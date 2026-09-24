import { useCallback, useRef, useState } from 'react'
import { CAMERA_MODES, type CameraModeConfig, type FilterConfig } from '@/config/modes'
import { processSession } from '@/lib/imageProcessor'
import type { SourceImage } from '@/types/session'

// Internal tool (unlinked): upload photos and compare every filter — the current
// three plus candidate new looks — side by side, so we can judge distinctiveness
// and dial in the Polaroid frame. Not part of the product; just /filterdemos.

const flatFrame = {
  borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0,
  borderColor: '#ffffff', showTimestamp: false, timestampPosition: 'bottom-right' as const,
}

// Build a flat-frame landscape config for a candidate look. `name` is unused by
// the processor (it only reads aspectRatio/filter/frame), so a placeholder is fine.
function mk(label: string, filter: FilterConfig): CameraModeConfig {
  return { name: 'disposable', label, captureCount: 1, aspectRatio: 3 / 2, orientation: 'landscape', filter, frame: flatFrame }
}

interface Candidate { key: string; label: string; note: string; config: CameraModeConfig }

const POLAROID_WINDOW = { left: 0.0714, top: 0.0474, right: 0.0714, bottom: 0.1632 }

const CANDIDATES: Candidate[] = [
  // ── Current production looks (for reference) ──
  { key: 'disposable', label: 'Disposable', note: 'current', config: CAMERA_MODES.disposable },
  { key: 'super8',     label: 'Super 8',    note: 'current', config: CAMERA_MODES.super8 },
  { key: 'polaroid',   label: 'Polaroid',   note: 'current frame', config: CAMERA_MODES.polaroid },
  { key: 'polaroid2',  label: 'Polaroid',   note: 'new frame', config: { ...CAMERA_MODES.polaroid, frame: { ...CAMERA_MODES.polaroid.frame, frameSrc: '/frames/polaroid.svg', window: POLAROID_WINDOW } } },

  // ── Black & white ──
  { key: 'bw',    label: 'Black & White', note: 'b&w', config: mk('Black & White', { warmth: 0, grain: 0.06, vignette: 0.15, brightness: 1.0, contrast: 1.06, saturation: 0, liftedBlacks: 0.04, softness: 0.1 }) },
  { key: 'noir',  label: 'Noir', note: 'b&w', config: mk('Noir', { warmth: 0, grain: 0.14, vignette: 0.45, brightness: 0.98, contrast: 1.28, saturation: 0, liftedBlacks: 0.0, softness: 0.1 }) },

  // ── Warm / vintage ──
  { key: 'sepia',       label: 'Sepia', note: 'vintage', config: mk('Sepia', { warmth: 0, grain: 0.1, vignette: 0.35, brightness: 1.03, contrast: 0.96, saturation: 0, liftedBlacks: 0.12, softness: 0.2, tint: { r: 150, g: 120, b: 82, strength: 0.45 } }) },
  { key: 'warmfilm',    label: 'Warm Film', note: 'warm', config: mk('Warm Film', { warmth: 0.16, grain: 0.12, vignette: 0.2, brightness: 1.02, contrast: 0.98, saturation: 0.95, liftedBlacks: 0.08, softness: 0.25 }) },
  { key: 'golden',      label: 'Golden Hour', note: 'warm', config: mk('Golden Hour', { warmth: 0.26, grain: 0.08, vignette: 0.25, brightness: 1.06, contrast: 0.95, saturation: 1.0, liftedBlacks: 0.12, softness: 0.4, tint: { r: 255, g: 190, b: 120, strength: 0.08 } }) },
  { key: 'champagne',   label: 'Champagne', note: 'warm', config: mk('Champagne', { warmth: 0.14, grain: 0.06, vignette: 0.12, brightness: 1.1, contrast: 0.9, saturation: 0.9, liftedBlacks: 0.14, softness: 0.3, tint: { r: 255, g: 232, b: 205, strength: 0.1 } }) },
  { key: 'fadedvintage', label: 'Faded Vintage', note: 'vintage', config: mk('Faded Vintage', { warmth: 0.1, grain: 0.1, vignette: 0.28, brightness: 1.03, contrast: 0.9, saturation: 0.72, liftedBlacks: 0.2, softness: 0.3 }) },

  // ── Modern / clean ──
  { key: 'softmatte',   label: 'Soft Matte', note: 'modern', config: mk('Soft Matte', { warmth: 0.03, grain: 0.05, vignette: 0.15, brightness: 1.02, contrast: 0.9, saturation: 0.9, liftedBlacks: 0.16, softness: 0.2 }) },
  { key: 'classicfilm', label: 'Classic Film', note: 'modern', config: mk('Classic Film', { warmth: 0.06, grain: 0.08, vignette: 0.2, brightness: 1.02, contrast: 0.95, saturation: 0.95, liftedBlacks: 0.06, softness: 0.2 }) },
  { key: 'editorial',   label: 'Editorial', note: 'cool', config: mk('Editorial', { warmth: 0, grain: 0.03, vignette: 0.1, brightness: 1.02, contrast: 1.1, saturation: 0.8, liftedBlacks: 0.02, softness: 0.05, tint: { r: 205, g: 216, b: 230, strength: 0.06 } }) },
  { key: 'flash',       label: 'Flash', note: 'candid', config: mk('Flash', { warmth: 0.02, grain: 0.1, vignette: 0.05, brightness: 1.1, contrast: 1.12, saturation: 0.98, liftedBlacks: 0.02, softness: 0.05 }) },
  { key: 'dustgrain',   label: 'Dust & Grain', note: 'texture', config: mk('Dust & Grain', { warmth: 0.08, grain: 0.26, vignette: 0.3, brightness: 1.0, contrast: 1.0, saturation: 0.85, liftedBlacks: 0.12, softness: 0.15 }) },

  // ── Wild ──
  { key: 'selective', label: 'Selective Color', note: 'wild', config: mk('Selective Color', { warmth: 0, grain: 0.08, vignette: 0.22, brightness: 1.0, contrast: 1.08, saturation: 1.12, liftedBlacks: 0.03, softness: 0.1, selectiveColor: { hue: 18, range: 40 } }) },
  { key: 'duotone',   label: 'Duotone — Indigo & Blush', note: 'wild', config: mk('Duotone — Indigo & Blush', { warmth: 0, grain: 0.06, vignette: 0.26, brightness: 1.0, contrast: 1.05, saturation: 1.0, liftedBlacks: 0.0, softness: 0.1, duotone: { shadow: { r: 28, g: 30, b: 58 }, highlight: { r: 246, g: 224, b: 206 } } }) },
]

