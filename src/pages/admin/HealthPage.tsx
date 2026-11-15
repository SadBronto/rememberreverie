import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

type State = 'unknown' | 'ok' | 'offline' | 'stalled' | 'closed'

interface Display {
  id: string
  name: string
  slug: string | null
  state: State
  seenAt: string | null
  advancedAt: string | null
  visible: boolean | null
  build: string | null
  monitor: boolean
  hours: string | null
}

interface LogEvent {
  id: string
  createdAt: string
  weddingId: string | null
  eventName: string | null
  kind: string
  severity: string
  source: string | null
  detail: string | null
}

type Filter = 'all' | 'displays' | 'crashes' | 'uploads'

const KIND_LABEL: Record<string, string> = {
  display_offline:     'Display offline',
  display_stalled:     'Display frozen',
  display_recovered:   'Display back',
  client_crash:        'Page crashed',
  client_error:        'Page error',
  boot_failure:        'Page failed to start',
  slug_resolve_failed: 'Lookup failed',
  upload_failure:      'Upload failed',
  upload_spike:        'Uploads failing',
}

const FILTER_KINDS: Record<Exclude<Filter, 'all'>, string[]> = {
  displays: ['display_offline', 'display_stalled', 'display_recovered'],
  crashes:  ['client_crash', 'client_error', 'boot_failure', 'slug_resolve_failed'],
  uploads:  ['upload_failure', 'upload_spike'],
}

const STATE_UI: Record<State, { label: string; cls: string }> = {
  ok:      { label: 'OK',               cls: 'text-green-400/90 border-green-400/30' },
  offline: { label: 'Offline',          cls: 'text-red-400/90 border-red-400/40' },
  stalled: { label: 'Frozen',           cls: 'text-red-400/90 border-red-400/40' },
  closed:  { label: 'Closed hours',     cls: 'text-cream/40 border-cream/15' },
  unknown: { label: 'Not reporting',    cls: 'text-cream/40 border-cream/15' },
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} min ago`
  const h = m / 60
  if (h < 48) return `${h.toFixed(1)} h ago`
  return `${(h / 24).toFixed(1)} days ago`
}

export default function HealthPage() {
  const navigate = useNavigate()
  const [displays, setDisplays] = useState<Display[]>([])
  const [events, setEvents] = useState<LogEvent[]>([])
  const [now, setNow] = useState(Date.now())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    if (!supabase) { setError('Not configured.'); setLoading(false); return }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/admin/login', { replace: true }); return }
    try {
      const res = await fetch('/api/admin/health', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.status === 401) { navigate('/admin/login', { replace: true }); return }
      if (!res.ok) { setError('Could not load health data.'); setLoading(false); return }
      const data = await res.json()
      setDisplays(data.displays ?? [])
      setEvents(data.events ?? [])
      setNow(data.now ?? Date.now())
      setError(null)
    } catch {
      setError('Could not load health data. Check your connection.')
    }
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    void load()
    const iv = setInterval(() => void load(), 60_000)   // keep the picture fresh
    return () => clearInterval(iv)
  }, [load])

  const shown = filter === 'all' ? events : events.filter(e => FILTER_KINDS[filter].includes(e.kind))
  const problems = displays.filter(d => d.state === 'offline' || d.state === 'stalled').length

  return (
    <div className="min-h-dvh bg-ink">
      <div className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/5 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-mono text-cream/25 text-[9px] tracking-[0.35em] uppercase">Reverie · Admin</p>
          <h1 className="text-serif text-cream text-lg font-normal mt-0.5">Service health</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => void load()} className="text-sans text-cream/40 text-[11px] tracking-widest uppercase hover:text-cream/70 transition-colors touch-manipulation">Refresh</button>
          <button onClick={() => navigate('/admin/weddings')} className="text-sans text-cream/30 text-[11px] tracking-widest uppercase hover:text-cream/50 transition-colors touch-manipulation">Events</button>
        </div>
      </div>

      <div className="px-5 py-5 max-w-3xl mx-auto">
        {loading && <div className="w-7 h-7 mx-auto mt-16 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />}
        {error && <p className="text-sans text-red-400/80 text-sm text-center mt-10">{error}</p>}

        {!loading && !error && (
          <>
            {/* Displays */}
            <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase mb-3">
              Displays{problems > 0 ? ` · ${problems} need attention` : ''}
            </p>
            {displays.length === 0 && (
              <p className="text-sans text-cream/30 text-sm mb-8">No Reverie Live events yet.</p>
            )}
            <div className="flex flex-col gap-2 mb-10">
              {displays.map(d => {
                const ui = STATE_UI[d.state]
                const oldBuild = d.build && d.build !== __BUILD_ID__ && __BUILD_ID__ !== 'dev'
                return (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/admin/weddings/${d.id}`)}
                    className="text-left rounded-2xl border border-cream/10 bg-cream/[0.02] px-4 py-3.5 active:scale-[0.99] transition-transform touch-manipulation"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sans text-cream text-sm">{d.name}</p>
                      <span className={`text-mono text-[9px] tracking-[0.2em] uppercase px-2 py-1 rounded-full border ${ui.cls}`}>{ui.label}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-mono text-[10px] text-cream/35 tracking-wide">
                      <span>Last check-in: {timeAgo(d.seenAt, now)}</span>
                      <span>Last slide change: {timeAgo(d.advancedAt, now)}</span>
                      <span>Build: {d.build ?? 'unknown'}{oldBuild ? ' (older than live)' : ''}</span>
                      <span>
                        {d.monitor ? (d.hours ? `Watched ${d.hours}` : 'Watched 24/7') : 'Monitoring off'}
                        {d.visible === false ? ' · screen hidden' : ''}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Issue log */}
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase">Issue log · last 90 days</p>
              <div className="flex gap-1.5">
                {(['all', 'displays', 'crashes', 'uploads'] as Filter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-mono text-[9px] tracking-[0.15em] uppercase px-2.5 py-1 rounded-full border touch-manipulation ${filter === f ? 'bg-cream text-ink border-cream' : 'text-cream/40 border-cream/15'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0 && <p className="text-sans text-cream/30 text-sm">Nothing logged. That's good.</p>}
            <div className="flex flex-col">
              {shown.map(e => (
                <div key={e.id} className="border-t border-cream/[0.06] py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-sans text-sm ${e.severity === 'error' ? 'text-red-400/90' : e.severity === 'info' ? 'text-green-400/80' : 'text-cream/80'}`}>
                      {KIND_LABEL[e.kind] ?? e.kind}
                    </p>
                    <p className="text-mono text-[10px] text-cream/30 shrink-0">{timeAgo(e.createdAt, now)}</p>
                  </div>
                  <p className="text-mono text-[10px] text-cream/35 mt-0.5">
                    {e.eventName ?? 'Unknown event'}{e.source ? ` · ${e.source}` : ''} · {new Date(e.createdAt).toLocaleString()}
                  </p>
                  {e.detail && <p className="text-sans text-cream/50 text-xs mt-1 leading-relaxed break-words whitespace-pre-wrap">{e.detail}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
