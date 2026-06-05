import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import QRCreator, { type QRSettings } from '@/components/QRCreator'

interface SessionRecord {
  id: string
  mode: 'disposable' | 'polaroid' | 'super8'
  memoryNumber: number | null
  capturedAt: string | null
  uploadedAt: string
  status: 'active' | 'hidden'
  photoUrl: string | null
  annotationUrl: string | null
}

interface GalleryData {
  wedding: { id: string; coupleNames: string; weddingDate: string }
  sessions: SessionRecord[]
}

type LoadState = 'loading' | 'ready' | 'auth-required' | 'error'

export default function CoupleGalleryPage() {
  const { weddingId } = useParams<{ weddingId: string }>()
  const navigate = useNavigate()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [data, setData] = useState<GalleryData | null>(null)
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [qrSettings, setQrSettings] = useState<QRSettings | null | 'loading'>(null)
  const [visible, setVisible] = useState(false)
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null)
  const [lightbox, setLightbox] = useState<SessionRecord | null>(null)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase || !weddingId) {
      setLoadState('error')
      return
    }

    async function load() {
      if (!supabase || !weddingId) return

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoadState('auth-required')
        return
      }

      tokenRef.current = session.access_token

      const res = await fetch(`/api/couple/gallery?weddingId=${weddingId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (res.status === 401 || res.status === 403) {
        setLoadState('auth-required')
        return
      }

      if (!res.ok) {
        setLoadState('error')
        return
      }

      const json: GalleryData = await res.json()
      setData(json)
      setSessions(json.sessions)
      setLoadState('ready')
      setTimeout(() => setVisible(true), 60)
    }

    load()
  }, [weddingId])

  // Load saved QR settings whenever the modal opens
  useEffect(() => {
    if (!showQR || !tokenRef.current) return
    setQrSettings('loading')
    fetch('/api/couple/wedding', {
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setQrSettings(data?.qr_settings ?? null))
      .catch(() => setQrSettings(null))
  }, [showQR])

  const saveQRSettings = useCallback(async (settings: QRSettings) => {
    if (!tokenRef.current) return
    await fetch('/api/couple/qr', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ qrSettings: settings }),
    })
  }, [])

  async function deleteSession(sessionId: string) {
    // Optimistic: remove from list immediately
    setSessions(prev => prev.filter(s => s.id !== sessionId))

    const res = await fetch(`/api/couple/session?sessionId=${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })

    if (!res.ok) {
      // Revert — put it back (re-fetch would be cleaner but this avoids a round-trip)
      window.location.reload()
    }
  }

  async function toggleVisibility(sessionId: string, currentStatus: 'active' | 'hidden') {
    const nextStatus = currentStatus === 'active' ? 'hidden' : 'active'

    // Optimistic update
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: nextStatus } : s))

    const res = await fetch(`/api/couple/session?sessionId=${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ status: nextStatus }),
    })

    if (!res.ok) {
      // Revert on failure
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: currentStatus } : s))
    }
  }

  async function downloadPhoto(photoUrl: string, annotationUrl: string | null, memoryNumber: number | null) {
    const blob = await flattenPhoto(photoUrl, annotationUrl)
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `reverie-memory-${memoryNumber ?? 'photo'}.jpg`
    a.click()
    URL.revokeObjectURL(objectUrl)
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    navigate('/couple/login')
  }

  async function downloadAll() {
    const photos = sessions.filter(s => s.status === 'active' && s.photoUrl)
    if (photos.length === 0 || zipProgress) return

    setZipProgress({ current: 0, total: photos.length })
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()

      for (let i = 0; i < photos.length; i++) {
        const s = photos[i]!
        const blob = await flattenPhoto(s.photoUrl!, s.annotationUrl)
        const num = String(s.memoryNumber ?? i + 1).padStart(3, '0')
        zip.file(`memory-${num}.jpg`, blob)
        setZipProgress({ current: i + 1, total: photos.length })
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const slug = (data?.wedding.coupleNames ?? 'reverie')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const date  = data?.wedding.weddingDate ?? new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href     = URL.createObjectURL(zipBlob)
      a.download = `${slug}-${date}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setZipProgress(null)
    }
  }

  // ── Redirect states ──────────────────────────────────────────

  if (loadState === 'auth-required') {
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6 text-center gap-4">
        <p className="text-serif text-cream text-xl">Sign in to view your gallery</p>
        <button
          onClick={() => navigate('/couple/login')}
          className="px-6 py-3 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase touch-manipulation"
        >
          Sign in
        </button>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6 text-center gap-3">
        <p className="text-serif text-cream text-xl">Couldn't load your gallery</p>
        <p className="text-sans text-cream/40 text-sm">Check your connection and try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-3 rounded-full border border-cream/15 text-cream/60 text-sans text-xs tracking-widest uppercase touch-manipulation"
        >
          Retry
        </button>
      </div>
    )
  }

  if (loadState === 'loading') {
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-cream/20 border-t-cream/70 animate-spin" />
        <p className="text-sans text-cream/30 text-xs tracking-widest uppercase">Loading your memories</p>
      </div>
    )
  }

  // ── Stats ────────────────────────────────────────────────────

  const allSessions = sessions
  const activeSessions = allSessions.filter(s => s.status === 'active')
  const visibleSessions = showHidden ? allSessions : activeSessions

  const totalPhotos = activeSessions.length

  // Most active hour (from captured_at timestamps)
  const hourCounts: Record<number, number> = {}
  for (const s of allSessions) {
    if (s.capturedAt) {
      const h = new Date(s.capturedAt).getHours()
      hourCounts[h] = (hourCounts[h] ?? 0) + 1
    }
  }
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]
  const peakHourDisplay = peakHour
    ? (() => {
        const h = parseInt(peakHour[0])
        const ampm = h >= 12 ? 'PM' : 'AM'
        const h12 = h % 12 || 12
        return `${h12}:00 ${ampm}`
      })()
    : '—'

  const guestUrl = weddingId ? `https://rememberreverie.com/w/${weddingId}` : ''

  // Retention: wedding_date + 90 days
  const retentionInfo = (() => {
    if (!data?.wedding.weddingDate) return null
    const del = new Date(data.wedding.weddingDate + 'T12:00:00')
    del.setDate(del.getDate() + 90)
    const daysLeft = Math.ceil((del.getTime() - Date.now()) / 86400000)
    const formatted = del.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return { daysLeft, formatted }
  })()

  return (
    <div className="min-h-dvh bg-ink overflow-y-auto">

      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/5 px-5 py-4 flex items-center justify-between transition-all duration-700"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div>
          <p className="text-mono text-cream/30 text-[9px] tracking-[0.3em] uppercase">Your gallery</p>
          <h1 className="text-serif text-cream text-lg font-normal leading-tight mt-0.5">
            {data?.wedding.coupleNames}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQR(true)}
            className="px-3 py-1.5 rounded-full border border-cream/15 text-cream/50 text-sans text-[11px] tracking-widest uppercase touch-manipulation active:bg-cream/5 transition-colors"
          >
            QR Code
          </button>
          <button
            onClick={() => navigate(`/couple/${weddingId}/settings`)}
            title="Settings"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-cream/10 text-cream/30 touch-manipulation active:bg-cream/5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
            </svg>
          </button>
          <button
            onClick={signOut}
            className="px-3 py-1.5 rounded-full border border-cream/10 text-cream/30 text-sans text-[11px] tracking-widest uppercase touch-manipulation active:bg-cream/5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* QR Creator modal */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setShowQR(false) }}
        >
          <div className="w-full max-w-lg bg-ink border-t border-cream/10 rounded-t-3xl px-6 pt-5 pb-10 overflow-y-auto max-h-[92dvh]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-mono text-cream/30 text-[9px] tracking-[0.3em] uppercase">Your QR Code</p>
                <h2 className="text-serif text-cream text-lg font-normal mt-0.5">Create & download</h2>
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
            {qrSettings === 'loading' ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
              </div>
            ) : (
              <QRCreator
                url={guestUrl}
                coupleNames={data?.wedding.coupleNames ?? ''}
                onClose={() => setShowQR(false)}
                initialSettings={qrSettings}
                onSave={saveQRSettings}
              />
            )}
          </div>
        </div>
      )}


      {/* Stats */}
      <div
        className="px-5 py-5 border-b border-cream/5 transition-all duration-700 delay-100"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(6px)' }}
      >
        <div className="flex gap-6">
          <Stat value={String(totalPhotos)} label="memories captured" />
          <Stat value={peakHourDisplay} label="most active hour" />
          {allSessions.length - activeSessions.length > 0 && (
            <Stat value={String(allSessions.length - activeSessions.length)} label="hidden" />
          )}
        </div>
      </div>

      {/* Retention notice — shown when ≤ 60 days to deletion */}
      {retentionInfo && retentionInfo.daysLeft <= 60 && (
        <RetentionNotice {...retentionInfo} onDownload={downloadAll} />
      )}

      {/* Slideshow CTA */}
      <div className="px-4 pt-3 pb-1">
        <a
          href={`/w/${weddingId}/slideshow`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-4 bg-ink-light border border-cream/10 rounded-2xl px-4 py-4 touch-manipulation active:bg-cream/5 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cream/5 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="rgba(245,240,232,0.55)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="18" height="12" rx="2"/>
                <path d="M7 19h6M10 15v4"/>
              </svg>
            </div>
            <div>
              <p className="text-sans text-cream/80 text-sm font-medium leading-tight">Reception Slideshow</p>
              <p className="text-mono text-cream/30 text-[10px] tracking-[0.15em] mt-0.5">Live display — memories appear as guests shoot</p>
            </div>
          </div>
          <svg className="shrink-0 opacity-30 group-hover:opacity-60 transition-opacity" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(245,240,232,1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4"/>
          </svg>
        </a>
      </div>

      {/* Controls */}
      <div className="px-5 py-3 border-b border-cream/5 flex items-center justify-between gap-3">
        {/* Download all ZIP */}
        <button
          onClick={downloadAll}
          disabled={!!zipProgress || activeSessions.length === 0}
          className="flex items-center gap-2 text-sans text-cream/50 text-xs tracking-widest uppercase touch-manipulation active:text-cream/80 transition-colors disabled:opacity-30"
        >
          {zipProgress ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border border-cream/40 border-t-cream/80 animate-spin shrink-0" />
              <span>{zipProgress.current} / {zipProgress.total}</span>
            </>
          ) : (
            <>
              <DownloadIcon />
              <span>Download all</span>
            </>
          )}
        </button>

        {/* Show/hide hidden toggle */}
        {allSessions.some(s => s.status === 'hidden') && (
          <button
            onClick={() => setShowHidden(v => !v)}
            className="text-sans text-cream/30 text-xs tracking-widest uppercase touch-manipulation active:text-cream/60 transition-colors"
          >
            {showHidden ? 'Hide hidden' : 'Show hidden'}
          </button>
        )}
      </div>

      {/* Onboarding — brand-new gallery with no photos yet */}
      {allSessions.length === 0 && (
        <OnboardingPanel
          onCreateQR={() => setShowQR(true)}
          onChooseLink={() => navigate(`/couple/${weddingId}/settings`)}
        />
      )}

      {/* Empty state — has photos, but all hidden / filtered out */}
      {allSessions.length > 0 && visibleSessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <p className="text-serif text-cream/40 text-xl italic">Nothing to show</p>
          <p className="text-sans text-cream/25 text-sm mt-2">
            Your visible memories are hidden. Tap "Show hidden" to see them.
          </p>
        </div>
      )}

      {/* Photo grid */}
      {visibleSessions.length > 0 && (
        <div
          className="px-3 pt-3 pb-6 transition-all duration-700 delay-200"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-2">
            {visibleSessions.map(session => (
              <PhotoTile
                key={session.id}
                session={session}
                onToggleVisibility={toggleVisibility}
                onDownload={downloadPhoto}
                onDelete={deleteSession}
                onOpen={setLightbox}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        className="px-5 pb-10 pt-2 flex flex-col items-center gap-2 transition-all duration-700 delay-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <p className="text-mono text-cream/15 text-[10px] tracking-[0.25em] uppercase text-center">
          {data?.wedding.weddingDate
            ? new Date(data.wedding.weddingDate + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : ''
          }
        </p>
        {retentionInfo && retentionInfo.daysLeft > 60 && (
          <p className="text-mono text-cream/15 text-[9px] tracking-[0.2em] uppercase text-center">
            Archived {retentionInfo.formatted}
          </p>
        )}
        <p className="text-mono text-cream/10 text-[9px] tracking-[0.2em] uppercase">
          RememberReverie.com
        </p>
      </div>

      {/* Lightbox — tap a photo to view it large */}
      {lightbox && (
        <Lightbox
          session={lightbox}
          onClose={() => setLightbox(null)}
          onDownload={downloadPhoto}
        />
      )}
    </div>
  )
}

function Lightbox({
  session,
  onClose,
  onDownload,
}: {
  session: SessionRecord
  onClose: () => void
  onDownload: (photoUrl: string, annotationUrl: string | null, memoryNumber: number | null) => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-ink/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <button
        onClick={onClose}
        title="Close"
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-ink/60 border border-cream/10 touch-manipulation active:scale-95"
      >
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="rgba(245,240,232,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      <div className="relative max-w-full max-h-[82dvh]">
        {session.photoUrl && (
          <img
            src={session.photoUrl}
            alt={`Memory #${session.memoryNumber}`}
            draggable={false}
            className="max-w-full max-h-[82dvh] object-contain rounded-sm"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.55)' }}
          />
        )}
        {session.annotationUrl && (
          <img
            src={session.annotationUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ mixBlendMode: 'multiply' }}
          />
        )}
      </div>

      <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-4">
        {session.memoryNumber != null && (
          <span className="text-mono text-cream/40 text-[10px] tracking-[0.3em] uppercase">
            Memory #{session.memoryNumber}
          </span>
        )}
        {session.photoUrl && (
          <button
            onClick={() => onDownload(session.photoUrl!, session.annotationUrl, session.memoryNumber)}
            className="flex items-center gap-2 text-sans text-cream/60 text-xs tracking-widest uppercase touch-manipulation active:text-cream/90"
          >
            <DownloadIcon />
            Download
          </button>
        )}
      </div>
    </div>
  )
}

// ── Download helpers ────────────────────────────────────────────

function loadCorsImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// JPEG blob of the photo with the signature composited on top (matching the
// on-screen multiply blend). Falls back to the raw photo if compositing fails
// (e.g. a cross-origin taint), so a download always works.
async function flattenPhoto(photoUrl: string, annotationUrl: string | null): Promise<Blob> {
  if (!annotationUrl) return (await fetch(photoUrl)).blob()
  try {
    const [photo, annot] = await Promise.all([loadCorsImage(photoUrl), loadCorsImage(annotationUrl)])
    const canvas = document.createElement('canvas')
    canvas.width  = photo.naturalWidth
    canvas.height = photo.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(photo, 0, 0)
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(annot, 0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.95)
    )
  } catch {
    return (await fetch(photoUrl)).blob()
  }
}

// ── Sub-components ──────────────────────────────────────────────

function OnboardingPanel({ onCreateQR, onChooseLink }: { onCreateQR: () => void; onChooseLink: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-16 max-w-md mx-auto">
      <p className="text-mono text-cream/30 text-[10px] tracking-[0.3em] uppercase">
        Your gallery · Getting started
      </p>
      <h2 className="text-serif text-cream text-2xl font-normal mt-3">
        This is where it all collects.
      </h2>
      <p className="text-sans text-cream/45 text-sm leading-relaxed mt-3">
        Right now it's empty — but not for long. Create your QR code, set it where
        your guests will find it, and every photo they take appears here, automatically.
      </p>
      <button
        onClick={onCreateQR}
        className="mt-7 px-7 py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
      >
        Create your QR code
      </button>
      <button
        onClick={onChooseLink}
        className="mt-4 text-sans text-cream/35 text-xs italic touch-manipulation active:text-cream/60 transition-colors"
      >
        Make it yours — choose a custom link before you print
      </button>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-serif text-cream text-xl font-normal">{value}</p>
      <p className="text-mono text-cream/30 text-[9px] tracking-[0.15em] uppercase mt-0.5">{label}</p>
    </div>
  )
}

function PhotoTile({
  session,
  onToggleVisibility,
  onDownload,
  onDelete,
  onOpen,
}: {
  session: SessionRecord
  onToggleVisibility: (id: string, status: 'active' | 'hidden') => void
  onDownload: (photoUrl: string, annotationUrl: string | null, memoryNumber: number | null) => void
  onDelete: (id: string) => void
  onOpen: (session: SessionRecord) => void
}) {
  const [imgVisible, setImgVisible] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isHidden = session.status === 'hidden'

  return (
    <div
      className={`w-full mb-2 rounded-lg overflow-hidden break-inside-avoid relative group transition-opacity duration-300 ${isHidden ? 'opacity-40' : ''}`}
    >
      {session.photoUrl ? (
        <>
          <img
            src={session.photoUrl}
            alt={`Memory #${session.memoryNumber}`}
            draggable={false}
            onLoad={() => setImgVisible(true)}
            onClick={() => onOpen(session)}
            className="w-full h-auto block transition-opacity duration-500 cursor-zoom-in"
            style={{ opacity: imgVisible ? 1 : 0 }}
          />
          {/* Annotation overlay */}
          {session.annotationUrl && imgVisible && (
            <img
              src={session.annotationUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ mixBlendMode: 'multiply' }}
            />
          )}
          {/* Memory number badge */}
          {session.memoryNumber && (
            <div className="absolute top-2 left-2 bg-ink/70 backdrop-blur-sm rounded px-1.5 py-0.5">
              <p className="text-mono text-cream/60 text-[9px] tracking-[0.2em]">
                #{session.memoryNumber}
              </p>
            </div>
          )}

          {/* Delete confirmation overlay */}
          {confirmDelete && (
            <div className="absolute inset-0 bg-ink/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-3">
              <p className="text-sans text-cream/80 text-xs text-center leading-relaxed">
                Delete this memory?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onDelete(session.id)}
                  className="px-3 py-1.5 rounded-full bg-red-500/80 text-white text-sans text-[11px] tracking-wide touch-manipulation active:scale-95"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-full border border-cream/20 text-cream/60 text-sans text-[11px] tracking-wide touch-manipulation active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Actions overlay */}
          {!confirmDelete && (
            <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
              {session.photoUrl && (
                <ActionButton
                  title="Download"
                  onClick={() => onDownload(session.photoUrl!, session.annotationUrl, session.memoryNumber)}
                >
                  <DownloadIcon />
                </ActionButton>
              )}
              <ActionButton
                title={isHidden ? 'Show' : 'Hide'}
                onClick={() => onToggleVisibility(session.id, session.status)}
              >
                {isHidden ? <EyeIcon /> : <EyeOffIcon />}
              </ActionButton>
              <ActionButton
                title="Delete"
                onClick={() => setConfirmDelete(true)}
              >
                <TrashIcon />
              </ActionButton>
            </div>
          )}
        </>
      ) : (
        /* Photo failed to load or URL missing */
        <div className="aspect-[3/2] bg-ink-light flex items-center justify-center">
          <p className="text-mono text-cream/20 text-[10px]">Photo unavailable</p>
        </div>
      )}
    </div>
  )
}

function ActionButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-full bg-ink/80 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
    >
      {children}
    </button>
  )
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="rgba(245,240,232,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2v7M4 6l3 3 3-3M2 10v2h10v-2" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="rgba(245,240,232,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 7C1 7 3 3 7 3s6 4 6 4-2 4-6 4-6-4-6-4z" />
      <circle cx="7" cy="7" r="1.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="rgba(245,240,232,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l10 10M5.5 5.6A2 2 0 009.4 9.4M3 6C2 7 1 7 1 7s2 4 6 4c.9 0 1.7-.2 2.4-.5M11.5 9.2C12.5 8 13 7 13 7s-2-4-6-4c-.4 0-.8 0-1.1.1" />
    </svg>
  )
}

function RetentionNotice({
  daysLeft,
  formatted,
  onDownload,
}: {
  daysLeft: number
  formatted: string
  onDownload: () => void
}) {
  // 31–60 days: quiet amber line
  if (daysLeft > 30) {
    return (
      <div className="px-5 py-2">
        <p className="text-mono text-cream/30 text-[10px] tracking-[0.2em] text-center">
          Memories archived {formatted} · {daysLeft} days remaining
        </p>
      </div>
    )
  }

  // 15–30 days: small amber card
  if (daysLeft > 14) {
    return (
      <div className="px-4 pt-2 pb-1">
        <div className="bg-amber-film/8 border border-amber-film/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sans text-amber-film/80 text-sm font-medium">Download your memories</p>
            <p className="text-mono text-cream/30 text-[10px] tracking-wide mt-0.5">
              Archived {formatted} · {daysLeft} days left
            </p>
          </div>
          <button
            onClick={onDownload}
            className="shrink-0 text-mono text-amber-film/60 text-[10px] tracking-[0.2em] uppercase touch-manipulation"
          >
            Download
          </button>
        </div>
      </div>
    )
  }

  // 7–14 days: orange, more urgent
  if (daysLeft > 7) {
    return (
      <div className="px-4 pt-2 pb-1">
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sans text-orange-400/90 text-sm font-semibold">
              {daysLeft} days to download
            </p>
            <button
              onClick={onDownload}
              className="shrink-0 px-3 py-1 rounded-full border border-orange-400/30 text-orange-400/80 text-sans text-[11px] tracking-widest uppercase touch-manipulation"
            >
              Download all
            </button>
          </div>
          <p className="text-mono text-cream/35 text-[10px] tracking-wide mt-1.5">
            Your memories will be permanently deleted on {formatted}.
          </p>
        </div>
      </div>
    )
  }

  // ≤ 7 days: red, urgent
  return (
    <div className="px-4 pt-2 pb-1">
      <div className="bg-red-500/12 border border-red-500/35 rounded-xl px-4 py-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sans text-red-400 text-sm font-bold">
            {daysLeft <= 1 ? 'Last day' : `${daysLeft} days left`} — download now
          </p>
          <button
            onClick={onDownload}
            className="shrink-0 px-3 py-1.5 rounded-full bg-red-400/20 border border-red-400/40 text-red-300 text-sans text-[11px] tracking-widest uppercase touch-manipulation active:scale-95"
          >
            Download all
          </button>
        </div>
        <p className="text-mono text-cream/40 text-[10px] tracking-wide leading-relaxed">
          All photos are permanently deleted on {formatted}. Use "Download all" to save a zip of your memories.
        </p>
      </div>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="rgba(245,240,232,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h10M5 4V2.5h4V4M11 4l-.8 7.5H3.8L3 4" />
    </svg>
  )
}
