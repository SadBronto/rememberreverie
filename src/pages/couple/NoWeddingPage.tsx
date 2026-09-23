import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { portalBase } from '@/lib/portalNav'

export default function NoWeddingPage() {
  const navigate = useNavigate()

  async function signOut() {
    await supabase?.auth.signOut()
    navigate(`${portalBase()}/login`)
  }

  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6 text-center gap-4">
      <p className="text-serif text-cream text-xl">No event found</p>
      <p className="text-sans text-cream/40 text-sm max-w-xs leading-relaxed">
        We couldn't find an event linked to your email. Make sure you're using
        the email you registered with.
      </p>
      <button
        onClick={signOut}
        className="mt-4 px-6 py-3 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation"
      >
        Try a different email
      </button>
    </div>
  )
}
