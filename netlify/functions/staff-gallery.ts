import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getPhotoUrls } from '../lib/storage'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/staff/gallery?slug=moose[&offset=0]
// Header: x-staff-code: <the event's staff_code>
//
// Password-only moderation view for on-site staff. Returns the photos currently
// LIVE on the slideshow (status 'active'), newest first, so staff can pull anything
// the auto-filter missed. No login; scoped to one event; read-only here (removal is
// the sibling staff-session function). The staff_code is a per-event shared password
// set by the admin — if it's unset, the staff page is simply unavailable.
const PAGE = 60

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }

  const slug = event.queryStringParameters?.slug?.trim().toLowerCase()
  const weddingIdParam = event.queryStringParameters?.weddingId
  const code = event.headers['x-staff-code']
  const offset = Math.max(0, parseInt(event.queryStringParameters?.offset ?? '0', 10) || 0)

  if (!slug && !weddingIdParam) return { statusCode: 400, body: 'Missing slug' }
  if (!code) return { statusCode: 401, body: 'Missing staff code' }

  const base = admin.from('weddings').select('id, couple_names, staff_code')
  const { data: wedding } = weddingIdParam
    ? await base.eq('id', weddingIdParam).single()
    : await base.eq('slug', slug!).single()

  if (!wedding) return { statusCode: 404, body: 'Not found' }
  if (!wedding.staff_code || wedding.staff_code !== code) {
    return { statusCode: 401, body: 'Incorrect code' }
  }

  const { data: sessions, error } = await admin
    .from('sessions')
    .select('id, mode, memory_number, captured_at, output_path, annotation_path')
    .eq('wedding_id', wedding.id)
    .eq('status', 'active')
    .not('output_path', 'is', null)
    .order('captured_at', { ascending: false })
    .range(offset, offset + PAGE - 1)

  if (error) return { statusCode: 500, body: 'Failed to fetch photos' }

  const urlMap = await getPhotoUrls(
    (sessions ?? []).flatMap(s => [s.output_path, s.annotation_path].filter(Boolean) as string[]),
    3600,
  )

  const photos = (sessions ?? []).map(s => ({
    id:            s.id,
    mode:          s.mode,
    memoryNumber:  s.memory_number,
    capturedAt:    s.captured_at,
    photoUrl:      s.output_path     ? urlMap.get(s.output_path)     ?? null : null,
    annotationUrl: s.annotation_path ? urlMap.get(s.annotation_path) ?? null : null,
  })).filter(p => p.photoUrl)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      weddingId:  wedding.id,
      eventName:  wedding.couple_names,
      photos,
      hasMore:    (sessions ?? []).length === PAGE,
      nextOffset: offset + (sessions ?? []).length,
    }),
  }
}
