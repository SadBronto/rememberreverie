import { useState } from 'react'
import type { WeddingConfig } from '@/types/session'
import FilmGrain from '@/components/FilmGrain'

// Guest-side location gate. Shown when an event has a fence and the guest taps
// "Open Camera". The distance check runs entirely in the browser — the guest's
// coordinates are never sent to us. The bypass code IS verified server-side.

type Phase = 'intro' | 'checking' | 'outside' | 'denied' | 'bypass'

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export default function GeofenceGate({
  config, weddingId, onPass, onClose,
}: {
  config: WeddingConfig
  weddingId: string
  onPass: () => void
  onClose: () => void
}) {
  const [phase, setPhase]         = useState<Phase>('intro')
  const [code, setCode]           = useState('')
  const [codeErr, setCodeErr]     = useState(false)
  const [verifying, setVerifying] = useState(false)

  const eventName = config.coupleNames || 'the event'
  const radius    = config.geofenceRadiusM ?? 150

  function check() {
    if (!navigator.geolocation || config.geofenceLat == null || config.geofenceLng == null) {
      setPhase('denied')
      return
    }
    setPhase('checking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        const d = distanceM(latitude, longitude, config.geofenceLat!, config.geofenceLng!)
        // Give guests the benefit of their GPS error margin (capped) so real
        // attendees near the edge — or indoors — aren't wrongly blocked.
        const slack = Math.min(accuracy || 0, 150)
        if (d <= radius + slack) onPass()
        else setPhase('outside')
      },
      () => setPhase('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  async function submitCode() {
    if (!code.trim() || verifying) return
    setVerifying(true); setCodeErr(false)
    try {
      const res = await fetch('/api/geofence/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weddingId, code }),
      })
      const data = await res.json()
      if (data.ok) onPass()
      else setCodeErr(true)
    } catch {
      setCodeErr(true)
    } finally {
      setVerifying(false)
    }
  }

  const Primary = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="mt-8 w-full max-w-[260px] py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform duration-100 touch-manipulation"
    >
      {label}
    </button>
  )

  const BypassLink = () =>
    config.geofenceHasBypass ? (
      <button
        onClick={() => { setPhase('bypass'); setCode(''); setCodeErr(false) }}
        className="mt-4 text-sans text-cream/40 text-xs underline underline-offset-2 touch-manipulation hover:text-cream/60"
      >
        I'm here but this isn't working
      </button>
    ) : null

  return (
    <div className="fixed inset-0 z-[120] bg-ink flex flex-col items-center justify-center px-8 text-center safe-top safe-bottom">
      <FilmGrain opacity={0.04} />

      {/* Always-available exit */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full border border-cream/10 touch-manipulation"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="rgba(245,240,232,0.5)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="relative z-10 max-w-sm w-full flex flex-col items-center">

        {phase === 'intro' && (
          <>
            <p className="text-mono text-amber-film/80 text-[10px] tracking-[0.3em] uppercase">Quick location check</p>
            <h2 className="text-serif text-cream text-2xl font-normal mt-3 leading-tight">Before your photo</h2>
            <p className="text-sans text-cream/55 text-sm leading-relaxed font-light mt-4">
              To keep this gallery to guests who are actually here, we'll do a one-time check of your
              location before you add a photo. We don't store it or track you — we just confirm you're at {eventName}.
            </p>
            <Primary label="Continue" onClick={check} />
            <button onClick={onClose} className="mt-3 text-sans text-cream/35 text-xs tracking-widest uppercase touch-manipulation hover:text-cream/55">
              Not now
            </button>
          </>
        )}

        {phase === 'checking' && (
          <>
            <div className="w-8 h-8 rounded-full border-2 border-cream/20 border-t-cream/70 animate-spin" />
            <p className="text-sans text-cream/45 text-sm mt-5">Checking your location…</p>
          </>
        )}

        {phase === 'outside' && (
          <>
            <h2 className="text-serif text-cream text-2xl font-normal leading-tight">Are you at {eventName}?</h2>
            <p className="text-sans text-cream/55 text-sm leading-relaxed font-light mt-4">
              We couldn't confirm you're at the event, so we can't add a photo just yet. If you're here,
              make sure your phone's location is on and try again.
            </p>
            <Primary label="Try Again" onClick={check} />
            <BypassLink />
          </>
        )}

        {phase === 'denied' && (
          <>
            <h2 className="text-serif text-cream text-2xl font-normal leading-tight">We couldn't check your location</h2>
            <p className="text-sans text-cream/55 text-sm leading-relaxed font-light mt-4">
              To add a photo, allow location access when your browser asks, then try again — or
              re-enable it in your browser's site settings.
            </p>
            <Primary label="Try Again" onClick={check} />
            <BypassLink />
          </>
        )}

        {phase === 'bypass' && (
          <>
            <p className="text-mono text-amber-film/80 text-[10px] tracking-[0.3em] uppercase">Event code</p>
            <h2 className="text-serif text-cream text-2xl font-normal mt-3 leading-tight">Enter the event code</h2>
            <p className="text-sans text-cream/55 text-sm leading-relaxed font-light mt-4">
              Ask event staff for the code, then enter it below.
            </p>
            <input
              value={code}
              onChange={e => { setCode(e.target.value); setCodeErr(false) }}
              onKeyDown={e => { if (e.key === 'Enter') submitCode() }}
              autoFocus
              placeholder="Event code"
              className="mt-5 w-full max-w-[260px] text-center bg-ink-light border border-cream/15 rounded-xl px-4 py-3 text-cream text-sans tracking-widest focus:outline-none focus:border-cream/35"
            />
            {codeErr && (
              <p className="text-sans text-red-400/70 text-xs mt-3">That code didn't match — double-check with staff.</p>
            )}
            <Primary label={verifying ? 'Checking…' : 'Submit'} onClick={submitCode} />
            <button onClick={() => setPhase('intro')} className="mt-3 text-sans text-cream/35 text-xs tracking-widest uppercase touch-manipulation hover:text-cream/55">
              Back
            </button>
          </>
        )}
      </div>
    </div>
  )
}
