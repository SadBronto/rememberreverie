import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { getStroke } from 'perfect-freehand'
import { useSessionStore } from '@/store/sessionStore'
import type { Annotation } from '@/types/session'
import ColorWheelPicker from '@/components/ColorWheelPicker'

type Mode = 'quadratic' | 'pressure'

// Rainbow hue cycles through the full spectrum as you draw
let rainbowHue = 0
function getRainbowColor(): string {
  rainbowHue = (rainbowHue + 2) % 360
  return `hsla(${rainbowHue},72%,42%,0.92)`
}

const WEIGHTS = [
  { label: 'Fine',   px: 1.5 },
  { label: 'Medium', px: 2.8 },
  { label: 'Bold',   px: 5.0 },
]

// ── Component ────────────────────────────────────────────────────────────────
export default function AnnotatePage() {
  const { weddingId }   = useParams()
  const navigate        = useNavigate()
  const location        = useLocation()
  const { activeSession, weddingConfig, setAnnotation, finalizeSession } = useSessionStore()

  // Did CameraPage tell us this is the final demo photo?
  const isLastDemoPhoto = (location.state as { isLastDemoPhoto?: boolean } | null)?.isLastDemoPhoto ?? false

  const containerRef     = useRef<HTMLDivElement>(null)
  const canvasRef        = useRef<HTMLCanvasElement>(null)
  const strokeHistoryRef = useRef<ImageData[]>([])
  const strokePointsRef  = useRef<{ x: number; y: number }[]>([])
  const isPointerDownRef = useRef(false)
  const activeColorRef   = useRef<string>('#1a1612')
  const modeRef          = useRef<Mode>('quadratic')
  const strokePointsHistoryRef = useRef<Array<{ points: Array<[number, number]>; color: string; weight: number }>>([])
  const [photoUrl,            setPhotoUrl]            = useState<string | null>(null)
  const [hasDrawn,            setHasDrawn]            = useState(false)
  const [isSubmitting,        setIsSubmitting]        = useState(false)
  const [colorHex,            setColorHex]            = useState<string>('#1a1612')
  const [isRainbow,           setIsRainbow]           = useState(false)
  const [showColorPicker,     setShowColorPicker]     = useState(false)
  const [selectedWeightIndex, setSelectedWeightIndex] = useState(1) // Medium
  const [mode,                setMode]                = useState<Mode>('quadratic')
  const [isIOS,               setIsIOS]               = useState(false)

  // Redirect if no active session with output image
  useEffect(() => {
    if (!activeSession?.outputImage) {
      navigate(`/w/${weddingId ?? 'demo'}/camera`, { replace: true })
      return
    }
    const url = URL.createObjectURL(activeSession.outputImage)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [activeSession, navigate, weddingId])

  // Keep activeColorRef in sync (avoids stale closure in onPointerMove)
  useEffect(() => {
    activeColorRef.current = isRainbow ? 'rainbow' : colorHex
  }, [colorHex, isRainbow])

  // Detect iOS and disable pressure mode (simulatePressure doesn't work on iOS touch)
  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(iOS)
  }, [])

  // Keep modeRef in sync
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // Sync canvas pixel dimensions to its CSS size whenever the container resizes
  useEffect(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !photoUrl) return

    const sync = () => {
      const { clientWidth, clientHeight } = container
      // Render at device resolution so the signature stays sharp when it's later
      // scaled up onto the full-size photo. It used to be captured at CSS size and
      // looked jagged/blurry once composited. The context is scaled to match, so
      // all drawing code keeps working in CSS coordinates.
      const res = Math.max(2, Math.min(window.devicePixelRatio || 1, 3))
      const w = Math.round(clientWidth * res)
      const h = Math.round(clientHeight * res)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.setTransform(res, 0, 0, res, 0, 0)
      }
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(container)
    return () => ro.disconnect()
  }, [photoUrl])

  function getCanvasPos(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect()
    // The context is pre-scaled to device pixels, so we draw in CSS coordinates.
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    // Save state before this stroke so we can undo. Cap the history — at device
    // resolution each snapshot is several MB, so unbounded growth could OOM mobile.
    strokeHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (strokeHistoryRef.current.length > 20) strokeHistoryRef.current.shift()

    const [x, y] = getCanvasPos(e)
    strokePointsRef.current = [{ x, y }]
    isPointerDownRef.current = true
    setHasDrawn(true)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    const pts = strokePointsRef.current
    const [x, y] = getCanvasPos(e)
    pts.push({ x, y })
    if (pts.length < 3) return

    const color = activeColorRef.current === 'rainbow'
      ? getRainbowColor()
      : activeColorRef.current

    const weight = WEIGHTS[selectedWeightIndex]?.px ?? 2.8

    if (modeRef.current === 'pressure') {
      // Perfect-freehand: simulatePressure derives width from drawing speed
      const outline = getStroke(pts.map(p => [p.x, p.y] as [number, number]), {
        size: weight * 2.0,
        thinning: 0.72,
        smoothing: 0.86,
        streamline: 0.72,
        simulatePressure: true,
      })
      if (outline.length) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        // Redraw all previous strokes
        for (const prevStroke of strokePointsHistoryRef.current) {
          const prevOutline = getStroke(prevStroke.points, {
            size: prevStroke.weight * 2.0,
            thinning: 0.72,
            smoothing: 0.86,
            streamline: 0.72,
            simulatePressure: true,
          })
          if (prevOutline.length) {
            ctx.fillStyle = prevStroke.color
            ctx.beginPath()
            ctx.moveTo(prevOutline[0]![0], prevOutline[0]![1])
            for (let i = 1; i < prevOutline.length; i++) {
              ctx.lineTo(prevOutline[i]![0], prevOutline[i]![1])
            }
            ctx.closePath()
            ctx.fill()
          }
        }
        // Draw current stroke
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(outline[0]![0], outline[0]![1])
        for (let i = 1; i < outline.length; i++) {
          ctx.lineTo(outline[i]![0], outline[i]![1])
        }
        ctx.closePath()
        ctx.fill()
      }
    } else {
      // Quadratic midpoint smoothing, constant width
      ctx.lineWidth   = weight
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.strokeStyle = color

      const n  = pts.length
      const p0 = pts[n - 3]!, p1 = pts[n - 2]!, p2 = pts[n - 1]!
      const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
      const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

      ctx.beginPath()
      ctx.moveTo(m1.x, m1.y)
      ctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y)
      ctx.stroke()
    }
  }, [selectedWeightIndex])

  const onPointerUp = useCallback(() => {
    if (!isPointerDownRef.current) return
    isPointerDownRef.current = false

    const ctx = canvasRef.current?.getContext('2d')
    const pts = strokePointsRef.current
    if (ctx && pts.length > 0) {
      const color  = activeColorRef.current === 'rainbow' ? getRainbowColor() : activeColorRef.current
      const weight = WEIGHTS[selectedWeightIndex]?.px ?? 2.8

      if (modeRef.current === 'pressure') {
        // Store for redo on canvas clear
        strokePointsHistoryRef.current.push({
          points: pts.map(p => [p.x, p.y] as [number, number]),
          color,
          weight,
        })
        if (pts.length === 1) {
          // Tap: draw a dot
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(pts[0]!.x, pts[0]!.y, (weight * 2.0) / 4, 0, Math.PI * 2)
          ctx.fill()
        }
        // For pressure mode, the stroke is already drawn in onPointerMove
      } else {
        // Quadratic mode
        ctx.lineCap     = 'round'
        ctx.lineJoin    = 'round'
        ctx.strokeStyle = color
        ctx.fillStyle   = color
        ctx.lineWidth   = weight

        if (pts.length === 1) {
          // A tap with no movement — leave a dot
          ctx.beginPath()
          ctx.arc(pts[0]!.x, pts[0]!.y, weight / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // Finish the stroke from the last midpoint to the final fingertip point
          const n  = pts.length
          const p1 = pts[n - 2]!, p2 = pts[n - 1]!
          const m1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
          ctx.beginPath()
          ctx.moveTo(m1.x, m1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()
        }
      }
    }
    strokePointsRef.current = []
  }, [selectedWeightIndex])

  function handleUndo() {
    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    if (modeRef.current === 'pressure') {
      if (strokePointsHistoryRef.current.length === 0) return
      strokePointsHistoryRef.current.pop()
      // Redraw everything
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const stroke of strokePointsHistoryRef.current) {
        const outline = getStroke(stroke.points, {
          size: stroke.weight * 2.0,
          thinning: 0.72,
          smoothing: 0.86,
          streamline: 0.72,
          simulatePressure: true,
        })
        if (outline.length) {
          ctx.fillStyle = stroke.color
          ctx.beginPath()
          ctx.moveTo(outline[0]![0], outline[0]![1])
          for (let i = 1; i < outline.length; i++) {
            ctx.lineTo(outline[i]![0], outline[i]![1])
          }
          ctx.closePath()
          ctx.fill()
        }
      }
      if (strokePointsHistoryRef.current.length === 0) setHasDrawn(false)
    } else {
      if (strokeHistoryRef.current.length === 0) return
      const prev = strokeHistoryRef.current.pop()!
      ctx.putImageData(prev, 0, 0)
      if (strokeHistoryRef.current.length === 0) setHasDrawn(false)
    }
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    if (modeRef.current === 'pressure') {
      strokePointsHistoryRef.current = []
    } else {
      strokeHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  function destination() {
    return isLastDemoPhoto ? '/demo/gallery' : `/w/${weddingId ?? 'demo'}/done`
  }

  async function handleKeep() {
    if (!activeSession || isSubmitting) return
    setIsSubmitting(true)

    let annotation: Annotation | null = null
    let finalOutputImage = activeSession.outputImage

    if (hasDrawn && canvasRef.current && activeSession.outputImage) {
      annotation = {
        type:      weddingConfig?.annotationMode === 'doodle' ? 'doodle' : 'signature',
        dataUrl:   canvasRef.current.toDataURL('image/png'),
        appliedAt: new Date(),
      }
      setAnnotation(annotation)

      // For demo sessions: bake the signature into the photo so the gallery
      // shows it correctly (gallery reads outputImage, not annotation.dataUrl).
      if (weddingConfig?.isDemoMode) {
        finalOutputImage = await compositeSignatureOntoPhoto(
          activeSession.outputImage,
          canvasRef.current,
        )
      }
    }

    const sessionToSave = {
      ...activeSession,
      annotation,
      outputImage: finalOutputImage,
    }

    await finalizeSession(sessionToSave)
    navigate(destination(), { replace: true })
  }

  async function handleSkip() {
    if (!activeSession || isSubmitting) return
    setIsSubmitting(true)
    await finalizeSession(activeSession)
    navigate(destination(), { replace: true })
  }

  if (!photoUrl) return null

  const isSignature = weddingConfig?.annotationMode !== 'doodle'

  return (
    <div className="relative flex flex-col min-h-dvh bg-ink overflow-hidden select-none">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4 pb-3 safe-top">
        <button
          onClick={handleSkip}
          disabled={isSubmitting}
          className="text-mono text-cream/35 text-[11px] tracking-widest uppercase touch-manipulation"
        >
          Skip
        </button>

        <p className="text-mono text-cream/40 text-[11px] tracking-[0.25em] uppercase">
          {isSignature ? 'Sign it' : 'Make your mark'}
        </p>

        <div className="flex items-center gap-3">
          {hasDrawn && (
            <button
              onClick={handleUndo}
              disabled={isSubmitting}
              className="text-mono text-cream/35 text-[11px] tracking-widest uppercase touch-manipulation"
            >
              Undo
            </button>
          )}
          {hasDrawn && (
            <button
              onClick={handleClear}
              disabled={isSubmitting}
              className="text-mono text-red-400/60 text-[11px] tracking-widest uppercase touch-manipulation"
            >
              Clear
            </button>
          )}
          {!hasDrawn && <div className="w-10" />}
        </div>
      </div>

      {/* ── Photo + drawing canvas ───────────────────────────────────────────── */}
      {/* Container uses the ACTUAL photo aspect ratio so no cropping occurs.
          The signature canvas then maps 1-to-1 onto photo pixels (just a scale). */}
      <div className="flex-1 flex items-center justify-center px-4 py-2 min-h-0">
        <div
          ref={containerRef}
          className="relative"
        >
          <img
            src={photoUrl}
            alt=""
            className="block max-w-full"
            style={{ maxHeight: '65vh' }}
            draggable={false}
          />

          {/* Signature hint — inside signing area (bottom ~21% for polaroid) */}
          {isSignature && !hasDrawn && (
            <div
              className="absolute left-[12%] right-[12%] pointer-events-none"
              style={{ bottom: '8%' }}
            >
              <div className="w-full h-px border-b border-dashed border-ink/20" />
              <p className="text-mono text-ink/25 text-[9px] tracking-widest text-center mt-1.5 uppercase">
                your signature
              </p>
            </div>
          )}

          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
      </div>

      {/* ── Pen controls ────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-5 pb-3 flex flex-col gap-3">

        {/* Mode toggle — only show on desktop */}
        {!isIOS && (
          <div className="flex gap-2 justify-center">
            {(['quadratic', 'pressure'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setSelectedWeightIndex(m === 'pressure' ? 0 : 1) }}
                className={`px-3 py-1.5 rounded-full text-sans text-xs tracking-widest uppercase transition-colors touch-manipulation ${
                  mode === m ? 'bg-cream text-ink' : 'border border-cream/15 text-cream/50'
                }`}
              >
                {m === 'quadratic' ? 'Smooth' : 'Pressure'}
              </button>
            ))}
          </div>
        )}

        {/* Color row — colour wheel picker + rainbow */}
        <div className="flex items-center gap-4 justify-center">

          {/* Colour swatch — tapping opens the custom colour wheel */}
          <button
            onClick={() => { setIsRainbow(false); setShowColorPicker(true) }}
            aria-label="Choose colour"
            className={`
              w-9 h-9 rounded-full flex-shrink-0 touch-manipulation transition-all duration-150
              ring-2 ring-offset-2 ring-offset-ink
              ${!isRainbow ? 'ring-cream/60 scale-110' : 'ring-cream/20 scale-100'}
            `}
            style={{ background: colorHex }}
          />

          {/* Rainbow toggle */}
          <button
            onClick={() => setIsRainbow((r) => !r)}
            aria-label="Rainbow"
            className={`
              w-9 h-9 rounded-full flex-shrink-0 touch-manipulation transition-all duration-150
              ring-2 ring-offset-2 ring-offset-ink
              ${isRainbow ? 'ring-cream/60 scale-110' : 'ring-cream/20 scale-100'}
            `}
            style={{ background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }}
          />

          {/* Divider */}
          <div className="w-px h-5 bg-cream/15" />

          {/* Weight buttons */}
          {WEIGHTS.map((w, i) => (
            <button
              key={w.label}
              onClick={() => setSelectedWeightIndex(i)}
              className={`
                flex items-center justify-center rounded-full border px-3 py-1.5 touch-manipulation
                transition-colors text-[11px] tracking-wider text-mono uppercase
                ${selectedWeightIndex === i
                  ? 'border-cream/50 text-cream/80 bg-cream/8'
                  : 'border-cream/15 text-cream/35'
                }
              `}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 pb-8 safe-bottom">
        <button
          onClick={handleKeep}
          disabled={isSubmitting}
          className="w-full max-w-xs py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform duration-100 touch-manipulation disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Keep Memory'}
        </button>
      </div>
      {/* Colour wheel picker overlay */}
      {showColorPicker && (
        <ColorWheelPicker
          color={colorHex}
          onChange={(hex) => { setColorHex(hex); activeColorRef.current = hex }}
          onClose={() => setShowColorPicker(false)}
        />
      )}
    </div>
  )
}

// ── Composite helper ─────────────────────────────────────────────────────────
// Draws the signature canvas on top of the photo at full photo resolution.
// sigCanvas is at display size; we just scale it up to photo dimensions.
async function compositeSignatureOntoPhoto(
  photoBlob: Blob,
  sigCanvas: HTMLCanvasElement,
): Promise<Blob> {
  const photoUrl = URL.createObjectURL(photoBlob)
  const photo = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = photoUrl
  })
  URL.revokeObjectURL(photoUrl)

  const canvas = document.createElement('canvas')
  canvas.width  = photo.naturalWidth
  canvas.height = photo.naturalHeight
  const ctx = canvas.getContext('2d')!

  // Draw the base photo
  ctx.drawImage(photo, 0, 0)

  // Scale the signature up to full photo resolution and composite it
  const scaleX = photo.naturalWidth  / sigCanvas.width
  const scaleY = photo.naturalHeight / sigCanvas.height
  ctx.save()
  ctx.scale(scaleX, scaleY)
  ctx.drawImage(sigCanvas, 0, 0)
  ctx.restore()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Composite toBlob failed')),
      'image/jpeg',
      0.92,
    )
  })
}