const SAMPLES = [
  { label: 'Sample — landscape', path: '/demo-media/photos/d01.jpg' },
  { label: 'Sample — portrait',  path: '/demo-media/photos/p01.jpg' },
]

interface Tile { key: string; label: string; note: string; url: string }
interface Result { id: string; name: string; originalUrl: string; tiles: Tile[] }

type Bg = 'dark' | 'gray' | 'light'
const BG_CLASS: Record<Bg, string> = {
  dark:  'bg-[#141210]',
  gray:  'bg-[#8a8580]',
  light: 'bg-[#f3efe8]',
}

export default function FilterDemoPage() {
  const [results, setResults] = useState<Result[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bg, setBg] = useState<Bg>('gray')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const idRef = useRef(0)

  const runOne = useCallback(async (blob: Blob, name: string) => {
    const src: SourceImage = { blob, capturedAt: new Date(), index: 0 }
    const tiles: Tile[] = []
    for (const c of CANDIDATES) {
      const out = await processSession([src], c.config, { timestampEnabled: false, timestampStyle: 'classic' }, 1000)
      tiles.push({ key: c.key, label: c.label, note: c.note, url: URL.createObjectURL(out) })
    }
    const result: Result = { id: `r${idRef.current++}`, name, originalUrl: URL.createObjectURL(blob), tiles }
    setResults(prev => [result, ...prev])
  }, [])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true); setError(null)
    try {
      for (const file of Array.from(files)) await runOne(file, file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Processing failed')
    } finally {
      setBusy(false)
    }
  }, [runOne])

  const loadSample = useCallback(async (path: string, label: string) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(path, { cache: 'reload' })
      if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`)
      await runOne(await res.blob(), label)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sample failed to load')
    } finally {
      setBusy(false)
    }
  }, [runOne])

  return (
    <div className="min-h-dvh bg-ink text-cream px-6 py-10">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-8">
          <p className="text-mono text-cream/30 text-[10px] tracking-[0.3em] uppercase">Internal tool</p>
          <h1 className="text-serif text-cream text-3xl font-normal mt-1">Filter comparison</h1>
          <p className="text-sans text-cream/50 text-sm mt-2 max-w-2xl leading-relaxed">
            Upload one or more photos (or load a sample) to run every look side by side — the current three,
            the improved Polaroid frame, and four new candidates. Nothing is uploaded to a server; all
            processing runs in your browser with the real filter pipeline.
          </p>
        </header>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <label className="px-5 py-3 rounded-full bg-cream text-ink text-sans text-xs font-medium tracking-widest uppercase cursor-pointer active:scale-[0.97] transition-transform">
            Upload photos
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
          </label>
          {SAMPLES.map(s => (
            <button key={s.path} onClick={() => loadSample(s.path, s.label)}
              className="px-4 py-3 rounded-full border border-cream/20 text-cream/70 text-sans text-xs tracking-widest uppercase active:scale-[0.97] transition-transform">
              {s.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-mono text-cream/30 text-[10px] tracking-wide uppercase">Backdrop</span>
            {(['dark', 'gray', 'light'] as Bg[]).map(b => (
              <button key={b} onClick={() => setBg(b)}
                className={`px-3 py-1.5 rounded-full text-sans text-[11px] capitalize transition-colors ${bg === b ? 'bg-cream text-ink' : 'border border-cream/15 text-cream/50'}`}>
                {b}
              </button>
            ))}
          </div>

          {results.length > 0 && (
            <button onClick={() => setResults([])}
              className="px-4 py-3 rounded-full border border-cream/15 text-cream/40 text-sans text-xs tracking-widest uppercase">
              Clear
            </button>
          )}
        </div>

        {busy && <p className="text-sans text-amber-film/70 text-sm mb-6">Processing…</p>}
        {error && <p className="text-sans text-red-400/80 text-sm mb-6">{error}</p>}
        {results.length === 0 && !busy && (
          <p className="text-sans text-cream/30 text-sm">No photos yet — upload some or load a sample above.</p>
        )}

        {/* Results */}
        <div className="flex flex-col gap-12">
          {results.map(result => (
            <section key={result.id}>
              <div className="flex items-center gap-4 mb-4">
                <img src={result.originalUrl} alt="original" className="w-24 h-24 object-cover rounded-lg border border-cream/10" />
                <div>
                  <p className="text-sans text-cream/80 text-sm">{result.name}</p>
                  <p className="text-mono text-cream/30 text-[10px] tracking-wide uppercase mt-0.5">Original</p>
                </div>
              </div>

              <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 p-6 rounded-2xl ${BG_CLASS[bg]}`}>
                {result.tiles.map(tile => {
                  const isPolaroid = tile.key.startsWith('polaroid')
                  const isNew = tile.note !== 'current'
                  return (
                    <button key={tile.key} type="button" onClick={() => setLightbox(tile.url)} className="block text-left w-full">
                      <div className="flex items-center justify-center">
                        <img
                          src={tile.url}
                          alt={tile.label}
                          className="max-w-full h-auto rounded-[2px]"
                          style={isPolaroid ? { boxShadow: '0 6px 18px rgba(0,0,0,0.35)' } : undefined}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`text-sans text-xs ${bg === 'light' ? 'text-ink/80' : 'text-cream/80'}`}>{tile.label}</span>
                        <span className={`text-mono text-[9px] tracking-wide uppercase px-1.5 py-0.5 rounded ${isNew ? 'bg-amber-film/20 text-amber-film' : (bg === 'light' ? 'text-ink/40' : 'text-cream/30')}`}>
                          {tile.note}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="enlarged" className="max-w-full max-h-full object-contain shadow-2xl" />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-6 text-cream/70 text-4xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
