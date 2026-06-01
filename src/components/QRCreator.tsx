import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import qrcode from 'qrcode-generator'

// ── Types ─────────────────────────────────────────────────────────────────────
type DotStyle   = 'square' | 'mustache' | 'blob' | 'heart' | 'dot' | 'var-circle'
type FrameStyle = 'square' | 'rounded' | 'circle' | 'teardrop' | 'diamond-frame' | 'jagged'
type BallStyle  = 'square' | 'rounded' | 'circle' | 'diamond' | 'hexagon' | 'squircle'
type ECLevel    = 'L' | 'M' | 'Q' | 'H'
type GradDir    = 'none' | 'H' | 'V' | 'D'

export interface QRSettings {
  dotStyle:      string
  frameStyle:    string
  ballStyle:     string
  fgColor:       string
  bgColor:       string
  transparent:   boolean
  useEyeColors:  boolean
  outerEye:      string
  innerEye:      string
  gradDir:       string
  gradColor2:    string
  quietZone:     number
  ecLevel:       string
  qrSize:        number
  centerMode:    string
  monogramText:  string
  monogramColor: string
  logoSize:      number
}

interface Props {
  url: string
  coupleNames: string
  onClose?: () => void
  initialSettings?: QRSettings | null
  onSave?: (settings: QRSettings) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOT_STD: Record<DotStyle, number> = {
  square:       0,
  mustache:     0,
  blob:         3.8,
  heart:        0,
  dot:          0,
  'var-circle': 0,
}

const MUSTACHE_BODY: Record<string, { type: 'path' | 'rect'; d?: string; base: number }> = {
  '0000': { type:'path', d:'M250,0c138.077,0,250,111.93,250,250c0,138.077-111.923,250-250,250C111.93,500,0,388.077,0,250C0,111.93,111.93,0,250,0z', base:500 },
  '1000': { type:'path', d:'M-0.001,0l14,0c0,0-4.381,9.151-0.551,14C13.448,14-0.001,14.24-0.001,0z', base:14 },
  '0100': { type:'path', d:'M13.999,0v14c0,0-9.151-4.381-14-0.551C-0.001,13.449-0.242,0,13.999,0z', base:14 },
  '0010': { type:'path', d:'M14,14H0c0,0,4.38-9.15,0.55-14C0.55,0,14-0.24,14,14z', base:14 },
  '0001': { type:'path', d:'M0,14V0c0,0,9.15,4.38,14,0.55C14,0.55,14.24,14,0,14z', base:14 },
  '1100': { type:'path', d:'M0-0.001h14v13.97v0.029l-3.431,0.001C4.731,13.999,0,7.731,0-0.001z', base:14 },
  '0110': { type:'path', d:'M13.999-0.001v14H0.029H0v-3.431C0,4.729,6.267-0.001,13.999-0.001z', base:14 },
  '0011': { type:'path', d:'M13.999,13.999H0V0.028v-0.029h3.43C9.269-0.001,13.999,6.267,13.999,13.999z', base:14 },
  '1001': { type:'path', d:'M0,14V0h13.971H14v3.43C14,9.27,7.732,14,0,14z', base:14 },
  '1010': { type:'rect', base:100 },
  '0101': { type:'rect', base:100 },
  '1110': { type:'rect', base:100 },
  '1101': { type:'rect', base:100 },
  '1011': { type:'rect', base:100 },
  '0111': { type:'rect', base:100 },
  '1111': { type:'rect', base:100 },
}

// ── Pure SVG helpers ──────────────────────────────────────────────────────────

function hexToR(h: string): number { return parseInt(h.slice(1,3),16)/255 }
function hexToG(h: string): number { return parseInt(h.slice(3,5),16)/255 }
function hexToB(h: string): number { return parseInt(h.slice(5,7),16)/255 }

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w/2, h/2)
  return `M${x+r},${y} h${w-2*r} a${r},${r} 0 0 1 ${r},${r} v${h-2*r} a${r},${r} 0 0 1 -${r},${r} h-${w-2*r} a${r},${r} 0 0 1 -${r},-${r} v-${h-2*r} a${r},${r} 0 0 1 ${r},-${r}z`
}

function circleArc(cx: number, cy: number, r: number): string {
  return `M${cx-r},${cy} a${r},${r} 0 1 0 ${r*2},0 a${r},${r} 0 1 0 -${r*2},0z`
}

function jaggedPath(x: number, y: number, w: number, h: number, jag: number): string {
  const offsets = [0.9,-0.4,0.6,-1.0,0.3,-0.7,1.0,-0.2,0.5,-0.8,0.1,-0.6,0.8,-0.3,0.7,-0.5,0.4,-0.9,0.2,-1.0]
  let oi = 0
  const next = () => offsets[(oi++) % offsets.length]! * jag
  const pts: [number, number][] = []
  const n = 8
  for (let i = 0; i <= n; i++) pts.push([x + (w/n)*i, y + next()])
  for (let i = 1; i <= n; i++) pts.push([x + w + next(), y + (h/n)*i])
  for (let i = 1; i <= n; i++) pts.push([x + w - (w/n)*i, y + h + next()])
  for (let i = 1; i < n; i++) pts.push([x + next(), y + h - (h/n)*i])
  return 'M' + pts.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' L') + 'Z'
}

