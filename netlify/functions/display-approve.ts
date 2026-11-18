import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Private-slideshow display approvals. The owner (or an admin) approves one specific
// display, and can lock it again later.
//   GET  /api/host/display?weddingId=x               -> list approved displays
//   POST /api/host/display?weddingId=x {op:'approve', displayId}
//   POST /api/host/display?weddingId=x {op:'lock', displayId}   (lock one screen)
//   POST /api/host/display?weddingId=x {op:'lock-all'}
// Auth: the caller must own the event (couple_email === token user's email) or be an admin.
function json(obj: unknown, statusCode = 200) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

export const handler: Handler = async (event) => {
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user?.email) return { statusCode: 401, body: 'Invalid token' }

  const weddingId = event.queryStringParameters?.weddingId
  if (!weddingId) return { statusCode: 400, body: 'Missing weddingId' }

  const { data: wedding } = await admin
    .from('weddings').select('id, couple_email, couple_names, slideshow_private').eq('id', weddingId).single()
  if (!wedding) return { statusCode: 404, body: 'Not found' }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = adminEmails.includes(user.email.toLowerCase())
  const isOwner = !!wedding.couple_email && wedding.couple_email.toLowerCase() === user.email.toLowerCase()
  if (!isAdmin && !isOwner) return { statusCode: 403, body: 'Forbidden' }

  if (event.httpMethod === 'GET') {
    const { data } = await admin
      .from('display_approvals').select('display_id, approved_at')
      .eq('wedding_id', weddingId).order('approved_at', { ascending: false })
    return json({ coupleNames: wedding.couple_names, private: !!wedding.slideshow_private, displays: data ?? [] })
  }

  if (event.httpMethod === 'POST') {
    let body: { op?: string; displayId?: string }
    try { body = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }
    const displayId = (body.displayId ?? '').slice(0, 64)

    if (body.op === 'approve') {
      if (!/^[A-Za-z0-9-]{8,64}$/.test(displayId)) return { statusCode: 400, body: 'Bad display id' }
      const { error } = await admin.from('display_approvals').upsert(
        { wedding_id: weddingId, display_id: displayId, approved_at: new Date().toISOString(), approved_by: user.email },
        { onConflict: 'wedding_id,display_id' },
      )
      if (error) return { statusCode: 500, body: 'Could not approve' }
      return json({ ok: true, coupleNames: wedding.couple_names })
    }

    if (body.op === 'lock') {
      if (!displayId) return { statusCode: 400, body: 'Missing displayId' }
      await admin.from('display_approvals').delete().eq('wedding_id', weddingId).eq('display_id', displayId)
      return json({ ok: true })
    }

    if (body.op === 'lock-all') {
      await admin.from('display_approvals').delete().eq('wedding_id', weddingId)
      return json({ ok: true })
    }

    return { statusCode: 400, body: 'Unknown op' }
  }

  return { statusCode: 405, body: 'Method Not Allowed' }
}
