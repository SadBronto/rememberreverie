import type { CameraModeConfig, FilterConfig, FrameConfig } from '@/config/modes'
import type { SourceImage } from '@/types/session'

const OUTPUT_QUALITY = 0.92   // JPEG quality — visually lossless

// Per-event customization scales (see ProcessOptions).
const TS_SIZE_SCALE         = { small: 0.82, medium: 1, large: 1.25 } as const
const POLAROID_BORDER_SCALE = { thin: 0.72, standard: 1, wide: 1.35 } as const

export interface ProcessOptions {
  timestampEnabled: boolean
  /** Layout style — each has its own position, font size, and colour */
  timestampStyle: 'classic' | 'vertical' | 'elegant'
  /** Passed to the 'elegant' style to render "Couple Names · date" */
  coupleNames?: string
  /**
   * Horizontal alignment of the source image within the crop area.
   * 'left' starts from the left edge instead of centering — useful for preview
   * thumbnails where the subject is off-centre in the sample image.
   * Default: 'center'.
   */
  sourceAlign?: 'left' | 'center'
  /** Timestamp size scale. Default 'medium'. */
  timestampSize?: 'small' | 'medium' | 'large'
  /** Polaroid frame border width. Default 'standard'. */
  polaroidBorder?: 'thin' | 'standard' | 'wide'
}

// Main entry point: takes raw captured images + mode config, returns processed Blob.
// Designed for captureCount>=1 so Photo Booth (multi-image) works the same way.
export async function processSession(
  sourceImages: SourceImage[],
  config: CameraModeConfig,
  options: ProcessOptions,
  outputWidth = 2400  // smaller value for gallery thumbnails to reduce CPU time
): Promise<Blob> {
  const composited = await compositeImages(sourceImages, config, outputWidth, options.sourceAlign ?? 'center')
  const filtered = await applyFilters(composited, config.filter)
  const framed = await applyFrame(filtered, config.frame, options)
  // Asset-framed modes (real Polaroid frame) keep a transparent margin for the
  // frame's soft drop shadow, so they must emit PNG, not JPEG.
  return canvasToBlob(framed, config.frame.frameSrc ? 'image/png' : 'image/jpeg')
}

// Composite source images into a single canvas at the correct aspect ratio.
// For single-shot: just draw the one image cropped/fitted to aspect ratio.
// Photo Booth will implement its own compositing strategy here.
async function compositeImages(
  sources: SourceImage[],
  config: CameraModeConfig,
  outputWidth = 2400,
  sourceAlign: 'left' | 'center' = 'center',
): Promise<HTMLCanvasElement> {
  const first = sources[0]
  if (!first) throw new Error('No source images in session')

  const img = await blobToImage(first.blob)
  const canvas = document.createElement('canvas')

  const targetWidth = outputWidth
  const targetHeight = Math.round(targetWidth / config.aspectRatio)
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Cover-fit: crop source to fill target aspect ratio
  const srcAspect = img.naturalWidth / img.naturalHeight
  const tgtAspect = config.aspectRatio
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight

  if (srcAspect > tgtAspect) {
    // Source is wider — crop sides. 'left' keeps left edge; 'center' splits evenly.
    sw = img.naturalHeight * tgtAspect
    sx = sourceAlign === 'left' ? 0 : (img.naturalWidth - sw) / 2
  } else {
    // Source is taller — crop top/bottom. 'left' keeps top; 'center' splits evenly.
    sh = img.naturalWidth / tgtAspect
    sy = sourceAlign === 'left' ? 0 : (img.naturalHeight - sh) / 2
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)
  return canvas
}

