import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getStroke } from 'perfect-freehand'

// Private sandbox (route: /admin/signature-lab) to compare two pen feels before
// deciding what to ship in the guest signing screen:
//   • Quadratic  — midpoint curve smoothing, constant width (what AnnotatePage uses now)
//   • Pressure   — perfect-freehand: variable width that tapers with speed (ink-pen feel)
// Draw the same signature in each, flip between them, judge which you like.

type Mode = 'quadratic' | 'pressure'
type Pt = { x: number; y: number }

export default function SignatureLabPage() {
  const navigate = useNavigate()

  useEffect(() => {
    async function checkAuth() {
      if (!supabase) { navigate('/admin/login', { replace: true }); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/admin/login', { replace: true }); return }
    }
    checkAuth()
  }, [navigate])
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const strokesRef  = useRef<Pt[][]>([])
  const currentRef  = useRef<Pt[]>([])
  const drawingRef  = useRef(false)
  const modeRef     = useRef<Mode>('quadratic')
  const sizeRef     = useRef(7)

  const [mode, setMode] = useState<Mode>('quadratic')
  const [size, setSize] = useState(7)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { sizeRef.current = size }, [size])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle   = '#1a1612'
    ctx.strokeStyle = '#1a1612'

    const all = [...strokesRef.current, currentRef.current].filter(s => s.length > 0)

    for (const stroke of all) {
      if (modeRef.current === 'pressure') {
        // perfect-freehand: simulatePressure derives width from drawing speed
        const outline = getStroke(stroke.map(p => [p.x, p.y]), {
          size: sizeRef.current * 2.4,
          thinning: 0.62,
          smoothing: 0.55,
          streamline: 0.5,
          simulatePressure: true,
        })
        if (outline.length) {
          ctx.beginPath()
          ctx.moveTo(outline[0]![0], outline[0]![1])
          for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i]![0], outline[i]![1])
          ctx.closePath()
          ctx.fill()
        }
      } else {
        // Quadratic midpoint smoothing, constant width
        if (stroke.length === 1) {
          ctx.beginPath()
          ctx.arc(stroke[0]!.x, stroke[0]!.y, sizeRef.current / 2, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        ctx.lineWidth = sizeRef.current
        ctx.lineCap   = 'round'
        ctx.lineJoin  = 'round'
        ctx.beginPath()
        ctx.moveTo(stroke[0]!.x, stroke[0]!.y)
        for (let i = 1; i < stroke.length - 1; i++) {
          const mid = { x: (stroke[i]!.x + stroke[i + 1]!.x) / 2, y: (stroke[i]!.y + stroke[i + 1]!.y) / 2 }
          ctx.quadraticCurveTo(stroke[i]!.x, stroke[i]!.y, mid.x, mid.y)
        }
        const last = stroke[stroke.length - 1]!
        ctx.lineTo(last.x, last.y)
        ctx.stroke()
      }
    }
  }, [])

  // Keep the canvas pixel size synced to its CSS box
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const sync = () => {
      const r = canvas.getBoundingClientRect()
      const w = Math.round(r.width), h = Math.round(r.height)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; redraw() }
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [redraw])

  // Re-render when the mode or size changes
  useEffect(() => { redraw() }, [mode, size, redraw])

  function pos(e: React.PointerEvent<HTMLCanvasElement>): Pt {
    const r = canvasRef.current!.getBoundingClientRect()
    const sx = canvasRef.current!.width / r.width
    const sy = canvasRef.current!.height / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    currentRef.current = [pos(e)]
    redraw()
  }, [redraw])

  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    currentRef.current.push(pos(e))
    redraw()
  }, [redraw])

  const onUp = useCallback(() => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (currentRef.current.length > 0) strokesRef.current.push(currentRef.current)
    currentRef.current = []
    redraw()
  }, [redraw])

  function clear() {
    strokesRef.current = []
    currentRef.current = []
    redraw()
  }

  return (
    <div className="min-h-dvh bg-ink flex flex-col safe-top safe-bottom px-6">
      <header className="pt-8 pb-4">
        <p className="text-mono text-cream/30 text-[10px] tracking-[0.3em] uppercase">Signature lab — private</p>
        <h1 className="text-serif text-cream text-2xl font-normal mt-1">Pen feel comparison</h1>
        <p className="text-sans text-cream/40 text-sm mt-2 max-w-md leading-relaxed">
          Sign below, then flip between the two. <span className="text-cream/70">Quadratic</span> is what
          guests use now (smooth, even line). <span className="text-cream/70">Pressure</span> tapers with
          speed for an ink-pen look.
        </p>
      </header>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-3">
        {(['quadratic', 'pressure'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-full text-sans text-xs tracking-widest uppercase transition-colors touch-manipulation ${
              mode === m ? 'bg-cream text-ink' : 'border border-cream/15 text-cream/50'
            }`}
          >
            {m === 'quadratic' ? 'Quadratic' : 'Pressure'}
          </button>
        ))}
      </div>

      {/* Signing card */}
      <div className="relative rounded-2xl overflow-hidden bg-[#faf8f4] flex-1 min-h-0 mb-4" style={{ maxHeight: '52vh' }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        />
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <div className="w-2/3 border-b border-dashed border-ink/20" />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-5 pb-8">
        <label className="flex items-center gap-3 flex-1">
          <span className="text-sans text-cream/50 text-xs tracking-widest uppercase shrink-0">Weight</span>
          <input
            type="range" min={2} max={16} step={1} value={size}
            onChange={e => setSize(Number(e.target.value))}
            className="flex-1 accent-cream"
          />
          <span className="text-mono text-cream/40 text-xs w-6 text-right">{size}</span>
        </label>
        <button
          onClick={clear}
          className="px-5 py-2.5 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation active:bg-cream/5"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
