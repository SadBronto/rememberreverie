import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// PATCH /api/couple/session?sessionId=xxx  → body: { status: 'active' | 'hidden' }
// DELETE /api/couple/session?sessionId=xxx → soft-deletes (status = 'deleted')
// Requires: Authorization: Bearer <supabase-access-token>
export const handler: Handler = async (event) => {
  const method = event.httpMethod
  if (method !== 'PATCH' && method !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const sessionId = event.queryStringParameters?.sessionId
  if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return { statusCode: 401, body: 'Invalid token' }

  // Verify the session belongs to a wedding owned by this user
  const { data: session } = await admin
    .from('sessions')
    .select('id, wedding_id')
    .eq('id', sessionId)
    .single()

  if (!session) return { statusCode: 404, body: 'Session not found' }

  const { data: wedding } = await admin
    .from('weddings')
    .select('couple_email')
    .eq('id', session.wedding_id)
    .single()

  if (wedding?.couple_email && wedding.couple_email !== user.email) {
    return { statusCode: 403, body: 'Forbidden' }
  }

  // DELETE → soft-delete
  if (method === 'DELETE') {
    const { error } = await admin
      .from('sessions')
      .update({ status: 'deleted' })
      .eq('id', sessionId)
    if (error) return { statusCode: 500, body: 'Failed to delete session' }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  // PATCH → hide/show
  let body: { status: string }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { status } = body
  if (status !== 'active' && status !== 'hidden') {
    return { statusCode: 400, body: 'status must be "active" or "hidden"' }
  }

  const { error } = await admin
    .from('sessions')
    .update({ status })
    .eq('id', sessionId)

  if (error) return { statusCode: 500, body: 'Failed to update session' }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
