import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/slug?slug=corey-and-sarah
// Returns { weddingId } or 404. LandingPage handles status checks once redirected.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }

  const slug = event.queryStringParameters?.slug?.trim().toLowerCase()
  if (!slug) return { statusCode: 400, body: 'Missing slug' }

  const { data, error } = await db
    .from('weddings')
    .select('id')
    .eq('slug', slug)
    .single()

  if (error || !data) return { statusCode: 404, body: 'Not found' }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weddingId: data.id }),
  }
}