async function applyFilters(source: HTMLCanvasElement, filter: FilterConfig): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')!

  // Base image with CSS-style filters applied via canvas drawImage
  ctx.filter = [
    `brightness(${filter.brightness})`,
    `contrast(${filter.contrast})`,
    `saturate(${filter.saturation})`,
    filter.softness > 0 ? `blur(${filter.softness * 0.6}px)` : '',
  ].filter(Boolean).join(' ')
  ctx.drawImage(source, 0, 0)
  ctx.filter = 'none'

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // Lifted blacks (matte / faded film look)
  const blackFloor = Math.round(filter.liftedBlacks * 30)

  // Warmth overlay color (amber tint)
  const warmR = 255, warmG = 180, warmB = 100
  const tint = filter.tint
  const sel = filter.selectiveColor
  const duo = filter.duotone

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!
    let g = data[i + 1]!
    let b = data[i + 2]!

    // Lift blacks
    r = blackFloor + Math.round(r * (255 - blackFloor) / 255)
    g = blackFloor + Math.round(g * (255 - blackFloor) / 255)
    b = blackFloor + Math.round(b * (255 - blackFloor) / 255)

    // Warmth blend
    r = Math.round(r + (warmR - r) * filter.warmth)
    g = Math.round(g + (warmG - g) * filter.warmth * 0.5)
    b = Math.round(b + (warmB - b) * filter.warmth * 0.3)

    // Arbitrary colour tint (sepia, cool cast, …)
    if (tint) {
      r = Math.round(r + (tint.r - r) * tint.strength)
      g = Math.round(g + (tint.g - g) * tint.strength)
      b = Math.round(b + (tint.b - b) * tint.strength)
    }

    // Selective colour — desaturate everything except hues near the target
    if (sel) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn
      let h = 0
      if (dd !== 0) {
        if (mx === r) h = 60 * ((((g - b) / dd) % 6 + 6) % 6)
        else if (mx === g) h = 60 * ((b - r) / dd + 2)
        else h = 60 * ((r - g) / dd + 4)
      }
      let dh = Math.abs(h - sel.hue); if (dh > 180) dh = 360 - dh
      const s = mx === 0 ? 0 : dd / mx
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      if (dh > sel.range || s < 0.12) {
        // Outside the kept hue → full grayscale.
        r = luma; g = luma; b = luma
      } else {
        // Kept hue → push saturation so the colour genuinely pops.
        r = luma + (r - luma) * 1.5
        g = luma + (g - luma) * 1.5
        b = luma + (b - luma) * 1.5
      }
    }

    // Duotone — map luminance onto a two-colour ramp
    if (duo) {
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      r = duo.shadow.r + (duo.highlight.r - duo.shadow.r) * l
      g = duo.shadow.g + (duo.highlight.g - duo.shadow.g) * l
      b = duo.shadow.b + (duo.highlight.b - duo.shadow.b) * l
    }

    data[i] = Math.min(255, r)
    data[i + 1] = Math.min(255, g)
    data[i + 2] = Math.min(255, b)
  }
  ctx.putImageData(imageData, 0, 0)

  // Grain layer
  if (filter.grain > 0) {
    applyGrain(ctx, canvas.width, canvas.height, filter.grain)
  }

  // Vignette
  if (filter.vignette > 0) {
    applyVignette(ctx, canvas.width, canvas.height, filter.vignette)
  }

  return canvas
}

function applyGrain(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const grainCanvas = document.createElement('canvas')
  grainCanvas.width = w
  grainCanvas.height = h
  const gCtx = grainCanvas.getContext('2d')!
  const imageData = gCtx.createImageData(w, h)
  const data = imageData.data
  const strength = intensity * 40

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * strength
    data[i] = 128 + noise
    data[i + 1] = 128 + noise
    data[i + 2] = 128 + noise
    data[i + 3] = 255
  }
  gCtx.putImageData(imageData, 0, 0)

  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = intensity * 0.35
  ctx.drawImage(grainCanvas, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

function applyVignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const gradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.85)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${strength * 0.55})`)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
}

async function applyFrame(
  source: HTMLCanvasElement,
  frame: FrameConfig,
  options: ProcessOptions,
): Promise<HTMLCanvasElement> {
  // Real frame asset (e.g. the Polaroid SVG): composite the photo into the frame's
  // window and paint the designed frame on top. Bypasses the procedural borders.
  if (frame.frameSrc && frame.window) {
    return applyAssetFrame(source, frame.frameSrc, frame.window)
  }

  // Polaroid border width is host-adjustable; scale the procedural borders.
  const bScale = frame.style === 'polaroid'
    ? (POLAROID_BORDER_SCALE[options.polaroidBorder ?? 'standard'] ?? 1)
    : 1
  const bT = Math.round(source.height * frame.borderTop * bScale)
  const bB = Math.round(source.height * frame.borderBottom * bScale)
  const bL = Math.round(source.width * frame.borderLeft * bScale)
  const bR = Math.round(source.width * frame.borderRight * bScale)

  const totalW = source.width + bL + bR
  const totalH = source.height + bT + bB

  const canvas = document.createElement('canvas')
  canvas.width = totalW
  canvas.height = totalH
  const ctx = canvas.getContext('2d')!

  if (frame.style === 'polaroid') {
    // Warm vintage frame: cream gradient, faint paper tooth on the border only,
    // gently aged corners, and a soft inner shadow so the photo reads as recessed.
    // 'v2' is the stronger treatment — clearly cream (not white), more texture, a
    // deeper recess and a faint gloss, so it reads unmistakably as a Polaroid.
    const v2 = frame.weathering === 'v2'

    const grad = ctx.createLinearGradient(0, 0, 0, totalH)
    if (v2) { grad.addColorStop(0, '#f6f1e6'); grad.addColorStop(1, '#e9dfcc') }
    else    { grad.addColorStop(0, '#fbfaf7'); grad.addColorStop(1, '#f4f0e9') }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, totalW, totalH)

    // Texture + aging are drawn BEFORE the photo, so the photo (painted next)
    // covers the centre and they only ever show on the border.
    drawAgedCorners(ctx, totalW, totalH, v2 ? 0.09 : 0.05)
    if (v2) drawPolaroidSheen(ctx, totalW, totalH)

    ctx.drawImage(source, bL, bT)

    drawInnerShadow(ctx, bL, bT, source.width, source.height, v2 ? 0.30 : 0.18)

    if (v2) {
      // Crisp outer edge so the print keeps definition against a light background.
      ctx.strokeStyle = 'rgba(120,100,70,0.22)'
      ctx.lineWidth = Math.max(1, Math.round(totalW * 0.0018))
      ctx.strokeRect(0.5, 0.5, totalW - 1, totalH - 1)
    }
  } else {
    // Flat border (disposable / super8 have zero borders; this is the default)
    ctx.fillStyle = frame.borderColor
    ctx.fillRect(0, 0, totalW, totalH)
    ctx.drawImage(source, bL, bT)
  }

  // Wedding-level timestampEnabled is the sole gate — mode's showTimestamp is only
  // a design default and should not override the couple's explicit configuration.
  if (options.timestampEnabled) {
    drawTimestamp(ctx, totalW, totalH, bB, bL, bR, options)
  }

  return canvas
}

// ── Real frame-asset compositing ────────────────────────────────────────────

const frameImageCache = new Map<string, Promise<HTMLImageElement>>()
function loadFrameImage(src: string): Promise<HTMLImageElement> {
  let p = frameImageCache.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load frame ${src}`))
      img.src = src
    })
    frameImageCache.set(src, p)
  }
  return p
}

