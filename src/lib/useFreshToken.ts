import { useEffect, type MutableRefObject } from 'react'
import { supabase } from '@/lib/supabase'

// Pages grab the access token once at load and keep it in a ref. Supabase tokens
// expire after about an hour, so a page left open (or a tab that slept) starts
// getting "Invalid token". This keeps the ref current: it follows every refresh
// Supabase does, and re-reads the session whenever the tab comes back to the front.
export function useFreshToken(tokenRef: MutableRefObject<string | null>) {
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) tokenRef.current = session.access_token
    })
    const sync = () => {
      if (document.visibilityState !== 'visible') return
      void client.auth.getSession().then(({ data }) => {
        if (data.session?.access_token) tokenRef.current = data.session.access_token
      })
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      sub.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [tokenRef])
}
