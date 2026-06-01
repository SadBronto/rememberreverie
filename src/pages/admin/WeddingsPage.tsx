import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface WeddingSummary {
  id: string
  couple_names: string
  wedding_date: string | null
  status: 'pending_setup' | 'draft' | 'active' | 'paused' | 'reception_live' | 'archived' | 'expired'
  couple_email: string | null
  allowed_modes: string[]
  photoCount: number
}

const STATUS_LABEL: Record<string, string> = {
  pending_setup:  'Setup Pending',
  draft:          'Draft',
  active:         'Active',
  paused:         'Paused',
  reception_live: 'Live',
  archived:       'Archived',
  expired:        'Expired',
}

const STATUS_COLOR: Record<string, string> = {
  pending_setup:  'text-amber-film/80',
  draft:          'text-cream/30',
  active:         'text-green-400/80',
  paused:         'text-cream/30',
  reception_live: 'text-amber-400/90',
  archived:       'text-cream/20',
  expired:        'text-cream/20',
}

export default function WeddingsPage() {
  const navigate = useNavigate()
  const [weddings, setWeddings] = useState<WeddingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!supabase) { setAuthError(true); return }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/admin/login', { replace: true }); return }
      tokenRef.current = session.access_token

      const res = await fetch('/api/admin/weddings', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (res.status === 401) { navigate('/admin/login', { replace: true }); return }
      if (!res.ok) { setAuthError(true); setLoading(false); return }

      setWeddings(await res.json())
      setLoading(false)
    }
    load()
  }, [navigate])

  if (authError) return (
    <div className="min-h-dvh bg-ink flex items-center justify-center">
      <p className="text-sans text-cream/40 text-sm">Failed to load. Check your connection.</p>
    </div>
  )

  if (loading) return (
    <div className="min-h-dvh bg-ink flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
    </div>
  )

  const pending  = weddings.filter(w => w.status === 'pending_setup')
  const active   = weddings.filter(w => w.status === 'active' || w.status === 'reception_live')
  const drafts   = weddings.filter(w => w.status === 'draft' || w.status === 'paused')
  const archived = weddings.filter(w => w.status === 'archived' || w.status === 'expired')

  return (
    <div className="min-h-dvh bg-ink">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/5 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-mono text-cream/25 text-[9px] tracking-[0.35em] uppercase">Reverie · Admin</p>
          <h1 className="text-serif text-cream text-lg font-normal mt-0.5">Weddings</h1>
        </div>
        <button
          onClick={() => navigate('/admin/weddings/new')}
          className="px-4 py-2 rounded-full bg-cream text-ink text-sans text-xs font-medium tracking-widest uppercase active:scale-95 transition-transform touch-manipulation"
        >
          + New
        </button>
      </div>

      <div className="px-5 py-4 flex flex-col gap-1">

        {weddings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-serif text-cream/30 text-xl italic">No weddings yet</p>
            <button
              onClick={() => navigate('/admin/weddings/new')}
              className="mt-6 px-6 py-3 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase"
            >
              Create first wedding
            </button>
          </div>
        )}

        {[{ label: 'Setup Pending', items: pending }, { label: 'Active', items: active }, { label: 'Drafts & Paused', items: drafts }, { label: 'Archived', items: archived }]
          .filter(g => g.items.length > 0)
          .map(group => (
            <div key={group.label} className="mb-6">
              <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase mb-2 px-1">
                {group.label}
              </p>
              <div className="flex flex-col gap-1">
                {group.items.map(w => (
                  <WeddingRow key={w.id} wedding={w} onClick={() => navigate(`/admin/weddings/${w.id}`)} />
                ))}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

function WeddingRow({ wedding, onClick }: { wedding: WeddingSummary; onClick: () => void }) {
  const dateStr = wedding.wedding_date
    ? new Date(wedding.wedding_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : 'Event'

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-ink-light rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 active:opacity-70 transition-opacity touch-manipulation"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-sans text-[11px] font-medium shrink-0 ${STATUS_COLOR[wedding.status]}`}>
          ● {STATUS_LABEL[wedding.status]}
        </span>
        <span className="text-sans text-cream text-sm truncate">{wedding.couple_names}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-right">
        <span className="text-mono text-cream/30 text-[11px]">{dateStr}</span>
        <span className="text-mono text-cream/40 text-[11px]">{wedding.photoCount} 📷</span>
        <span className="text-cream/30 text-xs">›</span>
      </div>
    </button>
  )
}
