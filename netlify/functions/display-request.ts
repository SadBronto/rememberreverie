import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/display-request {weddingId, displayId}
// Public (no login): someone standing at a private screen who is NOT the account owner
// asks us to email the owner an approval link. The link opens /host/approve, where the
// owner signs in and approves that one screen from anywhere. Limited to one email per
// event every 5 minutes, and the owner's address is never returned in full.
function json(obj: unknown, statusCode = 200) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

function mask(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return '***'
  return `${name.slice(0, 1)}***@${domain}`
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  let body: { weddingId?: string; displayId?: string }
  try { body = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }
  const weddingId = body.weddingId ?? ''
  const displayId = (body.displayId ?? '').slice(0, 64)
  if (!weddingId || !/^[A-Za-z0-9-]{8,64}$/.test(displayId)) return { statusCode: 400, body: 'Bad request' }

  const { data: wedding } = await admin
    .from('weddings').select('couple_email, couple_names, slideshow_private').eq('id', weddingId).single()
  if (!wedding || !wedding.slideshow_private || !wedding.couple_email) {
    return json({ ok: false, reason: 'no-owner' })
  }

  const since = new Date(Date.now() - 5 * 60_000).toISOString()
  const { count } = await admin
    .from('display_requests').select('display_id', { count: 'exact', head: true })
    .eq('wedding_id', weddingId).gte('requested_at', since)
  if ((count ?? 0) > 0) return json({ ok: true, throttled: true, sentTo: mask(wedding.couple_email) })

  await admin.from('display_requests').upsert(
    { wedding_id: weddingId, display_id: displayId, requested_at: new Date().toISOString() },
    { onConflict: 'wedding_id,display_id' },
  )

  const link = `https://rememberreverie.com/host/approve?w=${encodeURIComponent(weddingId)}&d=${encodeURIComponent(displayId)}`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Remember Reverie <hello@rememberreverie.com>',
      to: [wedding.couple_email],
      subject: 'Someone is asking to start your private slideshow',
      html: `<div style="font-family:Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#1a1612">
        <h2 style="font-weight:600">A screen is waiting for your approval</h2>
        <p>Someone at <strong>${String(wedding.couple_names).replace(/</g, '&lt;')}</strong> asked to start your private slideshow on a screen, and your sign-in is needed to allow it.</p>
        <p><a href="${link}" style="display:inline-block;background:#1a1612;color:#fff;padding:12px 22px;border-radius:24px;text-decoration:none">Review and approve</a></p>
        <p style="color:#666;font-size:13px">If you were not expecting this, ignore this email and the screen stays locked.</p>
      </div>`,
    }),
  })
  if (!res.ok) {
    console.error('display-request email failed:', await res.text())
    return json({ ok: false, reason: 'email-failed' }, 500)
  }
  return json({ ok: true, sentTo: mask(wedding.couple_email) })
}