// Composite the (filtered) photo into the frame's transparent window, then paint
// the frame on top. The output canvas keeps alpha so the caller can emit PNG.
async function applyAssetFrame(
  source: HTMLCanvasElement,
  frameSrc: string,
  win: { left: number; top: number; right: number; bottom: number },
): Promise<HTMLCanvasElement> {
  const frameImg = await loadFrameImage(frameSrc)
  const winWFrac = 1 - win.left - win.right
  const winHFrac = 1 - win.top - win.bottom
  const frameW = Math.round(source.width / winWFrac)
  const frameH = Math.round(frameW * (frameImg.naturalHeight / frameImg.naturalWidth))

  const canvas = document.createElement('canvas')
  canvas.width = frameW
  canvas.height = frameH
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  drawCover(ctx, source, frameW * win.left, frameH * win.top, frameW * winWFrac, frameH * winHFrac)
  ctx.drawImage(frameImg, 0, 0, frameW, frameH)
  return canvas
}

// Cover-fit a source canvas into a destination rect (crop to fill, centered).
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  dx: number, dy: number, dw: number, dh: number,
) {
  const sAspect = img.width / img.height
  const dAspect = dw / dh
  let sx = 0, sy = 0, sw = img.width, sh = img.height
  if (sAspect > dAspect) { sw = img.height * dAspect; sx = (img.width - sw) / 2 }
  else { sh = img.width / dAspect; sy = (img.height - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

// ── Polaroid frame helpers ─────────────────────────────────────────────────────

// Subtle warm darkening from each corner — a hint of age, not a heavy vignette.
function drawAgedCorners(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const corners: [number, number][] = [[0, 0], [w, 0], [0, h], [w, h]]
  ctx.save()
  for (const [cx, cy] of corners) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5)
    g.addColorStop(0, `rgba(110,85,55,${strength})`)
    g.addColorStop(1, 'rgba(110,85,55,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()
}

// Faint diagonal gloss across the border — the subtle sheen of a real Polaroid.
// Drawn before the photo so it only shows on the frame, never washing the image.
function drawPolaroidSheen(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0,    'rgba(255,255,255,0.14)')
  g.addColorStop(0.30, 'rgba(255,255,255,0.00)')
  g.addColorStop(1,    'rgba(60,45,25,0.05)')
  ctx.save()
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

// Soft inner shadow around the photo so it sits recessed in the frame.
function drawInnerShadow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  strength: number,
) {
  const blur = Math.round(w * 0.03)
  const c0 = `rgba(15,10,4,${strength})`, c1 = 'rgba(15,10,4,0)'
  let g: CanvasGradient
  g = ctx.createLinearGradient(0, y, 0, y + blur);             g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(x, y, w, blur)
  g = ctx.createLinearGradient(0, y + h, 0, y + h - blur);     g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(x, y + h - blur, w, blur)
  g = ctx.createLinearGradient(x, 0, x + blur, 0);             g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(x, y, blur, h)
  g = ctx.createLinearGradient(x + w, 0, x + w - blur, 0);     g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(x + w - blur, y, blur, h)
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

// ── Timestamp drawing ────────────────────────────────────────────────────────

function now() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    mm:  pad(d.getMonth() + 1),
    dd:  pad(d.getDate()),
    yy:  String(d.getFullYear()).slice(2),
    hh:  pad(d.getHours()),
    min: pad(d.getMinutes()),
    sec: pad(d.getSeconds()),
  }
}

function drawTimestamp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bB: number,
  bL: number,
  bR: number,
  options: ProcessOptions,
) {
  // Normalise legacy style values that may still be in the DB
  const style = (['classic', 'vertical', 'elegant'] as const).includes(
    options.timestampStyle as 'classic' | 'vertical' | 'elegant'
  ) ? options.timestampStyle : 'classic'

  const scale = TS_SIZE_SCALE[options.timestampSize ?? 'medium'] ?? 1
  if (style === 'classic')  drawClassic(ctx, w, h, bB, bR, scale)
  if (style === 'vertical') drawVertical(ctx, w, h, bB, bL, scale)
  if (style === 'elegant')  drawElegant(ctx, w, h, bB, options.coupleNames, scale)
}

