import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import QRCreator, { type QRSettings } from '@/components/QRCreator'
import StyledQR from '@/components/StyledQR'

// Leaflet-backed venue picker — lazy so the map library only loads for admins
// who actually open the geofence editor (and never reaches the guest bundle).
const GeofenceMap = lazy(() => import('@/components/GeofenceMap'))

interface WeddingDetail {
  id: string
  couple_names: string
  wedding_date: string | null
  is_event: boolean
  event_end_date: string | null
  status: string
  couple_email: string | null
  welcome_message: string
  allowed_modes: string[]
  annotation_mode: string
  selfie_enabled: boolean
  timestamp_enabled: boolean
  timestamp_style: string
  photo_cap: number | null
  slideshow_enabled: boolean
  slug: string | null
  couple_review_enabled: boolean
  qr_settings: QRSettings | null
  slideshow_qr_slide: boolean
  geofence_enabled: boolean
  geofence_lat: number | null
  geofence_lng: number | null
  geofence_radius_m: number | null
  geofence_bypass_code: string | null
}

interface Counts { disposable: number; polaroid: number; super8: number; total: number }
interface RecentPhoto { id: string; mode: string; memoryNumber: number | null; photoUrl: string | null; annotationUrl: string | null; capturedAt: string | null }

const STATUS_OPTIONS = ['pending_setup', 'draft', 'active', 'paused', 'reception_live', 'archived', 'expired']
const STATUS_LABEL: Record<string, string> = {
  pending_setup:   'Pending Setup',
  draft:           'Draft',
  active:          'Active',
  paused:          'Paused',
  reception_live:  'Reception Live',
  archived:        'Archived',
  expired:         'Expired',
}
const STATUS_COLOR: Record<string, string> = {
  pending_setup:  'text-amber-film/80',
  active:         'text-green-400/70',
  reception_live: 'text-green-400/70',
  paused:         'text-cream/40',
  draft:          'text-cream/40',
  archived:       'text-red-400/50',
  expired:        'text-red-400/50',
}

const MODES = [{ id: 'disposable', label: 'Disposable' }, { id: 'polaroid', label: 'Polaroid' }, { id: 'super8', label: 'Super 8' }]

