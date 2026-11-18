import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST  /api/couple/setup — initial setup wizard; only works when status='pending_setup'; activates wedding
// PATCH /api/couple/setup — ongoing settings update; works any time; does not change status
// Both require: Authorization: Bearer <supabase-access-token>
export const handler: Handler = async (event) => {
  const method = event.httpMethod
  if (method !== 'POST' && method !== 'PATCH') return { statusCode: 405, body: 'Method Not Allowed' }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user?.email) return { statusCode: 401, body: 'Invalid token' }

  // Find their wedding
  const { data: wedding, error: wErr } = await admin
    .from('weddings')
    .select('id, status, addon_geofence')
    .eq('couple_email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (wErr || !wedding) return { statusCode: 404, body: 'No wedding found for this account' }

  // POST: only valid during initial setup
  if (method === 'POST' && wedding.status !== 'pending_setup') {
    return { statusCode: 409, body: 'Wedding is already configured — use PATCH to make changes' }
  }

  let body: Record<string, unknown>
  try { body = JSON.parse(event.body ?? '{}') } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { coupleNames, weddingDate, captureStart, captureEnd, eventTimezone,
          welcomeMessage, allowedModes, annotationMode,
          timestampEnabled, timestampStyle, timestampSize, timestampOutline, slug, selfieEnabled,
          staffCode, qrSlideEnabled, qrEvery, qrSeconds, spotlightNew, geofence } = body as Record<string, any>

  if (!coupleNames) {
    return { statusCode: 400, body: 'coupleNames is required' }
  }
  if (!Array.isArray(allowedModes) || allowedModes.length === 0) {
    return { statusCode: 400, body: 'At least one memory style is required' }
  }

  const update: Record<string, unknown> = {
    couple_names:      String(coupleNames).trim(),
    wedding_date:      weddingDate ? weddingDate : null,
    welcome_message:   welcomeMessage ? String(welcomeMessage).trim() : 'Leave us a memory.',
    allowed_modes:     allowedModes,
    annotation_mode:   annotationMode ?? 'signature',
    timestamp_enabled: timestampEnabled ?? true,
    timestamp_style:   timestampStyle ?? 'classic',
    slug:              slug ? String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '').trim() || null : null,
  }

  // Only persist the selfie toggle when the client actually sends it (settings
  // page does; the initial setup POST doesn't — it relies on the DB default TRUE).
  if (typeof selfieEnabled === 'boolean') update.selfie_enabled = selfieEnabled

  // Capture window — only touch these columns when the client sends them, so a
  // partial PATCH (e.g. the settings page) never blanks an existing window.
  // retention_until is left null: cleanup derives capture_end + 90d automatically.
  if (captureStart  !== undefined) update.capture_start  = captureStart  || null
  if (captureEnd    !== undefined) update.capture_end    = captureEnd    || null
  if (eventTimezone !== undefined) update.event_timezone = eventTimezone || null

  // Timestamp size + outline — only touch when sent (partial PATCH safety).
  if (timestampSize    !== undefined) update.timestamp_size    = timestampSize
  if (timestampOutline !== undefined) update.timestamp_outline = timestampOutline

  // Staff password (clients choose their own). 6-40 characters; blank leaves it unchanged.
  if (typeof staffCode === 'string' && staffCode.trim()) {
    const code = staffCode.trim()
    if (code.length < 6 || code.length > 40) return { statusCode: 400, body: 'The staff password needs 6 to 40 characters' }
    update.staff_code = code
  }

  // Scan-to-share slide and timing, and "show new photos right away".
  if (typeof qrSlideEnabled === 'boolean') update.slideshow_qr_slide = qrSlideEnabled
  if (qrEvery !== undefined)   update.slideshow_qr_every   = Math.max(1, Math.min(50, Math.round(Number(qrEvery) || 10)))
  if (qrSeconds !== undefined) update.slideshow_qr_seconds = Math.max(3, Math.min(60, Math.round(Number(qrSeconds) || 12)))
  if (typeof spotlightNew === 'boolean') update.slideshow_spotlight_new = spotlightNew

  // Location fence: only for events that have the geofence add-on.
  if (geofence && wedding.addon_geofence) {
    const g = geofence as { enabled?: boolean; lat?: number | null; lng?: number | null; radiusM?: number; bypassCode?: string | null }
    const lat = g.lat == null ? null : Number(g.lat)
    const lng = g.lng == null ? null : Number(g.lng)
    if (g.enabled && (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng))) {
      return { statusCode: 400, body: 'Set the venue location on the map before turning the location fence on' }
    }
    update.geofence_enabled = !!g.enabled
    update.geofence_lat = lat
    update.geofence_lng = lng
    update.geofence_radius_m = Math.max(25, Math.min(1000, Math.round(Number(g.radiusM) || 150)))
    update.geofence_bypass_code = g.bypassCode ? String(g.bypassCode).trim().slice(0, 40) || null : null
  }

  // Only POST activates the wedding
  if (method === 'POST') update.status = 'active'

  const { error: updateErr } = await admin
    .from('weddings')
    .update(update)
    .eq('id', wedding.id)

  if (updateErr) {
    // Unique constraint on slug
    if (updateErr.code === '23505') {
      return { statusCode: 409, body: 'That URL is already taken — try a different one' }
    }
    console.error('couple-setup update error:', updateErr)
    return { statusCode: 500, body: 'Failed to save settings' }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, weddingId: wedding.id }),
  }
}
