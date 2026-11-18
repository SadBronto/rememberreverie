import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// Opened by scanning the QR on a private slideshow screen. The owner signs in (magic
// link), and this page approves that one screen. Other screens stay locked.
export default function ApproveDisplayPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const weddingId = params.get('w') ?? ''
  const displayId = params.get('d') ?? ''
  const [phase, setPhase] = useState<'working' | 'done' | 'denied' | 'error'>('working')
  const [names, setNames] = useState('')

  useEffect(() => {
    async function run() {
      if (!supabase || !weddingId || !displayId) { setPhase('error'); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const next = `/host/approve?w=${encodeURIComponent(weddingId)}&d=${encodeURIComponent(displayId)}`
        navigate(`/host/login?next=${encodeURIComponent(next)}`, { replace: true })
        return
      }
      try {
        const res = await fetch(`/api/host/display?weddingId=${weddingId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'approve', displayId }),
        })
        if (res.status === 403) { setPhase('denied'); return }
        if (!res.ok) { setPhase('error'); return }
        const d = await res.json()
        setNames(d.coupleNames ?? '')
        setPhase('done')
      } catch { setPhase('error') }
    }
    void run()
  }, [weddingId, displayId, navigate])

  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6 text-center">
      <p className="text-mono text-cream/30 text-[10px] tracking-[0.4em] uppercase mb-8">Reverie</p>
      {phase === 'working' && <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />}
      {phase === 'done' && (
        <>
          <p className="text-serif text-cream text-2xl mb-3">Screen approved</p>
          <p className="text-sans text-cream/45 text-sm leading-relaxed max-w-xs">
            {names ? `${names}: the slideshow` : 'The slideshow'} will start on that screen in a few seconds.
            You can lock it again any time from your settings.
          </p>
        </>
      )}
      {phase === 'denied' && (
        <p className="text-sans text-cream/50 text-sm max-w-xs">This account does not own this event, so it cannot approve the screen. Sign in with the email the event was set up under.</p>
      )}
      {phase === 'error' && (
        <p className="text-sans text-cream/50 text-sm max-w-xs">That approval link did not work. Reload the slideshow screen and scan the new code.</p>
      )}
    </div>
  )
}
