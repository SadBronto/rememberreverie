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

// DELETE /api/admin/session?sessionId=xxx
// Admin-only soft-delete: sets session status to 'deleted'.
// The couple gallery already filters out deleted sessions.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const user = await verifyAdmin(event.headers.authorization)
  if (!user) return { statusCode: 401, body: 'Unauthorized' }

  const sessionId = event.queryStringParameters?.sessionId
  if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' }

  const { error } = await admin
    .from('sessions')
    .update({ status: 'deleted' })
    .eq('id', sessionId)

  if (error) return { statusCode: 500, body: 'Failed to delete session' }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
