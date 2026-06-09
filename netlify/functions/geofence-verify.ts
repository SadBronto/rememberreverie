import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/geofence/verify  { weddingId, code }
// Checks a guest-entered bypass code against the wedding's geofence_bypass_code.
// Kept server-side so the code is never shipped in the public wedding config.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let body: { weddingId?: string; code?: string }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { weddingId, code } = body
  if (!weddingId || !code) {
    return { statusCode: 400, body: JSON.stringify({ ok: false }) }
  }

  const { data, error } = await supabase
    .from('weddings')
    .select('geofence_bypass_code')
    .eq('id', weddingId)
    .single()

  if (error || !data) {
    return { statusCode: 200, body: JSON.stringify({ ok: false }) }
  }

  const expected = (data.geofence_bypass_code ?? '').trim().toLowerCase()
  const given = code.trim().toLowerCase()
  const ok = expected.length > 0 && given === expected

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ ok }),
  }
}
