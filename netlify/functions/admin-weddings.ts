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

// GET /api/admin/weddings  — list all weddings with photo counts
// POST /api/admin/weddings — create a new wedding (minimal: just couple email)
export const handler: Handler = async (event) => {
  const user = await verifyAdmin(event.headers.authorization)
  if (!user) return { statusCode: 401, body: 'Unauthorized' }

  // ── GET: list ─────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const { data: weddings, error } = await admin
      .from('weddings')
      .select('id, couple_names, wedding_date, status, couple_email, allowed_modes, created_at')
      .order('created_at', { ascending: false })

    if (error) return { statusCode: 500, body: 'Failed to fetch weddings' }

    // Get photo counts per wedding in one query
    const { data: counts } = await admin
      .from('sessions')
      .select('wedding_id')
      .neq('status', 'deleted')

    const countMap: Record<string, number> = {}
    for (const row of counts ?? []) {
      countMap[row.wedding_id] = (countMap[row.wedding_id] ?? 0) + 1
    }

    const result = (weddings ?? []).map(w => ({
      ...w,
      photoCount: countMap[w.id] ?? 0,
    }))

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(result),
    }
  }

  // ── POST: create ───────────────────────────────────────────
  // Simplified: admin only provides the couple's email.
  // The couple configures everything else via /couple/setup after receiving their link.
  if (event.httpMethod === 'POST') {
    let body: Record<string, unknown>
    try { body = JSON.parse(event.body ?? '{}') } catch {
      return { statusCode: 400, body: 'Invalid JSON' }
    }

    const { coupleEmail, coupleNames, weddingDate } = body as Record<string, string>

    if (!coupleEmail) {
      return { statusCode: 400, body: 'coupleEmail is required' }
    }

    const id = crypto.randomUUID()

    const { data, error } = await admin.from('weddings').insert({
      id,
      couple_names:      coupleNames?.trim() || 'TBD',
      wedding_date:      weddingDate || new Date().toISOString().slice(0, 10),
      couple_email:      coupleEmail.trim().toLowerCase(),
      welcome_message:   'Leave us a memory.',
      allowed_modes:     ['disposable'],
      annotation_mode:   'signature',
      timestamp_enabled: true,
      timestamp_style:   'classic',
      status:            'pending_setup',
    }).select('*').single()

    if (error) {
      console.error('Create wedding error:', error)
      return { statusCode: 500, body: 'Failed to create wedding' }
    }

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' }
}