function finderOrigins(count: number): Array<{r: number; c: number}> {
  return [{r:0,c:0},{r:0,c:count-7},{r:count-7,c:0}]
}

function isFinderModule(row: number, col: number, count: number): boolean {
  for (const fp of finderOrigins(count)) {
    const dr = row - fp.r, dc = col - fp.c
    if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) return true
  }
  return false
}

// ── Dot path renderers ────────────────────────────────────────────────────────

function heartDotPath(px: number, py: number, S: number): string {
  const s = S / 30, x = px, y = py
  return `M${x+15*s},${y+25*s} C${x+15*s},${y+25*s} ${x+3*s},${y+17*s} ${x+3*s},${y+10*s} C${x+3*s},${y+6*s} ${x+6*s},${y+3.5*s} ${x+9.5*s},${y+3.5*s} C${x+11.5*s},${y+3.5*s} ${x+13.5*s},${y+4.5*s} ${x+15*s},${y+6.5*s} C${x+16.5*s},${y+4.5*s} ${x+18.5*s},${y+3.5*s} ${x+20.5*s},${y+3.5*s} C${x+24*s},${y+3.5*s} ${x+27*s},${y+6*s} ${x+27*s},${y+10*s} C${x+27*s},${y+17*s} ${x+15*s},${y+25*s} ${x+15*s},${y+25*s}Z `
}

// "dot" style: circle base + concave bezier bridges toward orthogonal dark neighbours
function circleBridgeDotPath(px: number, py: number, S: number, matrix: boolean[][], row: number, col: number): string {
  const count = matrix.length
  const cx = px + S/2, cy = py + S/2
  const r  = S * 0.45
  const bw = r * 0.78
  const waist = 0.72
  function isD(dr: number, dc: number) {
    const nr = row + dr, nc = col + dc
    return nr >= 0 && nr < count && nc >= 0 && nc < count &&
           matrix[nr]![nc]! && !isFinderModule(nr, nc, count)
  }
  let d = circleArc(cx, cy, r)
  if (isD(0,  1)) { const mx = cx + S/2; d += `M${cx},${cy-bw} Q${mx},${cy-bw*waist} ${cx+S},${cy-bw} L${cx+S},${cy+bw} Q${mx},${cy+bw*waist} ${cx},${cy+bw}Z ` }
  if (isD(0, -1)) { const mx = cx - S/2; d += `M${cx},${cy-bw} Q${mx},${cy-bw*waist} ${cx-S},${cy-bw} L${cx-S},${cy+bw} Q${mx},${cy+bw*waist} ${cx},${cy+bw}Z ` }
  if (isD( 1, 0)) { const my = cy + S/2; d += `M${cx-bw},${cy} Q${cx-bw*waist},${my} ${cx-bw},${cy+S} L${cx+bw},${cy+S} Q${cx+bw*waist},${my} ${cx+bw},${cy}Z ` }
  if (isD(-1, 0)) { const my = cy - S/2; d += `M${cx-bw},${cy} Q${cx-bw*waist},${my} ${cx-bw},${cy-S} L${cx+bw},${cy-S} Q${cx+bw*waist},${my} ${cx+bw},${cy}Z ` }
  return d
}

function varCircleDotPath(px: number, py: number, S: number, row: number, col: number): string {
  const hash  = (row * 7 + col * 13 + row * col) % 11
  const scale = 0.38 + (hash / 10) * 0.57
  const r     = (S / 2) * scale
  const cx    = px + S / 2, cy = py + S / 2
  return `M${cx-r},${cy} a${r},${r} 0 1 0 ${r*2},0 a${r},${r} 0 1 0 -${r*2},0 `
}

// ── Eye renderers ─────────────────────────────────────────────────────────────

