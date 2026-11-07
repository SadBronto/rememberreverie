import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

// POST /api/log-error
// Client-reported upload-failure telemetry. Unauthenticated on purpose (it is a
// fire-and-forget report from the guest's device), best-effort, and bounded: only a
// handful of short fields are stored, so it can't be used to dump large payloads.
// Reviewed via the admin-only /api/admin/upload-errors endpoint.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  let b: Record<string, unknown>
  try { b = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }

  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)

  try {
    await admin.from('upload_errors').insert({
      wedding_id:   str(b.weddingId, 100),
      session_id:   str(b.sessionId, 100),
      device_token: str(b.deviceToken, 100),
      stage:        str(b.stage, 40),
      status:       num(b.status),
      detail:       str(b.detail, 500),
      attempt:      num(b.attempt),
      retry:        typeof b.retry === 'boolean' ? b.retry : null,
    })
  } catch {
    // Logging must never surface an error to the caller.
  }
  return { statusCode: 204, body: '' }
}
