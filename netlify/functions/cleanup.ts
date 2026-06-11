import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { deletePhotos } from '../lib/storage'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Runs daily at 3 AM UTC.
//
// WEDDINGS: delete photos for any wedding whose wedding_date was > 90 days ago.
//
// EVENTS (is_event=true): use event_end_date instead of wedding_date.
//   - 7 days before event_end_date: send warning email to couple_email, set cleanup_warning_sent=true.
//   - On/after event_end_date: delete photos and expire the project.
//
// ALL PROJECTS with a photo_cap: send a warning email at 80% capacity.
//   - cap_warning_sent resets to false when admin changes photo_cap, so it re-fires after an increase.
export const handler: Handler = async () => {
  const today = new Date()

  // ── Weddings: 90-day rule (unchanged) ────────────────────────
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffDate = cutoff.toISOString().slice(0, 10)

  const { data: weddingsToClean, error: wErr } = await admin
    .from('weddings')
    .select('id, couple_names, wedding_date')
    .eq('is_event', false)
    .lt('wedding_date', cutoffDate)
    .not('status', 'in', '("expired","archived")')

  if (wErr) {
    console.error('cleanup: failed to query weddings', wErr)
    return { statusCode: 500, body: 'Query failed' }
  }

  // ── Events: warning + expiry based on event_end_date ─────────
  const { data: allEvents } = await admin
    .from('weddings')
    .select('id, couple_names, couple_email, event_end_date, cleanup_warning_sent')
    .eq('is_event', true)
    .not('status', 'in', '("expired","archived")')
    .not('event_end_date', 'is', null)

  const warnDate = new Date(today)
  warnDate.setDate(warnDate.getDate() + 7)  // warn when end_date is within 7 days

  const eventsToWarn  = (allEvents ?? []).filter(e => {
    if (e.cleanup_warning_sent) return false
    const end = new Date(e.event_end_date + 'T12:00:00')
    return end > today && end <= warnDate
  })

  const eventsToClean = (allEvents ?? []).filter(e => {
    const end = new Date(e.event_end_date + 'T12:00:00')
    return end <= today
  })

  // ── Send warning emails ───────────────────────────────────────
  for (const event of eventsToWarn) {
    try {
      if (!event.couple_email) continue

      const endFormatted = new Date(event.event_end_date + 'T12:00:00')
        .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Reverie <hello@rememberreverie.com>',
          to: [event.couple_email],
          subject: 'Your Reverie photos will be deleted soon',
          html: `
            <div style="background:#1a1612;color:#f5f0e8;font-family:Georgia,serif;padding:40px;max-width:520px;margin:0 auto;border-radius:12px">
              <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#c8a882;margin:0 0 8px">Remember Reverie</p>
              <h1 style="font-size:22px;font-weight:normal;margin:0 0 24px">Your photos expire in 7 days</h1>
              <p style="color:#b0a898;font-size:14px;line-height:1.6;margin:0 0 16px">
                The photos for <strong style="color:#f5f0e8">${event.couple_names}</strong> are scheduled for deletion on <strong style="color:#f5f0e8">${endFormatted}</strong>.
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
        .eq('id', event.id)

      console.log(`cleanup: warning email sent for event ${event.id} (${event.couple_names})`)
    } catch (err) {
      console.error(`cleanup: failed to send warning for ${event.id}`, err)
    }
  }

  // ── Delete expired projects (weddings + events) ───────────────
  const toDelete = [...(weddingsToClean ?? []), ...eventsToClean]

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

      await admin.from('weddings').update({ status: 'expired' }).eq('id', project.id)

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
    body: JSON.stringify({ cleaned, warned: eventsToWarn.length, capWarned, errors }),
  }
}