function getFramePath(type: FrameStyle, fx: number, fy: number, S: number, finderPos: string): string {
  const full = S*7, inner = S*5, off = S
  const cx = fx + full/2, cy = fy + full/2
  const squareOuter = `M${fx},${fy}h${full}v${full}h-${full}z`
  const squareInner = `M${fx+off},${fy+off}h${inner}v${inner}h-${inner}z`

  switch (type) {
    case 'rounded': {
      const ro = S*1.5, ri = S*0.8
      return roundedRect(fx, fy, full, full, ro) + ' ' + roundedRect(fx+off, fy+off, inner, inner, ri)
    }
    case 'circle':
      return circleArc(cx, cy, full/2) + ' ' + circleArc(cx, cy, inner/2)
    case 'teardrop': {
      const r = S*1.4
      let outer: string, cut: string
      if (finderPos === 'tl') {
        outer = `M${fx},${fy} L${fx+full-r},${fy} a${r},${r} 0 0 1 ${r},${r} L${fx+full},${fy+full-r} a${r},${r} 0 0 1 -${r},${r} L${fx+r},${fy+full} a${r},${r} 0 0 1 -${r},-${r} L${fx},${fy}z`
        const ri = S*0.7
        cut = `M${fx+off},${fy+off} L${fx+off+inner-ri},${fy+off} a${ri},${ri} 0 0 1 ${ri},${ri} L${fx+off+inner},${fy+off+inner-ri} a${ri},${ri} 0 0 1 -${ri},${ri} L${fx+off+ri},${fy+off+inner} a${ri},${ri} 0 0 1 -${ri},-${ri} L${fx+off},${fy+off}z`
      } else if (finderPos === 'tr') {
        outer = `M${fx+r},${fy} L${fx+full},${fy} L${fx+full},${fy+full-r} a${r},${r} 0 0 1 -${r},${r} L${fx+r},${fy+full} a${r},${r} 0 0 1 -${r},-${r} L${fx},${fy+r} a${r},${r} 0 0 1 ${r},-${r}z`
        const ri = S*0.7
        cut = `M${fx+off+ri},${fy+off} L${fx+off+inner},${fy+off} L${fx+off+inner},${fy+off+inner-ri} a${ri},${ri} 0 0 1 -${ri},${ri} L${fx+off+ri},${fy+off+inner} a${ri},${ri} 0 0 1 -${ri},-${ri} L${fx+off},${fy+off+ri} a${ri},${ri} 0 0 1 ${ri},-${ri}z`
      } else {
        outer = `M${fx},${fy+r} a${r},${r} 0 0 1 ${r},-${r} L${fx+full-r},${fy} a${r},${r} 0 0 1 ${r},${r} L${fx+full},${fy+full-r} a${r},${r} 0 0 1 -${r},${r} L${fx},${fy+full}z`
        const ri = S*0.7
        cut = `M${fx+off},${fy+off+ri} a${ri},${ri} 0 0 1 ${ri},-${ri} L${fx+off+inner-ri},${fy+off} a${ri},${ri} 0 0 1 ${ri},${ri} L${fx+off+inner},${fy+off+inner-ri} a${ri},${ri} 0 0 1 -${ri},${ri} L${fx+off},${fy+off+inner}z`
      }
      return outer + ' ' + cut
    }
    case 'diamond-frame': {
      const outerD = `M${cx},${fy} L${fx+full},${cy} L${cx},${fy+full} L${fx},${cy}z`
      const cutD   = `M${cx},${fy+off} L${fx+off+inner},${cy} L${cx},${fy+off+inner} L${fx+off},${cy}z`
      return outerD + ' ' + cutD
    }
    case 'jagged': {
      const jag = S * 0.32
      return jaggedPath(fx, fy, full, full, jag) + ' ' +
             jaggedPath(fx+off, fy+off, inner, inner, jag * 0.65)
    }
    default:
      return squareOuter + ' ' + squareInner
  }
}

