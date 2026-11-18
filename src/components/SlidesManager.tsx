import { useCallback, useEffect, useRef, useState } from 'react'

// Slide ids start with the upload time in ms, so the date added can be shown without storing anything new.
function addedOn(id: string): string {
  const ms = Number(id.split('-')[0])
  if (!Number.isFinite(ms) || ms < 1e12) return ''
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

interface SlideItem { id: string; path: string; url: string | null }

// Manage the promo / logo slides shown in the Reverie Live slideshow between photos.
// Shared by the host Settings page and the admin event page; both call the same
// host-authed /api/host/slides endpoint (admins are allowed on any event).
export default function SlidesManager({
  weddingId,
  getToken,
}: {
  weddingId: string
  getToken: () => string | null
}) {
  const [slides, setSlides] = useState<SlideItem[]>([])
  const [every, setEvery] = useState(7)
  const [seconds, setSeconds] = useState(12)
  const [order, setOrder] = useState<'rotate' | 'together' | 'random'>('rotate')
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)   // index of the slide open in the large viewer
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const authHeader = useCallback(() => ({ Authorization: `Bearer ${getToken() ?? ''}` }), [getToken])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/host/slides?weddingId=${weddingId}`, { headers: authHeader() })
      if (res.ok) {
        const d = await res.json()
        setSlides(d.slides ?? [])
        setEvery(d.every ?? 7)
        setSeconds(d.seconds ?? 12)
        setOrder(d.order ?? 'rotate')
      }
    } catch { /* leave as-is */ }
  }, [weddingId, authHeader])

  useEffect(() => { void load() }, [load])

  // Large viewer: Esc closes, arrow keys move between slides.
  useEffect(() => {
    if (viewing === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewing(null)
      else if (e.key === 'ArrowRight') setViewing(v => (v === null ? v : Math.min(slides.length - 1, v + 1)))
      else if (e.key === 'ArrowLeft') setViewing(v => (v === null ? v : Math.max(0, v - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, slides.length])

  async function addSlide(file: File) {
    if (!file.type.startsWith('image/')) { setError('Pick an image file (JPG, PNG, or WebP).'); return }
    setBusy(true); setError(null)
    try {
      const r1 = await fetch(`/api/host/slides?weddingId=${weddingId}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'upload-url', contentType: file.type }),
      })
      if (!r1.ok) { setError((await r1.text()) || 'Could not start the upload.'); return }
      const { slideId, path, uploadUrl } = await r1.json()

      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!put.ok) { setError('The image failed to upload. Try again.'); return }

      const next = [...slides.map(s => ({ id: s.id, path: s.path })), { id: slideId, path }]
      const r2 = await fetch(`/api/host/slides?weddingId=${weddingId}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'save', slides: next }),
      })
      if (!r2.ok) { setError('The slide uploaded but could not be saved.'); return }
      await load()
    } catch {
      setError('Something went wrong. Check the connection and try again.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveSettings(e: number, s: number, o: string = order) {
    try {
      await fetch(`/api/host/slides?weddingId=${weddingId}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'settings', every: e, seconds: s, order: o }),
      })
    } catch { /* non-blocking */ }
  }

  async function removeSlide(id: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/host/slides?weddingId=${weddingId}&slideId=${id}`, {
        method: 'DELETE', headers: authHeader(),
      })
      if (res.ok) await load()
      else setError('Could not remove that slide.')
    } catch {
      setError('Something went wrong removing the slide.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {slides.map((s, i) => (
          <div key={s.id} className="relative aspect-video rounded-lg overflow-hidden bg-ink-light border border-cream/10">
            {s.url && (
              <button type="button" onClick={() => setViewing(i)} aria-label="View slide larger" className="absolute inset-0 w-full h-full cursor-zoom-in">
                <img src={s.url} alt="" className="absolute inset-0 w-full h-full object-contain" />
              </button>
            )}
            {addedOn(s.id) && (
              <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-ink/75 text-cream/60 text-mono text-[8px] pointer-events-none">{addedOn(s.id)}</span>
            )}
            <button
              type="button"
              onClick={() => removeSlide(s.id)}
              disabled={busy}
              aria-label="Remove slide"
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ink/80 border border-cream/20 text-cream flex items-center justify-center active:scale-95 disabled:opacity-40 touch-manipulation"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="aspect-video rounded-lg border border-dashed border-cream/25 text-cream/50 flex flex-col items-center justify-center gap-1 active:scale-[0.98] disabled:opacity-40 touch-manipulation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          <span className="text-mono text-[9px] tracking-widest uppercase">{busy ? 'Working…' : 'Add image'}</span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void addSlide(f) }}
      />

      <div className="flex flex-wrap gap-x-5 gap-y-2 items-center text-sans text-cream/60 text-xs pt-1">
        <label className="flex items-center gap-2">
          Show a slide every
          <input
            type="number" min={1} max={50} value={every}
            onChange={e => setEvery(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            onBlur={() => saveSettings(every, seconds)}
            className="w-14 bg-ink-light border border-cream/15 rounded-lg px-2 py-1 text-cream text-center focus:outline-none focus:border-cream/35"
          />
          photos
        </label>
        <label className="flex items-center gap-2">
          Each shows for
          <input
            type="number" min={3} max={60} value={seconds}
            onChange={e => setSeconds(Math.max(3, Math.min(60, Number(e.target.value) || 3)))}
            onBlur={() => saveSettings(every, seconds)}
            className="w-14 bg-ink-light border border-cream/15 rounded-lg px-2 py-1 text-cream text-center focus:outline-none focus:border-cream/35"
          />
          seconds
        </label>
      </div>

      {slides.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sans text-cream/60 text-xs">
          When it is time for a slide
          <select
            value={order}
            onChange={e => { const v = e.target.value as 'rotate' | 'together' | 'random'; setOrder(v); void saveSettings(every, seconds, v) }}
            className="bg-ink-light border border-cream/15 rounded-lg px-2 py-1 text-cream focus:outline-none focus:border-cream/35"
          >
            <option value="rotate">Show one, then the next one next time (A, B, C...)</option>
            <option value="together">Show all of them back to back</option>
            <option value="random">Show one at random (all shown before any repeat)</option>
          </select>
        </label>
      )}

      {viewing !== null && slides[viewing]?.url && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4" onClick={() => setViewing(null)}>
          <img src={slides[viewing].url!} alt="" className="max-w-full max-h-[80vh] object-contain" onClick={e => e.stopPropagation()} />
          <p className="text-mono text-cream/50 text-xs mt-4" onClick={e => e.stopPropagation()}>
            {viewing + 1} of {slides.length}{addedOn(slides[viewing].id) ? ` · added ${addedOn(slides[viewing].id)}` : ''}
          </p>
          <div className="flex items-center gap-6 mt-3" onClick={e => e.stopPropagation()}>
            <button type="button" disabled={viewing === 0} onClick={() => setViewing(viewing - 1)}
              className="px-4 py-2 rounded-full border border-cream/25 text-cream/70 text-sans text-xs tracking-widest uppercase disabled:opacity-25">Prev</button>
            <button type="button" onClick={() => setViewing(null)}
              className="px-4 py-2 rounded-full bg-cream text-ink text-sans text-xs tracking-widest uppercase">Close</button>
            <button type="button" disabled={viewing === slides.length - 1} onClick={() => setViewing(viewing + 1)}
              className="px-4 py-2 rounded-full border border-cream/25 text-cream/70 text-sans text-xs tracking-widest uppercase disabled:opacity-25">Next</button>
          </div>
        </div>
      )}

      {error && <p className="text-sans text-red-400/80 text-xs">{error}</p>}
      <p className="text-mono text-cream/25 text-[10px] leading-relaxed">
        Shown full-screen between photos on the live slideshow (a venue logo, an upcoming-event
        promo, etc.). Use a wide/landscape image for the best fit. Reverie Live only.
      </p>
    </div>
  )
}
