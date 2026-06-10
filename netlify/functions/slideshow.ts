import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Batch-sign storage paths in ONE request. Returns a path → signed-URL map.
// Far cheaper than calling createSignedUrl once per photo, which matters because
// the slideshow re-signs every photo on each 30s poll.
async function signPaths(paths: string[], expiry: number): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (paths.length === 0) return map
  const { data } = await admin.storage.from('photos').createSignedUrls(paths, expiry)
  for (const item of data ?? []) {
    if (item.signedUrl && !item.error && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

// GET /api/slideshow?weddingId=xxx
// No auth required — the weddingId (UUID) acts as the access key,
// consistent with the guest camera URL (/w/:weddingId).
// Returns active photos with 2-hour signed URLs for TV display.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const weddingId = event.queryStringParameters?.weddingId
  if (!weddingId) return { statusCode: 400, body: 'Missing weddingId' }

  const { data: wedding } = await admin
    .from('weddings')
    .select('couple_names, wedding_date, welcome_message, timestamp_enabled, timestamp_style, slug, qr_settings')
    .eq('id', weddingId)
    .single()

  if (!wedding) return { statusCode: 404, body: 'Wedding not found' }

  // QR-slide toggle is fetched separately and tolerantly: if the
  // slideshow_qr_slide column hasn't been migrated yet, the slideshow still loads
  // (the QR slide just stays off until the migration runs).
  let qrSlideEnabled = false
  let autoFullscreen = false
  let slowPoll = false
  {
    const { data: extra, error: extraErr } = await admin
      .from('weddings')
      .select('slideshow_qr_slide, slideshow_auto_fullscreen, slideshow_slow_poll')
      .eq('id', weddingId)
      .single()
    if (!extraErr && extra) {
      qrSlideEnabled = extra.slideshow_qr_slide ?? false
      autoFullscreen = extra.slideshow_auto_fullscreen ?? false
      slowPoll = extra.slideshow_slow_poll ?? false
    }
  }

  const { data: sessions, error } = await admin
    .from('sessions')
    .select('id, mode, memory_number, captured_at, output_path, annotation_path')
    .eq('wedding_id', weddingId)
    .eq('status', 'active')
    .not('output_path', 'is', null)
    .order('uploaded_at', { ascending: true })

  if (error) return { statusCode: 500, body: 'Failed to fetch sessions' }

  // 2-hour signed URLs — slideshow polls every 30s so they never actually expire.
  // Sign every photo + annotation in a SINGLE batch request (not one call each).
  const EXPIRY = 86400  // 24h — URLs stay stable for the event so the slideshow caches images instead of re-downloading every poll
  const urlMap = await signPaths(
    (sessions ?? []).flatMap(s => [s.output_path, s.annotation_path].filter(Boolean) as string[]),
    EXPIRY,
  )

  const photos = (sessions ?? []).map(s => ({
    id:            s.id,
    mode:          s.mode,
    memoryNumber:  s.memory_number,
    capturedAt:    s.captured_at,
    photoUrl:      s.output_path     ? urlMap.get(s.output_path)     ?? null : null,
    annotationUrl: s.annotation_path ? urlMap.get(s.annotation_path) ?? null : null,
  }))

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      coupleNames:      wedding.couple_names,
      weddingDate:      wedding.wedding_date,
      welcomeMessage:   wedding.welcome_message ?? 'Leave us a memory.',
      timestampEnabled: wedding.timestamp_enabled ?? false,
      timestampStyle:   wedding.timestamp_style ?? 'classic',
      slug:             wedding.slug ?? null,
      qrSettings:       wedding.qr_settings ?? null,
      qrSlideEnabled:   qrSlideEnabled,
      autoFullscreen:   autoFullscreen,
      slowPoll:         slowPoll,
      photos:           photos.filter(p => p.photoUrl),
    }),
  }
}
