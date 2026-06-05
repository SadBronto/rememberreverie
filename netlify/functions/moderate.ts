import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const VISION_KEY = process.env.GOOGLE_VISION_API_KEY

// Google's SafeSearch likelihood ladder, weakest → strongest
const LIKELIHOOD = ['UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY']
const atLeast = (level: string, threshold: string) =>
  LIKELIHOOD.indexOf(level) >= LIKELIHOOD.indexOf(threshold)

// POST /api/moderate  { sessionId }
//
// Runs Google Vision SafeSearch on the uploaded photo. If it reads as actually
// explicit, the session is set to 'flagged' — which removes it from the slideshow
// and couple gallery and surfaces it for admin review.
//
// Thresholds are deliberately conservative so we don't hide innocent wedding
// photos (a low-cut dress or a dance-floor dip should NOT vanish). 'racy' alone
// only flags at VERY_LIKELY (Vision's top confidence bucket).
//
// Fail-OPEN: any error (no key, download fail, Vision down) leaves the photo
// visible. Losing a real memory to an API hiccup is worse than a rare miss, and
// the admin can always hide manually.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  if (!VISION_KEY) return { statusCode: 200, body: JSON.stringify({ skipped: 'no-key' }) }

  let body: { sessionId?: string }
  try { body = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }
  const sessionId = body.sessionId
  if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' }

  const { data: session } = await admin
    .from('sessions')
    .select('id, output_path, status')
    .eq('id', sessionId)
    .single()

  if (!session?.output_path || session.status === 'deleted') {
    return { statusCode: 200, body: JSON.stringify({ skipped: 'no-photo' }) }
  }

  // Download the photo with the service role, send it to Vision as base64.
  const { data: blob, error: dlErr } = await admin.storage.from('photos').download(session.output_path)
  if (dlErr || !blob) {
    console.error('moderate: download failed', dlErr)
    return { statusCode: 200, body: JSON.stringify({ moderated: false, error: 'download' }) }
  }
  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')

  let safe: Record<string, string> | null = null
  try {
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: base64 }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }],
      }),
    })
    const json = await res.json()
    safe = json?.responses?.[0]?.safeSearchAnnotation ?? null
  } catch (e) {
    console.error('moderate: vision call failed', e)
    return { statusCode: 200, body: JSON.stringify({ moderated: false, error: 'vision' }) }
  }
  if (!safe) return { statusCode: 200, body: JSON.stringify({ moderated: false }) }

  const adult    = safe.adult    ?? 'UNKNOWN'
  const violence = safe.violence ?? 'UNKNOWN'
  const racy     = safe.racy     ?? 'UNKNOWN'

  // Hide only clear cases. Tune here if you want stricter/looser.
  const flagged =
    atLeast(adult, 'LIKELY') ||
    atLeast(racy, 'VERY_LIKELY') ||
    atLeast(violence, 'VERY_LIKELY')

  if (flagged) {
    await admin
      .from('sessions')
      .update({ status: 'flagged', moderation_labels: JSON.stringify({ adult, violence, racy }) })
      .eq('id', sessionId)
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moderated: true, flagged, labels: { adult, violence, racy } }),
  }
}
