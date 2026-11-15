import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { evaluateDisplay } from '../lib/health'

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function verifyAdmin(authHeader: string | undefined) {
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user?.email) return null
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  return adminEmails.includes(user.email.toLowerCase()) ? user : null
}

// GET /api/admin/health[?weddingId=xxx]
// Admin-only. Returns every live event's display status (computed fresh, not just the
// last scheduled result) and the recent issue log (service events + failed uploads).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }
  const user = await verifyAdmin(event.headers.authorization)
  if (!user) return { statusCode: 401, body: 'Unauthorized' }

  const weddingId = event.queryStringParameters?.weddingId
  const now = Date.now()

  const { data: rows, error } = await admin
    .from('weddings')
    .select('id, couple_names, slug, status, display_seen_at, display_advanced_at, display_visible, display_build, display_monitor, display_hours_start, display_hours_end, event_timezone, slideshow_slow_poll')
    .eq('plan', 'live')
    .not('status', 'in', '("expired","archived")')
    .order('couple_names')
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

  const displays = (rows ?? []).map(r => {
    const seenAt = r.display_seen_at ? Date.parse(r.display_seen_at) : null
    const advancedAt = r.display_advanced_at ? Date.parse(r.display_advanced_at) : null
    return {
      id: r.id, name: r.couple_names, slug: r.slug,
      state: evaluateDisplay({
        seenAt, advancedAt, slowPoll: r.slideshow_slow_poll ?? false, monitor: r.display_monitor ?? true,
        hoursStart: r.display_hours_start, hoursEnd: r.display_hours_end, timezone: r.event_timezone,
      }, now),
      seenAt: r.display_seen_at, advancedAt: r.display_advanced_at, visible: r.display_visible,
      build: r.display_build, monitor: r.display_monitor ?? true,
      hours: r.display_hours_start && r.display_hours_end ? `${r.display_hours_start} to ${r.display_hours_end}` : null,
    }
  })

  let evQ = admin.from('service_events').select('*').order('created_at', { ascending: false }).limit(200)
  let upQ = admin.from('upload_errors').select('*').order('created_at', { ascending: false }).limit(100)
  if (weddingId) { evQ = evQ.eq('wedding_id', weddingId); upQ = upQ.eq('wedding_id', weddingId) }
  const [{ data: evs }, { data: ups }] = await Promise.all([evQ, upQ])

  // Resolve event names for every id that appears in the log.
  const ids = new Set<string>()
  for (const e of evs ?? []) if (e.wedding_id) ids.add(e.wedding_id)
  for (const u of ups ?? []) if (u.wedding_id) ids.add(u.wedding_id)
  const nameById = new Map<string, string>(displays.map(d => [d.id, d.name]))
  const missing = [...ids].filter(i => !nameById.has(i))
  if (missing.length > 0) {
    const { data: more } = await admin.from('weddings').select('id, couple_names').in('id', missing)
    for (const w of more ?? []) nameById.set(w.id, w.couple_names)
  }

  const events = [
    ...(evs ?? []).map(e => ({
      id: `e${e.id}`, createdAt: e.created_at, weddingId: e.wedding_id, eventName: e.wedding_id ? nameById.get(e.wedding_id) ?? null : null,
      kind: e.kind as string, severity: e.severity as string, source: e.source as string | null, detail: e.detail as string | null,
    })),
    ...(ups ?? []).map(u => ({
      id: `u${u.id}`, createdAt: u.created_at, weddingId: u.wedding_id, eventName: u.wedding_id ? nameById.get(u.wedding_id) ?? null : null,
      kind: 'upload_failure', severity: 'warn', source: 'guest-phone',
      detail: [u.stage, u.status ? `HTTP ${u.status}` : null, u.detail].filter(Boolean).join(' | ') || null,
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 250)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ now, displays, events }),
  }
}
