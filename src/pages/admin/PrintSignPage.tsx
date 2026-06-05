import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/lib/supabase'

interface Wedding {
  couple_names: string
  wedding_date: string | null
  slug: string | null
  is_event: boolean
}

// Print-ready table sign (US Letter portrait, light background for paper).
// Reached from the admin event page; "Print / Save as PDF" → drop in an acrylic stand.
export default function PrintSignPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [wedding, setWedding] = useState<Wedding | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!supabase || !id) { navigate('/admin/login', { replace: true }); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/admin/login', { replace: true }); return }
      const res = await fetch(`/api/admin/wedding?id=${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setWedding(data.wedding)
      }
      setLoading(false)
    }
    load()
  }, [id, navigate])

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
        <p className="text-sans text-cream/40 text-sm">Event not found.</p>
        <button onClick={() => navigate(-1)} className="text-cream/30 text-sans text-xs tracking-widest uppercase">← Back</button>
      </div>
    )
  }

  const guestUrl = wedding.slug
    ? `https://rememberreverie.com/${wedding.slug}`
    : `https://rememberreverie.com/w/${id}`
  const dateStr = wedding.wedding_date
    ? new Date(wedding.wedding_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <>
      <style>{`
        @page { size: letter portrait; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body, #root { background: #ffffff !important; }
          .sign-sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .sign-sheet, .sign-sheet * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-ink/95 backdrop-blur-md border-b border-cream/10">
        <button onClick={() => navigate(`/admin/weddings/${id}`)} className="text-cream/50 text-sans text-sm">← Back</button>
        <p className="text-mono text-cream/30 text-[10px] tracking-[0.3em] uppercase">Print sign</p>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-full bg-cream text-ink text-sans text-xs font-medium tracking-widest uppercase"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="min-h-dvh py-8 px-4 flex justify-center" style={{ background: '#3a342c' }}>
        {/* The sheet — US Letter portrait */}
        <div
          className="sign-sheet"
          style={{
            width: '8.5in',
            minHeight: '11in',
            background: 'linear-gradient(180deg, #fbfaf7 0%, #f4efe6 100%)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '0.9in 0.8in',
            color: '#2a241c',
          }}
        >
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.35em', textTransform: 'uppercase', color: '#8a7d68' }}>
            Capture a memory at
          </p>

          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 400, fontSize: '46px', lineHeight: 1.1, margin: '14px 0 6px', color: '#1a1612' }}>
            {wedding.couple_names}
          </h1>

          {dateStr && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#9a8d76' }}>
              {dateStr}
            </p>
          )}

          <div style={{ width: '56px', height: '1px', background: '#c8b9a0', margin: '26px 0' }} />

          <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400, fontSize: '30px', margin: '0 0 4px', color: '#1a1612' }}>
            Be our photographer.
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', lineHeight: 1.55, maxWidth: '4.6in', color: '#5a5040', margin: '0 0 30px' }}>
            Point your phone's camera at the code, tap the link, and start shooting.
            No app to download — your photos appear in our gallery instantly.
          </p>

          {/* QR */}
          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '18px', boxShadow: '0 4px 18px rgba(40,28,12,0.12)' }}>
            <QRCodeSVG value={guestUrl} size={300} bgColor="#ffffff" fgColor="#1a1612" level="M" />
          </div>

          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.1em', color: '#9a8d76', margin: '14px 0 0', wordBreak: 'break-all' }}>
            {guestUrl.replace('https://', '')}
          </p>

          {/* Steps */}
          <div style={{ display: 'flex', gap: '34px', margin: '34px 0 0' }}>
            {[['1', 'Scan'], ['2', 'Shoot a few'], ['3', 'Find them in our gallery']].map(([n, label]) => (
              <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', maxWidth: '1.4in' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #c8b9a0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display', serif", fontSize: '15px', color: '#7a6c54' }}>
                  {n}
                </div>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#5a5040' }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#b3a588', marginTop: '28px' }}>
            Reverie · by Third Degree Entertainment
          </p>
        </div>
      </div>
    </>
  )
}
