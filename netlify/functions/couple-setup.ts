import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST  /api/couple/setup — initial setup wizard; only works when status='pending_setup'; activates wedding
// PATCH /api/couple/setup — ongoing settings update; works any time; does not change status
// Both require: Authorization: Bearer <supabase-access-token>
export const handler: Handler = async (event) => {
  const method = event.httpMethod
  if (method !== 'POST' && method !== 'PATCH') return { statusCode: 405, body: 'Method Not Allowed' }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user?.email) return { statusCode: 401, body: 'Invalid token' }

  // Find their wedding
  const { data: wedding, error: wErr } = await admin
    .from('weddings')
    .select('id, status')
    .eq('couple_email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (wErr || !wedding) return { statusCode: 404, body: 'No wedding found for this account' }

  // POST: only valid during initial setup
  if (method === 'POST' && wedding.status !== 'pending_setup') {
    return { statusCode: 409, body: 'Wedding is already configured — use PATCH to make changes' }
  }

  let body: Record<string, unknown>
  try { body = JSON.parse(event.body ?? '{}') } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { coupleNames, weddingDate, welcomeMessage, allowedModes, annotationMode,
          timestampEnabled, timestampStyle, photoCap, slug } = body as Record<string, any>

  if (!coupleNames) {
    return { statusCode: 400, body: 'coupleNames is required' }
  }
  if (!Array.isArray(allowedModes) || allowedModes.length === 0) {
    return { statusCode: 400, body: 'At least one memory style is required' }
  }

  const update: Record<string, unknown> = {
    couple_names:      String(coupleNames).trim(),
    wedding_date:      weddingDate ? weddingDate : null,
    welcome_message:   welcomeMessage ? String(welcomeMessage).trim() : 'Leave us a memory.',
    allowed_modes:     allowedModes,
    annotation_mode:   annotationMode ?? 'signature',
    timestamp_enabled: timestampEnabled ?? true,
    timestamp_style:   timestampStyle ?? 'classic',
    photo_cap:         photoCap ? Number(photoCap) : null,
    slug:              slug ? String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '').trim() || null : null,
  }

  // Only POST activates the wedding
  if (method === 'POST') update.status = 'active'

  const { error: updateErr } = await admin
    .from('weddings')
    .update(update)
    .eq('id', wedding.id)

  if (updateErr) {
    // Unique constraint on slug
    if (updateErr.code === '23505') {
      return { statusCode: 409, body: 'That URL is already taken — try a different one' }
    }
    console.error('couple-setup update error:', updateErr)
    return { statusCode: 500, body: 'Failed to save settings' }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, weddingId: wedding.id }),
  }
}
