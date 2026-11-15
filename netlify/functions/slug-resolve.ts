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

  // maybeSingle: "no such slug" is data=null (404), but a database error is a 500, so a
  // momentary hiccup is never mistaken for "this slideshow doesn't exist" (the kiosk
  // retries on 5xx but treats 404 as a configuration problem).
  const { data, error } = await db
    .from('weddings')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (error) return { statusCode: 500, body: 'Lookup failed' }
  if (!data) return { statusCode: 404, body: 'Not found' }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weddingId: data.id }),
  }
}
