import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSessionStore } from '@/store/sessionStore'
import FilmGrain from '@/components/FilmGrain'
import type { WeddingConfig } from '@/types/session'
import { isDemoId, DEMO_BASE_CONFIG } from '@/demo/demoConfig'

// Fallback used in dev when the API isn't available (no Supabase credentials yet)
const DEV_FALLBACK: WeddingConfig = {
  id: 'demo',
  coupleNames: 'Sophia & James',
  weddingDate: '2026-06-14',
  welcomeMessage: 'Leave us a memory.',
  allowedModes: ['disposable'],
  preferredOrientation: 'any',
  annotationMode: 'signature',
  slideshowEnabled: false,
  timestampEnabled: true,
  timestampStyle: 'classic',
}

export default function LandingPage() {
  const { weddingId } = useParams()
  const navigate = useNavigate()
  const { setWeddingConfig, weddingConfig } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<'notfound' | 'network' | null>(null)

  useEffect(() => {
    const id = weddingId ?? 'demo'

    // If a config is already loaded for this wedding (e.g. set by the demo
    // setup wizard), don't overwrite it.
    if (weddingConfig && weddingConfig.id === id) {
      setLoading(false)
      return
    }

    // Demo guest landing never hits the API — fall back to the base demo config
    // (keeps the Guest flow reload-safe even though demo state isn't persisted).
    if (isDemoId(id)) {
      setWeddingConfig({ ...DEMO_BASE_CONFIG, id })
      setLoading(false)
      return
    }

    // In local dev there may be no backend — fall back to a sample config so the
    // page still renders. In production we NEVER show a fake couple to a guest;
    // we show a proper error screen instead.
    const isLocalDev =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

    let cancelled = false
    setLoading(true)
    setLoadError(null)

    fetch(`/api/weddings/${id}`)
      .then(async (res) => {
        if (cancelled) return
        if (res.ok) {
          setWeddingConfig((await res.json()) as WeddingConfig)
          setLoading(false)
          return
        }
        // Wedding not found / not active (paused, expired, still pending setup)
        if (isLocalDev) { setWeddingConfig({ ...DEV_FALLBACK, id }); setLoading(false); return }
        setLoadError('notfound')
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        // Server unreachable / network blip
        if (isLocalDev) { setWeddingConfig({ ...DEV_FALLBACK, id }); setLoading(false); return }
        setLoadError('network')
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [weddingId, weddingConfig, setWeddingConfig])

  const handleOpen = () => {
    const id = weddingId ?? 'demo'
    navigate(`/w/${id}/camera`)
  }

  if (loadError) return <LandingMessage variant={loadError} />
  if (loading || !weddingConfig) return <LandingLoading />

  const formattedDate = weddingConfig.weddingDate ? formatDate(weddingConfig.weddingDate) : null

  return (
    <div className="relative flex flex-col min-h-dvh bg-ink px-6 overflow-hidden safe-top safe-bottom">

      {/* Animated film grain — nearly subconscious */}
      <FilmGrain opacity={0.038} />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 35%, rgba(0,0,0,0.45) 100%)' }}
      />

      {/* Wordmark */}
      <header className="relative z-10 flex flex-col items-center pt-10">
        <p className="text-mono text-[10px] tracking-[0.3em] text-cream/30 uppercase">a memory from</p>
        <h1 className="text-serif text-cream text-3xl font-normal tracking-wide mt-1">Reverie</h1>
      </header>

      {/* Center content — flex-centered with slight upward bias via pb */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-5 text-center pb-[10vh]">
        <div className="w-10 h-px bg-cream/20" />

        <div>
          <h2 className="text-serif text-cream leading-tight font-normal" style={{ fontSize: 'clamp(2rem, 9vw, 2.6rem)' }}>
            {weddingConfig.coupleNames}
          </h2>
          {formattedDate && (
            <p className="text-mono text-amber-film/70 text-xs tracking-[0.2em] mt-2 uppercase">
              {formattedDate}
            </p>
          )}
        </div>

        {weddingConfig.welcomeMessage && (
          <p className="text-sans text-cream/55 text-sm leading-relaxed max-w-[240px] font-light">
            {weddingConfig.welcomeMessage}
          </p>
        )}

        <div className="w-10 h-px bg-cream/20" />

        {weddingConfig.slideshowEnabled && (
          <p className="text-sans text-cream/30 text-[11px] leading-relaxed max-w-[220px]">
            Photos taken at this event may appear on displays here tonight.
          </p>
        )}
      </div>

      {/* CTA — anchored at bottom */}
      <div className="relative z-10 flex flex-col items-center gap-4 w-full max-w-xs mx-auto pb-10">
        <button
          onClick={handleOpen}
          className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform duration-100 touch-manipulation"
        >
          Open Camera
        </button>
        <p className="text-mono text-cream/20 text-[10px] tracking-widest uppercase">
          a Third Degree Entertainment offering
        </p>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function LandingLoading() {
  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 rounded-full border-2 border-cream/20 border-t-cream/70 animate-spin" />
    </div>
  )
}

function LandingMessage({ variant }: { variant: 'notfound' | 'network' }) {
  const isNetwork = variant === 'network'
  return (
    <div className="relative flex flex-col min-h-dvh bg-ink overflow-hidden safe-top safe-bottom px-8">
      <FilmGrain opacity={0.038} />
      <header className="relative z-10 flex flex-col items-center pt-12">
        <p className="text-mono text-[10px] tracking-[0.3em] text-cream/30 uppercase">a memory from</p>
        <h1 className="text-serif text-cream text-3xl font-normal tracking-wide mt-1">Reverie</h1>
      </header>
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-5 text-center pb-[12vh]">
        <div className="w-10 h-px bg-cream/20" />
        <h2 className="text-serif text-cream text-2xl font-normal">
          {isNetwork ? "We couldn't load this page" : "This gallery isn't available"}
        </h2>
        <p className="text-sans text-cream/55 text-sm leading-relaxed max-w-[260px] font-light">
          {isNetwork
            ? 'Check your connection and try again.'
            : 'Double-check the link, or ask your host for a fresh one.'}
        </p>
        {isNetwork && (
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-8 py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform duration-100 touch-manipulation"
          >
            Try Again
          </button>
        )}
        <div className="w-10 h-px bg-cream/20" />
      </div>
    </div>
  )
}
