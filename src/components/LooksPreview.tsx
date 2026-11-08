import { useEffect, useRef, useState } from 'react'
import { processSession } from '@/lib/imageProcessor'
import { CAMERA_MODES } from '@/config/modes'
import type { CameraModeName } from '@/types/session'

// One high-variety sample (landscape, already 3:2): saturated colors, bright sky,
// and dark shadows, so differences like Polaroid's faded blacks show up.
const SAMPLE = '/demo-media/photos/d15.jpg'

const LOOKS: { mode: CameraModeName; label: string }[] = [
  { mode: 'disposable', label: 'Disposable' },
  { mode: 'polaroid',   label: 'Polaroid' },
  { mode: 'super8',     label: 'Super 8' },
  { mode: 'noir',       label: 'Noir' },
  { mode: 'flash',      label: 'Flash' },
  { mode: 'champagne',  label: 'Champagne' },
]

// Shows ONE sample photo through each of the six real looks, so visitors see what the
// filters actually do. Uses the production processSession pipeline (filter only, framed
// uniformly to 3:2 so the tiles compare cleanly), so the preview can't drift from the
// product. Best-effort: a tile that fails to render just stays a soft skeleton.
export default function LooksPreview() {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const madeUrls = useRef<string[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const blob = await (await fetch(SAMPLE)).blob()
        await Promise.all(
          LOOKS.map(async ({ mode }) => {
            const base = CAMERA_MODES[mode]
            const cfg = {
              ...base,
              aspectRatio: 3 / 2,
              // Filter only: strip borders + timestamp so the six tiles are directly comparable.
              frame: {
                borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0,
                borderColor: '#000', showTimestamp: false, timestampPosition: 'bottom-right' as const,
              },
            }
            const out = await processSession(
              [{ blob, capturedAt: new Date(), index: 0 }],
              cfg,
              { timestampEnabled: false, timestampStyle: 'classic' },
              640,
            )
            if (!alive) return
            const url = URL.createObjectURL(out)
            madeUrls.current.push(url)
            setUrls((prev) => ({ ...prev, [mode]: url }))
          }),
        )
      } catch {
        /* preview is best-effort; tiles stay as skeletons */
      }
    })()
    return () => {
      alive = false
      madeUrls.current.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  return (
    <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-xl mx-auto">
      {LOOKS.map(({ mode, label }) => (
        <div key={mode} className="flex flex-col gap-1.5">
          <div className="relative aspect-[3/2] rounded-lg overflow-hidden bg-ink-light">
            {urls[mode] ? (
              <img
                src={urls[mode]}
                alt={`${label} look`}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 animate-pulse bg-cream/5" />
            )}
          </div>
          <span className="text-mono text-cream/50 text-[9px] tracking-[0.25em] uppercase text-center">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
