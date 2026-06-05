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

// Admin-only session controls (all gated by verifyAdmin):
//   DELETE /api/admin/session?sessionId=xxx        — soft-delete (status 'deleted')
//   PATCH  /api/admin/session?sessionId=xxx { status: 'active' | 'hidden' }
//     — restore a flagged/hidden photo to 'active', or manually hide an 'active'
//       one. This is how the admin clears a moderation false-positive.
export const handler: Handler = async (event) => {
  const user = await verifyAdmin(event.headers.authorization)
  if (!user) return { statusCode: 401, body: 'Unauthorized' }

  const sessionId = event.queryStringParameters?.sessionId
  if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' }

  if (event.httpMethod === 'DELETE') {
    const { error } = await admin
      .from('sessions')
      .update({ status: 'deleted' })
      .eq('id', sessionId)
    if (error) return { statusCode: 500, body: 'Failed to delete session' }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  if (event.httpMethod === 'PATCH') {
    let body: { status?: string }
    try { body = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }
    if (!body.status || !['active', 'hidden'].includes(body.status)) {
      return { statusCode: 400, body: "status must be 'active' or 'hidden'" }
    }
    const { error } = await admin
      .from('sessions')
      .update({ status: body.status })
      .eq('id', sessionId)
    if (error) return { statusCode: 500, body: 'Failed to update session' }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  return { statusCode: 405, body: 'Method Not Allowed' }
}
