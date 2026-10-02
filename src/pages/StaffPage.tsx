import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pokeSlideshow } from '@/lib/liveRefresh'

interface StaffPhoto {
  id: string
  mode: string
  memoryNumber: number | null
  capturedAt: string | null
  photoUrl: string
  annotationUrl: string | null
}

// Per-browser-session so a refresh during a shift doesn't re-prompt; clears when the
// tab closes (we don't want a shared staff password living in localStorage forever).
const CODE_KEY = 'reverie-staff-code'

// Password-gated, login-free moderation page for on-site venue staff: see the photos
// currently on the slideshow (newest first) and pull anything the auto-filter missed.
// A removal hides the photo (it moves to the private Hidden archive for host/admin
// review) and nudges the live slideshow to drop it within ~1s.
export default function StaffPage() {
  const { slug } = useParams<{ slug: string }>()

  const [code, setCode] = useState('')
  const [entering, setEntering] = useState('')
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [eventName, setEventName] = useState('')
  const [photos, setPhotos] = useState<StaffPhoto[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [open, setOpen] = useState<StaffPhoto | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const weddingIdRef = useRef<string | null>(null)
  const offsetRef = useRef(0)

  const load = useCallback(async (c: string, reset: boolean) => {
    if (!slug) return
    setLoading(true)
    setError(null)
    try {
      const offset = reset ? 0 : offsetRef.current
      const res = await fetch(`/api/staff/gallery?slug=${encodeURIComponent(slug)}&offset=${offset}`, {
        headers: { 'x-staff-code': c },
      })
      if (res.status === 401) {
        setError('Incorrect password.')
        setAuthed(false)
        try { sessionStorage.removeItem(CODE_KEY) } catch { /* ignore */ }
        return
      }
      if (!res.ok) { setError('Something went wrong. Please try again.'); return }
      const data = await res.json() as {
        weddingId: string; eventName: string; photos: StaffPhoto[]; hasMore: boolean; nextOffset: number
      }
      weddingIdRef.current = data.weddingId
      setEventName(data.eventName ?? '')
      setPhotos(prev => reset ? data.photos : [...prev, ...data.photos])
      offsetRef.current = data.nextOffset ?? (offset + data.photos.length)
      setHasMore(!!data.hasMore)
      setAuthed(true)
      setCode(c)
      try { sessionStorage.setItem(CODE_KEY, c) } catch { /* ignore */ }
    } catch {
      setError('Network error. Check the connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  // Resume a code saved earlier this session.
  useEffect(() => {
    let saved: string | null = null
    try { saved = sessionStorage.getItem(CODE_KEY) } catch { /* ignore */ }
    if (saved) void load(saved, true)
  }, [load])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const c = entering.trim()
    if (c) void load(c, true)
  }

  async function remove(id: string) {
    setRemoving(id)
    setError(null)
    try {
      const res = await fetch('/api/staff/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-code': code },
        body: JSON.stringify({ slug, sessionId: id }),
      })
      if (res.ok) {
        setPhotos(prev => prev.filter(p => p.id !== id))
        setOpen(null)
        setConfirm(false)
        pokeSlideshow(weddingIdRef.current) // drop it from the TV now
      } else {
        setError('Could not remove that photo. Please try again.')
      }
    } catch {
      setError('Network error while removing. Please try again.')
    } finally {
      setRemoving(null)
    }
  }

  // ── Password gate ─────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-6 safe-top safe-bottom">
        <div className="w-full max-w-xs flex flex-col items-center text-center">
          <p className="text-mono text-cream/30 text-[10px] tracking-[0.4em] uppercase">Reverie · Staff</p>
          <h1 className="text-serif text-cream text-2xl font-normal mt-4">Photo moderation</h1>
          <p className="text-sans text-cream/45 text-sm font-light mt-3 leading-relaxed">
            Enter the staff password to review and remove photos from the screen.
          </p>
          <form onSubmit={submit} className="w-full mt-8 flex flex-col gap-3">
            <input
              type="password"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={entering}
              onChange={e => setEntering(e.target.value)}
              placeholder="Staff password"
              className="w-full bg-ink-light border border-cream/15 rounded-xl px-4 py-3.5 text-cream text-sans text-center tracking-wide placeholder:text-cream/25 focus:outline-none focus:border-cream/35 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !entering.trim()}
              className="w-full py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.98] disabled:opacity-40 transition-all touch-manipulation"
            >
              {loading ? 'Checking…' : 'Enter'}
            </button>
            {error && <p className="text-sans text-red-400/80 text-sm mt-1">{error}</p>}
          </form>
        </div>
      </div>
    )
  }

  // ── Moderation grid ───────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-ink safe-top safe-bottom">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/10 px-5 py-4">
        <p className="text-mono text-cream/30 text-[9px] tracking-[0.35em] uppercase">Staff · Photo moderation</p>
        <h1 className="text-serif text-cream text-lg font-normal mt-0.5">{eventName || 'Live photos'}</h1>
        <p className="text-sans text-cream/40 text-xs font-light mt-1">
          Tap any photo to remove it from the screen.
        </p>
      </div>

      {error && (
        <div className="mx-5 mt-4 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
          <p className="text-sans text-red-400/80 text-sm">{error}</p>
        </div>
      )}

      {photos.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center text-center px-8 py-24 gap-2">
          <p className="text-serif text-cream/50 text-xl italic">No photos on the screen yet.</p>
          <p className="text-sans text-cream/30 text-sm">New photos appear here as guests take them.</p>
        </div>
      )}

      {/* Grid */}
      <div className="px-3 py-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map(p => (
          <button
            key={p.id}
            onClick={() => { setOpen(p); setConfirm(false) }}
            className="relative aspect-square rounded-lg overflow-hidden bg-ink-light border border-cream/5 active:scale-[0.97] transition-transform touch-manipulation"
          >
            <img src={p.photoUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
            {p.annotationUrl && (
              <img src={p.annotationUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ mixBlendMode: 'multiply' }} />
            )}
            {p.memoryNumber != null && (
              <span className="absolute bottom-1 left-1 text-mono text-cream/70 text-[9px] bg-ink/60 rounded px-1">#{p.memoryNumber}</span>
            )}
          </button>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pb-10 pt-2">
          <button
            onClick={() => load(code, false)}
            disabled={loading}
            className="px-6 py-3 rounded-full border border-cream/20 text-cream/60 text-sans text-xs tracking-widest uppercase active:scale-95 disabled:opacity-40 transition-all touch-manipulation"
          >
            {loading ? 'Loading…' : 'Load older photos'}
          </button>
        </div>
      )}

      {/* Lightbox + remove. Three ways out: the X, tapping the dark area, or Close. */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex flex-col p-4 safe-top safe-bottom"
          onClick={() => { setOpen(null); setConfirm(false) }}
        >
          {/* Top bar with a clear close button */}
          <div className="flex justify-end shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(null); setConfirm(false) }}
              aria-label="Close"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-ink/70 border border-cream/25 text-cream active:scale-95 touch-manipulation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>

          {/* The photo itself ignores taps; the dark area around it closes. */}
          <div className="flex-1 flex items-center justify-center min-h-0 py-3 pointer-events-none">
            <div className="relative max-w-full max-h-full pointer-events-auto" onClick={e => e.stopPropagation()}>
              <img src={open.photoUrl} alt="" draggable={false} className="block max-w-full max-h-full object-contain" />
              {open.annotationUrl && (
                <img src={open.annotationUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{ mixBlendMode: 'multiply' }} />
              )}
            </div>
          </div>

          <div className="w-full max-w-sm mx-auto flex flex-col gap-3 shrink-0" onClick={e => e.stopPropagation()}>
            {!confirm ? (
              <button
                onClick={() => setConfirm(true)}
                className="w-full py-3.5 rounded-full bg-red-500/90 text-white text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.98] transition-all touch-manipulation"
              >
                Remove from screen
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => remove(open.id)}
                  disabled={removing === open.id}
                  className="flex-1 py-3.5 rounded-full bg-red-500 text-white text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.98] disabled:opacity-50 transition-all touch-manipulation"
                >
                  {removing === open.id ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  onClick={() => setConfirm(false)}
                  className="flex-1 py-3.5 rounded-full border border-cream/25 text-cream/70 text-sans text-sm tracking-widest uppercase active:scale-[0.98] transition-all touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              onClick={() => { setOpen(null); setConfirm(false) }}
              className="w-full py-2.5 rounded-full border border-cream/25 text-cream/70 text-sans text-xs tracking-widest uppercase touch-manipulation active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
