import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getPhotoUrls } from '../lib/storage'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/weddings/:id
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const id = event.path.split('/').pop()
  if (!id) return { statusCode: 400, body: 'Missing wedding id' }

  const { data, error } = await supabase
    .from('weddings')
    .select('*')
    .eq('id', id)
    .eq('status', 'active')  // don't serve archived/expired weddings
    .single()

  if (error || !data) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Wedding not found' }) }
  }

  // Map snake_case DB columns → camelCase WeddingConfig shape
  const config = {
    id:                   data.id,
    coupleNames:          data.couple_names,
    weddingDate:          data.wedding_date,
    welcomeMessage:       data.welcome_message,
    allowedModes:         data.allowed_modes,
    preferredOrientation: data.preferred_orientation,
    annotationMode:       data.annotation_mode,
    slideshowEnabled:     data.slideshow_enabled,
    timestampEnabled:     data.timestamp_enabled,
    timestampStyle:       data.timestamp_style,
    timestampSize:        data.timestamp_size ?? 'medium',
    timestampOutline:     data.timestamp_outline ?? 'medium',
    themeColor:           data.theme_color ?? undefined,
    heroImageUrl:         data.hero_image_url ?? undefined,
    photoCap:             data.photo_cap ?? undefined,
    isDemoMode:           data.is_demo_mode,
    isEvent:              data.is_event ?? false,
    // Location fence — public fields only (bypass code stays server-side)
    geofenceEnabled:      data.geofence_enabled ?? false,
    geofenceLat:          data.geofence_lat ?? null,
    geofenceLng:          data.geofence_lng ?? null,
    geofenceRadiusM:      data.geofence_radius_m ?? null,
    geofenceHasBypass:    !!data.geofence_bypass_code,
    selfieEnabled:        data.selfie_enabled ?? true,
    plan:                 data.plan ?? 'basic',
    captureStart:         data.capture_start ?? null,
    captureEnd:           data.capture_end ?? null,
    eventTimezone:        data.event_timezone ?? null,
  }

  // Logo watermark for new photos. Sent inline as a data URL (small, resized on upload)
  // so the guest's phone can draw it onto the canvas without any cross-origin issues.
  let watermarkData: string | null = null
  if (data.watermark_photos && data.watermark_path) {
    try {
      const u = (await getPhotoUrls([data.watermark_path], 300)).get(data.watermark_path)
      if (u) {
        const r = await fetch(u)
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer())
          if (buf.length < 900_000) {
            watermarkData = `data:${r.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`
          }
        }
      }
    } catch { /* no watermark rather than a failed page */ }
  }
  ;(config as Record<string, unknown>).watermarkData = watermarkData
  ;(config as Record<string, unknown>).watermarkPosition = data.watermark_position ?? 'bottom-left'
  ;(config as Record<string, unknown>).watermarkOpacity = data.watermark_opacity ?? 85

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      // Cache for 60s — config rarely changes mid-reception
      'Cache-Control': 'public, max-age=60',
    },
    body: JSON.stringify(config),
  }
}
