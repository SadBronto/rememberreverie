import { useCallback, useEffect, useRef, useState } from 'react'

// Upload / replace / remove the event's logo watermark. The image is shrunk in the
// browser (max 600px wide, transparency kept) so it stays small on guests' phones.
// Where the watermark is applied (new photos / the TV) is an admin setting.
export default function WatermarkManager({ weddingId, getToken, label }: { weddingId: string; getToken: () => string | null; label?: string }) {
  // With a `label` (client Settings) the whole block, heading included, only appears
  // when the admin has switched the watermark on for this event.
  const [enabled, setEnabled] = useState(!label)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const headers = useCallback(() => ({ Authorization: `Bearer ${getToken() ?? ''}`, 'Content-Type': 'application/json' }), [getToken])
  const endpoint = `/api/host/slides?weddingId=${weddingId}`

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { headers: headers() })
      if (res.ok) { const d = await res.json(); setUrl(d.watermark?.url ?? null); if (label) setEnabled(!!d.watermarkEnabled) }
    } catch { /* leave */ }
  }, [endpoint, headers, label])
  useEffect(() => { void load() }, [load])

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

  if (!enabled) return null
  return (
    <div className="flex flex-col gap-3">
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
      <p className="text-mono text-cream/25 text-[10px] leading-relaxed">A transparent PNG works best. Shown small in the bottom-left corner.</p>
    </div>
  )
}
