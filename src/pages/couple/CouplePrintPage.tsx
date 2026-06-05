import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PrintSignSheet from '@/components/PrintSignSheet'
import type { QRSettings } from '@/components/QRCreator'

interface Wedding {
  couple_names: string
  wedding_date: string | null
  slug: string | null
  qr_settings: QRSettings | null
}

// Couple-facing print sign route — same sheet as the admin, fetched via the
// couple endpoint (returns the signed-in couple's own event).
export default function CouplePrintPage() {
  const { weddingId } = useParams<{ weddingId: string }>()
  const navigate = useNavigate()
  const [wedding, setWedding] = useState<Wedding | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!supabase) { navigate('/couple/login', { replace: true }); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/couple/login', { replace: true }); return }
      const res = await fetch('/api/couple/wedding', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) setWedding(await res.json())
      setLoading(false)
    }
    load()
  }, [navigate])

  if (loading) {
    return (
      <div className="min-h-dvh bg-ink flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
      </div>
    )
  }
  if (!wedding) {
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center gap-3">
        <p className="text-sans text-cream/40 text-sm">Gallery not found.</p>
        <button onClick={() => navigate(-1)} className="text-cream/30 text-sans text-xs tracking-widest uppercase">← Back</button>
      </div>
    )
  }

  const guestUrl = wedding.slug
    ? `https://rememberreverie.com/${wedding.slug}`
    : `https://rememberreverie.com/w/${weddingId}`
  const dateStr = wedding.wedding_date
    ? new Date(wedding.wedding_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <PrintSignSheet
      coupleNames={wedding.couple_names}
      dateStr={dateStr}
      guestUrl={guestUrl}
      qrSettings={wedding.qr_settings}
      onBack={() => navigate(`/couple/${weddingId}`)}
    />
  )
}
