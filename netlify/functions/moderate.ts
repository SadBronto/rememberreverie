import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getPhotoUrls } from '../lib/storage'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const VISION_KEY = process.env.GOOGLE_VISION_API_KEY

// Global daily ceiling on Vision calls — an app-level hard backstop against runaway
// cost, on TOP of the Google Cloud budget alert + API quota. SafeSearch is ~$1.50 /
// 1,000, so 3,000/day ≈ $4.50/day worst case even under abuse.
const DAILY_VISION_CAP = 3000

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
// Reverie Live only: moderation is a paid-tier feature, so it runs solely for
// plan='live' events. That also confines the per-image Vision cost to events that
// paid for it.
//
// Thresholds are deliberately conservative so we don't hide innocent photos (a
// low-cut dress or a dance-floor dip should NOT vanish). 'racy' alone only flags at
// VERY_LIKELY (Vision's top confidence bucket).
//
// Fail-OPEN: any error (no key, fetch fail, Vision down) leaves the photo visible.
// Losing a real memory to an API hiccup is worse than a rare miss, and the admin
// can always hide manually.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  if (!VISION_KEY) return { statusCode: 200, body: JSON.stringify({ skipped: 'no-key' }) }

  let body: { sessionId?: string }
  try { body = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }
  const sessionId = body.sessionId
  if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' }

  const { data: session } = await admin
    .from('sessions')
    .select('id, output_path, status, wedding_id')
    .eq('id', sessionId)
    .single()

  if (!session?.output_path || session.status === 'deleted') {
    return { statusCode: 200, body: JSON.stringify({ skipped: 'no-photo' }) }
  }

  // Reverie Live only — skip moderation (and its cost) for basic-plan events.
  const { data: wedding } = await admin
    .from('weddings')
    .select('plan')
    .eq('id', session.wedding_id)
    .single()
  if ((wedding?.plan ?? 'basic') !== 'live') {
    return { statusCode: 200, body: JSON.stringify({ skipped: 'not-live' }) }
  }

  // Global daily Vision ceiling — cost backstop (counts photos already moderated today).
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .gte('moderated_at', startOfDay.toISOString())
  if ((count ?? 0) >= DAILY_VISION_CAP) {
    console.warn('moderate: daily Vision cap reached, skipping', { cap: DAILY_VISION_CAP })
    return { statusCode: 200, body: JSON.stringify({ skipped: 'daily-cap' }) }
  }

  // Resolve the photo URL from the active store (R2 public CDN or Supabase signed).
  // Vision fetches it directly by URI — this replaces the old Supabase-only download
  // that broke silently once photos moved to R2.
  const urls = await getPhotoUrls([session.output_path])
  const imageUri = urls.get(session.output_path)
  if (!imageUri) {
    console.error('moderate: could not resolve photo URL')
    return { statusCode: 200, body: JSON.stringify({ moderated: false, error: 'no-url' }) }
  }

  // Mark it moderated up front so concurrent uploads count toward the daily cap.
  await admin.from('sessions').update({ moderated_at: new Date().toISOString() }).eq('id', sessionId)

  let safe: Record<string, string> | null = null
  try {
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { source: { imageUri } }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }],
      }),
    })
    if (!res.ok) console.error('moderate: vision HTTP error', res.status)
    const json = await res.json()
    if (json?.error) console.error('moderate: vision API error', JSON.stringify(json.error))
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
    const { error: flagErr } = await admin
      .from('sessions')
      .update({ status: 'flagged', moderation_labels: JSON.stringify({ adult, violence, racy }) })
      .eq('id', sessionId)
    if (flagErr) {
      // Fallback: if the flagged status/labels column isn't available, still remove
      // the explicit photo from the slideshow + gallery by hiding it.
      console.error('moderate: flagged update failed, falling back to hidden', flagErr)
      await admin.from('sessions').update({ status: 'hidden' }).eq('id', sessionId)
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moderated: true, flagged, labels: { adult, violence, racy } }),
  }
}
