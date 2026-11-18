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
  const [phase, setPhase] = useState<'working' | 'choose' | 'done' | 'denied' | 'error'>('working')
  const [remote, setRemote] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [sentTo, setSentTo] = useState('')
  const [names, setNames] = useState('')

  useEffect(() => {
    async function run() {
      if (!supabase || !weddingId || !displayId) { setPhase('error'); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPhase('choose'); return }
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

  function signIn() {
    const next = `/host/approve?w=${encodeURIComponent(weddingId)}&d=${encodeURIComponent(displayId)}`
    navigate(`/host/login?next=${encodeURIComponent(next)}`)
  }

  async function emailOwner() {
    setRemote('sending')
    try {
      const res = await fetch('/api/display-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weddingId, displayId }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.ok) { setSentTo(d.sentTo ?? ''); setRemote('sent') } else setRemote('failed')
    } catch { setRemote('failed') }
  }

  const emailOption = (
    <div className="mt-8 flex flex-col items-center gap-3 max-w-xs">
      {remote === 'sent' ? (
        <p className="text-sans text-cream/55 text-sm leading-relaxed">
          We emailed {sentTo || 'the account owner'} a link. Once they approve it, the screen starts on its own.
        </p>
      ) : (
        <>
          <p className="text-sans text-cream/40 text-xs">Not the account owner, or they are not here right now?</p>
          <button onClick={emailOwner} disabled={remote === 'sending'}
            className="px-5 py-2.5 rounded-full border border-cream/20 text-cream/70 text-sans text-xs tracking-widest uppercase disabled:opacity-40">
            {remote === 'sending' ? 'Sending...' : 'Email them to approve it'}
          </button>
          {remote === 'failed' && <p className="text-sans text-red-400/80 text-xs">Could not send the email. Try again in a moment.</p>}
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6 text-center">
      <p className="text-mono text-cream/30 text-[10px] tracking-[0.4em] uppercase mb-8">Reverie</p>
      {phase === 'working' && <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />}
      {phase === 'choose' && (
        <>
          <p className="text-serif text-cream text-2xl mb-3">Unlock this screen</p>
          <p className="text-sans text-cream/45 text-sm leading-relaxed max-w-xs mb-6">Sign in as the event owner to start the slideshow on this screen.</p>
          <button onClick={signIn} className="px-7 py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase">Sign in</button>
          {emailOption}
        </>
      )}
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
      {phase === 'denied' && emailOption}
      {phase === 'error' && (
        <p className="text-sans text-cream/50 text-sm max-w-xs">That approval link did not work. Reload the slideshow screen and scan the new code.</p>
      )}
    </div>
  )
}
