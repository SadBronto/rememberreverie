import { useState, useEffect } from 'react'
import type { CameraModeName } from '@/types/session'
import { CAMERA_MODES } from '@/config/modes'

interface Props {
  mode: CameraModeName
  phase: 'ready' | 'capturing' | 'processing' | 'uploading'
  /** Override the mode's default aspect (e.g. Disposable portrait) */
  aspectRatio?: number
}

interface CropBox { left: number; top: number; width: number; height: number }

// Shows the exact region that will be captured, darkening what falls outside.
// The video fills the viewport with object-cover; the capture center-crops to the
// mode's aspect ratio, so on a portrait phone landscape modes clip top/bottom.
export default function ViewfinderOverlay({ mode, phase, aspectRatio }: Props) {
  const config = CAMERA_MODES[mode]
  const dimmed  = phase !== 'ready'
  const ar      = aspectRatio ?? config.aspectRatio   // width / height

  const [crop, setCrop] = useState<CropBox | null>(null)

  useEffect(() => {
    function calcCrop() {
      const vw = window.innerWidth
      const vh = window.innerHeight
      let bw: number, bh: number

      if (vw / vh >= ar) {
        // Viewport wider than the mode's aspect: constrain by height
        bh = vh; bw = vh * ar
      } else {
        // Viewport taller (portrait phone + landscape mode): constrain by width
        bw = vw; bh = vw / ar
      }

      setCrop({
        left:   (vw - bw) / 2,
        top:    (vh - bh) / 2,
        width:  bw,
        height: bh,
      })
    }

    calcCrop()
    window.addEventListener('resize', calcCrop)
    window.addEventListener('orientationchange', calcCrop)
    return () => {
      window.removeEventListener('resize', calcCrop)
      window.removeEventListener('orientationchange', calcCrop)
    }
  }, [ar])

  if (!crop) return null

  const { left, top, width, height } = crop
  const sc = 'rgba(245,240,232,0.50)'  // corner stroke colour
  const cs = 18    // corner arm length (px)
  const sw = 1.5   // stroke width

  return (
    <div
      className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${dimmed ? 'opacity-30' : 'opacity-100'}`}
    >
      {/* ── Dark overlay outside the crop box ─────────────────────────────── */}
      {/* box-shadow trick: shadow spreads outward from the crop box edge      */}
      <div
        className="absolute"
        style={{
          left, top, width, height,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.44)',
        }}
      />

      {/* ── Corner brackets at crop boundary ──────────────────────────────── */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Top-left */}
        <polyline
          points={`${left + cs},${top + 5} ${left + 5},${top + 5} ${left + 5},${top + cs}`}
          fill="none" stroke={sc} strokeWidth={sw} strokeLinecap="round"
        />
        {/* Top-right */}
        <polyline
          points={`${left + width - cs},${top + 5} ${left + width - 5},${top + 5} ${left + width - 5},${top + cs}`}
          fill="none" stroke={sc} strokeWidth={sw} strokeLinecap="round"
        />
        {/* Bottom-left */}
        <polyline
          points={`${left + cs},${top + height - 5} ${left + 5},${top + height - 5} ${left + 5},${top + height - cs}`}
          fill="none" stroke={sc} strokeWidth={sw} strokeLinecap="round"
        />
        {/* Bottom-right */}
        <polyline
          points={`${left + width - cs},${top + height - 5} ${left + width - 5},${top + height - 5} ${left + width - 5},${top + height - cs}`}
          fill="none" stroke={sc} strokeWidth={sw} strokeLinecap="round"
        />
      </svg>

      {/* ── Polaroid: signing area indicator BELOW the crop box ─────────────
           The entire crop box is captured as the photo. The white signing border
           is added AFTER capture. We show it below to accurately represent the
           final output, not inside the photo area (which was misleading).     ── */}
      {mode === 'polaroid' && (() => {
        // Signing border height = borderBottom fraction of image height.
        // In viewfinder coordinates, the image height = crop box height.
        const sigH = Math.round(height * config.frame.borderBottom)
        const sigTop = top + height
        // Only render if the indicator fits on screen (portrait phones have room)
        if (sigTop + sigH > window.innerHeight) return null
        return (
          <div
            className="absolute flex flex-col items-center justify-center gap-1"
            style={{
              left,
              top:   sigTop,
              width,
              height: sigH,
              background: 'rgba(245,240,232,0.18)',
              borderTop:  '1.5px dashed rgba(245,240,232,0.55)',
            }}
          >
            <p className="text-mono text-cream/55 text-[9px] tracking-[0.22em] uppercase">
              signing area
            </p>
            <p className="text-mono text-cream/28 text-[8px] tracking-wide">
              added after capture
            </p>
          </div>
        )
      })()}
    </div>
  )
}
