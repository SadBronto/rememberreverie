import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import StyledQR from '@/components/StyledQR'
import type { QRSettings } from '@/components/QRCreator'
import { isDemoId } from '@/demo/demoConfig'
import { useDemoStore } from '@/store/demoStore'
import { buildDemoGallery } from '@/demo/demoGallery'

interface SlideshowPhoto {
  id: string
  mode: string
  memoryNumber: number | null
  capturedAt: string | null
  photoUrl: string
  annotationUrl: string | null
}

// A slide is either a guest photo or an interspersed "scan to share" QR slide.
type Slide =
  | { id: string; kind: 'photo'; photo: SlideshowPhoto }
  | { id: string; kind: 'qr' }

interface SlideshowData {
  coupleNames: string
  weddingDate: string
  welcomeMessage: string
  timestampEnabled: boolean
  timestampStyle: string
  slug: string | null
  qrSettings: QRSettings | null
  qrSlideEnabled: boolean
  photos: SlideshowPhoto[]
}

const SLIDE_DURATION   = 7500  // ms per slide
const TRANSITION_MS    = 1100  // crossfade duration (gentle)
const POLL_INTERVAL_MS = 30000 // refresh for new photos
const QR_EVERY         = 10    // insert a "scan to share" slide after every N photos
const QR_DURATION      = 12000 // QR slide lingers longer than a photo

