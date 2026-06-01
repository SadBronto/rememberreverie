import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/couple/wedding
// Returns the authenticated couple's most recent wedding record.
// Used by CoupleSetupPage to load existing (partial) data.
// Requires: Authorization: Bearer <supabase-access-token>
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user?.email) return { statusCode: 401, body: 'Invalid token' }

  const { data: wedding, error: wErr } = await admin
    .from('weddings')
    .select('id, couple_names, wedding_date, status, couple_email, allowed_modes, annotation_mode, timestamp_enabled, timestamp_style, photo_cap, welcome_message, slug')
    .eq('couple_email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (wErr || !wedding) return { statusCode: 404, body: 'No wedding found for this account' }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(wedding),
  }
}
