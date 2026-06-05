import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Batch-sign storage paths in ONE request. Returns a path → signed-URL map.
async function signPaths(paths: string[], expiry: number): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (paths.length === 0) return map
  const { data } = await admin.storage.from('photos').createSignedUrls(paths, expiry)
  for (const item of data ?? []) {
    if (item.signedUrl && !item.error && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

// GET /api/couple/gallery?weddingId=xxx
// Requires: Authorization: Bearer <supabase-access-token>
// Returns all sessions for the wedding with 1-hour signed photo URLs.
// Verifies the requesting user's email matches weddings.couple_email.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const weddingId = event.queryStringParameters?.weddingId
  if (!weddingId) return { statusCode: 400, body: 'Missing weddingId' }

  // Verify bearer token
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return { statusCode: 401, body: 'Invalid token' }

  // Check the user's email matches this wedding's couple_email
  const { data: wedding, error: weddingError } = await admin
    .from('weddings')
    .select('id, couple_names, wedding_date, couple_email, timestamp_enabled, timestamp_style')
    .eq('id', weddingId)
    .single()

  if (weddingError || !wedding) {
    return { statusCode: 404, body: 'Wedding not found' }
  }

  if (wedding.couple_email && wedding.couple_email !== user.email) {
    return { statusCode: 403, body: 'Forbidden' }
  }

  // Fetch sessions: includes hidden (couple manages visibility themselves) but
  // EXCLUDES 'flagged' — moderation hits stay admin-only so potentially explicit
  // content never surfaces to the couple, even under "Show hidden".
  const { data: sessions, error: sessionsError } = await admin
    .from('sessions')
    .select('id, mode, memory_number, captured_at, uploaded_at, status, output_path, annotation_path')
    .eq('wedding_id', weddingId)
    .neq('status', 'deleted')
    .neq('status', 'flagged')
    .order('uploaded_at', { ascending: true })

  if (sessionsError) {
    return { statusCode: 500, body: 'Failed to fetch sessions' }
  }

  // Batch-sign every photo + annotation in ONE request (1-hour URLs).
  const EXPIRY = 3600
  const urlMap = await signPaths(
    (sessions ?? []).flatMap(s => [s.output_path, s.annotation_path].filter(Boolean) as string[]),
    EXPIRY,
  )

  const enriched = (sessions ?? []).map(s => ({
    id:            s.id,
    mode:          s.mode,
    memoryNumber:  s.memory_number,
    capturedAt:    s.captured_at,
    uploadedAt:    s.uploaded_at,
    status:        s.status,
    photoUrl:      s.output_path     ? urlMap.get(s.output_path)     ?? null : null,
    annotationUrl: s.annotation_path ? urlMap.get(s.annotation_path) ?? null : null,
  }))

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      wedding: {
        id:             wedding.id,
        coupleNames:    wedding.couple_names,
        weddingDate:    wedding.wedding_date,
      },
      sessions: enriched,
    }),
  }
}
