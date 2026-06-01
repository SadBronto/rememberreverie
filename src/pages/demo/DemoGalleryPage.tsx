import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoStore } from '@/store/demoStore'
import { useSessionStore } from '@/store/sessionStore'
import { SEED_PHOTOS } from '@/lib/seedImages'
import { CAMERA_MODES } from '@/config/modes'
import { processSession } from '@/lib/imageProcessor'

// Processed URL + the mode label for the aria hint (hidden from UI)
interface ProcessedPhoto {
  url: string
  mode: string
}

export default function DemoGalleryPage() {
  const navigate = useNavigate()
  const { setup }  = useDemoStore()
  const { completedSessions, weddingConfig } = useSessionStore()

  const [visible,      setVisible]      = useState(false)
  const [statsVisible, setStatsVisible] = useState(false)
  const [lightboxUrl,  setLightboxUrl]  = useState<string | null>(null)
  // null = loading skeleton, ProcessedPhoto = ready
  const [processed, setProcessed] = useState<(ProcessedPhoto | null)[]>(
    () => new Array(SEED_PHOTOS.length).fill(null)
  )

  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true),      80)
    const t2 = setTimeout(() => setStatsVisible(true), 900)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Process seed photos through the filter pipeline one at a time.
  // Sequential (not parallel) to keep the UI responsive on mid-range phones.
  useEffect(() => {
    let cancelled = false
    const coupleNames = setup?.coupleNames ?? weddingConfig?.coupleNames ?? ''

    async function processSeedPhotos() {
      for (let i = 0; i < SEED_PHOTOS.length; i++) {
        if (cancelled) break
        const photo = SEED_PHOTOS[i]!

        try {
          const res = await fetch(photo.src)
          if (!res.ok || cancelled) break
          const blob = await res.blob()
          if (cancelled) break

          const modeConfig    = CAMERA_MODES[photo.mode]
          const sourceImages  = [{ blob, capturedAt: new Date(), index: 0 }]

          // 900px wide — crisp for 2-column gallery on retina, much faster than 2400px
          const outputBlob = await processSession(
            sourceImages,
            modeConfig,
            {
              timestampEnabled: true,
              timestampStyle:   'classic',
              coupleNames,
            },
            900
          )
          if (cancelled) { URL.revokeObjectURL(URL.createObjectURL(outputBlob)); break }

          const url = URL.createObjectURL(outputBlob)
          urlsRef.current.push(url)

          setProcessed(prev => {
            const next = [...prev]
            next[i] = { url, mode: photo.mode }
            return next
          })
        } catch {
          // Skip broken images — skeleton stays in place
        }
      }
    }

    processSeedPhotos()

    return () => {
      cancelled = true
      // Revoke all object URLs on unmount
      urlsRef.current.forEach(u => URL.revokeObjectURL(u))
      urlsRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const coupleNames  = setup?.coupleNames ?? weddingConfig?.coupleNames ?? 'Your Wedding'
  const userPhotos   = completedSessions.length
  const totalPhotos  = userPhotos + SEED_PHOTOS.length
  const totalGuests  = 38 + (coupleNames.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 20)

  return (
    <div className="min-h-dvh bg-ink overflow-y-auto">

      {/* ── Lightbox ──────────────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            draggable={false}
            className="object-contain"
            style={{ maxWidth: '92vw', maxHeight: '90vh' }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-cream text-lg touch-manipulation"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Sticky header ─────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/5 px-6 py-4 flex items-center justify-between transition-all duration-700"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div>
          <p className="text-mono text-cream/30 text-[9px] tracking-[0.3em] uppercase">Gallery</p>
          <h1 className="text-serif text-cream text-lg font-normal leading-tight mt-0.5">{coupleNames}</h1>
        </div>
        <button
          onClick={() => navigate('/demo/setup')}
          className="px-4 py-2 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation active:bg-cream/5 transition-colors"
        >
          Try Another Style
        </button>
      </div>

      {/* ── Emotional stats ───────────────────────────────────────────────────── */}
      <div
        className="px-6 py-6 border-b border-cream/5 transition-all duration-700"
        style={{ opacity: statsVisible ? 1 : 0, transform: statsVisible ? 'none' : 'translateY(8px)' }}
      >
        <div className="flex gap-6">
          <Stat value={`${totalGuests}`}  label="guests" />
          <Stat value={`${totalPhotos}`}  label="moments captured" />
          <Stat value="8:14 PM"           label="most active hour" />
        </div>
      </div>

      {/* ── Masonry photo grid ────────────────────────────────────────────────── */}
      <div
        className="px-3 pt-3 pb-1 transition-all duration-700 delay-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="columns-2 gap-2">

          {/* User's actual captured photos — front and center */}
          {completedSessions.map((session) => session.outputImage && (
            <UserPhotoTile
              key={session.id}
              blob={session.outputImage}
              onClick={setLightboxUrl}
            />
          ))}

          {/* Seed photos — processing through filters one by one */}
          {SEED_PHOTOS.map((photo, i) => (
            processed[i]
              ? <DevelopedTile
                  key={photo.id}
                  url={processed[i]!.url}
                  signed={processed[i]!.mode === 'polaroid' && i === 3}
                  onClick={setLightboxUrl}
                />
              : <SkeletonTile key={photo.id} mode={photo.mode} />
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ────────────────────────────────────────────────────────── */}
      <div
        className="px-6 py-10 flex flex-col items-center gap-4 transition-all duration-700 delay-500"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <p className="text-serif text-cream/50 text-sm italic text-center max-w-[240px] leading-relaxed">
          Because no photographer can be everywhere, all the time.
        </p>
        <button
          onClick={() => navigate('/demo/setup')}
          className="w-full max-w-xs py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
        >
          Try Another Memory Style
        </button>
        <button
          onClick={() => navigate('/')}
          className="text-cream/30 text-sans text-xs tracking-widest uppercase touch-manipulation"
        >
          Back to start
        </button>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-serif text-cream text-xl font-normal">{value}</p>
      <p className="text-mono text-cream/30 text-[9px] tracking-[0.15em] uppercase mt-0.5">{label}</p>
    </div>
  )
}

// Aspect ratios for skeleton tiles — match processed output (image + border framing)
const MODE_ASPECT: Record<string, string> = {
  disposable: 'aspect-[3/2]',
  polaroid:   'aspect-[5/6]',
  super8:     'aspect-[4/3]',
}

function SkeletonTile({ mode }: { mode: string }) {
  const h = MODE_ASPECT[mode] ?? 'aspect-[3/2]'
  return (
    <div className={`w-full mb-2 rounded-lg overflow-hidden break-inside-avoid ${h} bg-ink-light`}>
      <div className="w-full h-full animate-pulse bg-gradient-to-br from-cream/5 to-cream/[0.02]" />
    </div>
  )
}

function DevelopedTile({ url, signed, onClick }: {
  url: string; signed?: boolean; onClick: (url: string) => void
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  return (
    <div
      className="w-full mb-2 rounded-lg overflow-hidden break-inside-avoid transition-opacity duration-500 relative cursor-zoom-in"
      style={{ opacity: visible ? 1 : 0 }}
      onClick={() => onClick(url)}
    >
      <img src={url} alt="" draggable={false} className="w-full h-auto block" loading="lazy" />
      {signed && (
        // Signing area occupies the bottom ~21% of the polaroid output
        <div
          className="absolute pointer-events-none"
          style={{ bottom: 0, left: '5.5%', right: '5.5%', height: '21%',
                   display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                   paddingLeft: '8%', paddingBottom: '2%' }}
        >
          <img
            src="/demosignature.png"
            alt=""
            draggable={false}
            style={{ width: '68%', height: 'auto', mixBlendMode: 'multiply', opacity: 0.88 }}
          />
        </div>
      )}
    </div>
  )
}

function UserPhotoTile({ blob, onClick }: { blob: Blob; onClick: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  if (!url) return null

  return (
    <div
      className="w-full mb-2 rounded-lg overflow-hidden break-inside-avoid cursor-zoom-in"
      onClick={() => onClick(url)}
    >
      <img src={url} alt="Your captured memory" draggable={false} className="w-full h-auto block" />
    </div>
  )
}
