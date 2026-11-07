import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function verifyAdmin(authHeader: string | undefined) {
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user?.email) return null
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  return adminEmails.includes(user.email.toLowerCase()) ? user : null
}

// GET /api/admin/upload-errors?limit=200&weddingId=xxx
// Admin-only dump of recent upload failures, newest first, for occasional review.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }

  const user = await verifyAdmin(event.headers.authorization)
  if (!user) return { statusCode: 401, body: 'Unauthorized' }

  const limit = Math.min(parseInt(event.queryStringParameters?.limit ?? '200', 10) || 200, 1000)
  const weddingId = event.queryStringParameters?.weddingId

  let q = admin
    .from('upload_errors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (weddingId) q = q.eq('wedding_id', weddingId)

  const { data, error } = await q
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: data?.length ?? 0, errors: data ?? [] }),
  }
}
