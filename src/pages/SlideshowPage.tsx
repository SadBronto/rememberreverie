import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

interface SlideshowPhoto {
  id: string
  mode: string
  memoryNumber: number | null
  capturedAt: string | null
  photoUrl: string
  annotationUrl: string | null
}

interface SlideshowData {
  coupleNames: string
  weddingDate: string
  photos: SlideshowPhoto[]
}

const SLIDE_DURATION   = 6000  // ms per photo
const TRANSITION_MS    = 700   // crossfade duration
const POLL_INTERVAL_MS = 30000 // refresh for new photos

export default function SlideshowPage({ weddingId: weddingIdProp }: { weddingId?: string } = {}) {
  const { weddingId: weddingIdParam } = useParams<{ weddingId: string }>()
  const weddingId = weddingIdProp ?? weddingIdParam

  const [coupleNames, setCoupleNames] = useState('')
  const [weddingDate, setWeddingDate] = useState('')
  const [photos, setPhotos]           = useState<SlideshowPhoto[]>([])
  const [index, setIndex]             = useState(0)
  const [visible, setVisible]         = useState(true)  // opacity gate for crossfade
  const [newCount, setNewCount]       = useState(0)     // flash indicator on new arrivals
  const [loadError, setLoadError]     = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const photosRef        = useRef<SlideshowPhoto[]>([])
  const indexRef         = useRef(0)
  const advanceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitioningRef = useRef(false)

  // Keep refs in sync so timer callbacks always see fresh values
  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => { indexRef.current  = index  }, [index])

  // ── Data fetching ─────────────────────────────────────────────

  const fetchPhotos = useCallback(async (isInitial = false) => {
    if (!weddingId) return
    try {
      const res = await fetch(`/api/slideshow?weddingId=${weddingId}`)
      if (!res.ok) { if (isInitial) setLoadError(true); return }
      const data: SlideshowData = await res.json()

      setCoupleNames(data.coupleNames)
      setWeddingDate(data.weddingDate)

      setPhotos(prev => {
        const existingIds = new Set(prev.map(p => p.id))
        // Update signed URLs in-place (they rotate), then append newcomers
        const updated  = prev.map(p => {
          const fresh = data.photos.find(f => f.id === p.id)
          return fresh ? { ...p, photoUrl: fresh.photoUrl } : p
        })
        const incoming = data.photos.filter(p => !existingIds.has(p.id))
        if (!isInitial && incoming.length > 0) setNewCount(n => n + incoming.length)
        return [...updated, ...incoming]
      })

      if (isInitial) setLoadError(false)
    } catch {
      if (isInitial) setLoadError(true)
    }
  }, [weddingId])

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

  // ── Auto-advance ──────────────────────────────────────────────

  const advance = useCallback((delta = 1) => {
    const total = photosRef.current.length
    if (total === 0 || transitioningRef.current) return

    transitioningRef.current = true
    setVisible(false)

    setTimeout(() => {
      setIndex(prev => {
        const next = (prev + delta + total) % total
        indexRef.current = next
        return next
      })
      setVisible(true)
      transitioningRef.current = false
    }, TRANSITION_MS)
  }, [])

  // Schedule the auto-advance timer; reset it whenever index changes
  useEffect(() => {
    if (photos.length === 0) return
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => advance(1), SLIDE_DURATION)
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    }
  }, [index, photos.length, advance])

  // ── Keyboard + click navigation ───────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advance(1)  }
      if (e.key === 'ArrowLeft')                    { e.preventDefault(); advance(-1) }
      if (e.key === 'f' || e.key === 'F')           { toggleFullscreen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance])

  // Fullscreen state sync
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

  const currentPhoto = photos[index] ?? null
  const total        = photos.length

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
        {/* Pulsing camera icon */}
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,232,0.2)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <p className="text-sans text-cream/25 text-sm">Capturing memories…</p>
        </div>
      </div>
    )
  }

  // ── Slideshow ─────────────────────────────────────────────────

  return (
    <div
      className="relative min-h-dvh bg-black flex items-center justify-center overflow-hidden select-none cursor-pointer"
      onClick={() => advance(1)}
    >
      {/* Photo (+ signature overlay) */}
      {currentPhoto && (
        <div
          key={currentPhoto.id}
          className="relative"
          style={{
            opacity:    visible ? 1 : 0,
            transition: `opacity ${TRANSITION_MS}ms ease-in-out`,
          }}
        >
          <img
            src={currentPhoto.photoUrl}
            alt=""
            draggable={false}
            className="max-w-full max-h-dvh object-contain"
          />
          {currentPhoto.annotationUrl && (
            <img
              src={currentPhoto.annotationUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={{ mixBlendMode: 'multiply' }}
            />
          )}
        </div>
      )}

      {/* Bottom gradient scrim */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}
      />

      {/* Bottom text: couple names + date */}
      <div className="absolute bottom-0 left-0 right-0 px-8 pb-7 flex flex-col items-center gap-1 pointer-events-none">
        {coupleNames && (
          <p className="text-serif text-cream/80 text-xl font-normal italic tracking-wide">
            {coupleNames}
          </p>
        )}
        {formattedDate && (
          <p className="text-mono text-cream/35 text-[11px] tracking-[0.3em] uppercase">
            {formattedDate}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-px bg-cream/10 pointer-events-none">
          <div
            className="h-full bg-cream/30"
            style={{
              width:      `${((index + 1) / total) * 100}%`,
              transition: 'width 300ms ease-out',
            }}
          />
        </div>
      )}

      {/* Memory number — top left */}
      {currentPhoto?.memoryNumber != null && (
        <div
          className="absolute top-5 left-5 pointer-events-none"
          style={{ opacity: visible ? 1 : 0, transition: `opacity ${TRANSITION_MS}ms` }}
        >
          <p className="text-mono text-cream/25 text-[10px] tracking-[0.3em]">
            #{currentPhoto.memoryNumber}
          </p>
        </div>
      )}

      {/* Photo counter — top right area (next to fullscreen button) */}
      <div className="absolute top-5 right-16 pointer-events-none">
        <p className="text-mono text-cream/20 text-[10px] tracking-[0.2em]">
          {index + 1} / {total}
        </p>
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

      {/* Fullscreen toggle — top right */}
      <button
        onClick={e => { e.stopPropagation(); toggleFullscreen() }}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 transition-colors touch-manipulation"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
      </button>

      {/* Live pulse dot — bottom right */}
      <div className="absolute bottom-5 right-5 flex items-center gap-1.5 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 animate-pulse" />
        <p className="text-mono text-cream/20 text-[9px] tracking-[0.3em] uppercase">Live</p>
      </div>
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
