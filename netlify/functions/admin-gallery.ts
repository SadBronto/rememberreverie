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
    .select('id, mode, memory_number, captured_at, uploaded_at, status, output_path', { count: 'exact' })
    .eq('wedding_id', weddingId)
    .neq('status', 'deleted')
    .order('uploaded_at', { ascending: false })
    .range(from, to)

  if (error) return { statusCode: 500, body: 'Failed to fetch sessions' }

  const EXPIRY = 3600
  const photos = await Promise.all(
    (sessions ?? []).map(async (s) => {
      let photoUrl: string | null = null
      if (s.output_path) {
        const { data } = await admin.storage
          .from('photos')
          .createSignedUrl(s.output_path, EXPIRY)
        photoUrl = data?.signedUrl ?? null
      }
      return {
        id:           s.id,
        mode:         s.mode,
        memoryNumber: s.memory_number,
        capturedAt:   s.captured_at,
        uploadedAt:   s.uploaded_at,
        status:       s.status,
        photoUrl,
      }
    })
  )

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ photos, total: count ?? 0, page, pageSize }),
  }
}
