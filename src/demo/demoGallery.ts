import type { SessionRecord } from '@/pages/couple/GalleryPage'
import type { CaptureSession } from '@/types/session'
import { DEMO_PHOTOS, type DemoPhoto } from '@/demo/demoData'
import { DEMO_BASE_CONFIG, isDemoId } from '@/demo/demoConfig'
import { CAMERA_MODES } from '@/config/modes'
import { processSession } from '@/lib/imageProcessor'

// Builds the demo gallery by running each raw demo photo through the REAL
// processSession pipeline (so the demo can't drift from the product), then layers
// in any photos the prospect captured in the Guest persona. The expensive bit —
// filtering the 46 bundled photos — is processed once and cached for the session.

let manifestCache: Promise<SessionRecord[]> | null = null

async function processManifestPhoto(p: DemoPhoto): Promise<SessionRecord> {
  const blob = await (await fetch(p.src)).blob()
  // Override the mode's aspect ratio with the image's NATIVE ratio + native width
  // so processSession does no cropping (the photos are pre-sized per mode, incl.
  // portrait disposable).
  const config = { ...CAMERA_MODES[p.mode], aspectRatio: p.w / p.h }
  const out = await processSession(
    [{ blob, capturedAt: new Date(p.capturedAt), index: 0 }],
    config,
    {
      timestampEnabled: DEMO_BASE_CONFIG.timestampEnabled,
      timestampStyle:   DEMO_BASE_CONFIG.timestampStyle,
      coupleNames:      DEMO_BASE_CONFIG.coupleNames,
    },
    p.w,
  )
  return {
    id:            p.id,
    mode:          p.mode,
    memoryNumber:  p.memoryNumber,
    capturedAt:    p.capturedAt,
    uploadedAt:    p.capturedAt,
    status:        p.status,
    photoUrl:      URL.createObjectURL(out),
    annotationUrl: p.sigSrc,
  }
}

function guestCaptureToSession(s: CaptureSession): SessionRecord | null {
  if (!s.outputImage) return null
  const iso = s.capturedAt.toISOString()
  return {
    id:            s.id,
    mode:          s.mode,
    memoryNumber:  s.memoryNumber,
    capturedAt:    iso,
    uploadedAt:    iso,
    status:        'active',
    photoUrl:      URL.createObjectURL(s.outputImage),
    annotationUrl: s.annotation?.dataUrl ?? null,
  }
}

export async function buildDemoGallery(guestSessions: CaptureSession[] = []): Promise<SessionRecord[]> {
  if (!manifestCache) manifestCache = Promise.all(DEMO_PHOTOS.map(processManifestPhoto))
  const base = await manifestCache
  // Prospect's own Guest captures float to the top (most recent first).
  const guests = guestSessions
    .filter((s) => isDemoId(s.weddingId))
    .map(guestCaptureToSession)
    .filter((s): s is SessionRecord => s !== null)
    .reverse()
  return [...guests, ...base]
}