function getBallPath(type: BallStyle, fx: number, fy: number, S: number): string {
  const bx = fx+S*2, by = fy+S*2, bs = S*3, bc = bs/2
  const cx = bx+bc, cy = by+bc
  switch (type) {
    case 'rounded': return roundedRect(bx, by, bs, bs, bs*0.22)
    case 'circle':  return circleArc(cx, cy, bc*0.95)
    case 'diamond': return `M${cx},${by} L${bx+bs},${cy} L${cx},${by+bs} L${bx},${cy}z`
    case 'hexagon': {
      const r = bc * 0.95
      const pts: string[] = []
      for (let k = 0; k < 6; k++) {
        const angle = (k * Math.PI / 3) - Math.PI / 6
        pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`)
      }
      return 'M' + pts.join(' L') + 'Z'
    }
    case 'squircle': {
      const k = bs * 0.44
      return `M${cx},${by} C${cx+k},${by} ${bx+bs},${cy-k} ${bx+bs},${cy} C${bx+bs},${cy+k} ${cx+k},${by+bs} ${cx},${by+bs} C${cx-k},${by+bs} ${bx},${cy+k} ${bx},${cy} C${bx},${cy-k} ${cx-k},${by} ${cx},${by}Z`
    }
    default: return `M${bx},${by}h${bs}v${bs}h-${bs}z`
  }
}

// ── Matrix builder ────────────────────────────────────────────────────────────

function buildMatrix(content: string, ec: ECLevel): boolean[][] {
  const qr = qrcode(0, ec)
  qr.addData(content)
  qr.make()
  const count = qr.getModuleCount()
  const m: boolean[][] = []
  for (let r = 0; r < count; r++) {
    m[r] = []
    for (let c = 0; c < count; c++) m[r]![c] = qr.isDark(r, c)
  }
  return m
}

// ── SVG builder ───────────────────────────────────────────────────────────────

interface SVGParams {
  matrix: boolean[][]
  displaySize: number
  dotStyle: DotStyle
  frameStyle: FrameStyle
  ballStyle: BallStyle
  fgColor: string
  bgColor: string
  outerCol: string
  innerCol: string
  transparent: boolean
  gradDir: GradDir
  gradColor2: string
  quietZone: number   // in modules (0–4)
  centerDataUrl: string | null
  logoSize: number    // 1–100 percent of data area
}

function buildSVG(p: SVGParams): string {
  const { matrix, displaySize, dotStyle, frameStyle, ballStyle,
          fgColor, bgColor, outerCol, innerCol, transparent,
          gradDir, gradColor2, quietZone, centerDataUrl, logoSize } = p

  const count  = matrix.length
  const S      = 10
  const total  = count * S
  const PAD    = S * quietZone
  const full   = total + PAD * 2
  const std    = DOT_STD[dotStyle]
  const gradOn = gradDir !== 'none'

  // ── Data modules ────────────────────────────────────────────────────────────
  let dataPath      = ''
  let mustacheParts = ''

  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!matrix[row]![col] || isFinderModule(row, col, count)) continue
      const px = PAD + col*S, py = PAD + row*S

      if (dotStyle === 'heart') {
        dataPath += heartDotPath(px, py, S)
      } else if (dotStyle === 'dot') {
        dataPath += circleBridgeDotPath(px, py, S, matrix, row, col)
      } else if (dotStyle === 'var-circle') {
        dataPath += varCircleDotPath(px, py, S, row, col)
      } else if (dotStyle === 'mustache') {
        const up    = row > 0          && !!matrix[row-1]![col]
        const right = col < count - 1  && !!matrix[row]![col+1]
        const down  = row < count - 1  && !!matrix[row+1]![col]
        const left  = col > 0          && !!matrix[row]![col-1]
        const key   = `${up?1:0}${right?1:0}${down?1:0}${left?1:0}`
        const asset = MUSTACHE_BODY[key]
        if (asset) {
          const sc    = (S / asset.base).toFixed(6)
          const inner = asset.type === 'path'
            ? `<path d="${asset.d}" stroke="none"/>`
            : `<rect width="100" height="100" stroke="none"/>`
          mustacheParts += `<g transform="translate(${px},${py}) scale(${sc})">${inner}</g>`
        }
      } else {
        // square (default) and blob (uses blur filter, also square rects)
        dataPath += `M${px},${py}h${S}v${S}h-${S}z `
      }
    }
  }

  // ── Finder patterns ─────────────────────────────────────────────────────────
  let framePath = '', ballPath = ''
  const positions: Array<'tl'|'tr'|'bl'> = ['tl', 'tr', 'bl']
  finderOrigins(count).forEach((fp, i) => {
    framePath += getFramePath(frameStyle, PAD + fp.c*S, PAD + fp.r*S, S, positions[i]!) + ' '
    ballPath  += getBallPath(ballStyle,  PAD + fp.c*S, PAD + fp.r*S, S)                 + ' '
  })

  // ── Center image ────────────────────────────────────────────────────────────
  let logoEl = ''
  if (centerDataUrl) {
    const pct    = logoSize / 100
    const ls     = total * pct
    const lx     = PAD + (total - ls) / 2
    const ly     = PAD + (total - ls) / 2
    // Minimal 2-unit halo so the background rect doesn't add visible dead space
    const pad    = 2
    const logoBg = transparent ? 'white' : bgColor
    logoEl = `<rect x="${(lx-pad).toFixed(2)}" y="${(ly-pad).toFixed(2)}" width="${(ls+pad*2).toFixed(2)}" height="${(ls+pad*2).toFixed(2)}" fill="${logoBg}" rx="${pad}"/><image href="${centerDataUrl}" x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" width="${ls.toFixed(2)}" height="${ls.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`
  }

  // ── Gradient ────────────────────────────────────────────────────────────────
  let gradDef     = ''
  let dotFill     = `fill="${fgColor}"`

  if (gradOn) {
    const dirs: Record<string, {x1:string;y1:string;x2:string;y2:string}> = {
      H: {x1:'0%', y1:'0%',  x2:'100%', y2:'0%'  },
      V: {x1:'0%', y1:'0%',  x2:'0%',   y2:'100%'},
      D: {x1:'0%', y1:'0%',  x2:'100%', y2:'100%'},
    }
    const gc = dirs[gradDir]!
    gradDef  = `<linearGradient id="qrgrad" x1="${gc.x1}" y1="${gc.y1}" x2="${gc.x2}" y2="${gc.y2}" gradientUnits="objectBoundingBox"><stop offset="0%" stop-color="${fgColor}"/><stop offset="100%" stop-color="${gradColor2}"/></linearGradient>`
    dotFill  = `fill="url(#qrgrad)"`
  }

  // ── Blob (Gaussian threshold) filter ────────────────────────────────────────
  let filterDefs    = ''
  let dataGroupAttrs = dotFill

  if (std > 0) {
    const M = 30, O = -10
    if (gradOn) {
      filterDefs     = `<filter id="f" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${std}" result="blur"/><feColorMatrix type="matrix" in="blur" result="mask" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${M} ${O}"/><feComposite in="SourceGraphic" in2="mask" operator="in"/></filter>`
      dataGroupAttrs = `${dotFill} filter="url(#f)"`
    } else {
      const R = hexToR(fgColor).toFixed(4), G = hexToG(fgColor).toFixed(4), B = hexToB(fgColor).toFixed(4)
      filterDefs     = `<filter id="f" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${std}" result="blur"/><feColorMatrix type="matrix" values="0 0 0 0 ${R} 0 0 0 0 ${G} 0 0 0 0 ${B} 0 0 0 ${M} ${O}"/></filter>`
      dataGroupAttrs = `filter="url(#f)"`
    }
  }

  // ── Mustache gradient override (userSpaceOnUse) ──────────────────────────────
  if (dotStyle === 'mustache' && gradOn) {
    const uCoords: Record<string, number[]> = {
      H: [PAD, PAD, PAD+total, PAD        ],
      V: [PAD, PAD, PAD,       PAD+total  ],
      D: [PAD, PAD, PAD+total, PAD+total  ],
    }
    const [ux1, uy1, ux2, uy2] = uCoords[gradDir]!
    gradDef = `<linearGradient id="qrgrad" gradientUnits="userSpaceOnUse" x1="${ux1}" y1="${uy1}" x2="${ux2}" y2="${uy2}"><stop offset="0%" stop-color="${fgColor}"/><stop offset="100%" stop-color="${gradColor2}"/></linearGradient>`
  }

  // ── Assemble ─────────────────────────────────────────────────────────────────
  const dataEl = dotStyle === 'mustache'
    ? `<g ${dotFill}>${mustacheParts}</g>`
    : `<path ${dataGroupAttrs} d="${dataPath}"/>`

  const bgRect = transparent ? '' : `<rect width="${full}" height="${full}" fill="${bgColor}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${displaySize}" height="${displaySize}" viewBox="0 0 ${full} ${full}"><defs>${gradDef}${filterDefs}</defs>
${bgRect}
${dataEl}
<path fill="${outerCol}" fill-rule="evenodd" d="${framePath}"/>
<path fill="${innerCol}" d="${ballPath}"/>
${logoEl}
</svg>`
}

// ── Monogram renderer ─────────────────────────────────────────────────────────

async function renderMonogram(text: string, color: string, size = 400): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Cream circle background
  ctx.fillStyle = '#faf8f3'
  ctx.beginPath()
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2)
  ctx.fill()

  await document.fonts.ready   // ensures Playfair Display is loaded

  const fontSize = text.length <= 2 ? Math.round(size * 0.62) : Math.round(size * 0.44)
  ctx.font         = `italic ${fontSize}px 'Playfair Display', Georgia, serif`
  ctx.fillStyle    = color
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size/2, size/2 + Math.round(fontSize * 0.05))

  return canvas.toDataURL('image/png')
}

