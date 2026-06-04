import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useSessionStore } from '@/store/sessionStore'
import type { Annotation } from '@/types/session'
import ColorWheelPicker from '@/components/ColorWheelPicker'

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

  const [photoUrl,            setPhotoUrl]            = useState<string | null>(null)
  const [hasDrawn,            setHasDrawn]            = useState(false)
  const [isSubmitting,        setIsSubmitting]        = useState(false)
  const [colorHex,            setColorHex]            = useState<string>('#1a1612')
  const [isRainbow,           setIsRainbow]           = useState(false)
  const [showColorPicker,     setShowColorPicker]     = useState(false)
  const [selectedWeightIndex, setSelectedWeightIndex] = useState(1) // Medium

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

  // Sync canvas pixel dimensions to its CSS size whenever the container resizes
  useEffect(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !photoUrl) return

    const sync = () => {
      const { clientWidth, clientHeight } = container
      if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        canvas.width  = clientWidth
        canvas.height = clientHeight
      }
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(container)
    return () => ro.disconnect()
  }, [photoUrl])

  function getCanvasPos(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect   = canvasRef.current!.getBoundingClientRect()
    const scaleX = canvasRef.current!.width  / rect.width
    const scaleY = canvasRef.current!.height / rect.height
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY]
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    // Save state before this stroke so we can undo
    strokeHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))

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
    ctx.lineWidth   = weight
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.strokeStyle = color

    // Smoothing: draw a quadratic curve from the previous midpoint to the new
    // midpoint, using the real sample as the control point. This rounds off the
    // jagged segments you get from raw finger samples.
    const n  = pts.length
    const p0 = pts[n - 3]!, p1 = pts[n - 2]!, p2 = pts[n - 1]!
    const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
    const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

    ctx.beginPath()
    ctx.moveTo(m1.x, m1.y)
    ctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y)
    ctx.stroke()
  }, [selectedWeightIndex])

  const onPointerUp = useCallback(() => {
    if (!isPointerDownRef.current) return
    isPointerDownRef.current = false

    const ctx = canvasRef.current?.getContext('2d')
    const pts = strokePointsRef.current
    if (ctx && pts.length > 0) {
      const color  = activeColorRef.current === 'rainbow' ? getRainbowColor() : activeColorRef.current
      const weight = WEIGHTS[selectedWeightIndex]?.px ?? 2.8
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
    strokePointsRef.current = []
  }, [selectedWeightIndex])

  function handleUndo() {
    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!ctx || !canvas || strokeHistoryRef.current.length === 0) return

    const prev = strokeHistoryRef.current.pop()!
    ctx.putImageData(prev, 0, 0)
    if (strokeHistoryRef.current.length === 0) setHasDrawn(false)
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    strokeHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
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
