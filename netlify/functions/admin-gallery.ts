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

// GET /api/admin/gallery?weddingId=xxx&page=0&pageSize=48
// Returns a paginated list of all non-deleted sessions for a wedding
// with signed photo URLs. Admin-gated.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const user = await verifyAdmin(event.headers.authorization)
  if (!user) return { statusCode: 401, body: 'Unauthorized' }

  const weddingId = event.queryStringParameters?.weddingId
  if (!weddingId) return { statusCode: 400, body: 'Missing weddingId' }

  const pageSize = Math.min(parseInt(event.queryStringParameters?.pageSize ?? '48', 10), 100)
  const page     = Math.max(parseInt(event.queryStringParameters?.page ?? '0', 10), 0)
  const from     = page * pageSize
  const to       = from + pageSize - 1

  const { data: sessions, error, count } = await admin
    .from('sessions')
    .select('id, mode, memory_number, captured_at, uploaded_at, status, output_path, annotation_path', { count: 'exact' })
    .eq('wedding_id', weddingId)
    .neq('status', 'deleted')
    .order('uploaded_at', { ascending: false })
    .range(from, to)

  if (error) return { statusCode: 500, body: 'Failed to fetch sessions' }

  // Batch-sign every photo + annotation in ONE request.
  const EXPIRY = 3600
  const urlMap = await signPaths(
    (sessions ?? []).flatMap(s => [s.output_path, s.annotation_path].filter(Boolean) as string[]),
    EXPIRY,
  )
  const photos = (sessions ?? []).map(s => ({
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
    body: JSON.stringify({ photos, total: count ?? 0, page, pageSize }),
  }
}