// ── Initials helper ───────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s*(?:&|and)\s*/i)
  if (parts.length >= 2)
    return (parts[0]?.trim()[0] ?? '').toUpperCase() + (parts[1]?.trim()[0] ?? '').toUpperCase()
  const w = name.trim().split(/\s+/)
  if (w.length >= 2) return (w[0]![0] ?? '').toUpperCase() + (w[1]![0] ?? '').toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QRCreator({ url, coupleNames, onClose, initialSettings, onSave }: Props) {
  const s = initialSettings  // shorthand for defaults below

  // Style
  const [dotStyle,   setDotStyle]   = useState<DotStyle>(  (s?.dotStyle   as DotStyle)   ?? 'square')
  const [frameStyle, setFrameStyle] = useState<FrameStyle>((s?.frameStyle as FrameStyle) ?? 'square')
  const [ballStyle,  setBallStyle]  = useState<BallStyle>( (s?.ballStyle  as BallStyle)  ?? 'square')

  // Colors
  const [fgColor,      setFgColor]      = useState(s?.fgColor      ?? '#1a1612')
  const [bgColor,      setBgColor]      = useState(s?.bgColor      ?? '#f5f0e8')
  const [transparent,  setTransparent]  = useState(s?.transparent  ?? false)
  const [useEyeColors, setUseEyeColors] = useState(s?.useEyeColors ?? false)
  const [outerEye,     setOuterEye]     = useState(s?.outerEye     ?? '#1a1612')
  const [innerEye,     setInnerEye]     = useState(s?.innerEye     ?? '#1a1612')

  // Gradient
  const [gradDir,    setGradDir]    = useState<GradDir>((s?.gradDir as GradDir) ?? 'none')
  const [gradColor2, setGradColor2] = useState(s?.gradColor2 ?? '#8a6a40')

  // QR options
  const [quietZone, setQuietZone] = useState(s?.quietZone ?? 2)
  const [ecLevel,   setEcLevel]   = useState<ECLevel>((s?.ecLevel as ECLevel) ?? 'M')
  const [qrSize,    setQrSize]    = useState(s?.qrSize ?? 800)

  // Center image
  const [centerMode,      setCenterMode]      = useState<'none'|'monogram'|'logo'>((s?.centerMode as 'none'|'monogram'|'logo') ?? 'monogram')
  const [monogramText,    setMonogramText]    = useState(s?.monogramText ?? getInitials(coupleNames))
  const [monogramColor,   setMonogramColor]   = useState(s?.monogramColor ?? '#1a1612')

  // Auto-save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didMountRef  = useRef(false)
  const [monogramDataUrl, setMonogramDataUrl] = useState<string|null>(null)
  const [logoDataUrl,     setLogoDataUrl]     = useState<string|null>(null)
  const [logoSize,        setLogoSize]        = useState(20)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Re-render monogram whenever text/color changes
  useEffect(() => {
    if (centerMode !== 'monogram' || !monogramText) { setMonogramDataUrl(null); return }
    let dead = false
    renderMonogram(monogramText, monogramColor).then(d => { if (!dead) setMonogramDataUrl(d) })
    return () => { dead = true }
  }, [monogramText, monogramColor, centerMode])

  // Auto-save — skip first mount, then debounce 800ms after any setting change
  useEffect(() => {
    if (!onSave) return
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      onSave({
        dotStyle, frameStyle, ballStyle,
        fgColor, bgColor, transparent,
        useEyeColors, outerEye, innerEye,
        gradDir, gradColor2,
        quietZone, ecLevel, qrSize,
        centerMode, monogramText, monogramColor, logoSize,
      })
    }, 800)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dotStyle, frameStyle, ballStyle, fgColor, bgColor, transparent, useEyeColors,
      outerEye, innerEye, gradDir, gradColor2, quietZone, ecLevel, qrSize,
      centerMode, monogramText, monogramColor, logoSize])

  const centerDataUrl = centerMode === 'monogram' ? monogramDataUrl
    : centerMode === 'logo' ? logoDataUrl
    : null

  const outerCol = useEyeColors ? outerEye : fgColor
  const innerCol = useEyeColors ? innerEye : fgColor

  // Build QR matrix (only changes when url or EC level changes)
  const matrix = useMemo(() => {
    try { return buildMatrix(url, ecLevel) } catch { return null }
  }, [url, ecLevel])

  // Build SVG string for preview
  const svgString = useMemo(() => {
    if (!matrix) return ''
    return buildSVG({ matrix, displaySize: 220, dotStyle, frameStyle, ballStyle,
                      fgColor, bgColor, outerCol, innerCol, transparent,
                      gradDir, gradColor2, quietZone, centerDataUrl, logoSize })
  }, [matrix, dotStyle, frameStyle, ballStyle, fgColor, bgColor, outerCol, innerCol,
      transparent, gradDir, gradColor2, quietZone, centerDataUrl, logoSize])

  // Helper to get download-size SVG
  const getDownloadSVG = useCallback(() => {
    if (!matrix) return ''
    return buildSVG({ matrix, displaySize: qrSize, dotStyle, frameStyle, ballStyle,
                      fgColor, bgColor, outerCol, innerCol, transparent,
                      gradDir, gradColor2, quietZone, centerDataUrl, logoSize })
  }, [matrix, qrSize, dotStyle, frameStyle, ballStyle, fgColor, bgColor, outerCol, innerCol,
      transparent, gradDir, gradColor2, quietZone, centerDataUrl, logoSize])

  const downloadSVG = useCallback(() => {
    const svg  = getDownloadSVG()
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = 'reverie-qr.svg'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [getDownloadSVG])

  const downloadPNG = useCallback(() => {
    const svg = getDownloadSVG()
    if (!svg) return
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
    const svgUrl  = URL.createObjectURL(svgBlob)
    const img     = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = qrSize
      const ctx = canvas.getContext('2d')!
      if (!transparent) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, qrSize, qrSize) }
      ctx.drawImage(img, 0, 0, qrSize, qrSize)
      canvas.toBlob(blob => {
        if (!blob) return
        const a    = document.createElement('a')
        a.href     = URL.createObjectURL(blob)
        a.download = 'reverie-qr.png'
        a.click()
        URL.revokeObjectURL(a.href)
      }, 'image/png')
      URL.revokeObjectURL(svgUrl)
    }
    img.src = svgUrl
  }, [getDownloadSVG, qrSize, transparent, bgColor])

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setLogoDataUrl(ev.target?.result as string); setCenterMode('logo') }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Preview + scan reminder ──────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2.5">
        <div
          className="rounded-2xl overflow-hidden p-3"
          style={{
            background: transparent
              ? 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 0 0 / 12px 12px'
              : bgColor
          }}
        >
          {svgString
            ? <div dangerouslySetInnerHTML={{ __html: svgString }} />
            : <div className="w-[220px] h-[220px] flex items-center justify-center text-cream/20 text-xs">generating…</div>
          }
        </div>
        <p className="text-mono text-amber-film text-[9px] tracking-[0.25em] uppercase text-center font-medium">
          ↑ Scan this to confirm it works before printing
        </p>
      </div>

      {/* ── Guest URL ────────────────────────────────────────────────────── */}
      <div className="bg-ink-light rounded-xl px-4 py-3">
        <p className="text-mono text-cream/30 text-[9px] tracking-widest uppercase mb-1">Guest URL</p>
        <p className="text-mono text-cream/60 text-[11px] break-all">{url}</p>
      </div>

      {/* ── Center image ─────────────────────────────────────────────────── */}
      <Section label="Center image">
        <TabRow
          options={['none', 'monogram', 'logo'] as const}
          value={centerMode}
          onChange={setCenterMode}
          label={v => v === 'none' ? 'None' : v === 'monogram' ? 'Monogram' : 'Logo'}
        />
        {centerMode === 'monogram' && (
          <div className="flex flex-col gap-3 pl-1 mt-1">
            <div className="flex items-end gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sans text-cream/40 text-xs">Initials / text</label>
                <input
                  value={monogramText}
                  onChange={e => setMonogramText(e.target.value.slice(0, 4))}
                  placeholder="SJ"
                  maxLength={4}
                  className="w-20 bg-ink-light border border-cream/10 rounded-lg px-3 py-2 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 text-center tracking-widest"
                />
              </div>
              <ColorInput label="Color" value={monogramColor} onChange={setMonogramColor} id="mono-color" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sans text-cream/40 text-xs">Logo size — {logoSize}%</label>
              <input
                type="range" min={10} max={30} step={1}
                value={logoSize} onChange={e => setLogoSize(Number(e.target.value))}
                className="w-full accent-cream"
              />
              <p className="text-mono text-cream/15 text-[10px]">If the code won't scan, try reducing to 25% or less.</p>
            </div>
          </div>
        )}
        {centerMode === 'logo' && (
          <div className="flex flex-col gap-2 pl-1 mt-1">
            <button
              onClick={() => logoInputRef.current?.click()}
              className="self-start px-4 py-2 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation"
            >
              {logoDataUrl ? 'Replace image' : 'Upload image'}
            </button>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            {logoDataUrl && (
              <div className="flex flex-col gap-1.5 mt-1">
                <label className="text-sans text-cream/40 text-xs">Logo size — {logoSize}%</label>
                <input
                  type="range" min={10} max={30} step={1}
                  value={logoSize} onChange={e => setLogoSize(Number(e.target.value))}
                  className="w-full accent-cream"
                />
                <p className="text-mono text-cream/15 text-[10px]">If the code won't scan, try reducing to 25% or less.</p>
              </div>
            )}
            {!logoDataUrl && <p className="text-mono text-cream/20 text-[10px]">PNG or SVG. Square images recommended.</p>}
          </div>
        )}
      </Section>

      {/* ── Dot style ────────────────────────────────────────────────────── */}
      <Section label="Dot style">
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['square',      'Square'   ],
            ['mustache',    'Mustache' ],
            ['blob',        'Blob'     ],
            ['heart',       'Heart'    ],
            ['dot',         'Dot'      ],
            ['var-circle',  'Scatter'  ],
          ] as [DotStyle, string][]).map(([t, lbl]) => (
            <button
              key={t} onClick={() => setDotStyle(t)}
              className={`py-2 rounded-lg border text-sans text-xs transition-colors touch-manipulation ${
                dotStyle === t ? 'bg-cream text-ink border-cream' : 'text-cream/40 border-cream/15'
              }`}
            >{lbl}</button>
          ))}
        </div>
      </Section>

      {/* ── Eye style ────────────────────────────────────────────────────── */}
      <Section label="Eye style">
        <div className="flex flex-col gap-2">
          <p className="text-sans text-cream/30 text-[10px]">Frame shape</p>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['square',       'Square'  ],
              ['rounded',      'Rounded' ],
              ['circle',       'Circle'  ],
              ['teardrop',     'Teardrop'],
              ['diamond-frame','Diamond' ],
              ['jagged',       'Jagged'  ],
            ] as [FrameStyle, string][]).map(([t, lbl]) => (
              <button
                key={t} onClick={() => setFrameStyle(t)}
                className={`py-2 rounded-lg border text-sans text-xs transition-colors touch-manipulation ${
                  frameStyle === t ? 'bg-cream text-ink border-cream' : 'text-cream/40 border-cream/15'
                }`}
              >{lbl}</button>
            ))}
          </div>
          <p className="text-sans text-cream/30 text-[10px] mt-0.5">Ball shape</p>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['square',   'Square'   ],
              ['rounded',  'Rounded'  ],
              ['circle',   'Circle'   ],
              ['diamond',  'Diamond'  ],
              ['hexagon',  'Hexagon'  ],
              ['squircle', 'Squircle' ],
            ] as [BallStyle, string][]).map(([t, lbl]) => (
              <button
                key={t} onClick={() => setBallStyle(t)}
                className={`py-2 rounded-lg border text-sans text-xs transition-colors touch-manipulation ${
                  ballStyle === t ? 'bg-cream text-ink border-cream' : 'text-cream/40 border-cream/15'
                }`}
              >{lbl}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <Toggle value={useEyeColors} onChange={setUseEyeColors} />
          <span className="text-sans text-cream/40 text-xs">Custom eye colors</span>
        </div>
        {useEyeColors && (
          <div className="flex gap-6 pl-1 mt-1">
            <ColorInput label="Outer eye" value={outerEye} onChange={setOuterEye} id="outer-eye" />
            <ColorInput label="Inner eye" value={innerEye} onChange={setInnerEye} id="inner-eye" />
          </div>
        )}
      </Section>

      {/* ── Colors ───────────────────────────────────────────────────────── */}
      <Section label="Colors">
        <div className="flex gap-6">
          <ColorInput label="QR color"    value={fgColor} onChange={setFgColor} id="fg-color" />
          {!transparent && <ColorInput label="Background" value={bgColor} onChange={setBgColor} id="bg-color" />}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <Toggle value={transparent} onChange={setTransparent} />
          <span className="text-sans text-cream/40 text-xs">Transparent background</span>
        </div>
      </Section>

      {/* ── Gradient ─────────────────────────────────────────────────────── */}
      <Section label="Gradient">
        <TabRow
          options={['none', 'H', 'V', 'D'] as GradDir[]}
          value={gradDir}
          onChange={setGradDir}
          label={v => v === 'none' ? 'None' : v === 'H' ? 'Horizontal' : v === 'V' ? 'Vertical' : 'Diagonal'}
        />
        {gradDir !== 'none' && (
          <div className="flex gap-6 pl-1 mt-1">
            <ColorInput label="From" value={fgColor}    onChange={setFgColor}    id="grad-c1" />
            <ColorInput label="To"   value={gradColor2} onChange={setGradColor2} id="grad-c2" />
          </div>
        )}
      </Section>

      {/* ── Quiet zone ───────────────────────────────────────────────────── */}
      <Section label="Quiet zone (padding)">
        <div className="flex flex-col gap-1.5">
          <span className="text-sans text-cream/40 text-xs">{quietZone} module{quietZone !== 1 ? 's' : ''}</span>
          <input
            type="range" min={0} max={4} step={1}
            value={quietZone} onChange={e => setQuietZone(Number(e.target.value))}
            className="w-full accent-cream"
          />
        </div>
      </Section>

      {/* ── Error correction ─────────────────────────────────────────────── */}
      <Section label="Error correction">
        <p className="text-mono text-cream/15 text-[10px] -mt-1 mb-1">Higher = more resilient, denser. Use Q or H with a center image.</p>
        <div className="flex gap-1.5">
          {(['L', 'M', 'Q', 'H'] as ECLevel[]).map(ec => (
            <button
              key={ec} onClick={() => setEcLevel(ec)}
              className={`w-9 h-9 rounded-lg border text-sans text-xs font-medium transition-colors touch-manipulation ${
                ecLevel === ec ? 'bg-cream text-ink border-cream' : 'text-cream/40 border-cream/15'
              }`}
            >{ec}</button>
          ))}
        </div>
      </Section>

      {/* ── Download size ────────────────────────────────────────────────── */}
      <Section label="Download size">
        <div className="flex gap-2 flex-wrap">
          {[600, 800, 1200, 2000].map(s => (
            <button
              key={s} onClick={() => setQrSize(s)}
              className={`px-3 py-2 rounded-lg border text-sans text-xs transition-colors touch-manipulation ${
                qrSize === s ? 'bg-cream text-ink border-cream' : 'text-cream/40 border-cream/15'
              }`}
            >{s}px</button>
          ))}
        </div>
      </Section>

      {/* ── Downloads ────────────────────────────────────────────────────── */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={downloadPNG}
          className="flex-1 py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
        >
          Download PNG
        </button>
        <button
          onClick={downloadSVG}
          className="px-5 py-3.5 rounded-full border border-cream/20 text-cream/60 text-sans text-sm tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
        >
          SVG
        </button>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="text-mono text-cream/25 text-[10px] tracking-widest uppercase text-center touch-manipulation"
        >
          Close
        </button>
      )}
    </div>
  )
}