export default function SlideshowPage({ weddingId: weddingIdProp }: { weddingId?: string } = {}) {
  const { weddingId: weddingIdParam } = useParams<{ weddingId: string }>()
  const weddingId = weddingIdProp ?? weddingIdParam
  const demoConfig = useDemoStore((s) => s.config)

  const [coupleNames, setCoupleNames] = useState('')
  const [weddingDate, setWeddingDate] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('Leave us a memory.')
  const [timestampEnabled, setTimestampEnabled] = useState(false)
  const [timestampStyle, setTimestampStyle] = useState('classic')
  const [slug, setSlug] = useState<string | null>(null)
  const [qrSettings, setQrSettings] = useState<QRSettings | null>(null)
  const [qrSlideEnabled, setQrSlideEnabled] = useState(false)
  const [photos, setPhotos]           = useState<SlideshowPhoto[]>([])
  const [index, setIndex]             = useState(0)
  const [incoming, setIncoming]       = useState<number | null>(null) // index crossfading in on top
  const [incomingOpacity, setIncomingOpacity] = useState(0)
  const [newCount, setNewCount]       = useState(0)     // flash indicator on new arrivals
  const [loadError, setLoadError]     = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const slidesRef        = useRef<Slide[]>([])
  const indexRef         = useRef(0)
  const advanceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitioningRef = useRef(false)

  useEffect(() => { indexRef.current = index }, [index])

  // ── Data fetching ─────────────────────────────────────────────

  const fetchPhotos = useCallback(async (isInitial = false) => {
    if (!weddingId) return

    // Demo mode: build slides from the bundled photos (filtered via the real
    // pipeline), no backend. QR slide on so the feature is demonstrated.
    if (isDemoId(weddingId)) {
      const sess = await buildDemoGallery()
      const mapped: SlideshowPhoto[] = sess
        .filter(s => s.status === 'active' && s.photoUrl)
        .map(s => ({
          id: s.id, mode: s.mode, memoryNumber: s.memoryNumber,
          capturedAt: s.capturedAt, photoUrl: s.photoUrl!, annotationUrl: s.annotationUrl,
        }))
      setCoupleNames(demoConfig.coupleNames)
      setWeddingDate(demoConfig.weddingDate ?? '')
      setWelcomeMessage(demoConfig.welcomeMessage)
      setSlug(null)
      setQrSettings(null)
      setQrSlideEnabled(true)
      setPhotos(mapped)
      if (isInitial) setLoadError(false)
      return
    }

    try {
      const res = await fetch(`/api/slideshow?weddingId=${weddingId}`)
      if (!res.ok) { if (isInitial) setLoadError(true); return }
      const data: SlideshowData = await res.json()

      setCoupleNames(data.coupleNames)
      setWeddingDate(data.weddingDate)
      setWelcomeMessage(data.welcomeMessage ?? 'Leave us a memory.')
      setTimestampEnabled(data.timestampEnabled)
      setTimestampStyle(data.timestampStyle)
      setSlug(data.slug ?? null)
      setQrSettings(data.qrSettings ?? null)
      setQrSlideEnabled(data.qrSlideEnabled ?? false)

      setPhotos(prev => {
        const prevById = new Map(prev.map(p => [p.id, p]))
        // Reconcile to the API's current ACTIVE set on every poll:
        //  • keep photos still active, REUSING their existing (stable) URL so the
        //    browser serves them from cache instead of re-downloading each poll;
        //  • add new arrivals (with their fresh URL);
        //  • drop anything no longer returned (hidden / flagged / deleted).
        const reconciled = data.photos.map(f => prevById.get(f.id) ?? f)
        const newcomers  = data.photos.filter(f => !prevById.has(f.id)).length
        if (!isInitial && newcomers > 0) setNewCount(n => n + newcomers)
        return reconciled
      })

      if (isInitial) setLoadError(false)
    } catch {
      if (isInitial) setLoadError(true)
    }
  }, [weddingId, demoConfig])

  // Initial load + polling
  useEffect(() => {
    fetchPhotos(true)
    const poll = setInterval(() => fetchPhotos(false), POLL_INTERVAL_MS)
    return () => clearInterval(poll)
  }, [fetchPhotos])

  // Clear "new photos" indicator after 4 seconds
  useEffect(() => {
    if (newCount === 0) return
    const t = setTimeout(() => setNewCount(0), 4000)
    return () => clearTimeout(t)
  }, [newCount])

  // ── Build the slide list (photos + interspersed QR "scan to share" slides) ──

  const guestUrl = weddingId
    ? (slug ? `https://rememberreverie.com/${slug}` : `https://rememberreverie.com/w/${weddingId}`)
    : ''

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = []
    photos.forEach((p, i) => {
      out.push({ id: p.id, kind: 'photo', photo: p })
      if (qrSlideEnabled && guestUrl && (i + 1) % QR_EVERY === 0) {
        out.push({ id: `qr-${i}`, kind: 'qr' })
      }
    })
    return out
  }, [photos, qrSlideEnabled, guestUrl])

  useEffect(() => { slidesRef.current = slides }, [slides])

  // If photos were removed (hidden / flagged / deleted) and the list shrank past
  // the current position, snap back into range so we never land on a blank slide.
  useEffect(() => {
    if (slides.length > 0 && index >= slides.length) {
      setIndex(0)
      indexRef.current = 0
    }
  }, [slides.length, index])

  // ── Auto-advance / crossfade ──────────────────────────────────

  const advance = useCallback((delta = 1) => {
    const list = slidesRef.current
    const total = list.length
    if (total === 0 || transitioningRef.current) return
    transitioningRef.current = true

    const next = (indexRef.current + delta + total) % total

    const begin = () => {
      // True crossfade: the new slide fades in ON TOP of the current one.
      setIncoming(next)
      setIncomingOpacity(0)
      requestAnimationFrame(() => requestAnimationFrame(() => setIncomingOpacity(1)))
      window.setTimeout(() => {
        setIndex(next)
        indexRef.current = next
        setIncoming(null)
        setIncomingOpacity(0)
        transitioningRef.current = false
      }, TRANSITION_MS)
    }

    // Preload the next image first (only photo slides have one).
    const nextSlide = list[next]
    const url = nextSlide?.kind === 'photo' ? nextSlide.photo.photoUrl : null
    if (!url) { begin(); return }
    let started = false
    const once = () => { if (!started) { started = true; begin() } }
    const img = new Image()
    img.onload = once
    img.onerror = once
    img.src = url
    if (img.complete) once()
  }, [])

  useEffect(() => {
    if (slides.length === 0) return
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    const dur = slides[index]?.kind === 'qr' ? QR_DURATION : SLIDE_DURATION
    advanceTimerRef.current = setTimeout(() => advance(1), dur)
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    }
  }, [index, slides.length, advance])

  // ── Keyboard + fullscreen ─────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advance(1)  }
      if (e.key === 'ArrowLeft')                    { e.preventDefault(); advance(-1) }
      if (e.key === 'f' || e.key === 'F')           { toggleFullscreen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance])

  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => null)
    } else {
      document.exitFullscreen().catch(() => null)
    }
  }

  // ── Derived state ─────────────────────────────────────────────

  const currentSlide  = slides[index] ?? null
  const incomingSlide = incoming != null ? slides[incoming] ?? null : null
  const currentPhoto  = currentSlide?.kind === 'photo' ? currentSlide.photo : null
  const total         = slides.length

  const formattedDate = weddingDate
    ? new Date(weddingDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : ''

  // ── Waiting / error states ────────────────────────────────────

  if (loadError) {
    return (
      <div className="min-h-dvh bg-black flex flex-col items-center justify-center gap-4 text-center px-8">
        <p className="text-serif text-cream/40 text-xl italic">Wedding not found</p>
        <p className="text-mono text-cream/20 text-xs tracking-widest">Check the URL and try again.</p>
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="min-h-dvh bg-black flex flex-col items-center justify-center gap-6 text-center px-8">
        {coupleNames && (
          <div className="flex flex-col gap-1">
            <p className="text-mono text-cream/20 text-[10px] tracking-[0.4em] uppercase">Live</p>
            <p className="text-serif text-cream/50 text-2xl italic font-normal">{coupleNames}</p>
          </div>
        )}
        <div className="w-8 h-px bg-cream/10" />
        {qrSlideEnabled && guestUrl ? (
          <div className="flex flex-col items-center gap-5">
            <p className="text-serif text-cream/85 italic leading-snug" style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)', maxWidth: '20ch' }}>
              {welcomeMessage}
            </p>
            <div className="bg-white p-6 rounded-2xl shadow-2xl">
              <StyledQR url={guestUrl} settings={qrSettings} size={300} transparent />
            </div>
            <p className="text-mono text-cream/50 text-sm tracking-[0.3em] uppercase">Scan to get started</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,232,0.2)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <p className="text-sans text-cream/25 text-sm">Capturing memories…</p>
          </div>
        )}
      </div>
    )
  }

  // ── Slideshow ─────────────────────────────────────────────────

  return (
    <div
      className="relative min-h-dvh bg-black flex items-center justify-center overflow-hidden select-none cursor-pointer"
      onClick={() => advance(1)}
    >
      {/* Base layer — current slide, always fully opaque */}
      {currentSlide && (
        <SlideLayer key={currentSlide.id} slide={currentSlide} opacity={1} guestUrl={guestUrl} qrSettings={qrSettings} message={welcomeMessage} />
      )}

      {/* Incoming layer — next slide crossfading in on top */}
      {incomingSlide && (
        <SlideLayer
          key={incomingSlide.id}
          slide={incomingSlide}
          opacity={incomingOpacity}
          transitionMs={TRANSITION_MS}
          guestUrl={guestUrl}
          qrSettings={qrSettings}
          message={welcomeMessage}
        />
      )}

      {/* Bottom scrim + names/date — only on photo slides */}
      {currentPhoto && (
        <>
          <div
            className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}
          />
          <div className="absolute bottom-0 left-0 right-0 px-8 pb-7 flex flex-col items-center gap-1 pointer-events-none">
            {!(timestampEnabled && timestampStyle === 'elegant') && coupleNames && (
              <p className="text-serif text-cream/80 text-xl font-normal italic tracking-wide">{coupleNames}</p>
            )}
            {!timestampEnabled && formattedDate && (
              <p className="text-mono text-cream/35 text-[11px] tracking-[0.3em] uppercase">{formattedDate}</p>
            )}
          </div>
        </>
      )}

      {/* Progress bar */}
      {total > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-px bg-cream/10 pointer-events-none">
          <div
            className="h-full bg-cream/30"
            style={{ width: `${((index + 1) / total) * 100}%`, transition: 'width 300ms ease-out' }}
          />
        </div>
      )}

      {/* Memory number — top left, photo slides only */}
      {currentPhoto?.memoryNumber != null && (
        <div className="absolute top-5 left-5 pointer-events-none">
          <p className="text-mono text-cream/25 text-[10px] tracking-[0.3em]">#{currentPhoto.memoryNumber}</p>
        </div>
      )}

      {/* Slide counter — top right */}
      <div className="absolute top-5 right-16 pointer-events-none">
        <p className="text-mono text-cream/20 text-[10px] tracking-[0.2em]">{index + 1} / {total}</p>
      </div>

      {/* New photos toast */}
      {newCount > 0 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-cream/10 backdrop-blur-sm border border-cream/15 rounded-full px-4 py-1.5">
            <p className="text-sans text-cream/60 text-xs tracking-wide">
              {newCount} new {newCount === 1 ? 'memory' : 'memories'}
            </p>
          </div>
        </div>
      )}

      {/* Fullscreen toggle */}
      <button
        onClick={e => { e.stopPropagation(); toggleFullscreen() }}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 transition-colors touch-manipulation"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
      </button>

      {/* Live pulse dot */}
      <div className="absolute bottom-5 right-5 flex items-center gap-1.5 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 animate-pulse" />
        <p className="text-mono text-cream/20 text-[9px] tracking-[0.3em] uppercase">Live</p>
      </div>
    </div>
  )
}

