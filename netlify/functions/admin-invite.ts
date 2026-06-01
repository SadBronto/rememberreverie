import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SITE_URL = process.env.SITE_URL ?? 'https://rememberreverie.com'

async function verifyAdmin(authHeader: string | undefined) {
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user?.email) return null
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  return adminEmails.includes(user.email.toLowerCase()) ? user : null
}

function buildEmailHtml(link: string, isPendingSetup: boolean, coupleNames?: string | null) {
  const greeting = coupleNames ? `Hi ${coupleNames},` : 'Hello,'

  const heading = isPendingSetup
    ? 'Your gallery<br>is ready to set up.'
    : 'Access your gallery.'

  const body = isPendingSetup
    ? 'Personalize your experience — choose your camera styles, timestamp, and welcome message for your guests.'
    : 'Click below to view your photos and manage your gallery.'

  const cta = isPendingSetup ? 'Set Up Your Gallery →' : 'Open My Gallery →'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f5f0e8;">
  <div style="max-width:480px;margin:0 auto;padding:56px 36px 64px;">

    <p style="margin:0 0 44px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#8a7a6a;">
      Remember Reverie
    </p>

    <p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#5a4a3a;line-height:1.5;">
      ${greeting}
    </p>

    <h1 style="margin:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;color:#1a1612;line-height:1.35;">
      ${heading}
    </h1>

    <p style="margin:0 0 40px 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#5a4a3a;line-height:1.8;">
      ${body}
    </p>

    <a href="${link}"
       style="display:inline-block;background-color:#1a1612;color:#f5f0e8;text-decoration:none;padding:17px 38px;border-radius:100px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">
      ${cta}
    </a>

    <p style="margin:44px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#8a7a6a;line-height:1.8;">
      This link expires in 1 hour. If you weren't expecting this email, you can safely ignore it.
    </p>

  </div>
</body>
</html>`
}

// POST /api/admin/invite
// Body: { weddingId: string }
// Generates a magic link for the couple and emails it directly via Resend.
// Returns { sent: true, email: string } — the link itself is never exposed to the admin.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const user = await verifyAdmin(event.headers.authorization)
  if (!user) return { statusCode: 401, body: 'Unauthorized' }

  let body: { weddingId: string }
  try { body = JSON.parse(event.body ?? '{}') } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { weddingId } = body
  if (!weddingId) return { statusCode: 400, body: 'Missing weddingId' }

  const { data: wedding } = await admin
    .from('weddings')
    .select('couple_email, couple_names, status')
    .eq('id', weddingId)
    .single()

  if (!wedding?.couple_email) {
    return { statusCode: 400, body: 'No couple_email set on this wedding' }
  }

  // Generate a magic link server-side
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: wedding.couple_email,
    options: { redirectTo: `${SITE_URL}/auth/callback` },
  })

  if (error || !data?.properties?.action_link) {
    console.error('generateLink error:', error)
    return { statusCode: 500, body: 'Failed to generate link' }
  }

  // Email it directly via Resend — admin never sees the raw URL
  const isPendingSetup = wedding.status === 'pending_setup'
  const subject = isPendingSetup
    ? 'Set up your gallery — Remember Reverie'
    : 'Your Remember Reverie login link'

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Remember Reverie <hello@rememberreverie.com>',
      to:   [wedding.couple_email],
      subject,
      html: buildEmailHtml(data.properties.action_link, isPendingSetup, wedding.couple_names),
    }),
  })

  if (!emailRes.ok) {
    const errText = await emailRes.text()
    console.error('Resend error:', errText)
    return { statusCode: 500, body: 'Failed to send email' }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sent: true, email: wedding.couple_email }),
  }
}
