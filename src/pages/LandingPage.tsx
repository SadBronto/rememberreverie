import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSessionStore } from '@/store/sessionStore'
import FilmGrain from '@/components/FilmGrain'
import type { WeddingConfig } from '@/types/session'

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

  useEffect(() => {
    const id = weddingId ?? 'demo'

    // If a config is already loaded for this wedding (e.g. set by the demo
    // setup wizard), don't overwrite it.
    if (weddingConfig && weddingConfig.id === id) {
      setLoading(false)
      return
    }

    fetch(`/api/weddings/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found')
        return res.json() as Promise<WeddingConfig>
      })
      .then((config) => setWeddingConfig(config))
      .catch(() => {
        // Fall back to dev config if API isn't wired up yet
        setWeddingConfig({ ...DEV_FALLBACK, id })
      })
      .finally(() => setLoading(false))
  }, [weddingId, weddingConfig, setWeddingConfig])

  const handleOpen = () => {
    const id = weddingId ?? 'demo'
    navigate(`/w/${id}/camera`)
  }

  if (loading || !weddingConfig) return null

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
