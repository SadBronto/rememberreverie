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

const CANDIDATES: Candidate[] = [
  { key: 'disposable', label: 'Disposable',  note: 'current', config: CAMERA_MODES.disposable },
  { key: 'polaroid',   label: 'Polaroid',    note: 'current frame', config: CAMERA_MODES.polaroid },
  { key: 'polaroid2',  label: 'Polaroid',    note: 'real frame (SVG)', config: { ...CAMERA_MODES.polaroid, frame: { ...CAMERA_MODES.polaroid.frame, frameSrc: '/frames/polaroid.svg', window: { left: 0.0714, top: 0.0474, right: 0.0714, bottom: 0.1632 } } } },
  { key: 'super8',     label: 'Super 8',     note: 'current', config: CAMERA_MODES.super8 },
  { key: 'noir',       label: 'Noir B&W',    note: 'new candidate', config: mk('Noir B&W', { warmth: 0, grain: 0.16, vignette: 0.42, brightness: 1.0, contrast: 1.2, saturation: 0, liftedBlacks: 0.02, softness: 0.1 }) },
  { key: 'sepia',      label: 'Antique Sepia', note: 'new candidate', config: mk('Antique Sepia', { warmth: 0, grain: 0.12, vignette: 0.4, brightness: 1.03, contrast: 0.95, saturation: 0, liftedBlacks: 0.14, softness: 0.2, tint: { r: 150, g: 120, b: 82, strength: 0.42 } }) },
  { key: 'faded',      label: 'Faded Color', note: 'new candidate', config: mk('Faded Color', { warmth: 0.12, grain: 0.08, vignette: 0.22, brightness: 1.03, contrast: 0.96, saturation: 0.92, liftedBlacks: 0.16, softness: 0.2 }) },
  { key: 'nineties',   label: "'90s Point-and-Shoot", note: 'new candidate', config: mk("'90s Point-and-Shoot", { warmth: 0, grain: 0.13, vignette: 0.14, brightness: 1.05, contrast: 1.08, saturation: 1.06, liftedBlacks: 0.04, softness: 0.08, tint: { r: 150, g: 170, b: 200, strength: 0.05 } }) },
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
                  const isNew = tile.note.includes('new') || tile.note.includes('improved')
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
