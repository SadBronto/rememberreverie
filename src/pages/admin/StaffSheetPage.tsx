import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import StyledQR from '@/components/StyledQR'
import type { QRSettings } from '@/components/QRCreator'

interface Wedding {
  couple_names: string
  slug: string | null
  qr_settings: QRSettings | null
  staff_code: string | null
  photo_cap: number | null
  slideshow_slow_poll: boolean | null
}

const DEFAULT_RESET =
  'Unplug the small Onn streaming device from power, wait 10 seconds, and plug it back in. The slideshow returns on its own in about a minute.'
const DEFAULT_CONTACT = 'Corey - 509.389.6324'

const AMBER = '#b5651d'
const SERIF = "Georgia, 'Times New Roman', serif"
const SANS = "'DM Sans', Arial, sans-serif"

// Admin: one-page "Photo Screen, Staff" sheet for a venue. Same layout for every
// venue: what the screen is, how staff remove a photo (QR + password), and what to
// do when something stops working. Filled in from the event; the reset and contact
// wording can be edited on screen before printing.
export default function StaffSheetPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [wedding, setWedding] = useState<Wedding | null>(null)
  const [loading, setLoading] = useState(true)
  const [reset, setReset] = useState(DEFAULT_RESET)
  const [contact, setContact] = useState(DEFAULT_CONTACT)

  useEffect(() => {
    async function load() {
      if (!supabase || !id) { navigate('/admin/login', { replace: true }); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/admin/login', { replace: true }); return }
      const res = await fetch(`/api/admin/wedding?id=${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) setWedding((await res.json()).wedding)
      setLoading(false)
    }
    void load()
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
        <button onClick={() => navigate(-1)} className="text-cream/30 text-sans text-xs tracking-widest uppercase">Back</button>
      </div>
    )
  }

  const staffUrl = wedding.slug ? `https://rememberreverie.com/staff/${wedding.slug}` : ''
  // The rolling delete is driven by photo_cap alone, so the sheet follows it too.
  const unlimited = wedding.photo_cap == null
  const arrives = wedding.slideshow_slow_poll ? 'within five minutes' : 'within a minute'
  const holds = unlimited
    ? 'Every photo taken stays on the screen.'
    : `The screen holds up to ${wedding.photo_cap} recent photos; older ones get deleted.`
  const missing: string[] = []
  if (!wedding.slug) missing.push('a custom URL (slug)')
  if (!wedding.staff_code) missing.push('a staff moderation code')

  return (
    <>
      <style>{`
        @page { size: letter portrait; margin: 0.5in; }
        @media print {
          .ss-toolbar, .ss-edit { display: none !important; }
          html, body, #root { background: #ffffff !important; }
          .ss-wrap { background: #ffffff !important; padding: 0 !important; min-height: 0 !important; }
          .ss-sheet { box-shadow: none !important; margin: 0 !important; width: 100% !important; min-height: 0 !important; }
        }
        .ss-sheet, .ss-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="ss-toolbar sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-ink/95 backdrop-blur-md border-b border-cream/10">
        <button onClick={() => navigate(`/admin/weddings/${id}`)} className="text-cream/50 text-sans text-sm">← Back</button>
        <p className="text-mono text-cream/30 text-[10px] tracking-[0.3em] uppercase">Staff sheet</p>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-full bg-cream text-ink text-sans text-xs font-medium tracking-widest uppercase"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Screen-only edit panel */}
      <div className="ss-edit max-w-[8.5in] mx-auto px-4 pt-5 flex flex-col gap-3">
        {missing.length > 0 && (
          <p className="text-sans text-amber-film/80 text-sm">
            Set {missing.join(' and ')} on the event page first, then reload this sheet.
          </p>
        )}
        <label className="text-sans text-cream/50 text-xs">If the slideshow stops working (edit as needed)</label>
        <textarea
          value={reset} onChange={e => setReset(e.target.value)} rows={3}
          className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3 text-cream text-sans text-sm focus:outline-none focus:border-cream/25"
        />
        <label className="text-sans text-cream/50 text-xs">Contact line</label>
        <input
          value={contact} onChange={e => setContact(e.target.value)}
          className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3 text-cream text-sans text-sm focus:outline-none focus:border-cream/25"
        />
      </div>

      <div className="ss-wrap min-h-dvh py-8 px-4 flex justify-center" style={{ background: '#3a342c' }}>
        <div
          className="ss-sheet"
          style={{
            width: '8.5in', minHeight: '11in', background: '#ffffff', color: '#1a1612',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)', padding: '0.9in 0.9in 0.7in', fontFamily: SANS,
          }}
        >
          <p style={{ fontSize: '14px', letterSpacing: '0.04em', textTransform: 'uppercase', color: AMBER, margin: 0 }}>
            {wedding.couple_names}
          </p>
          <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: '44px', lineHeight: 1.1, margin: '6px 0 8px' }}>
            Photo Screen &bull; Staff
          </h1>
          <p style={{ fontSize: '14px', lineHeight: 1.4, color: '#555', margin: 0, maxWidth: '4.8in' }}>
            The TV runs a live photo experience: guests scan a QR code to take photos that appear on the screen automatically.
          </p>

          <hr style={{ border: 0, borderTop: '1px solid #ccc', margin: '22px 0 18px' }} />
          <div style={{ display: 'flex', gap: '0.5in', justifyContent: 'space-around', textAlign: 'center' }}>
            <p style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.35, margin: 0, flex: 1 }}>
              Guest photos show up on the screen {arrives} of being taken.
            </p>
            <p style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.35, margin: 0, flex: 1 }}>{holds}</p>
          </div>
          <hr style={{ border: 0, borderTop: '1px solid #ccc', margin: '18px 0 30px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4in' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', color: AMBER, margin: 0 }}>Inappropriate Photos</p>
              <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: '24px', margin: '4px 0 22px' }}>
                Take a Photo Off the Screen
              </h2>
              <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '15px', lineHeight: 1.9 }}>
                <li>Scan the staff QR code</li>
                <li>Enter password <em>{wedding.staff_code || '(not set)'}</em></li>
                <li>Tap the photo, then tap <strong>Remove</strong>.<br />It comes off the screen within a few seconds</li>
              </ol>
              <p style={{ fontSize: '12px', fontStyle: 'italic', color: '#666', margin: '30px 0 0' }}>
                Staff only. Please don&rsquo;t share or post this code.
              </p>
            </div>

            <div style={{ width: '2.5in', textAlign: 'center' }}>
              <div style={{ background: '#f7f7f7', padding: '12px', borderRadius: '6px', display: 'inline-block' }}>
                {staffUrl
                  ? <StyledQR url={staffUrl} settings={wedding.qr_settings} size={200} transparent />
                  : <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>No slug set</div>}
              </div>
              <p style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#555', margin: '8px 0 6px', textTransform: 'uppercase' }}>Staff access</p>
              <div style={{ border: '1.5px dashed #222', background: '#fff2cc', padding: '8px 10px' }}>
                <p style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, color: '#444' }}>Password</p>
                <p style={{ fontSize: '20px', fontWeight: 700, margin: '2px 0 0' }}>{wedding.staff_code || '(not set)'}</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5in', margin: '40px 0 22px', justifyContent: 'center' }}>
            <div style={{ background: '#f4cccc', padding: '12px 14px', width: '2.9in', fontSize: '14px', lineHeight: 1.45 }}>
              <p style={{ color: AMBER, fontWeight: 700, margin: '0 0 2px' }}>If the slideshow stops working</p>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{reset}</p>
            </div>
            <div style={{ background: '#f4cccc', padding: '12px 14px', width: '2.9in', fontSize: '14px', lineHeight: 1.45 }}>
              <p style={{ color: AMBER, fontWeight: 700, margin: '0 0 2px' }}>If you can&rsquo;t fix it</p>
              <p style={{ margin: 0 }}>
                If you can&rsquo;t delete inappropriate photos or something else isn&rsquo;t working, turn the TV off and call {contact}
              </p>
            </div>
          </div>

          <p style={{ textAlign: 'center', fontWeight: 700, fontSize: '14px', lineHeight: 1.4, color: '#333', margin: '28px auto 0', maxWidth: '4in' }}>
            Any guests interested in the service should be directed to RememberReverie.com
          </p>
        </div>
      </div>
    </>
  )
}
