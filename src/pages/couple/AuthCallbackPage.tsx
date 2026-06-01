import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setError('Supabase not configured.')
      return
    }

    async function handleCallback() {
      if (!supabase) return

      // supabase-js v2 automatically parses both hash fragments (#access_token=...)
      // and PKCE codes (?code=...) when getSession() is called after a redirect.
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        // Try explicit code exchange (PKCE fallback)
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError('Link expired or invalid. Request a new one.')
            return
          }
        } else {
          setError('Link expired or invalid. Request a new one.')
          return
        }
      }

      // Get the now-active session
      const { data: { session: activeSession } } = await supabase.auth.getSession()
      if (!activeSession) {
        setError('Authentication failed. Please try again.')
        return
      }

      const email = activeSession.user.email
      if (!email) {
        setError('No email on account.')
        return
      }

      // If a `next` param was embedded in the redirect URL (e.g. admin flow),
      // honor it directly instead of doing the couple-wedding lookup.
      const params = new URLSearchParams(window.location.search)
      const next = params.get('next')
      if (next && next.startsWith('/')) {
        navigate(next, { replace: true })
        return
      }

      // Find the wedding this couple owns
      const { data: weddings } = await supabase
        .from('weddings')
        .select('id, status')
        .eq('couple_email', email)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(1)

      const wedding = weddings?.[0]

      if (!wedding) {
        navigate('/couple/no-wedding', { replace: true })
      } else if (wedding.status === 'pending_setup') {
        // Couple hasn't configured their wedding yet — send them to setup wizard
        navigate('/couple/setup', { replace: true })
      } else {
        navigate(`/couple/${wedding.id}`, { replace: true })
      }
    }

    handleCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6 text-center">
        <p className="text-serif text-cream text-xl mb-3">Something went wrong</p>
        <p className="text-sans text-cream/40 text-sm mb-8">{error}</p>
        <button
          onClick={() => navigate('/couple/login')}
          className="px-6 py-3 rounded-full border border-cream/15 text-cream/60 text-sans text-xs tracking-widest uppercase touch-manipulation"
        >
          Back to login
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 rounded-full border-2 border-cream/20 border-t-cream/70 animate-spin" />
      <p className="text-sans text-cream/30 text-xs tracking-widest uppercase">Opening your gallery</p>
    </div>
  )
}
