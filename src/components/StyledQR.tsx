import { useEffect, useState } from 'react'
import { buildSVG, buildMatrix, renderMonogram, type QRSettings } from '@/components/QRCreator'

// Renders the *designed* QR (from saved qr_settings) anywhere outside the designer
// — the admin preview, the printable sign, etc. Falls back to a plain styled QR if
// no settings exist. Handles the async monogram render internally.
export default function StyledQR({
  url,
  settings,
  size = 240,
}: {
  url: string
  settings: QRSettings | null | undefined
  size?: number
}) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let dead = false
    async function build() {
      const s = settings ?? null
      let matrix: boolean[][]
      try { matrix = buildMatrix(url, (s?.ecLevel as 'L' | 'M' | 'Q' | 'H') ?? 'M') } catch { return }

      // Center image: monogram (async canvas render) or uploaded logo or none.
      let centerDataUrl: string | null = null
      const centerMode = s?.centerMode ?? 'none'
      if (centerMode === 'monogram' && s?.monogramText) {
        centerDataUrl = await renderMonogram(s.monogramText, s.monogramColor ?? '#1a1612')
      } else if (centerMode === 'logo') {
        centerDataUrl = s?.logoDataUrl ?? null
      }

      const fg = s?.fgColor ?? '#1a1612'
      const useEye = s?.useEyeColors ?? false

      const out = buildSVG({
        matrix,
        displaySize: size,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dotStyle:   (s?.dotStyle as any)   ?? 'square',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frameStyle: (s?.frameStyle as any) ?? 'square',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ballStyle:  (s?.ballStyle as any)  ?? 'square',
        fgColor:    fg,
        bgColor:    s?.bgColor ?? '#f5f0e8',
        outerCol:   useEye ? (s?.outerEye ?? fg) : fg,
        innerCol:   useEye ? (s?.innerEye ?? fg) : fg,
        transparent: s?.transparent ?? false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gradDir:    (s?.gradDir as any) ?? 'none',
        gradColor2: s?.gradColor2 ?? '#8a6a40',
        quietZone:  s?.quietZone ?? 2,
        centerDataUrl,
        logoSize:   s?.logoSize ?? 20,
      })
      if (!dead) setSvg(out)
    }
    build()
    return () => { dead = true }
  }, [url, settings, size])

  if (!svg) return <div style={{ width: size, height: size }} />
  return <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}
