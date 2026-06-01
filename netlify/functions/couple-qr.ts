import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// PATCH /api/couple/qr
// Body: { qrSettings: object }
// Saves QR creator settings for the authenticated couple's wedding.
// Only touches the qr_settings column — nothing else.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'PATCH') return { statusCode: 405, body: 'Method Not Allowed' }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user?.email) return { statusCode: 401, body: 'Invalid token' }

  let body: { qrSettings: unknown }
  try { body = JSON.parse(event.body ?? '{}') } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  if (!body.qrSettings || typeof body.qrSettings !== 'object') {
    return { statusCode: 400, body: 'Missing qrSettings' }
  }

  const { data: wedding } = await admin
    .from('weddings')
    .select('id')
    .eq('couple_email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!wedding) return { statusCode: 404, body: 'No wedding found' }

  const { error } = await admin
    .from('weddings')
    .update({ qr_settings: body.qrSettings })
    .eq('id', wedding.id)

  if (error) return { statusCode: 500, body: 'Failed to save QR settings' }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