// One stacked layer — a guest photo (+ signature overlay) or a "scan to share"
// QR slide — so the base and incoming layers crossfade cleanly.
function SlideLayer({
  slide,
  opacity,
  transitionMs,
  guestUrl,
  qrSettings,
  message,
}: {
  slide: Slide
  opacity: number
  transitionMs?: number
  guestUrl: string
  qrSettings: QRSettings | null
  message: string
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-black"
      style={{ opacity, transition: transitionMs ? `opacity ${transitionMs}ms ease-in-out` : undefined }}
    >
      {slide.kind === 'photo' ? (
        <div className="relative">
          <img
            src={slide.photo.photoUrl}
            alt=""
            draggable={false}
            className="max-w-full max-h-dvh object-contain"
          />
          {slide.photo.annotationUrl && (
            <img
              src={slide.photo.annotationUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={{ mixBlendMode: 'multiply' }}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-8 px-8 text-center">
          <p
            className="text-serif text-cream/90 italic leading-snug"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', maxWidth: '22ch' }}
          >
            {message}
          </p>
          <div className="bg-white p-6 rounded-2xl shadow-2xl">
            <StyledQR url={guestUrl} settings={qrSettings} size={340} transparent />
          </div>
          <p className="text-mono text-cream/55 text-sm tracking-[0.3em] uppercase">Scan to get started</p>
        </div>
      )}
    </div>
  )
}

function EnterFullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(245,240,232,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5"/>
    </svg>
  )
}

function ExitFullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(245,240,232,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5"/>
    </svg>
  )
}
