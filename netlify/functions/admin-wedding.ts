import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function verifyAdmin(authHeader: string | undefined) {
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user?.email) return null
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  return adminEmails.includes(user.email.toLowerCase()) ? user : null
}

// Batch-sign storage paths in ONE request. Returns a path → signed-URL map.
async function signPaths(paths: string[], expiry: number): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (paths.length === 0) return map
  const { data } = await admin.storage.from('photos').createSignedUrls(paths, expiry)
  for (const item of data ?? []) {
    if (item.signedUrl && !item.error && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

// GET  /api/admin/wedding?id=xxx  — wedding detail + recent sessions with signed photo URLs
// PATCH /api/admin/wedding?id=xxx — update wedding fields
// DELETE /api/admin/wedding?id=xxx — archive wedding
export const handler: Handler = async (event) => {
  const user = await verifyAdmin(event.headers.authorization)
  if (!user) return { statusCode: 401, body: 'Unauthorized' }

  const id = event.queryStringParameters?.id
  if (!id) return { statusCode: 400, body: 'Missing id' }

  // ── GET: detail ────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const { data: wedding, error: wErr } = await admin
      .from('weddings')
      .select('*')
      .eq('id', id)
      .single()

    if (wErr || !wedding) return { statusCode: 404, body: 'Wedding not found' }

    // Session counts by mode
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, mode, status, captured_at, uploaded_at, output_path, annotation_path, memory_number')
      .eq('wedding_id', id)
      .neq('status', 'deleted')
      .order('uploaded_at', { ascending: false })

    // Generate signed URLs for the 12 most recent active photos (one batch request)
    const recent = (sessions ?? []).filter(s => s.status === 'active').slice(0, 12)
    const urlMap = await signPaths(
      recent.flatMap(s => [s.output_path, s.annotation_path].filter(Boolean) as string[]),
      3600,
    )
    const recentWithUrls = recent.map(s => ({
      id: s.id, mode: s.mode, status: s.status, capturedAt: s.captured_at,
      memoryNumber: s.memory_number,
      photoUrl:      s.output_path     ? urlMap.get(s.output_path)     ?? null : null,
      annotationUrl: s.annotation_path ? urlMap.get(s.annotation_path) ?? null : null,
    }))

    const countByMode = { disposable: 0, polaroid: 0, super8: 0, total: 0 }
    for (const s of sessions ?? []) {
      if (s.status !== 'deleted') {
        countByMode.total++
        if (s.mode in countByMode) countByMode[s.mode as keyof typeof countByMode]++
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ wedding, counts: countByMode, recentPhotos: recentWithUrls }),
    }
  }

  // ── PATCH: update ──────────────────────────────────────────
  if (event.httpMethod === 'PATCH') {
    let body: Record<string, unknown>
    try { body = JSON.parse(event.body ?? '{}') } catch {
      return { statusCode: 400, body: 'Invalid JSON' }
    }

    // Only allow known fields
    const allowed = ['couple_names', 'wedding_date', 'couple_email', 'welcome_message',
                     'allowed_modes', 'annotation_mode', 'timestamp_enabled', 'timestamp_style',
                     'photo_cap', 'status', 'slideshow_enabled', 'slug',
                     'is_event', 'event_end_date', 'couple_review_enabled', 'qr_settings',
                     'slideshow_qr_slide', 'slideshow_slides', 'slideshow_auto_fullscreen',
                     'geofence_enabled', 'geofence_lat', 'geofence_lng', 'geofence_radius_m',
                     'geofence_bypass_code', 'selfie_enabled']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key] ?? null
    }

    // If photo_cap is being changed, reset the warning flag so it can fire again
    if ('photo_cap' in body) update.cap_warning_sent = false

    const { error } = await admin.from('weddings').update(update).eq('id', id)
    if (error) return { statusCode: 500, body: 'Failed to update wedding' }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  // ── DELETE: archive (default) or permanent delete (?hard=true) ─
  if (event.httpMethod === 'DELETE') {
    const hard = event.queryStringParameters?.hard === 'true'

    if (hard) {
      // Permanent + irreversible: remove every photo from storage, then delete
      // the wedding row (session rows cascade-delete via the FK).
      const { data: sess } = await admin
        .from('sessions')
        .select('output_path, annotation_path')
        .eq('wedding_id', id)
      const paths = (sess ?? []).flatMap(s =>
        [s.output_path, s.annotation_path].filter(Boolean) as string[]
      )
      for (let i = 0; i < paths.length; i += 100) {
        await admin.storage.from('photos').remove(paths.slice(i, i + 100))
      }
      const { error } = await admin.from('weddings').delete().eq('id', id)
      if (error) return { statusCode: 500, body: 'Failed to delete wedding' }
      return { statusCode: 200, body: JSON.stringify({ ok: true, deleted: true }) }
    }

    // Default: soft-archive + release the slug (the unique index ignores status,
    // so an archived event would otherwise hold its vanity URL hostage).
    const { error } = await admin.from('weddings').update({ status: 'archived', slug: null }).eq('id', id)
    if (error) return { statusCode: 500, body: 'Failed to archive wedding' }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  return { statusCode: 405, body: 'Method Not Allowed' }
}
