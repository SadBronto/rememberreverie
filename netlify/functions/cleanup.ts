import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { deletePhotos } from '../lib/storage'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Runs daily at 3 AM UTC.
//
// RETENTION (unified across weddings + events): every active project has an
// effective deletion date — retention_until, else capture_end + 90d, else the
// legacy (event_end_date | wedding_date) + 90d fallback.
//   - 7 days before: send warning email to couple_email, set cleanup_warning_sent=true.
//   - On/after that date: delete photos AND release the slug, then expire the project.
//
// ALL PROJECTS with a photo_cap: send a warning email at 80% capacity.
//   - cap_warning_sent resets to false when admin changes photo_cap, so it re-fires after an increase.
export const handler: Handler = async () => {
  const todayMs = Date.now()
  const warnMs  = todayMs + 7 * 24 * 60 * 60 * 1000  // warn 7 days before deletion

  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
  // DATE columns ('YYYY-MM-DD') are parsed at local noon to avoid TZ edge slips.
  const parseDate = (s: string | null) => (s ? new Date(s + 'T12:00:00') : null)

  // ── Unified retention ─────────────────────────────────────────
  // Effective deletion date for every active project, in priority order:
  //   1. retention_until   — explicit override (e.g. the "Keep" add-on)
  //   2. capture_end + 90  — v2 events with a capture window
  //   3. (event_end_date | wedding_date) + 90 — legacy fallback
  // On/after that date: photos deleted AND slug released. 7 days before: one
  // warning email (cleanup_warning_sent guards against repeats).
  const { data: rows, error: rErr } = await admin
    .from('weddings')
    .select('id, couple_names, couple_email, is_event, wedding_date, event_end_date, capture_end, retention_until, cleanup_warning_sent')
    .not('status', 'in', '("expired","archived")')

  if (rErr) {
    console.error('cleanup: failed to query weddings', rErr)
    return { statusCode: 500, body: 'Query failed' }
  }

  const effectiveRetention = (r: {
    is_event: boolean | null
    wedding_date: string | null
    event_end_date: string | null
    capture_end: string | null
    retention_until: string | null
  }): Date | null => {
    if (r.retention_until) return parseDate(r.retention_until)
    if (r.capture_end)     return addDays(parseDate(r.capture_end)!, 90)
    if (r.is_event && r.event_end_date) return addDays(parseDate(r.event_end_date)!, 90)
    if (!r.is_event && r.wedding_date)  return addDays(parseDate(r.wedding_date)!, 90)
    return null
  }

  type WarnItem = { id: string; couple_names: string; couple_email: string | null; deleteDate: Date }
  const toWarn: WarnItem[] = []
  const toDelete: { id: string; couple_names: string }[] = []

  for (const r of rows ?? []) {
    const ret = effectiveRetention(r)
    if (!ret) continue
    const retMs = ret.getTime()
    if (retMs <= todayMs) {
      toDelete.push({ id: r.id, couple_names: r.couple_names })
    } else if (!r.cleanup_warning_sent && retMs <= warnMs) {
      toWarn.push({ id: r.id, couple_names: r.couple_names, couple_email: r.couple_email, deleteDate: ret })
    }
  }

  // ── Send warning emails ───────────────────────────────────────
  for (const item of toWarn) {
    try {
      if (!item.couple_email) continue

      const endFormatted = item.deleteDate
        .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Reverie <hello@rememberreverie.com>',
          to: [item.couple_email],
          subject: 'Your Reverie photos will be deleted soon',
          html: `
            <div style="background:#1a1612;color:#f5f0e8;font-family:Georgia,serif;padding:40px;max-width:520px;margin:0 auto;border-radius:12px">
              <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#c8a882;margin:0 0 8px">Remember Reverie</p>
              <h1 style="font-size:22px;font-weight:normal;margin:0 0 24px">Your photos expire in 7 days</h1>
              <p style="color:#b0a898;font-size:14px;line-height:1.6;margin:0 0 16px">
                The photos for <strong style="color:#f5f0e8">${item.couple_names}</strong> are scheduled for deletion on <strong style="color:#f5f0e8">${endFormatted}</strong>.
              </p>
              <p style="color:#b0a898;font-size:14px;line-height:1.6;margin:0 0 32px">
                Sign in to your gallery to download all photos before they're permanently removed.
              </p>
              <a href="https://rememberreverie.com/couple/login" style="display:inline-block;background:#f5f0e8;color:#1a1612;padding:14px 28px;border-radius:100px;font-family:sans-serif;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none">
                Sign In & Download
              </a>
              <p style="color:#4a4440;font-size:11px;margin:32px 0 0">
                RememberReverie.com
              </p>
            </div>
          `,
        }),
      })

      await admin
        .from('weddings')
        .update({ cleanup_warning_sent: true })
        .eq('id', item.id)

      console.log(`cleanup: warning email sent for ${item.id} (${item.couple_names})`)
    } catch (err) {
      console.error(`cleanup: failed to send warning for ${item.id}`, err)
    }
  }

  // ── Delete expired projects (photos + slug) ───────────────────
  let cleaned = 0
  const errors: string[] = []

  for (const project of toDelete) {
    try {
      const { data: sessions } = await admin
        .from('sessions')
        .select('id, output_path, annotation_path')
        .eq('wedding_id', project.id)
        .neq('status', 'deleted')

      const paths: string[] = []
      for (const s of sessions ?? []) {
        if (s.output_path)     paths.push(s.output_path)
        if (s.annotation_path) paths.push(s.annotation_path)
      }

      await deletePhotos(paths)

      if ((sessions ?? []).length > 0) {
        await admin.from('sessions').update({ status: 'deleted' }).eq('wedding_id', project.id).neq('status', 'deleted')
      }

      // Expire AND release the slug — the unique index ignores status, so nulling
      // the slug frees it for reuse (matches the admin archive behavior).
      await admin.from('weddings').update({ status: 'expired', slug: null }).eq('id', project.id)

      console.log(`cleanup: expired ${project.id} (${project.couple_names})`)
      cleaned++
    } catch (err) {
      console.error(`cleanup: unhandled error for ${project.id}`, err)
      errors.push(project.id)
    }
  }

  // ── Photo cap: 80% warning ────────────────────────────────────
  // Runs for all active projects with a photo_cap set and cap_warning_sent=false.
  const { data: cappedProjects } = await admin
    .from('weddings')
    .select('id, couple_names, couple_email, photo_cap')
    .not('photo_cap', 'is', null)
    .eq('cap_warning_sent', false)
    .not('status', 'in', '("expired","archived")')

  let capWarned = 0

  for (const project of cappedProjects ?? []) {
    try {
      // Count active (non-deleted) sessions
      const { count } = await admin
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('wedding_id', project.id)
        .neq('status', 'deleted')

      const used = count ?? 0
      const cap  = project.photo_cap as number
      if (used < cap * 0.8) continue  // not at 80% yet

      if (!project.couple_email) continue

      const pct = Math.round((used / cap) * 100)

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Reverie <hello@rememberreverie.com>',
          to:   [project.couple_email],
          subject: `You're at ${pct}% of your photo limit`,
          html: `
            <div style="background:#1a1612;color:#f5f0e8;font-family:Georgia,serif;padding:40px;max-width:520px;margin:0 auto;border-radius:12px">
              <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#c8a882;margin:0 0 8px">Remember Reverie</p>
              <h1 style="font-size:22px;font-weight:normal;margin:0 0 24px">You're ${pct}% full</h1>
              <p style="color:#b0a898;font-size:14px;line-height:1.6;margin:0 0 8px">
                <strong style="color:#f5f0e8">${project.couple_names}</strong> has used <strong style="color:#f5f0e8">${used} of ${cap} photos</strong>.
              </p>
              <p style="color:#b0a898;font-size:14px;line-height:1.6;margin:0 0 32px">
                Once you hit ${cap}, the earliest photos will automatically be removed to make room for new ones. Sign in to download your memories now, or reply to this email to increase your limit.
              </p>
              <a href="https://rememberreverie.com/couple/login" style="display:inline-block;background:#f5f0e8;color:#1a1612;padding:14px 28px;border-radius:100px;font-family:sans-serif;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none">
                View Your Gallery
              </a>
              <p style="color:#4a4440;font-size:11px;margin:32px 0 0">RememberReverie.com</p>
            </div>
          `,
        }),
      })

      await admin
        .from('weddings')
        .update({ cap_warning_sent: true })
        .eq('id', project.id)

      console.log(`cleanup: cap warning sent for ${project.id} (${used}/${cap})`)
      capWarned++
    } catch (err) {
      console.error(`cleanup: cap warning failed for ${project.id}`, err)
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ cleaned, warned: toWarn.length, capWarned, errors }),
  }
}