export default function WeddingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const tokenRef = useRef<string | null>(null)

  const [wedding, setWedding]           = useState<WeddingDetail | null>(null)
  const [counts, setCounts]             = useState<Counts | null>(null)
  const [recentPhotos, setRecentPhotos] = useState<RecentPhoto[]>([])
  const [loading, setLoading]           = useState(true)

  // Edit form state
  const [form, setForm]       = useState<Partial<WeddingDetail>>({})
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState<'saved' | 'error' | null>(null)

  // Invite email state
  const [inviteSent, setInviteSent]         = useState<string | null>(null) // email address email was sent to
  const [inviteLoading, setInviteLoading]   = useState(false)
  const [inviteError, setInviteError]       = useState(false)
  const [copied, setCopied]                 = useState(false)
  const [copiedField, setCopiedField]       = useState<string | null>(null)
  const [lightboxPhoto, setLightboxPhoto]                 = useState<RecentPhoto | null>(null)
  const [lightboxConfirmDelete, setLightboxConfirmDelete] = useState(false)
  const [showDelete, setShowDelete]                       = useState(false)
  const [deleteConfirmText, setDeleteConfirmText]         = useState('')
  const [deleting, setDeleting]                           = useState(false)
  const [showQR, setShowQR]                               = useState(false)

  const guestUrl = id
    ? (form.slug
        ? `https://rememberreverie.com/${form.slug}`
        : `https://rememberreverie.com/w/${id}`)
    : ''
  // Slideshow uses the vanity subdomain when a slug is set, else the raw /w/:id URL
  const slideshowUrl = form.slug
    ? `https://slideshow.rememberreverie.com/${form.slug}`
    : `${window.location.origin}/w/${id}/slideshow`

  useEffect(() => {
    async function load() {
      if (!supabase || !id) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/admin/login', { replace: true }); return }
      tokenRef.current = session.access_token

      const res = await fetch(`/api/admin/wedding?id=${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.status === 401) { navigate('/admin/login', { replace: true }); return }
      if (!res.ok) { setLoading(false); return }

      const data = await res.json()
      setWedding(data.wedding)
      setForm(data.wedding)
      setCounts(data.counts)
      setRecentPhotos(data.recentPhotos)
      setLoading(false)
    }
    load()
  }, [id, navigate])

  function setField(field: string, value: unknown) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleMode(mode: string) {
    const current = (form.allowed_modes ?? [])
    setField('allowed_modes', current.includes(mode) ? current.filter(m => m !== mode) : [...current, mode])
  }

  async function saveChanges() {
    if (!tokenRef.current) return
    setSaving(true)
    setSaveMsg(null)
    const res = await fetch(`/api/admin/wedding?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaveMsg(res.ok ? 'saved' : 'error')
    if (res.ok) setTimeout(() => setSaveMsg(null), 2500)
    if (res.ok) setWedding(f => f ? { ...f, ...form as WeddingDetail } : f)
  }

  async function toggleActive() {
    if (!tokenRef.current || !wedding) return
    const newStatus = wedding.status === 'active' ? 'paused' : 'active'
    const res = await fetch(`/api/admin/wedding?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setWedding(w => w ? { ...w, status: newStatus } : w)
      setForm(f => ({ ...f, status: newStatus }))
    }
  }

  async function sendSetupEmail() {
    if (!tokenRef.current || !id) return
    setInviteLoading(true)
    setInviteSent(null)
    setInviteError(false)

    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify({ weddingId: id }),
    })
    setInviteLoading(false)
    if (res.ok) {
      const data = await res.json()
      setInviteSent(data.email)
    } else {
      setInviteError(true)
    }
  }

  async function copyText(text: string, field: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setCopiedField(field)
    setTimeout(() => { setCopied(false); setCopiedField(null) }, 2000)
  }

  function downloadQR() {
    const svg = document.querySelector('#wedding-qr-wrap svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 800; canvas.height = 800
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#f5f0e8'
      ctx.fillRect(0, 0, 800, 800)
      ctx.drawImage(img, 50, 50, 700, 700)
      const a = document.createElement('a')
      a.download = `${id}-qr.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
  }

  async function deletePhoto(sessionId: string) {
    if (!tokenRef.current) return
    const res = await fetch(`/api/admin/session?sessionId=${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
    if (res.ok) {
      setRecentPhotos(prev => prev.filter(p => p.id !== sessionId))
      setLightboxPhoto(null)
      setLightboxConfirmDelete(false)
    }
  }

  async function archiveWedding() {
    if (!tokenRef.current) return
    if (!confirm(`Archive ${wedding?.couple_names}? This won't delete photos.`)) return
    const res = await fetch(`/api/admin/wedding?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
    if (res.ok) navigate('/admin/weddings')
  }

  async function saveQR(settings: QRSettings) {
    if (!tokenRef.current) return
    await fetch(`/api/admin/wedding?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify({ qr_settings: settings }),
    })
    setWedding(w => w ? { ...w, qr_settings: settings } : w)
  }

  async function deleteWedding() {
    if (!tokenRef.current || deleting) return
    setDeleting(true)
    const res = await fetch(`/api/admin/wedding?id=${id}&hard=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
    if (res.ok) {
      navigate('/admin/weddings')
    } else {
      setDeleting(false)
      alert('Delete failed. Please try again.')
    }
  }

  if (loading) return (
    <div className="min-h-dvh bg-ink flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
    </div>
  )

  if (!wedding) return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center gap-3">
      <p className="text-sans text-cream/40 text-sm">Wedding not found.</p>
      <button onClick={() => navigate('/admin/weddings')} className="text-cream/30 text-sans text-xs tracking-widest uppercase">← Back</button>
    </div>
  )

  const isPendingSetup = wedding.status === 'pending_setup'
  const isActive       = wedding.status === 'active' || wedding.status === 'reception_live'

  return (
    <div className="min-h-dvh bg-ink pb-12">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/5 px-5 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin/weddings')} className="text-cream/40 text-sans text-sm touch-manipulation shrink-0">
          ← Back
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-serif text-cream text-lg font-normal truncate">{wedding.couple_names}</h1>
          <p className={`text-mono text-[10px] tracking-widest uppercase mt-0.5 ${STATUS_COLOR[wedding.status] ?? 'text-cream/40'}`}>
            {STATUS_LABEL[wedding.status] ?? wedding.status}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Activate / deactivate */}
          {!isPendingSetup && wedding.status !== 'archived' && (
            <button
              onClick={toggleActive}
              className={`px-3 py-1.5 rounded-full border text-sans text-[11px] tracking-widest uppercase touch-manipulation transition-colors ${
                isActive
                  ? 'border-cream/20 text-cream/50 hover:border-red-400/30 hover:text-red-400/60'
                  : 'border-green-400/25 text-green-400/60 hover:bg-green-400/5'
              }`}
            >
              {isActive ? 'Pause' : 'Activate'}
            </button>
          )}
          <button
            onClick={archiveWedding}
            className="px-3 py-1.5 rounded-full border border-cream/10 text-cream/25 text-sans text-[11px] tracking-widest uppercase touch-manipulation"
          >
            Archive
          </button>
          <button
            onClick={() => { setShowDelete(true); setDeleteConfirmText('') }}
            className="px-3 py-1.5 rounded-full border border-red-400/25 text-red-400/60 text-sans text-[11px] tracking-widest uppercase touch-manipulation hover:bg-red-400/5 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Permanent-delete confirmation — type to confirm */}
      {showDelete && (() => {
        const phrase = wedding.couple_names && wedding.couple_names !== 'TBD' ? wedding.couple_names : 'DELETE'
        const armed = deleteConfirmText.trim().toLowerCase() === phrase.toLowerCase()
        return (
          <div
            className="fixed inset-0 z-[60] bg-ink/85 backdrop-blur-sm flex items-center justify-center p-5"
            onClick={e => { if (e.target === e.currentTarget && !deleting) setShowDelete(false) }}
          >
            <div className="w-full max-w-sm bg-ink-light border border-red-400/20 rounded-2xl p-6 flex flex-col gap-4">
              <div>
                <p className="text-mono text-red-400/70 text-[10px] tracking-[0.3em] uppercase">Permanent delete</p>
                <h2 className="text-serif text-cream text-xl font-normal mt-1.5">Delete this event &amp; all photos?</h2>
              </div>
              <p className="text-sans text-cream/50 text-sm leading-relaxed">
                This erases the event and <span className="text-cream/80">every photo</span> from storage forever.
                It cannot be undone. To keep the photos, use <span className="text-cream/80">Archive</span> instead.
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-sans text-cream/40 text-xs">Type <span className="text-cream/80 font-medium">{phrase}</span> to confirm</span>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  autoFocus
                  className="w-full bg-ink border border-cream/15 rounded-xl px-3.5 py-2.5 text-cream text-sans text-sm focus:outline-none focus:border-red-400/40"
                />
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDelete(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteWedding}
                  disabled={!armed || deleting}
                  className="px-4 py-2 rounded-full bg-red-500/80 text-white text-sans text-xs tracking-widest uppercase touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting…' : 'Delete forever'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* QR designer modal */}
      {showQR && (
        <div
          className="fixed inset-0 z-[60] bg-ink/80 backdrop-blur-sm flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setShowQR(false) }}
        >
          <div className="w-full max-w-lg bg-ink border-t border-cream/10 rounded-t-3xl px-6 pt-5 pb-10 overflow-y-auto max-h-[92dvh]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-mono text-cream/30 text-[9px] tracking-[0.3em] uppercase">QR Code</p>
                <h2 className="text-serif text-cream text-lg font-normal mt-0.5">Design &amp; download</h2>
              </div>
              <button
                onClick={() => setShowQR(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-cream/10 touch-manipulation"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="rgba(245,240,232,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <QRCreator
              url={guestUrl}
              coupleNames={wedding.couple_names}
              initialSettings={wedding.qr_settings}
              onSave={saveQR}
              onClose={() => setShowQR(false)}
            />
          </div>
        </div>
      )}

      <div className="px-5 py-5 flex flex-col gap-8 max-w-lg">

        {/* Pending setup banner */}
        {isPendingSetup && (
          <div className="bg-amber-film/8 border border-amber-film/20 rounded-xl px-4 py-3.5 flex flex-col gap-1">
            <p className="text-sans text-amber-film/90 text-sm font-medium">Setup pending</p>
            <p className="text-sans text-cream/50 text-xs leading-relaxed">
              The couple hasn't configured their wedding yet. Send them a setup email below.
            </p>
          </div>
        )}

        {/* Stats bar (only meaningful once setup is done) */}
        {!isPendingSetup && (
          <div className="flex gap-5">
            <Stat value={String(counts?.total ?? 0)} label="total photos" />
            <Stat value={String(counts?.disposable ?? 0)} label="disposable" />
            <Stat value={String(counts?.polaroid ?? 0)} label="polaroid" />
            <Stat value={String(counts?.super8 ?? 0)} label="super 8" />
          </div>
        )}

        {/* Guest URL + QR — only show after setup */}
        {!isPendingSetup && (
          <div className="flex flex-col gap-3">
            <SectionLabel>Guest QR Code</SectionLabel>

            <div id="wedding-qr-wrap" className="bg-cream rounded-2xl p-5 flex flex-col items-center gap-4 self-start">
              <StyledQR url={guestUrl} settings={wedding.qr_settings} size={200} />
            </div>

            <div className="bg-ink-light rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-mono text-cream/50 text-[11px] truncate">{guestUrl}</p>
              <button
                onClick={() => copyText(guestUrl, 'url')}
                className="shrink-0 text-sans text-cream/50 text-xs tracking-widest uppercase touch-manipulation"
              >
                {copiedField === 'url' && copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setShowQR(true)}
                className="self-start px-4 py-2.5 rounded-full bg-cream text-ink text-xs font-medium tracking-widest uppercase touch-manipulation active:scale-95"
              >
                Design QR code
              </button>
              <button
                onClick={downloadQR}
                className="self-start px-4 py-2.5 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation active:bg-cream/5"
              >
                Download QR as PNG
              </button>
              <button
                onClick={() => navigate(`/admin/weddings/${id}/print`)}
                className="self-start px-4 py-2.5 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation active:bg-cream/5"
              >
                Print table sign →
              </button>
            </div>

            {/* Vanity slug */}
            <div className="flex flex-col gap-1.5 mt-1">
              <label className="text-sans text-cream/40 text-xs">Custom URL slug (optional)</label>
              <div className="flex items-center gap-2">
                <span className="text-mono text-cream/25 text-[11px] shrink-0">rememberreverie.com/</span>
                <input
                  value={form.slug ?? ''}
                  onChange={e => setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') || null)}
                  placeholder="sophiaandjames"
                  className="flex-1 bg-ink-light border border-cream/10 rounded-lg px-3 py-2 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25"
                />
              </div>
            </div>
          </div>
        )}

        {/* Couple portal access / setup email */}
        <div className="flex flex-col gap-3">
          <SectionLabel>{isPendingSetup ? 'Setup Email' : 'Couple Portal Access'}</SectionLabel>

          {wedding.couple_email ? (
            <div className="flex flex-col gap-2">
              <p className="text-sans text-cream/50 text-sm">
                Email: <span className="text-cream/80">{wedding.couple_email}</span>
              </p>

              {inviteSent ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sans text-green-400/70 text-sm">
                    Email sent to {inviteSent}
                  </p>
                  <button
                    onClick={sendSetupEmail}
                    disabled={inviteLoading}
                    className="self-start text-mono text-cream/30 text-[10px] tracking-widest uppercase touch-manipulation"
                  >
                    Send again
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={sendSetupEmail}
                    disabled={inviteLoading}
                    className="self-start px-4 py-2.5 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation active:bg-cream/5 disabled:opacity-40"
                  >
                    {inviteLoading
                      ? 'Sending…'
                      : isPendingSetup ? 'Send setup email' : 'Send login email'
                    }
                  </button>
                  {inviteError && (
                    <p className="text-sans text-red-400/70 text-xs">Failed to send — check RESEND_API_KEY in Netlify.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sans text-cream/30 text-sm italic">
              Set a couple email below to enable portal access.
            </p>
          )}
        </div>

        {/* Slideshow link */}
        {!isPendingSetup && (
          <div className="flex flex-col gap-3">
            <SectionLabel>Reception Slideshow</SectionLabel>
            <p className="text-sans text-cream/40 text-xs leading-relaxed -mt-1">
              Open on a TV or display at the reception — live updates as guests take photos.
            </p>
            <a
              href={slideshowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start px-4 py-2.5 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation active:bg-cream/5 hover:border-cream/25 hover:text-cream/70 transition-colors"
            >
              Open slideshow ↗
            </a>
            <div className="bg-ink-light rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-mono text-cream/35 text-[11px] truncate">
                {slideshowUrl}
              </p>
              <button
                onClick={() => copyText(slideshowUrl, 'slideshow')}
                className="shrink-0 text-sans text-cream/40 text-xs tracking-widest uppercase touch-manipulation"
              >
                {copiedField === 'slideshow' && copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Recent photos */}
        {recentPhotos.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Recent Photos</SectionLabel>
              <button
                onClick={() => navigate(`/admin/weddings/${id}/gallery`)}
                className="text-mono text-cream/30 text-[9px] tracking-[0.25em] uppercase hover:text-cream/55 transition-colors touch-manipulation"
              >
                View all →
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {recentPhotos.map(photo => (
                <div
                  key={photo.id}
                  className={`aspect-square rounded-lg overflow-hidden bg-ink-light relative group ${photo.photoUrl ? 'cursor-pointer' : ''}`}
                  onClick={() => { if (photo.photoUrl) setLightboxPhoto(photo) }}
                >
                  {photo.photoUrl ? (
                    <>
                      <img src={photo.photoUrl} alt="" draggable={false} className="w-full h-full object-cover" />
                      {photo.annotationUrl && (
                        <img src={photo.annotationUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ mixBlendMode: 'multiply' }} />
                      )}
                      <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/20 transition-colors duration-150 flex items-center justify-center">
                        <svg className="opacity-0 group-hover:opacity-80 transition-opacity duration-150" width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M8 3H3v5M17 3h-5M3 12v5h5M12 17h5v-5" stroke="#f5f0e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-mono text-cream/20 text-[9px]">—</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lightbox */}
        {lightboxPhoto && (
          <div
            className="fixed inset-0 z-50 bg-ink/96 backdrop-blur-sm flex flex-col items-center justify-center p-6 gap-4"
            onClick={() => { setLightboxPhoto(null); setLightboxConfirmDelete(false) }}
          >
            <div className="relative" onClick={e => e.stopPropagation()}>
              <img
                src={lightboxPhoto.photoUrl!}
                alt=""
                draggable={false}
                className="max-w-full max-h-[75dvh] object-contain rounded-xl shadow-2xl"
              />
              {lightboxPhoto.annotationUrl && (
                <img
                  src={lightboxPhoto.annotationUrl}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ mixBlendMode: 'multiply' }}
                />
              )}
            </div>
            {/* Metadata */}
            <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
              {lightboxPhoto.memoryNumber != null && (
                <p className="text-mono text-cream/40 text-xs tracking-widest">#{lightboxPhoto.memoryNumber}</p>
              )}
              <p className="text-mono text-cream/25 text-xs tracking-widest uppercase">{lightboxPhoto.mode}</p>
              {lightboxPhoto.capturedAt && (
                <p className="text-mono text-cream/25 text-xs tracking-widest">
                  {new Date(lightboxPhoto.capturedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
            {/* Actions */}
            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
              {!lightboxConfirmDelete ? (
                <>
                  <button
                    onClick={() => { setLightboxPhoto(null); setLightboxConfirmDelete(false) }}
                    className="text-mono text-cream/20 text-[10px] tracking-[0.3em] uppercase hover:text-cream/40 transition-colors touch-manipulation"
                  >
                    Close
                  </button>
                  <span className="text-cream/10">·</span>
                  <button
                    onClick={() => setLightboxConfirmDelete(true)}
                    className="text-mono text-red-400/40 text-[10px] tracking-[0.3em] uppercase hover:text-red-400/70 transition-colors touch-manipulation"
                  >
                    Delete
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sans text-cream/70 text-sm">Delete this photo permanently?</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => deletePhoto(lightboxPhoto.id)}
                      className="px-5 py-2 rounded-full bg-red-500/80 text-white text-sans text-xs tracking-widest uppercase touch-manipulation active:scale-95"
                    >
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setLightboxConfirmDelete(false)}
                      className="px-5 py-2 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation active:scale-95"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit form */}
        <div className="flex flex-col gap-4">
          <SectionLabel>Edit Details</SectionLabel>
          {isPendingSetup && (
            <p className="text-sans text-cream/30 text-xs -mt-2 leading-relaxed">
              These will be overwritten when the couple completes their setup.
            </p>
          )}

          <FormField label="Status">
            <AdminSelect value={form.status ?? ''} onChange={v => setField('status', v)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </AdminSelect>
          </FormField>

          <FormField label="Project type">
            <div className="flex items-center gap-3">
              <AdminToggle value={form.is_event ?? false} onChange={v => setField('is_event', v)} />
              <span className="text-sans text-cream/50 text-sm">
                {form.is_event ? 'Non-wedding event' : 'Wedding'}
              </span>
            </div>
          </FormField>

          <FormField label="Contact email">
            <AdminInput type="email" value={form.couple_email ?? ''} onChange={v => setField('couple_email', v || null)} placeholder="couple@email.com" />
          </FormField>

          <FormField label={form.is_event ? 'Name / organization' : 'Couple names'}>
            <AdminInput value={form.couple_names ?? ''} onChange={v => setField('couple_names', v)} />
          </FormField>

          {!form.is_event && (
            <FormField label="Wedding date">
              <AdminInput type="date" value={form.wedding_date ?? ''} onChange={v => setField('wedding_date', v)} />
            </FormField>
          )}

          {form.is_event && (
            <FormField label="Event end date">
              <AdminInput type="date" value={form.event_end_date ?? ''} onChange={v => setField('event_end_date', v || null)} />
              <p className="text-mono text-cream/25 text-[10px] mt-1 leading-relaxed">
                Photos are deleted on this date. A warning email is sent 7 days before.
                {!form.event_end_date && ' Leave blank for no auto-cleanup.'}
              </p>
            </FormField>
          )}

          <FormField label="Welcome message">
            <AdminInput value={form.welcome_message ?? ''} onChange={v => setField('welcome_message', v)} />
          </FormField>

          <FormField label="Memory styles">
            <div className="flex gap-2">
              {MODES.map(m => (
                <button key={m.id} type="button" onClick={() => toggleMode(m.id)}
                  className={`px-3 py-2 rounded-lg border text-sans text-xs tracking-wide transition-colors touch-manipulation ${
                    (form.allowed_modes ?? []).includes(m.id)
                      ? 'bg-cream text-ink border-cream'
                      : 'bg-transparent text-cream/40 border-cream/15'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Annotation mode">
            <AdminSelect value={form.annotation_mode ?? 'signature'} onChange={v => setField('annotation_mode', v)}>
              <option value="signature">Signature</option>
              <option value="doodle">Doodle</option>
              <option value="disabled">Disabled</option>
            </AdminSelect>
          </FormField>

          <FormField label="Selfie / front camera">
            <div className="flex items-center gap-3">
              <AdminToggle value={form.selfie_enabled ?? true} onChange={v => setField('selfie_enabled', v)} />
              <span className="text-sans text-cream/50 text-sm">
                {(form.selfie_enabled ?? true) ? 'Guests can flip to the front camera' : 'Rear camera only'}
              </span>
            </div>
            <p className="text-mono text-cream/25 text-[10px] mt-1 leading-relaxed">
              Adds a flip button so guests can take selfies — same no-retake rule and film look as the rear camera. Off = pure point-and-shoot.
            </p>
          </FormField>

          <FormField label="Let couple review flagged photos">
            <div className="flex items-center gap-3">
              <AdminToggle value={form.couple_review_enabled ?? false} onChange={v => setField('couple_review_enabled', v)} />
              <span className="text-sans text-cream/50 text-sm">
                {form.couple_review_enabled ? 'Couple can review' : 'Admin only'}
              </span>
            </div>
            <p className="text-mono text-cream/25 text-[10px] mt-1 leading-relaxed">
              When on, the couple sees auto-hidden (flagged) photos in a "Needs review" section and can restore them. Off = only you review them.
            </p>
          </FormField>

          <FormField label="Timestamp">
            <div className="flex items-center gap-3">
              <AdminToggle value={form.timestamp_enabled ?? true} onChange={v => setField('timestamp_enabled', v)} />
              {form.timestamp_enabled && (
                <AdminSelect value={form.timestamp_style ?? 'classic'} onChange={v => setField('timestamp_style', v)}>
                  <option value="classic">Classic</option>
                  <option value="vertical">Vertical</option>
                  <option value="elegant">Elegant</option>
                </AdminSelect>
              )}
            </div>
          </FormField>

          <FormField label="Slideshow “scan to share” slide">
            <div className="flex items-center gap-3">
              <AdminToggle value={form.slideshow_qr_slide ?? true} onChange={v => setField('slideshow_qr_slide', v)} />
              <span className="text-sans text-cream/50 text-sm">
                {(form.slideshow_qr_slide ?? true) ? 'On' : 'Off'}
              </span>
            </div>
            <p className="text-mono text-cream/25 text-[10px] mt-1 leading-relaxed">
              Mixes a "Want to share YOUR memories? Scan to get started" slide (with your QR) into the slideshow every few photos.
            </p>
          </FormField>

          <FormField label="Gallery size limit">
            <AdminInput type="number" value={form.photo_cap != null ? String(form.photo_cap) : ''} onChange={v => setField('photo_cap', v ? Number(v) : null)} placeholder="unlimited" min="1" />
            <p className="text-mono text-cream/25 text-[10px] mt-1 leading-relaxed">
              Max photos kept in this gallery. When it fills up, the oldest photos roll off so new ones always save. Leave blank for unlimited.
            </p>
          </FormField>

          <FormField label="Location fence">
            <div className="flex items-center gap-3">
              <AdminToggle
                value={form.geofence_enabled ?? false}
                onChange={v => setForm(f => ({
                  ...f,
                  geofence_enabled: v,
                  geofence_radius_m: v && f.geofence_radius_m == null ? 150 : f.geofence_radius_m,
                }))}
              />
              <span className="text-sans text-cream/50 text-sm">
                {form.geofence_enabled ? 'Guests must be at the venue' : 'Off'}
              </span>
            </div>
            <p className="text-mono text-cream/25 text-[10px] mt-1 leading-relaxed">
              When on, guests can only open the camera if their phone reports they're inside the fence.
              A soft anti-abuse gate (phone GPS isn't tamper-proof). Set a bypass code for guests whose
              location can't be checked.
            </p>

            {form.geofence_enabled && (
              <div className="flex flex-col gap-3 mt-3">
                <Suspense fallback={
                  <div className="w-full h-64 rounded-xl bg-ink-light border border-cream/10 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
                  </div>
                }>
                  <GeofenceMap
                    lat={form.geofence_lat ?? null}
                    lng={form.geofence_lng ?? null}
                    radius={form.geofence_radius_m ?? 150}
                    onMove={(la, lo) => setForm(f => ({ ...f, geofence_lat: la, geofence_lng: lo }))}
                  />
                </Suspense>

                {/* Radius */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sans text-cream/50 text-xs">Fence radius</label>
                    <span className="text-mono text-cream/50 text-[11px]">
                      {form.geofence_radius_m ?? 150} m · ~{Math.round((form.geofence_radius_m ?? 150) * 3.28084)} ft
                    </span>
                  </div>
                  <input
                    type="range" min={25} max={1000} step={25}
                    value={form.geofence_radius_m ?? 150}
                    onChange={e => setField('geofence_radius_m', Number(e.target.value))}
                    className="w-full accent-amber-film"
                  />
                  <p className="text-mono text-cream/25 text-[10px] leading-relaxed">
                    Indoor GPS can drift 30–100m — keep the radius generous (150m+) so real guests aren't blocked.
                  </p>
                </div>

                {/* Coordinates readout / warning */}
                {form.geofence_lat != null && form.geofence_lng != null ? (
                  <p className="text-mono text-cream/30 text-[10px]">
                    Venue: {form.geofence_lat.toFixed(5)}, {form.geofence_lng.toFixed(5)}
                  </p>
                ) : (
                  <p className="text-sans text-amber-film/70 text-xs">Set the venue location above before saving.</p>
                )}

                {/* Bypass code */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sans text-cream/50 text-xs">Bypass code (optional)</label>
                  <AdminInput
                    value={form.geofence_bypass_code ?? ''}
                    onChange={v => setField('geofence_bypass_code', v || null)}
                    placeholder="e.g. PAWS2026"
                  />
                  <p className="text-mono text-cream/25 text-[10px] leading-relaxed">
                    Post this at the venue or give it to staff. Guests whose location can't be verified can enter it to get in.
                  </p>
                </div>
              </div>
            )}
          </FormField>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveChanges}
              disabled={saving}
              className="px-6 py-3 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-95 transition-transform disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {saveMsg === 'saved' && <p className="text-sans text-green-400/70 text-sm">Saved</p>}
            {saveMsg === 'error' && <p className="text-sans text-red-400/70 text-sm">Error — try again</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-serif text-cream text-xl font-normal">{value}</p>
      <p className="text-mono text-cream/25 text-[9px] tracking-[0.15em] uppercase mt-0.5">{label}</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase">{children}</p>
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sans text-cream/50 text-xs">{label}</label>
      {children}
    </div>
  )
}

function AdminInput({ onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onChange: (v: any) => void }) {
  return (
    <input {...props} onChange={e => onChange(e.target.value)}
      className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 transition-colors"
    />
  )
}

function AdminSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3 text-cream text-sans text-sm focus:outline-none focus:border-cream/25 transition-colors appearance-none"
    >
      {children}
    </select>
  )
}

function AdminToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors touch-manipulation shrink-0 ${value ? 'bg-cream' : 'bg-cream/15'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${value ? 'left-7 bg-ink' : 'left-1 bg-cream/40'}`} />
    </button>
  )
}
