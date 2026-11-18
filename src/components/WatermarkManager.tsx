import { useCallback, useEffect, useRef, useState } from 'react'

type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

const POSITIONS: { id: Position; label: string }[] = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' },
  { id: 'center', label: 'Large, centered' },
]

// Logo watermark controls, used by the client Settings page and the admin event page:
// upload / replace / remove the logo (shrunk in the browser, transparency kept), where it
// sits, how strong it is, and whether it goes on guest photos, the TV slideshow, both
// or neither. Every change saves immediately.
export default function WatermarkManager({ weddingId, getToken, label }: { weddingId: string; getToken: () => string | null; label?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [photos, setPhotos] = useState(false)
  const [slideshow, setSlideshow] = useState(false)
  const [position, setPosition] = useState<Position>('bottom-left')
  const [opacity, setOpacity] = useState(85)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const headers = useCallback(() => ({ Authorization: `Bearer ${getToken() ?? ''}`, 'Content-Type': 'application/json' }), [getToken])
  const endpoint = `/api/host/slides?weddingId=${weddingId}`

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { headers: headers() })
      if (res.ok) {
        const w = (await res.json()).watermark
        if (w) {
          setUrl(w.url ?? null); setPhotos(!!w.photos); setSlideshow(!!w.slideshow)
          setPosition((w.position ?? 'bottom-left') as Position); setOpacity(w.opacity ?? 85)
        }
      }
    } catch { /* leave */ }
  }, [endpoint, headers])
  useEffect(() => { void load() }, [load])

  async function saveSettings(patch: Record<string, unknown>) {
    try {
      await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify({ op: 'watermark-settings', ...patch }) })
    } catch { /* non-blocking */ }
  }

  async function shrink(file: File): Promise<Blob> {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 600 / bmp.width)
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('resize failed')), 'image/png'))
  }

  async function upload(file: File) {
    setBusy(true); setError(null)
    try {
      const png = await shrink(file)
      const r1 = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify({ op: 'watermark-upload-url', contentType: 'image/png' }) })
      if (!r1.ok) { setError((await r1.text()) || 'Could not start the upload.'); return }
      const { path, uploadUrl } = await r1.json()
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png })
      if (!put.ok) { setError('The logo failed to upload. Try again.'); return }
      const r2 = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify({ op: 'watermark-save', path }) })
      if (!r2.ok) { setError('The logo uploaded but could not be saved.'); return }
      await load()
    } catch { setError('Use a PNG or WebP image (a transparent PNG works best).') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function remove() {
    setBusy(true); setError(null)
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify({ op: 'watermark-remove' }) })
      if (r.ok) setUrl(null); else setError('Could not remove the logo.')
    } finally { setBusy(false) }
  }

  const Check = ({ on, onChange, text }: { on: boolean; onChange: (v: boolean) => void; text: string }) => (
    <label className="flex items-center gap-3 text-sans text-cream/65 text-sm">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-amber-500" />
      {text}
    </label>
  )

  return (
    <div className="flex flex-col gap-4">
      {label && <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase">{label}</p>}

      <div className="flex items-center gap-4">
        <div className="w-32 h-20 rounded-lg border border-cream/10 flex items-center justify-center"
             style={{ background: 'repeating-conic-gradient(#2a2a2a 0% 25%, #3a3a3a 0% 50%) 50% / 16px 16px' }}>
          {url ? <img src={url} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-mono text-cream/30 text-[10px]">No logo</span>}
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="px-4 py-2 rounded-full border border-cream/20 text-cream/70 text-sans text-xs tracking-widest uppercase disabled:opacity-40">
            {busy ? 'Working...' : url ? 'Replace logo' : 'Upload logo'}
          </button>
          {url && <button type="button" onClick={remove} disabled={busy} className="text-cream/35 text-sans text-xs tracking-widest uppercase text-left disabled:opacity-40">Remove</button>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
      {error && <p className="text-sans text-red-400/80 text-xs">{error}</p>}
      <p className="text-mono text-cream/25 text-[10px] leading-relaxed">A plain white logo on a transparent background works best.</p>

      {/* Live preview on a sample photo (same size and placement rules as the real thing) */}
      <div className="flex flex-col gap-1.5">
        <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-cream/10 bg-ink-light" style={{ aspectRatio: '3 / 2' }}>
          <img src="/gallery/pexels-jonathan-nenemann-13434437.jpg" alt="Sample photo" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          {url ? (
            <img
              src={url} alt="" draggable={false}
              className="absolute object-contain pointer-events-none"
              style={position === 'center'
                ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '50%', maxHeight: '60%', opacity: opacity / 100 }
                : {
                    width: '16%', maxHeight: '18%', opacity: opacity / 100,
                    [position.startsWith('top') ? 'top' : 'bottom']: '4.5%',
                    [position.endsWith('right') ? 'right' : 'left']: '3%',
                  }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-sans text-cream/70 text-xs">Upload a logo to see it here</span>
            </div>
          )}
        </div>
        <p className="text-mono text-cream/25 text-[10px]">Preview on a sample photo. Position and transparency update as you change them.</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sans text-cream/45 text-xs">Show it on</p>
        <Check on={photos} onChange={v => { setPhotos(v); void saveSettings({ photos: v }) }} text="Guest photos (new photos only)" />
        <Check on={slideshow} onChange={v => { setSlideshow(v); void saveSettings({ slideshow: v }) }} text="The slideshow screen" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sans text-cream/45 text-xs">Where</p>
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map(p => (
            <button key={p.id} type="button"
              onClick={() => { setPosition(p.id); void saveSettings({ position: p.id }) }}
              className={`px-3 py-1.5 rounded-full border text-sans text-xs transition-colors ${position === p.id ? 'border-cream/60 text-cream bg-cream/10' : 'border-cream/15 text-cream/45'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-2 text-sans text-cream/45 text-xs">
        <span>Transparency: logo is {opacity}% visible</span>
        <input type="range" min={10} max={100} step={5} value={opacity}
          onChange={e => setOpacity(Number(e.target.value))}
          onPointerUp={() => void saveSettings({ opacity })}
          onKeyUp={() => void saveSettings({ opacity })}
          className="w-full accent-amber-500" />
      </label>
    </div>
  )
}