/** Bottom-right, two lines, orange — `05 21 '26 / 21:52:43` */
function drawClassic(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bB: number, bR: number,
  scale = 1,
) {
  const t = now()
  const fontSize = Math.round(w * 0.022 * scale)
  ctx.font = `${fontSize}px "DM Mono", monospace`
  ctx.fillStyle = '#e8762a'
  ctx.textAlign = 'right'

  const x = w - bR - Math.round(w * 0.016)
  const yBase = h - bB - Math.round(h * 0.016)

  ctx.textBaseline = 'bottom'
  ctx.fillText(`${t.mm} ${t.dd} '${t.yy}`, x, yBase)
  ctx.fillText(`${t.hh}:${t.min}:${t.sec}`, x, yBase - Math.round(fontSize * 1.45))
}

/** Bottom-left, rotated 90° upward, warm amber — `05 · 21 · '26` */
function drawVertical(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bB: number, bL: number,
  scale = 1,
) {
  const t = now()
  const text = `${t.mm} · ${t.dd} · '${t.yy}`
  const fontSize = Math.round(w * 0.019 * scale)

  ctx.font = `${fontSize}px "DM Mono", monospace`
  ctx.fillStyle = 'rgba(200,168,130,0.78)'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // Anchor point: bottom-left inside image
  const anchorX = bL + Math.round(w * 0.028)
  const anchorY = h - bB - Math.round(w * 0.04)

  ctx.save()
  ctx.translate(anchorX, anchorY)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** Bottom-centre: italic serif couple names above a small mono date */
function drawElegant(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bB: number,
  coupleNames?: string,
  scale = 1,
) {
  const datePart = new Date().toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })
  const nameSize = Math.round(w * 0.024 * scale)
  const dateSize = Math.round(w * 0.013 * scale)
  const lineGap  = Math.round(nameSize * 0.45)

  ctx.textAlign    = 'center'
  ctx.textBaseline = 'bottom'

  const bottomY = h - bB - Math.round(h * 0.028)

  if (coupleNames) {
    // Date — small mono at the very bottom
    ctx.font      = `${dateSize}px "DM Mono", monospace`
    ctx.fillStyle = 'rgba(255,248,235,0.45)'
    ctx.fillText(datePart, w / 2, bottomY)

    // Names — italic serif, above date
    const nameY = bottomY - dateSize - lineGap
    ctx.font      = `italic ${nameSize}px "Playfair Display", serif`
    ctx.fillStyle = 'rgba(255,248,235,0.88)'
    ctx.fillText(coupleNames, w / 2, nameY)
  } else {
    // No couple names — just date in italic serif
    ctx.font      = `italic ${nameSize}px "Playfair Display", serif`
    ctx.fillStyle = 'rgba(255,248,235,0.80)'
    ctx.fillText(datePart, w / 2, bottomY)
  }
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null')),
      type,
      type === 'image/jpeg' ? OUTPUT_QUALITY : undefined
    )
  })
}
