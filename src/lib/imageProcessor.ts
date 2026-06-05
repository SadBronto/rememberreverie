import type { CameraModeConfig, FilterConfig, FrameConfig } from '@/config/modes'
import type { SourceImage } from '@/types/session'

const OUTPUT_QUALITY = 0.92   // JPEG quality — visually lossless

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
  return canvasToBlob(framed)
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
  const bT = Math.round(source.height * frame.borderTop)
  const bB = Math.round(source.height * frame.borderBottom)
  const bL = Math.round(source.width * frame.borderLeft)
  const bR = Math.round(source.width * frame.borderRight)

  const totalW = source.width + bL + bR
  const totalH = source.height + bT + bB

  const canvas = document.createElement('canvas')
  canvas.width = totalW
  canvas.height = totalH
  const ctx = canvas.getContext('2d')!

  if (frame.style === 'polaroid') {
    // Warm vintage frame (Option B): cream gradient, faint paper tooth on the
    // border only, gently aged corners, and a soft inner shadow so the photo
    // reads as recessed into the frame.
    const grad = ctx.createLinearGradient(0, 0, 0, totalH)
    grad.addColorStop(0, '#fbfaf7')
    grad.addColorStop(1, '#f4f0e9')   // less yellow at the bottom
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, totalW, totalH)

    // Texture + aging are drawn BEFORE the photo, so the photo (painted next)
    // covers the centre and they only ever show on the border.
    drawPaperGrain(ctx, totalW, totalH, 0.15)
    drawAgedCorners(ctx, totalW, totalH, 0.05)

    ctx.drawImage(source, bL, bT)

    drawInnerShadow(ctx, bL, bT, source.width, source.height, 0.18)
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

// ── Polaroid frame helpers ─────────────────────────────────────────────────────

// Paper tooth across the frame. Drawn before the photo so it's border-only.
// Generated at ~1/4 scale then upscaled, so the texture stays a visible "tooth"
// on the full-size photo — 1px-per-pixel noise at full resolution is invisible.
function drawPaperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  const gw = Math.max(1, Math.round(w / 4))
  const gh = Math.max(1, Math.round(h / 4))
  const n = document.createElement('canvas')
  n.width = gw
  n.height = gh
  const nc = n.getContext('2d')!
  const id = nc.createImageData(gw, gh)
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 165 + Math.random() * 90
    id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 255
  }
  nc.putImageData(id, 0, 0)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'multiply'
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(n, 0, 0, w, h)
  ctx.restore()
}

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

  if (style === 'classic')  drawClassic(ctx, w, h, bB, bR)
  if (style === 'vertical') drawVertical(ctx, w, h, bB, bL)
  if (style === 'elegant')  drawElegant(ctx, w, h, bB, options.coupleNames)
}

/** Bottom-right, two lines, orange — `05 21 '26 / 21:52:43` */
function drawClassic(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bB: number, bR: number,
) {
  const t = now()
  const fontSize = Math.round(w * 0.022)
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
) {
  const t = now()
  const text = `${t.mm} · ${t.dd} · '${t.yy}`
  const fontSize = Math.round(w * 0.019)

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
) {
  const datePart = new Date().toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })
  const nameSize = Math.round(w * 0.024)
  const dateSize = Math.round(w * 0.013)
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

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null')),
      'image/jpeg',
      OUTPUT_QUALITY
    )
  })
}
