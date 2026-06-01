import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Phase = 'form' | 'sent' | 'error'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !supabase) return
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // next param tells AuthCallbackPage to redirect to admin after auth
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin/weddings`,
      },
    })

    setLoading(false)
    setPhase(error ? 'error' : 'sent')
  }

  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6">
      <p className="text-mono text-cream/20 text-[10px] tracking-[0.4em] uppercase mb-10">
        Reverie · Admin
      </p>

      {phase === 'sent' ? (
        <div className="text-center max-w-xs">
          <p className="text-serif text-cream text-2xl font-normal mb-3">Check your email</p>
          <p className="text-sans text-cream/40 text-sm leading-relaxed">
            Sent a link to <span className="text-cream/70">{email}</span>.
          </p>
          <button
            onClick={() => setPhase('form')}
            className="mt-8 text-cream/30 text-sans text-xs tracking-widest uppercase"
          >
            Try again
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
          <div className="text-center mb-2">
            <h1 className="text-serif text-cream text-2xl font-normal">Admin access</h1>
          </div>

          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@email.com"
            required
            autoFocus
            className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3.5 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 transition-colors"
          />

          {phase === 'error' && (
            <p className="text-sans text-[11px] text-red-400/80 text-center -mt-1">
              Something went wrong. Try again.
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform disabled:opacity-40"
          >
            {loading ? 'Sending…' : 'Send login link'}
          </button>
        </form>
      )}
    </div>
  )
}
