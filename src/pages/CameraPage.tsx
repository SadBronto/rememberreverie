import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useSessionStore } from '@/store/sessionStore'
import { useDemoStore, DEMO_PROMPTS } from '@/store/demoStore'
import { CAMERA_MODES, type CameraModeConfig } from '@/config/modes'
import { processSession } from '@/lib/imageProcessor'
import { playShutterSound } from '@/lib/sound'
import { flushPendingUploads, countRecovery } from '@/lib/recovery'
import type { CameraModeName } from '@/types/session'
import ModeSelector from '@/components/ModeSelector'
import ShutterButton from '@/components/ShutterButton'
import ViewfinderOverlay from '@/components/ViewfinderOverlay'

type CapturePhase = 'ready' | 'capturing' | 'processing' | 'uploading'
type CameraError = 'no-camera' | 'permission-denied' | null

export default function CameraPage() {
  const { weddingId } = useParams()
  const navigate = useNavigate()
  const { weddingConfig, selectedMode, setSelectedMode, beginSession, setActiveSessionOutput, finalizeSession } = useSessionStore()
  const { photosTaken, currentPromptIndex, incrementPhotoCount, advancePrompt } = useDemoStore()

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<CapturePhase>('ready')
  const [flashVisible, setFlashVisible] = useState(false)
  const [cameraError, setCameraError] = useState<CameraError>(null)
  const [pendingCount, setPendingCount] = useState(0)
  // Disposable can be shot landscape OR portrait (guest's choice, this mode only)
  const [dispOrientation, setDispOrientation] = useState<'landscape' | 'portrait'>('landscape')
  // Which camera the guest is using. 'user' = front (selfie). The preview is
  // mirrored for a natural feel, but the SAVED photo is un-mirrored (we draw from
  // the raw video frames, which CSS transforms don't touch) — like a real photo.
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')

  const modeConfig = CAMERA_MODES[selectedMode]
  // Disposable portrait flips the aspect ratio; everything else uses its own config.
  const captureConfig = useMemo<CameraModeConfig>(() => {
    if (selectedMode === 'disposable' && dispOrientation === 'portrait') {
      return { ...modeConfig, aspectRatio: 2 / 3, orientation: 'portrait' }
    }
    return modeConfig
  }, [selectedMode, dispOrientation, modeConfig])
  const isDemo = weddingConfig?.isDemoMode ?? false
  // The "sign here" border hint only applies to actual signature mode (demo always
  // demonstrates signing). Doodle draws on the photo, and 'disabled' = no signing.
  const signatureMode = isDemo ? true : weddingConfig?.annotationMode === 'signature'
  const photoCap = weddingConfig?.photoCap
  const atPhotoLimit = photoCap !== undefined && photosTaken >= photoCap
  const prompt = isDemo ? (DEMO_PROMPTS[currentPromptIndex] ?? null) : null
  const allowedModes = weddingConfig?.allowedModes ?? ['disposable']
  // Front-camera flip is allowed unless the event explicitly turned it off.
  const selfieAllowed = weddingConfig?.selfieEnabled !== false

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  // Restart the camera when the MODE or the FACING (front/rear) changes — but NOT
  // on orientation toggle, which must not re-zoom the feed (the overlay + capture
  // handle orientation).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMode, facing])

  // Retry any photos that didn't finish uploading on a previous visit, and keep a
  // live count so the guest can SEE that stranded photos are still being handled
  // (and that they clear once the connection's back).
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const n = await countRecovery()
      if (alive) setPendingCount(n)
    }
    const flushAndRefresh = async () => { await flushPendingUploads(); await refresh() }
    void flushAndRefresh()
    const interval = setInterval(refresh, 5000)
    window.addEventListener('online', flushAndRefresh)
    return () => {
      alive = false
      clearInterval(interval)
      window.removeEventListener('online', flushAndRefresh)
    }
  }, [])

  async function startCamera() {
    stopCamera()
    setCameraError(null)
    // Request a generous, consistent feed and DON'T force the mode's aspect ratio —
    // forcing it made the browser crop/zoom the sensor (Polaroid looked zoomed, and
    // toggling Disposable orientation zoomed). We frame with the viewfinder overlay
    // and crop to the mode's aspect at capture time instead.
    const videoConstraints = {
      width:  { ideal: 2560 },
      height: { ideal: 1440 },
    }

    // Open the requested camera first, then fall back to the other (e.g. a device
    // with no front camera, or a desktop webcam).
    const order: Array<'environment' | 'user'> =
      facing === 'user' ? ['user', 'environment'] : ['environment', 'user']

    for (const facingMode of order) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { ...videoConstraints, facingMode },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        // Reflect the camera that actually opened, so the mirror matches reality.
        if (facingMode !== facing) setFacing(facingMode)
        return
      } catch (err) {
        const name = (err as DOMException).name
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setCameraError('permission-denied')
          return
        }
        // NotFoundError, NotReadableError, etc. — try next facing mode
      }
    }

    // Both cameras failed — no camera hardware available
    setCameraError('no-camera')
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // Flip between rear and front cameras (the effect restarts the stream).
  function flipCamera() {
    if (phase !== 'ready') return
    navigator.vibrate?.(10)
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
  }

  const capturePhoto = useCallback(async () => {
    if (phase !== 'ready' || !videoRef.current || !weddingConfig || atPhotoLimit) return

    setPhase('capturing')
    setFlashVisible(true)
    setTimeout(() => setFlashVisible(false), 180)

    // Haptic + sound
    navigator.vibrate?.(30)
    playShutterSound()

    try {
      const video = videoRef.current
      const vidW  = video.videoWidth
      const vidH  = video.videoHeight

      // Capture exactly the pixels CSS object-cover is showing on screen.
      // Without this, the compositor and the viewfinder guide disagree whenever
      // the camera delivers a different aspect ratio than the viewport (common on
      // Android, which often delivers 4:3 landscape even when held portrait).
      const dispW = video.clientWidth   // = window.innerWidth for a full-bleed video
      const dispH = video.clientHeight  // = window.innerHeight
      const coverScale = Math.max(dispW / vidW, dispH / vidH)
      const srcW = dispW / coverScale
      const srcH = dispH / coverScale
      const srcX = (vidW - srcW) / 2
      const srcY = (vidH - srcH) / 2

      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(srcW)
      canvas.height = Math.round(srcH)
      canvas.getContext('2d')!.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)

      const rawBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Capture failed')), 'image/jpeg', 0.97)
      )

      setPhase('processing')

      beginSession(weddingConfig.id, selectedMode)
      const sourceImages = [{ blob: rawBlob, capturedAt: new Date(), index: 0 }]

      const outputBlob = await processSession(
        sourceImages,
        captureConfig,
        {
          timestampEnabled: weddingConfig.timestampEnabled,
          timestampStyle:   weddingConfig.timestampStyle,
          coupleNames:      weddingConfig.coupleNames,
        }
      )

      setActiveSessionOutput(outputBlob, sourceImages)
      setPhase('uploading')

      if (isDemo) {
        incrementPhotoCount()
        advancePrompt()
      }

      const newPhotoCount = photosTaken + 1
      const isLastDemoPhoto = isDemo && photoCap !== undefined && newPhotoCount >= photoCap

      // Annotation routing:
      //   • signature → Polaroid only (it's a sign-the-border moment)
      //   • doodle    → any style (you're drawing on the photo itself)
      //   • disabled  → never
      // Demo always shows signing on Polaroid so guests experience it.
      const needsAnnotation = isDemo
        ? selectedMode === 'polaroid'
        : weddingConfig.annotationMode === 'doodle'
          ? true
          : weddingConfig.annotationMode === 'signature'
            ? selectedMode === 'polaroid'
            : false

      if (needsAnnotation) {
        navigate(`/w/${weddingId ?? 'demo'}/annotate`, {
          replace: true,
          state: { isLastDemoPhoto },
        })
      } else if (isLastDemoPhoto) {
        // Non-polaroid last demo photo — finalize and jump straight to gallery
        const { activeSession } = useSessionStore.getState()
        if (activeSession) finalizeSession(activeSession)
        navigate('/demo/gallery', { replace: true })
      } else {
        const { activeSession } = useSessionStore.getState()
        if (activeSession) finalizeSession(activeSession)
        navigate(`/w/${weddingId ?? 'demo'}/done`, { replace: true })
      }
    } catch {
      setPhase('ready')
    }
  }, [phase, weddingConfig, selectedMode, modeConfig, captureConfig, atPhotoLimit, isDemo, photosTaken, photoCap, beginSession, setActiveSessionOutput, finalizeSession, incrementPhotoCount, advancePrompt, navigate, weddingId])

  if (!weddingConfig) return null

  if (cameraError === 'no-camera') {
    return <DesktopFallback onBack={() => navigate(-1)} />
  }

  if (cameraError === 'permission-denied') {
    return <PermissionDenied onRetry={startCamera} onBack={() => navigate(-1)} />
  }

  return (
    <div className="relative flex flex-col items-center justify-between min-h-dvh bg-black overflow-hidden select-none">

      {/* Flash */}
      <div
        className="absolute inset-0 bg-white pointer-events-none z-50 transition-opacity duration-150"
        style={{ opacity: flashVisible ? 0.85 : 0 }}
      />

      {/* Viewfinder */}
      <div className="absolute inset-0 flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
        />
        <ViewfinderOverlay mode={selectedMode} phase={phase} aspectRatio={captureConfig.aspectRatio} signatureMode={signatureMode} />
      </div>

      {/* Top bar */}
      <div className="relative z-10 w-full flex items-center justify-between px-5 pt-4 safe-top">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm touch-manipulation"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 13L5 8l5-5" stroke="#f5f0e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <span className="text-serif text-cream/70 text-base italic tracking-wide">
          {modeConfig.label}
        </span>

        {/* Right controls: demo counter + camera flip */}
        <div className="flex items-center gap-2">
          {isDemo && photoCap && (
            <span className="text-mono text-cream/35 text-xs tracking-widest">
              {photosTaken}/{photoCap}
            </span>
          )}
          {selfieAllowed && !cameraError ? (
            <button
              onClick={flipCamera}
              disabled={phase !== 'ready'}
              aria-label="Flip camera"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm touch-manipulation transition-opacity disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 9a8 8 0 0 1 13.5-3.2L20 8M20 4.5V8h-3.5" stroke="#f5f0e8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20 15a8 8 0 0 1-13.5 3.2L4 16M4 19.5V16h3.5" stroke="#f5f0e8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (!isDemo && <div className="w-9 h-9" />)}
        </div>
      </div>

      {/* Pending-upload indicator — stranded photos retry automatically */}
      {pendingCount > 0 && (
        <div className="absolute top-16 left-0 right-0 z-20 flex justify-center pointer-events-none safe-top">
          <div className="bg-ink/70 backdrop-blur-sm border border-amber-film/30 rounded-full px-3.5 py-1.5 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-amber-film/50 border-t-transparent animate-spin" />
            <p className="text-mono text-amber-film/80 text-[10px] tracking-widest uppercase">
              {pendingCount} waiting to upload
            </p>
          </div>
        </div>
      )}

      {/* Demo prompt */}
      {prompt && phase === 'ready' && (
        <div className="relative z-10 px-6 pointer-events-none">
          <div className="bg-black/40 backdrop-blur-md rounded-full px-5 py-2.5 border border-white/10">
            <p className="text-serif text-cream/80 text-sm italic tracking-wide text-center">
              {prompt}
            </p>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="relative z-10 w-full flex flex-col items-center gap-5 pb-8 safe-bottom">
        {/* Disposable orientation toggle (this mode only) */}
        {selectedMode === 'disposable' && phase === 'ready' && (
          <div className="flex gap-1.5">
            {(['landscape', 'portrait'] as const).map(o => (
              <button
                key={o}
                onClick={() => setDispOrientation(o)}
                className={`px-3 py-1 rounded-full text-mono text-[10px] tracking-widest uppercase touch-manipulation transition-colors ${
                  dispOrientation === o ? 'bg-cream text-ink' : 'border border-cream/20 text-cream/50'
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        )}

        {/* Mode selector — only shown when couple has enabled multiple styles */}
        {allowedModes.length > 1 && (
          <ModeSelector
            modes={allowedModes}
            selected={selectedMode}
            onChange={(mode: CameraModeName) => {
              if (phase === 'ready') setSelectedMode(mode)
            }}
          />
        )}

        <ShutterButton
          onPress={capturePhoto}
          disabled={phase !== 'ready' || atPhotoLimit}
          phase={phase}
        />

        {atPhotoLimit && (
          <p className="text-sans text-cream/50 text-xs text-center tracking-wide">
            All memories captured.
          </p>
        )}
      </div>
    </div>
  )
}

function DesktopFallback({ onBack }: { onBack: () => void }) {
  const url = window.location.href

  return (
    <div className="relative flex flex-col min-h-dvh bg-ink overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center px-5 pt-4 safe-top">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-cream/10 touch-manipulation"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 13L5 8l5-5" stroke="#f5f0e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center px-8 pb-12">
        <div>
          <p className="text-mono text-[10px] tracking-[0.3em] text-cream/30 uppercase mb-2">a memory from</p>
          <h1 className="text-serif text-cream text-3xl font-normal tracking-wide">Reverie</h1>
        </div>

        <div className="w-10 h-px bg-cream/20" />

        <div className="flex flex-col gap-2">
          <p className="text-sans text-cream/70 text-sm leading-relaxed">
            Reverie is designed for mobile.
          </p>
          <p className="text-sans text-cream/40 text-sm leading-relaxed">
            Scan with your phone to experience it.
          </p>
        </div>

        {/* QR code */}
        <div className="bg-cream p-5 rounded-2xl">
          <QRCodeSVG
            value={url}
            size={172}
            bgColor="#f5f0e8"
            fgColor="#1a1612"
            level="M"
          />
        </div>

        <p className="text-mono text-cream/20 text-[9px] tracking-wider max-w-[240px] break-all leading-relaxed">
          {url}
        </p>
      </div>
    </div>
  )
}

function PermissionDenied({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <div className="relative flex flex-col min-h-dvh bg-ink overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center px-5 pt-4 safe-top">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-cream/10 touch-manipulation"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 13L5 8l5-5" stroke="#f5f0e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-7 text-center px-8 pb-16">
        <div className="w-10 h-px bg-cream/20" />

        <div className="flex flex-col gap-3">
          <h2 className="text-serif text-cream text-2xl font-normal">Camera access needed</h2>
          <p className="text-sans text-cream/55 text-sm leading-relaxed max-w-[260px]">
            Reverie needs your camera to capture memories. Allow access in your browser settings and try again.
          </p>
        </div>

        <button
          onClick={onRetry}
          className="px-10 py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform duration-100 touch-manipulation"
        >
          Try Again
        </button>

        <div className="w-10 h-px bg-cream/20" />
      </div>
    </div>
  )
}