// ── Shared mini-components ────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase">{label}</p>
      {children}
    </div>
  )
}

function TabRow<T extends string>({
  options, value, onChange, label,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: (v: T) => string
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(opt => (
        <button
          key={opt} onClick={() => onChange(opt)}
          className={`px-3 py-2 rounded-lg border text-sans text-xs tracking-wide transition-colors touch-manipulation ${
            value === opt ? 'bg-cream text-ink border-cream' : 'text-cream/40 border-cream/15'
          }`}
        >{label(opt)}</button>
      ))}
    </div>
  )
}

function ColorInput({ label, value, onChange, id }: {
  label: string; value: string; onChange: (v: string) => void; id: string
}) {
  return (
    <div className="flex flex-col gap-1.5 items-start">
      <label className="text-sans text-cream/40 text-xs">{label}</label>
      <div className="relative">
        <div
          className="w-9 h-9 rounded-full border-2 border-cream/20 cursor-pointer"
          style={{ background: value }}
          onClick={() => document.getElementById(id)?.click()}
        />
        <input
          id={id} type="color" value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
        />
      </div>
      <p className="text-mono text-cream/20 text-[10px] uppercase">{value}</p>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-cream' : 'bg-cream/15'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${value ? 'left-5 bg-ink' : 'left-0.5 bg-cream/40'}`} />
    </button>
  )
}
