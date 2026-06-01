import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// GET /api/couple/check?email=xxx
// Returns { exists: boolean } — no auth required, just checks if the email
// has a non-archived wedding so we can reject unknown emails before sending
// a magic link.
const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const email = event.queryStringParameters?.email?.trim().toLowerCase()
  if (!email) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exists: false }),
    }
  }

  const { data } = await supabase
    .from('weddings')
    .select('id')
    .eq('couple_email', email)
    .neq('status', 'archived')
    .limit(1)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exists: Array.isArray(data) && data.length > 0 }),
  }
}

export { handler }
