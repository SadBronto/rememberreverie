import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface GalleryPhoto {
  id: string
  mode: string
  memoryNumber: number | null
  capturedAt: string | null
  uploadedAt: string
  status: 'active' | 'hidden' | 'flagged'
  moderationLabels: string | null
  photoUrl: string | null
  annotationUrl: string | null
}

// Short human reason from the stored SafeSearch result, e.g. "adult likely"
function moderationReason(labels: string | null): string | null {
  if (!labels) return null
  try {
    const o = JSON.parse(labels) as Record<string, string>
    const parts = Object.entries(o)
      .filter(([, v]) => v === 'LIKELY' || v === 'VERY_LIKELY')
      .map(([k, v]) => `${k} ${v.replace('_', ' ').toLowerCase()}`)
    return parts.length ? parts.join(', ') : null
  } catch { return null }
}

const PAGE_SIZE = 48

const MODE_LABEL: Record<string, string> = {
  disposable: 'Disposable',
  polaroid:   'Polaroid',
  super8:     'Super 8',
}

export default function AdminGalleryPage() {
  const { id: weddingId } = useParams<{ id: string }>()
  const navigate           = useNavigate()
  const tokenRef           = useRef<string | null>(null)

  const [photos, setPhotos]       = useState<GalleryPhoto[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lightbox, setLightbox]   = useState<GalleryPhoto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [filterMode, setFilterMode] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const loadPage = useCallback(async (p: number, token: string, replace = false) => {
    if (!weddingId) return
    const res = await fetch(
      `/api/admin/gallery?weddingId=${weddingId}&page=${p}&pageSize=${PAGE_SIZE}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return
    const data = await res.json()
    setPhotos(prev => replace ? data.photos : [...prev, ...data.photos])
    setTotal(data.total)
  }, [weddingId])

  useEffect(() => {
    async function init() {
      if (!supabase || !weddingId) { navigate('/admin/login', { replace: true }); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/admin/login', { replace: true }); return }
      tokenRef.current = session.access_token
      await loadPage(0, session.access_token, true)
      setLoading(false)
    }
    init()
  }, [weddingId, navigate, loadPage])

  async function loadMore() {
    if (!tokenRef.current) return
    setLoadingMore(true)
    const next = page + 1
    await loadPage(next, tokenRef.current, false)
    setPage(next)
    setLoadingMore(false)
  }

  async function deletePhoto(photo: GalleryPhoto) {
    if (!tokenRef.current) return
    const res = await fetch(`/api/admin/session?sessionId=${photo.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
    if (res.ok) {
      setPhotos(prev => prev.filter(p => p.id !== photo.id))
      setTotal(t => t - 1)
      setLightbox(null)
      setConfirmDelete(false)
    }
  }

  // Restore a flagged/hidden photo to active, or manually hide an active one.
  async function setStatus(photo: GalleryPhoto, status: 'active' | 'hidden') {
    if (!tokenRef.current) return
    const res = await fetch(`/api/admin/session?sessionId=${photo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, status } : p))
      setLightbox(prev => prev ? { ...prev, status } : prev)
    }
  }

  // ── Filtering (client-side on loaded batch) ───────────────────

  const filtered = photos.filter(p => {
    if (filterMode   !== 'all' && p.mode   !== filterMode)   return false
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    return true
  })

  const hasMore = photos.length < total
  const flaggedCount = photos.filter(p => p.status === 'flagged').length

  // ── Loading ───────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-dvh bg-ink flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-dvh bg-ink pb-16">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/5 px-5 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(`/admin/weddings/${weddingId}`)}
          className="text-cream/40 text-sans text-sm touch-manipulation shrink-0"
        >
          ← Back
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-serif text-cream text-lg font-normal">All Photos</h1>
          <p className="text-mono text-cream/30 text-[10px] tracking-widest uppercase mt-0.5">
            {total} memories
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-5 py-3 border-b border-cream/5 flex items-center gap-3 flex-wrap">
        <FilterChip active={filterMode === 'all'}        onClick={() => setFilterMode('all')}>All modes</FilterChip>
        <FilterChip active={filterMode === 'disposable'} onClick={() => setFilterMode('disposable')}>Disposable</FilterChip>
        <FilterChip active={filterMode === 'polaroid'}   onClick={() => setFilterMode('polaroid')}>Polaroid</FilterChip>
        <FilterChip active={filterMode === 'super8'}     onClick={() => setFilterMode('super8')}>Super 8</FilterChip>
        <span className="text-cream/10">·</span>
        <FilterChip active={filterStatus === 'all'}     onClick={() => setFilterStatus('all')}>All</FilterChip>
        <FilterChip active={filterStatus === 'active'}  onClick={() => setFilterStatus('active')}>Visible</FilterChip>
        <FilterChip active={filterStatus === 'hidden'}  onClick={() => setFilterStatus('hidden')}>Hidden</FilterChip>
        <FilterChip active={filterStatus === 'flagged'} onClick={() => setFilterStatus('flagged')}>
          Flagged{flaggedCount > 0 ? ` (${flaggedCount})` : ''}
        </FilterChip>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <p className="text-serif text-cream/30 text-xl italic">No photos</p>
        </div>
      ) : (
        <div className="px-3 pt-3">
          <div className="columns-3 gap-1.5 sm:columns-4 md:columns-5">
            {filtered.map(photo => (
              <GalleryTile
                key={photo.id}
                photo={photo}
                onClick={() => { setLightbox(photo); setConfirmDelete(false) }}
              />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center py-8">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-full border border-cream/15 text-cream/50 text-sans text-xs tracking-widest uppercase touch-manipulation active:bg-cream/5 disabled:opacity-40"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border border-cream/30 border-t-cream/70 animate-spin" />
                    Loading…
                  </span>
                ) : `Load more (${total - photos.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-ink/96 backdrop-blur-sm flex flex-col items-center justify-center p-6 gap-4"
          onClick={() => { setLightbox(null); setConfirmDelete(false) }}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.photoUrl!}
              alt=""
              draggable={false}
              className="max-w-full max-h-[72dvh] object-contain rounded-xl shadow-2xl"
            />
            {lightbox.annotationUrl && (
              <img
                src={lightbox.annotationUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ mixBlendMode: 'multiply' }}
              />
            )}
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
            {lightbox.memoryNumber != null && (
              <p className="text-mono text-cream/40 text-xs tracking-widest">
                #{lightbox.memoryNumber}
              </p>
            )}
            <p className="text-mono text-cream/25 text-xs tracking-widest uppercase">
              {MODE_LABEL[lightbox.mode] ?? lightbox.mode}
            </p>
            {lightbox.status === 'hidden' && (
              <p className="text-mono text-amber-film/50 text-xs tracking-widest uppercase">Hidden</p>
            )}
            {lightbox.status === 'flagged' && (
              <p className="text-mono text-red-400/70 text-xs tracking-widest uppercase">
                Flagged{moderationReason(lightbox.moderationLabels) ? ` · ${moderationReason(lightbox.moderationLabels)}` : ''}
              </p>
            )}
            {lightbox.capturedAt && (
              <p className="text-mono text-cream/25 text-xs tracking-widest">
                {new Date(lightbox.capturedAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
            {!confirmDelete ? (
              <>
                <button
                  onClick={() => { setLightbox(null); setConfirmDelete(false) }}
                  className="px-4 py-2 rounded-full border border-cream/15 text-cream/60 text-sans text-xs font-medium tracking-widest uppercase hover:bg-cream/5 hover:text-cream/80 transition-colors touch-manipulation"
                >
                  Close
                </button>
                {lightbox.photoUrl && (
                  <a
                    href={lightbox.photoUrl}
                    download={`memory-${lightbox.memoryNumber ?? lightbox.id}.jpg`}
                    className="px-4 py-2 rounded-full border border-cream/20 text-cream/80 text-sans text-xs font-medium tracking-widest uppercase hover:bg-cream/5 transition-colors touch-manipulation"
                    onClick={e => e.stopPropagation()}
                  >
                    Download
                  </a>
                )}
                {(lightbox.status === 'flagged' || lightbox.status === 'hidden') && (
                  <button
                    onClick={() => setStatus(lightbox, 'active')}
                    className="px-4 py-2 rounded-full border border-green-400/30 text-green-400/80 text-sans text-xs font-medium tracking-widest uppercase hover:bg-green-400/10 transition-colors touch-manipulation"
                  >
                    Restore
                  </button>
                )}
                {lightbox.status === 'active' && (
                  <button
                    onClick={() => setStatus(lightbox, 'hidden')}
                    className="px-4 py-2 rounded-full border border-cream/15 text-cream/60 text-sans text-xs font-medium tracking-widest uppercase hover:bg-cream/5 hover:text-cream/80 transition-colors touch-manipulation"
                  >
                    Hide
                  </button>
                )}
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-4 py-2 rounded-full border border-red-400/30 text-red-400/80 text-sans text-xs font-medium tracking-widest uppercase hover:bg-red-400/10 transition-colors touch-manipulation"
                >
                  Delete
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sans text-cream/70 text-sm">Delete this photo permanently?</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => deletePhoto(lightbox)}
                    className="px-5 py-2 rounded-full bg-red-500/80 text-white text-sans text-xs tracking-widest uppercase touch-manipulation active:scale-95"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
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
    </div>
  )
}

function GalleryTile({ photo, onClick }: { photo: GalleryPhoto; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div
      className={`w-full mb-1.5 rounded-md overflow-hidden break-inside-avoid relative group cursor-pointer ${photo.status === 'hidden' ? 'opacity-40' : ''}`}
      onClick={onClick}
    >
      {photo.photoUrl ? (
        <>
          <img
            src={photo.photoUrl}
            alt={`Memory #${photo.memoryNumber}`}
            draggable={false}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="w-full h-auto block transition-opacity duration-300"
            style={{ opacity: loaded ? 1 : 0 }}
          />
          {photo.annotationUrl && loaded && (
            <img
              src={photo.annotationUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ mixBlendMode: 'multiply' }}
            />
          )}
          <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/25 transition-colors duration-150" />
          {photo.status === 'flagged' && (
            <div className="absolute inset-0 ring-2 ring-inset ring-red-500/70 rounded-md pointer-events-none" />
          )}
          {photo.memoryNumber != null && (
            <div className="absolute top-1 left-1 bg-ink/70 rounded px-1 py-px">
              <p className="text-mono text-cream/50 text-[8px] tracking-[0.15em]">
                #{photo.memoryNumber}
              </p>
            </div>
          )}
          {photo.status === 'flagged' && (
            <div className="absolute top-1 right-1 bg-red-500/85 rounded px-1 py-px">
              <p className="text-mono text-white text-[8px] tracking-[0.15em] uppercase">Flagged</p>
            </div>
          )}
        </>
      ) : (
        <div className="aspect-square bg-ink-light flex items-center justify-center">
          <p className="text-mono text-cream/15 text-[9px]">—</p>
        </div>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sans text-[11px] tracking-wide touch-manipulation transition-colors ${
        active
          ? 'bg-cream/10 text-cream/80 border border-cream/20'
          : 'text-cream/35 border border-transparent hover:text-cream/55'
      }`}
    >
      {children}
    </button>
  )
}
