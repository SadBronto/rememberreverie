import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const DEFAULT_PHOTO_CAP = 500

// POST /api/webhooks/lemonsqueezy  — Lemon Squeezy calls this after a purchase.
//
// Turns a completed order into a `pending_setup` event and emails the buyer a
// link into the setup wizard. INERT until go-live: it does nothing unless the
// request carries a valid HMAC signature, which requires LEMONSQUEEZY_WEBHOOK_SECRET
// to be set AND Lemon Squeezy to be configured to call it. Nothing in the app links
// to a checkout, so there is no way to buy a service yet — this handler just sits
// ready. Finalize the variant→plan / add-on mapping when the LS products exist.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret) {
    // Not configured → refuse to act. Keeps provisioning dormant.
    console.warn('provision: LEMONSQUEEZY_WEBHOOK_SECRET not set; ignoring')
    return { statusCode: 503, body: 'Provisioning not configured' }
  }

  // The RAW body is required for signature verification (must match byte-for-byte).
  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : (event.body ?? '')

  const signature = event.headers['x-signature'] ?? event.headers['X-Signature'] ?? ''
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const sigBuf = Buffer.from(signature, 'utf8')
  const expBuf = Buffer.from(expected, 'utf8')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    console.warn('provision: invalid signature')
    return { statusCode: 401, body: 'Invalid signature' }
  }

  let payload: any
  try { payload = JSON.parse(rawBody) } catch { return { statusCode: 400, body: 'Invalid JSON' } }

  const eventName = payload?.meta?.event_name
  if (eventName !== 'order_created') {
    return { statusCode: 200, body: `Ignored event: ${eventName ?? 'unknown'}` }
  }

  const orderId = String(payload?.data?.id ?? '')
  const attrs   = payload?.data?.attributes ?? {}
  const email   = String(attrs.user_email ?? '').toLowerCase().trim()
  const custom  = payload?.meta?.custom_data ?? {}
  const item    = attrs.first_order_item ?? {}
  const variantName = String(item.variant_name ?? item.product_name ?? '')

  if (!orderId || !email) {
    console.error('provision: missing order id or email')
    return { statusCode: 400, body: 'Missing order id or email' }
  }

  // Idempotency — a re-delivered webhook must not create a second event.
  const { data: existing } = await admin
    .from('weddings')
    .select('id')
    .eq('ls_order_id', orderId)
    .maybeSingle()
  if (existing) return { statusCode: 200, body: 'Already provisioned' }

  // Map purchase → plan + add-ons (finalize when LS products/variants exist):
  //  - plan 'live' if the variant/product name mentions "live", else 'basic'
  //  - add-on flags from checkout custom_data
  const plan          = /live/i.test(variantName) ? 'live' : 'basic'
  const addonUnlimited = truthy(custom.unlimited)
  const addonGeofence  = truthy(custom.geofence)

  const { error: insErr } = await admin.from('weddings').insert({
    couple_names:    'TBD',
    couple_email:    email,
    status:          'pending_setup',
    is_event:        true,
    plan,
    addon_unlimited: addonUnlimited,
    addon_geofence:  addonGeofence,
    photo_cap:       addonUnlimited ? null : DEFAULT_PHOTO_CAP,
    ls_order_id:     orderId,
    order_amount:    typeof attrs.total === 'number' ? attrs.total : null,
    purchased_at:    new Date().toISOString(),
  })

  if (insErr) {
    // Unique-index violation = a duplicate we raced — treat as success.
    if ((insErr as { code?: string }).code === '23505') return { statusCode: 200, body: 'Already provisioned' }
    console.error('provision: insert failed', insErr)
    return { statusCode: 500, body: 'Provisioning failed' }
  }

  // Email the buyer a setup link — best-effort; never fail the webhook over email.
  try {
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Reverie <hello@rememberreverie.com>',
          to: [email],
          subject: 'Your Reverie is ready to set up',
          html: `
            <div style="background:#1a1612;color:#f5f0e8;font-family:Georgia,serif;padding:40px;max-width:520px;margin:0 auto;border-radius:12px">
              <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#c8a882;margin:0 0 8px">Remember Reverie</p>
              <h1 style="font-size:22px;font-weight:normal;margin:0 0 24px">Your Reverie is ready</h1>
              <p style="color:#b0a898;font-size:14px;line-height:1.6;margin:0 0 16px">
                Thank you! Set up your event — add your names, date, and the look you want — and you'll get a QR code to share with your guests.
              </p>
              <a href="https://rememberreverie.com/host/login" style="display:inline-block;background:#f5f0e8;color:#1a1612;padding:14px 28px;border-radius:100px;font-family:sans-serif;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none">
                Set up your event
              </a>
              <p style="color:#4a4440;font-size:11px;margin:32px 0 0">
                Sign in with this email address (${email}). RememberReverie.com
              </p>
            </div>
          `,
        }),
      })
    }
  } catch (err) {
    console.error('provision: setup email failed', err)
  }

  console.log(`provision: created event for order ${orderId} (${email}, plan=${plan})`)
  return { statusCode: 200, body: 'Provisioned' }
}

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'yes'
}
