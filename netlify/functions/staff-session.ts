import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/staff/session
// Header: x-staff-code: <event staff_code>
// Body: { slug?: string, weddingId?: string, sessionId: string }
//
// On-site staff removal. HIDES the photo (status 'hidden', removed_by 'staff') so it
// leaves the slideshow + the staff view immediately, but stays in the private archive
// for the host/admin to review (identify the person, decide on further steps). This is
// deliberately NOT a hard delete.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const code = event.headers['x-staff-code']
  if (!code) return { statusCode: 401, body: 'Missing staff code' }

  let body: { slug?: string; weddingId?: string; sessionId?: string }
  try { body = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }
  const { slug, weddingId, sessionId } = body
  if (!sessionId || (!slug && !weddingId)) return { statusCode: 400, body: 'Missing fields' }

  const base = admin.from('weddings').select('id, staff_code')
  const { data: wedding } = weddingId
    ? await base.eq('id', weddingId).single()
    : await base.eq('slug', slug!.trim().toLowerCase()).single()

  if (!wedding) return { statusCode: 404, body: 'Not found' }
  if (!wedding.staff_code || wedding.staff_code !== code) {
    return { statusCode: 401, body: 'Incorrect code' }
  }

  // Only hide a session that actually belongs to this event.
  const { data: session } = await admin
    .from('sessions')
    .select('id, wedding_id')
    .eq('id', sessionId)
    .single()
  if (!session || session.wedding_id !== wedding.id) {
    return { statusCode: 404, body: 'Photo not found' }
  }

  const { error } = await admin
    .from('sessions')
    .update({ status: 'hidden', removed_by: 'staff' })
    .eq('id', sessionId)

  if (error) {
    // removed_by may not be migrated yet — still get the photo off the screen.
    const { error: e2 } = await admin.from('sessions').update({ status: 'hidden' }).eq('id', sessionId)
    if (e2) return { statusCode: 500, body: 'Failed to remove photo' }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
