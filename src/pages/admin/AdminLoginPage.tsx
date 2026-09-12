import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'link-sent' | 'set-password' | 'password-set'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode]         = useState<Mode>('login')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  // If already signed in (e.g. arrived here from the dashboard to set a password
  // after a magic-link login), show the set-password view instead of the form.
  useEffect(() => {
    if (!supabase) { setChecking(false); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setMode('set-password')
      setChecking(false)
    })
  }, [])

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || !supabase) return
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    setLoading(false)
    if (error) { setError('Wrong email or password.'); return }
    navigate('/admin/weddings', { replace: true })
  }

  async function sendMagicLink() {
    if (!email.trim() || !supabase) { setError('Enter your email first.'); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin/weddings`,
      },
    })
    setLoading(false)
    if (error) { setError('Something went wrong. Try again.'); return }
    setMode('link-sent')
  }

  async function saveNewPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message || 'Could not set password.'); return }
    setPassword('')
    setMode('password-set')
  }

  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6">
      <p className="text-mono text-cream/20 text-[10px] tracking-[0.4em] uppercase mb-10">
        Reverie · Admin
      </p>

      {checking ? (
        <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
      ) : mode === 'link-sent' ? (
        <div className="text-center max-w-xs">
          <p className="text-serif text-cream text-2xl font-normal mb-3">Check your email</p>
          <p className="text-sans text-cream/40 text-sm leading-relaxed">
            Sent a link to <span className="text-cream/70">{email}</span>.
          </p>
          <button onClick={() => setMode('login')} className="mt-8 text-cream/30 text-sans text-xs tracking-widest uppercase">
            Back
          </button>
        </div>
      ) : mode === 'password-set' ? (
        <div className="text-center max-w-xs">
          <p className="text-serif text-cream text-2xl font-normal mb-3">Password set</p>
          <p className="text-sans text-cream/40 text-sm leading-relaxed">
            From now on you can sign in with just your email and password.
          </p>
          <button
            onClick={() => navigate('/admin/weddings', { replace: true })}
            className="mt-8 w-full py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform"
          >
            Go to dashboard
          </button>
        </div>
      ) : mode === 'set-password' ? (
        <form onSubmit={saveNewPassword} className="w-full max-w-xs flex flex-col gap-4">
          <div className="text-center mb-2">
            <h1 className="text-serif text-cream text-2xl font-normal">Set a password</h1>
            <p className="text-sans text-cream/35 text-xs leading-relaxed mt-2">
              You're signed in. Set a password so you can skip the email link next time.
            </p>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="New password (8+ characters)"
            autoFocus
            autoComplete="new-password"
            className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3.5 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 transition-colors"
          />
          {error && <p className="text-sans text-[11px] text-red-400/80 text-center -mt-1">{error}</p>}
          <button
            type="submit"
            disabled={loading || password.length < 8}
            className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform disabled:opacity-40"
          >
            {loading ? 'Saving…' : 'Set password'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/weddings', { replace: true })}
            className="text-cream/30 text-sans text-xs tracking-widest uppercase hover:text-cream/50 transition-colors"
          >
            Skip for now
          </button>
        </form>
      ) : (
        <form onSubmit={signIn} className="w-full max-w-xs flex flex-col gap-4">
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
            autoComplete="username"
            className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3.5 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3.5 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 transition-colors"
          />

          {error && (
            <p className="text-sans text-[11px] text-red-400/80 text-center -mt-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform disabled:opacity-40"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={sendMagicLink}
            disabled={loading}
            className="text-cream/30 text-sans text-xs tracking-widest uppercase hover:text-cream/50 transition-colors disabled:opacity-40"
          >
            Email me a one-time link instead
          </button>
          <p className="text-sans text-cream/20 text-[10px] leading-relaxed text-center -mt-1">
            First time? Use the one-time link, then set a password from the dashboard.
          </p>
        </form>
      )}

      {/* Context + legitimacy links */}
      <div className="mt-12 text-center max-w-xs">
        <p className="text-sans text-cream/25 text-[11px] leading-relaxed">
          Reverie is a private photo-sharing service for weddings &amp; events, by
          Third Degree Entertainment.
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
