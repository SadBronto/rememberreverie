import { useRef, useEffect, useCallback, useState } from 'react'

// ── Colour math ───────────────────────────────────────────────────────────────

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else                h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  color: string        // hex in
  onChange: (hex: string) => void
  onClose: () => void
}

const WHEEL_SIZE = 220   // canvas px — small keeps paint fast

export default function ColorWheelPicker({ color, onChange, onClose }: Props) {
  const wheelRef     = useRef<HTMLCanvasElement>(null)
  const savedRef     = useRef<ImageData | null>(null)   // wheel without cursor

  const init         = hexToHsl(color)
  const [hue, setHue]      = useState(init[0])
  const [sat, setSat]      = useState(init[1])
  const [lit, setLit]      = useState(Math.max(10, Math.min(90, init[2])))

  // ── Draw the HSL wheel (all pixels) ────────────────────────────────────────
  const paintWheel = useCallback((lightness: number) => {
    const canvas = wheelRef.current
    if (!canvas) return
    const ctx  = canvas.getContext('2d')!
    const size = WHEEL_SIZE
    const cx   = size / 2, cy = size / 2, r = size / 2 - 1

    const img  = ctx.createImageData(size, size)
    const d    = img.data

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > r) continue
        const h  = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
        const s  = (dist / r) * 100
        const [rr, gg, bb] = hslToRgb(h, s, lightness)
        const i  = (y * size + x) * 4
        d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    savedRef.current = ctx.getImageData(0, 0, size, size)
  }, [])

  // ── Overlay the selection cursor ────────────────────────────────────────────
  const paintCursor = useCallback((h: number, s: number) => {
    const canvas = wheelRef.current
    if (!canvas || !savedRef.current) return
    const ctx  = canvas.getContext('2d')!
    const size = WHEEL_SIZE
    const cx   = size / 2, cy = size / 2, r = size / 2 - 1

    ctx.putImageData(savedRef.current, 0, 0)    // restore wheel

    const angle  = h * Math.PI / 180
    const radius = (s / 100) * r
    const px     = cx + Math.cos(angle) * radius
    const py     = cy + Math.sin(angle) * radius

    ctx.beginPath()
    ctx.arc(px, py, 9, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth   = 3.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(px, py, 9, 0, Math.PI * 2)
    ctx.strokeStyle = 'white'
    ctx.lineWidth   = 2
    ctx.stroke()
  }, [])

  // Initial wheel paint
  useEffect(() => { paintWheel(lit) }, [])          // eslint-disable-line react-hooks/exhaustive-deps
  // Repaint wheel when lightness slider moves
  useEffect(() => { paintWheel(lit); paintCursor(hue, sat) }, [lit])  // eslint-disable-line react-hooks/exhaustive-deps
  // Reposition cursor when hue/sat change
  useEffect(() => { paintCursor(hue, sat) }, [hue, sat, paintCursor])

  // ── Pointer interaction on the wheel ───────────────────────────────────────
  function pickFromPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = wheelRef.current!
    const rect   = canvas.getBoundingClientRect()
    const scale  = WHEEL_SIZE / rect.width
    const x      = (e.clientX - rect.left) * scale
    const y      = (e.clientY - rect.top)  * scale
    const cx     = WHEEL_SIZE / 2, cy = WHEEL_SIZE / 2
    const r      = WHEEL_SIZE / 2 - 1
    const dx     = x - cx, dy = y - cy
    const dist   = Math.sqrt(dx * dx + dy * dy)
    if (dist > r) return

    const newH = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
    const newS = Math.min((dist / r) * 100, 100)
    setHue(newH); setSat(newS)
    const [rr, gg, bb] = hslToRgb(newH, newS, lit)
    onChange(rgbToHex(rr, gg, bb))
  }

  function handleLightness(newL: number) {
    setLit(newL)
    const [rr, gg, bb] = hslToRgb(hue, sat, newL)
    onChange(rgbToHex(rr, gg, bb))
  }

  const previewHex = rgbToHex(...hslToRgb(hue, sat, lit))
  // gradient under the lightness thumb: black → vivid hue → white
  const midHex     = rgbToHex(...hslToRgb(hue, Math.max(sat, 80), 50))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onPointerDown={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl px-6 pt-7 pb-10 safe-bottom flex flex-col items-center gap-5"
        style={{ background: '#1a1612' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Colour wheel */}
        <canvas
          ref={wheelRef}
          width={WHEEL_SIZE}
          height={WHEEL_SIZE}
          style={{ width: 260, height: 260, borderRadius: '50%', cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pickFromPointer(e) }}
          onPointerMove={e => { if (e.buttons) pickFromPointer(e) }}
        />

        {/* Lightness strip + slider */}
        <div className="w-full">
          <div
            className="w-full h-3 rounded-full mb-2"
            style={{ background: `linear-gradient(to right, #111, ${midHex}, #fff)` }}
          />
          <input
            type="range"
            min={5}
            max={95}
            value={lit}
            onChange={e => handleLightness(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: previewHex }}
          />
        </div>

        {/* Preview + Done */}
        <div className="w-full flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-full flex-shrink-0"
            style={{ background: previewHex, boxShadow: '0 0 0 2px rgba(245,240,232,0.3)' }}
          />
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase touch-manipulation"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
