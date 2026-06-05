import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

type Phase = 'form' | 'sent' | 'not-found' | 'error'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!addr || !supabase) return

    setLoading(true)

    // Check whether this email has a wedding before burning a magic-link send.
    try {
      const res = await fetch(`/api/couple/check?email=${encodeURIComponent(addr)}`)
      const { exists } = await res.json() as { exists: boolean }
      if (!exists) {
        setLoading(false)
        setPhase('not-found')
        return
      }
    } catch {
      // If the check endpoint fails, fall through and let signInWithOtp run —
      // better to send an unnecessary email than to silently block a real user.
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)

    if (error) {
      setPhase('error')
    } else {
      setPhase('sent')
    }
  }

  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6">

      {/* Wordmark */}
      <p className="text-mono text-cream/30 text-[10px] tracking-[0.4em] uppercase mb-10">
        Reverie
      </p>

      {phase === 'sent' ? (
        <div className="text-center max-w-xs">
          <p className="text-serif text-cream text-2xl font-normal mb-3">Check your email</p>
          <p className="text-sans text-cream/40 text-sm leading-relaxed">
            We sent a link to <span className="text-cream/70">{email}</span>.
            Click it to access your gallery.
          </p>
          <button
            onClick={() => { setPhase('form'); setEmail('') }}
            className="mt-8 text-cream/30 text-sans text-xs tracking-widest uppercase touch-manipulation"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
          <div className="text-center mb-2">
            <h1 className="text-serif text-cream text-2xl font-normal">Your gallery</h1>
            <p className="text-sans text-cream/40 text-sm mt-2 leading-relaxed">
              Enter the email you used when setting up your wedding.
            </p>
          </div>

          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoFocus
            className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3.5 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 transition-colors"
          />

          {phase === 'not-found' && (
            <p className="text-sans text-[11px] text-red-400/80 text-center -mt-1">
              No wedding found for that email address.
            </p>
          )}

          {phase === 'error' && (
            <p className="text-sans text-[11px] text-red-400/80 text-center -mt-1">
              Something went wrong. Try again.
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation disabled:opacity-40"
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      )}

      {/* No-supabase fallback for local dev */}
      {!supabase && (
        <p className="mt-8 text-sans text-cream/20 text-[11px] text-center max-w-xs">
          Supabase not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable auth.
        </p>
      )}

      {/* Context + legitimacy links */}
      <div className="mt-12 text-center max-w-xs">
        <p className="text-sans text-cream/25 text-[11px] leading-relaxed">
          Reverie is a private photo-sharing service for weddings &amp; events, by
          Third Degree Entertainment. We use one-time email links to sign you in — never a password.
        </p>
        <p className="text-mono text-cream/15 text-[9px] tracking-[0.2em] mt-3">
          <a href="https://www.thirddegreeentertainment.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-cream/40 transition-colors">Contact</a>
          {' · '}
          <Link to="/privacy" className="hover:text-cream/40 transition-colors">Privacy</Link>
        </p>
      </div>
    </div>
  )
}
