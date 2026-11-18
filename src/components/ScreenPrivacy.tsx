import { useCallback, useEffect, useState } from 'react'

interface Display { display_id: string; approved_at: string }

// Private-slideshow control for the owner: see which screens are approved, lock one
// or all of them. Renders nothing unless the event has the private slideshow turned on.
export default function ScreenPrivacy({ weddingId, getToken, label }: { weddingId: string; getToken: () => string | null; label?: string }) {
  const [priv, setPriv] = useState(false)
  const [displays, setDisplays] = useState<Display[]>([])
  const [busy, setBusy] = useState(false)
  const headers = useCallback(() => ({ Authorization: `Bearer ${getToken() ?? ''}`, 'Content-Type': 'application/json' }), [getToken])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/host/display?weddingId=${weddingId}`, { headers: headers() })
      if (res.ok) { const d = await res.json(); setPriv(!!d.private); setDisplays(d.displays ?? []) }
    } catch { /* leave as-is */ }
  }, [weddingId, headers])
  useEffect(() => { void load() }, [load])

  async function lock(body: Record<string, string>) {
    setBusy(true)
    try {
      await fetch(`/api/host/display?weddingId=${weddingId}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      await load()
    } finally { setBusy(false) }
  }

  if (!priv) return null
  return (
    <div className="flex flex-col gap-3">
      {label && <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase">{label}</p>}
      <p className="text-sans text-cream/50 text-xs leading-relaxed">
        Your slideshow is private. A screen only plays after you scan its QR code and sign in. Lock a screen to
        make it ask again.
      </p>
      {displays.length === 0 && <p className="text-mono text-cream/30 text-[11px]">No screens are approved right now.</p>}
      {displays.map(d => (
        <div key={d.display_id} className="flex items-center justify-between bg-ink-light border border-cream/10 rounded-xl px-4 py-3">
          <div>
            <p className="text-sans text-cream/70 text-sm">Screen {d.display_id.slice(0, 4)}</p>
            <p className="text-mono text-cream/30 text-[10px]">Approved {new Date(d.approved_at).toLocaleString()}</p>
          </div>
          <button
            onClick={() => lock({ op: 'lock', displayId: d.display_id })} disabled={busy}
            className="px-3 py-1.5 rounded-full border border-cream/20 text-cream/70 text-sans text-[11px] tracking-widest uppercase disabled:opacity-40"
          >
            Lock
          </button>
        </div>
      ))}
      {displays.length > 1 && (
        <button
          onClick={() => lock({ op: 'lock-all' })} disabled={busy}
          className="self-start text-cream/40 text-sans text-xs tracking-widest uppercase disabled:opacity-40"
        >
          Lock all screens
        </button>
      )}
    </div>
  )
}
