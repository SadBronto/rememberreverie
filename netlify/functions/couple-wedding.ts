import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { evaluateDisplay } from '../lib/health'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/couple/wedding
// Returns the authenticated couple's most recent wedding record.
// Used by CoupleSetupPage to load existing (partial) data.
// Requires: Authorization: Bearer <supabase-access-token>
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user?.email) return { statusCode: 401, body: 'Invalid token' }

  const { data: wedding, error: wErr } = await admin
    .from('weddings')
    .select('id, couple_names, wedding_date, status, couple_email, allowed_modes, annotation_mode, timestamp_enabled, timestamp_style, photo_cap, welcome_message, slug, qr_settings, is_event, event_end_date, selfie_enabled, plan, capture_start, capture_end, event_timezone, addon_unlimited, addon_geofence, retention_until, timestamp_size, timestamp_outline, staff_code, slideshow_qr_slide, slideshow_qr_every, slideshow_qr_seconds, slideshow_spotlight_new, geofence_enabled, geofence_lat, geofence_lng, geofence_radius_m, geofence_bypass_code, slideshow_slow_poll, slideshow_private, display_seen_at, display_advanced_at, display_hours_start, display_hours_end')
    .eq('couple_email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (wErr || !wedding) return { statusCode: 404, body: 'No wedding found for this account' }

  // Screen status for the client's status box, using the same rules as our own alerts.
  const w = wedding as Record<string, any>
  const seenAt = w.display_seen_at ? Date.parse(w.display_seen_at) : null
  const advancedAt = w.display_advanced_at ? Date.parse(w.display_advanced_at) : null
  const state = seenAt == null ? 'never' : evaluateDisplay({
    seenAt, advancedAt, slowPoll: !!w.slideshow_slow_poll, monitor: true,
    hoursStart: w.display_hours_start ?? null, hoursEnd: w.display_hours_end ?? null, timezone: w.event_timezone ?? null,
  }, Date.now())
  const screen = { state, seenAt, advancedAt }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ ...wedding, screen }),
  }
}
