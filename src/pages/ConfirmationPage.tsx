import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSessionStore } from '@/store/sessionStore'

const AUTO_RETURN_MS = 7000

export default function ConfirmationPage() {
  const { weddingId } = useParams()
  const navigate = useNavigate()
  const { completedSessions } = useSessionStore()

  const [photoVisible, setPhotoVisible] = useState(false)
  const [textVisible, setTextVisible] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)   // stop auto-return once the guest engages save/share

  const lastSession = completedSessions[completedSessions.length - 1]
  const annotation = lastSession?.annotation ?? null
  const isUploading = lastSession?.uploadStatus === 'uploading'
  const didFail = lastSession?.uploadStatus === 'failed'
  const memoryNum = lastSession?.memoryNumber

  // Build object URL for processed photo
  useEffect(() => {
    if (!lastSession?.outputImage) return
    const url = URL.createObjectURL(lastSession.outputImage)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [lastSession])

  // Staggered entrance — photo first, then text
  useEffect(() => {
    const t1 = setTimeout(() => setPhotoVisible(true), 80)
    const t2 = setTimeout(() => setTextVisible(true), 500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Auto-return progress bar + navigation (skipped once the guest engages save/share)
  useEffect(() => {
    if (paused) return
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      setProgress(Math.min(elapsed / AUTO_RETURN_MS, 1))
      if (elapsed < AUTO_RETURN_MS) {
        requestAnimationFrame(tick)
      }
    }
    const raf = requestAnimationFrame(tick)

    const nav = setTimeout(
      () => navigate(`/w/${weddingId ?? 'demo'}/camera`, { replace: true }),
      AUTO_RETURN_MS
    )

    return () => { cancelAnimationFrame(raf); clearTimeout(nav) }
  }, [navigate, weddingId, paused])

  async function handleSaveShare() {
    setPaused(true)  // give the guest time to use the share sheet
    const file = await buildShareFile(lastSession?.outputImage ?? null, annotation?.dataUrl ?? null, lastSession?.weddingId)
    if (!file) return
    const n = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    if (n.share && n.canShare && n.canShare({ files: [file] })) {
      try { await n.share({ files: [file], title: 'My photo' }) } catch { /* user cancelled */ }
    } else {
      // Desktop / unsupported — fall back to a direct download
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="flex flex-col items-center min-h-dvh bg-ink px-5 safe-top safe-bottom overflow-hidden">

      {/* Photo — hero of the screen */}
      <div
        className="relative flex items-center justify-center flex-1 w-full py-8 transition-all duration-700 ease-out"
        style={{
          opacity: photoVisible ? 1 : 0,
          transform: photoVisible ? 'scale(1)' : 'scale(0.94)',
        }}
      >
        {photoUrl ? (
          <div className="relative" style={{ maxHeight: '62vh' }}>
            {/* Processed photo */}
            <img
              src={photoUrl}
              alt="Your memory"
              draggable={false}
              className="block rounded-sm"
              style={{
                maxHeight: '62vh',
                maxWidth: '100%',
                width: 'auto',
                height: 'auto',
                // Subtle shadow so photo lifts off the ink background
                boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)',
              }}
            />

            {/* Annotation overlay for Polaroid signatures */}
            {annotation?.dataUrl && (
              <img
                src={annotation.dataUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ mixBlendMode: 'multiply' }}
              />
            )}
          </div>
        ) : (
          /* Fallback if no photo (shouldn't happen) */
          <div className="w-48 h-32 rounded bg-ink-light flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border border-cream/20 flex items-center justify-center">
              <UploadingSpinner />
            </div>
          </div>
        )}
      </div>

      {/* Text + CTA */}
      <div
        className="flex flex-col items-center gap-3 pb-6 w-full transition-all duration-500"
        style={{
          opacity: textVisible ? 1 : 0,
          transform: textVisible ? 'none' : 'translateY(8px)',
        }}
      >
        {memoryNum ? (
          <p className="text-mono text-amber-film/70 text-[10px] tracking-[0.3em] uppercase">
            Memory #{memoryNum}
          </p>
        ) : isUploading ? (
          <div className="flex items-center gap-2">
            <UploadingSpinner />
            <p className="text-mono text-cream/30 text-[10px] tracking-[0.25em] uppercase">
              Developing…
            </p>
          </div>
        ) : didFail ? (
          <p className="text-mono text-amber-film/70 text-[10px] tracking-[0.3em] uppercase">
            Saved to your phone
          </p>
        ) : null}

        <p className="text-serif text-cream text-xl font-normal text-center">
          You captured a moment.
        </p>

        <p className="text-sans text-cream/35 text-xs font-light text-center max-w-[220px] leading-relaxed">
          {didFail
            ? "We'll finish uploading as soon as the connection's back."
            : 'Thank you for sharing this with us.'}
        </p>

        {photoUrl && (
          <button
            onClick={handleSaveShare}
            className="mt-2 px-7 py-3 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
          >
            Save / Share
          </button>
        )}

        <button
          onClick={() => navigate(`/w/${weddingId ?? 'demo'}/camera`, { replace: true })}
          className="mt-1 text-mono text-cream/30 text-[10px] tracking-widest uppercase touch-manipulation"
        >
          Take Another
        </button>
      </div>

      {/* Auto-return progress bar — hidden once the guest pauses to save/share */}
      {!paused && (
        <div className="w-full h-px bg-cream/5 absolute bottom-0 left-0">
          <div
            className="h-full bg-cream/20 transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Produce a single shareable JPEG. Real sessions keep the signature as a separate
// overlay, so composite it; demo sessions already bake it into the photo.
async function buildShareFile(
  photoBlob: Blob | null,
  annotationDataUrl: string | null,
  weddingId?: string,
): Promise<File | null> {
  if (!photoBlob) return null
  const isDemo = weddingId?.startsWith('demo-') ?? false
  if (!annotationDataUrl || isDemo) {
    return new File([photoBlob], 'reverie-memory.jpg', { type: 'image/jpeg' })
  }
  try {
    const url = URL.createObjectURL(photoBlob)
    const [photo, annot] = await Promise.all([loadImg(url), loadImg(annotationDataUrl)])
    URL.revokeObjectURL(url)
    const canvas = document.createElement('canvas')
    canvas.width = photo.naturalWidth
    canvas.height = photo.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(photo, 0, 0)
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(annot, 0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.95))
    return new File([blob ?? photoBlob], 'reverie-memory.jpg', { type: 'image/jpeg' })
  } catch {
    return new File([photoBlob], 'reverie-memory.jpg', { type: 'image/jpeg' })
  }
}

function UploadingSpinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="#f5f0e8" strokeWidth="1.5" strokeOpacity="0.2"/>
      <path d="M10 2a8 8 0 0 1 8 8" stroke="#f5f0e8" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
