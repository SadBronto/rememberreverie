import { useEffect, useState } from 'react'
import { processSession } from '@/lib/imageProcessor'
import { CAMERA_MODES } from '@/config/modes'
import type { CameraModeName } from '@/types/session'

// ── Module-level cache (survives the lifetime of the app) ─────────────────────
const previewCache = new Map<string, string>()

// Single shared fetch so the source image is downloaded only once
let sourceBlobPromise: Promise<Blob> | null = null

function getSourceBlob(): Promise<Blob> {
  if (!sourceBlobPromise) {
    sourceBlobPromise = fetch('/gallery/pexels-breno-cardoso-149064345-18322549.jpg').then(r => {
      if (!r.ok) throw new Error('sample image fetch failed')
      return r.blob()
    })
  }
  return sourceBlobPromise
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mode: CameraModeName
  timestampEnabled?: boolean
  timestampStyle?: 'classic' | 'vertical' | 'elegant'
  /**
   * How the source image is cropped when compositing. 'left' anchors to the
   * left/top edge; 'center' (default) splits the crop evenly.
   * Also controls CSS objectPosition for the 'cover' fit mode.
   */
  sourceAlign?: 'left' | 'center'
  /**
   * 'cover' (default): image fills a fixed-size parent container (use inside a
   * div with explicit width + height + overflow:hidden).
   * 'natural': image renders at its own aspect ratio; parent just needs to wrap it.
   */
  fit?: 'cover' | 'natural'
  /** Maximum CSS height for 'natural' fit. Default '50vh'. */
  maxHeight?: string
  /** Names shown by the 'elegant' timestamp. Falls back to a sample when empty. */
  coupleNames?: string
}

// ── Aspect ratios of the processed output (after frame borders are added) ─────
// Used for loading placeholders so layout doesn't shift when image arrives.
const OUTPUT_ASPECT: Record<CameraModeName, string> = {
  disposable: '3 / 2',     // landscape 35mm, no borders
  polaroid:   '444 / 534', // 1:1 image + top/side 5.5% + bottom 28% borders
  super8:     '4 / 3',     // landscape, no borders
}

// ── Component ─────────────────────────────────────────────────────────────────
/**
 * Renders a sample wedding photo through the given filter + frame pipeline.
 *
 * In 'cover' mode: fills whatever fixed-size parent you give it (use overflow:hidden).
 * In 'natural' mode: renders at the image's own aspect ratio, constrained by maxHeight.
 *
 * Results are cached globally — repeated renders are instant after the first.
 */
export default function StylePreviewThumb({
  mode,
  timestampEnabled = false,
  timestampStyle   = 'classic',
  sourceAlign      = 'center',
  fit              = 'cover',
  maxHeight        = '50vh',
  coupleNames,
}: Props) {
  // Only the 'elegant' timestamp renders names; fall back to a sample when empty.
  const names = (coupleNames ?? '').trim() || 'Sophia & James'
  const nameKey = timestampEnabled && timestampStyle === 'elegant' ? names : ''
  const cacheKey = `${mode}-${timestampEnabled ? 't' : 'f'}-${timestampStyle}-${sourceAlign}-${nameKey}`

  const [dataUrl, setDataUrl] = useState<string | null>(() => previewCache.get(cacheKey) ?? null)
  const [failed,  setFailed]  = useState(false)

  useEffect(() => {
    if (previewCache.has(cacheKey)) {
      setDataUrl(previewCache.get(cacheKey)!)
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const blob = await getSourceBlob()
        const out  = await processSession(
          [{ blob, capturedAt: new Date('2026-05-21T12:00:00'), index: 0 }],
          CAMERA_MODES[mode],
          { timestampEnabled, timestampStyle, coupleNames: names, sourceAlign },
          400,
        )
        const url = await blobToDataUrl(out)
        if (cancelled) return
        previewCache.set(cacheKey, url)
        setDataUrl(url)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => { cancelled = true }
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loaded ────────────────────────────────────────────────────────────────
  if (dataUrl) {
    if (fit === 'natural') {
      return (
        <img
          src={dataUrl}
          alt=""
          draggable={false}
          style={{
            display:      'block',
            width:        'auto',
            height:       'auto',
            maxWidth:     '100%',
            maxHeight,
            borderRadius: 12,
            margin:       '0 auto',
          }}
        />
      )
    }
    // cover: fills the parent container
    return (
      <img
        src={dataUrl}
        alt=""
        draggable={false}
        style={{
          width:          '100%',
          height:         '100%',
          objectFit:      'cover',
          objectPosition: sourceAlign === 'left' ? 'left center' : 'center',
          display:        'block',
        }}
      />
    )
  }

  // ── Loading / error placeholder ───────────────────────────────────────────
  const ar = OUTPUT_ASPECT[mode]

  if (fit === 'natural') {
    return (
      <div
        style={{
          aspectRatio:   ar,
          width:         '100%',
          maxHeight,
          background:    '#2a2420',
          borderRadius:  12,
          margin:        '0 auto',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'center',
        }}
      >
        {!failed && (
          <div className="w-4 h-4 rounded-full border border-cream/20 border-t-cream/40 animate-spin" />
        )}
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-ink-light flex items-center justify-center">
      {!failed && (
        <div className="w-4 h-4 rounded-full border border-cream/20 border-t-cream/40 animate-spin" />
      )}
    </div>
  )
}
