import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/slideshow?weddingId=xxx
// No auth required — the weddingId (UUID) acts as the access key,
// consistent with the guest camera URL (/w/:weddingId).
// Returns active photos with 2-hour signed URLs for TV display.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const weddingId = event.queryStringParameters?.weddingId
  if (!weddingId) return { statusCode: 400, body: 'Missing weddingId' }

  const { data: wedding } = await admin
    .from('weddings')
    .select('couple_names, wedding_date')
    .eq('id', weddingId)
    .single()

  if (!wedding) return { statusCode: 404, body: 'Wedding not found' }

  const { data: sessions, error } = await admin
    .from('sessions')
    .select('id, mode, memory_number, captured_at, output_path')
    .eq('wedding_id', weddingId)
    .eq('status', 'active')
    .not('output_path', 'is', null)
    .order('uploaded_at', { ascending: true })

  if (error) return { statusCode: 500, body: 'Failed to fetch sessions' }

  // 2-hour signed URLs — slideshow polls every 30s so they never actually expire
  const EXPIRY = 7200
  const photos = await Promise.all(
    (sessions ?? []).map(async (s) => {
      const { data } = await admin.storage
        .from('photos')
        .createSignedUrl(s.output_path!, EXPIRY)
      return {
        id:           s.id,
        mode:         s.mode,
        memoryNumber: s.memory_number,
        capturedAt:   s.captured_at,
        photoUrl:     data?.signedUrl ?? null,
      }
    })
  )

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      coupleNames: wedding.couple_names,
      weddingDate: wedding.wedding_date,
      photos:      photos.filter(p => p.photoUrl),
    }),
  }
}
