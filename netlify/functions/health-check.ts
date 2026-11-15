import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { evaluateDisplay, nextAction, sendAlertEmail, ago, type DisplayState } from '../lib/health'

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

// Runs every 10 minutes (see netlify.toml). For each live (Reverie Live) event whose
// display has ever checked in:
//   - works out whether the display is ok / offline / frozen (see lib/health.ts)
//   - on a change: logs a service event and emails you ONCE per incident, then sends a
//     "back online" notice, plus a reminder if it is still down a day later
// Also flags a spike of failed guest uploads. Only notable events are stored; routine
// traffic is never logged, so the table stays small (pruned at 90 days by cleanup).

const SPIKE_WINDOW_MS   = 60 * 60_000
const SPIKE_COUNT       = 5
const SPIKE_COOLDOWN_MS = 6 * 60 * 60_000

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const isBad = (s: DisplayState) => s === 'offline' || s === 'stalled'

export const handler: Handler = async () => {
  const now = Date.now()
  const summary = { checked: 0, alerts: 0, recoveries: 0, reminders: 0, spikes: 0 }

  const { data: rows, error } = await admin
    .from('weddings')
    .select('id, couple_names, slug, display_seen_at, display_advanced_at, display_state, display_alerted_at, display_monitor, display_hours_start, display_hours_end, event_timezone, slideshow_slow_poll')
    .eq('plan', 'live')
    .not('status', 'in', '("expired","archived")')

  if (error) {
    console.error('health-check: query failed', error.message)
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }

  const names = new Map<string, string>()

  for (const r of rows ?? []) {
    names.set(r.id, r.couple_names)
    try {
      const prev = ((r.display_state as DisplayState) ?? 'unknown')
      const seenAt = r.display_seen_at ? Date.parse(r.display_seen_at) : null
      const advancedAt = r.display_advanced_at ? Date.parse(r.display_advanced_at) : null
      const alertedAt = r.display_alerted_at ? Date.parse(r.display_alerted_at) : null

      const next = evaluateDisplay({
        seenAt, advancedAt,
        slowPoll: r.slideshow_slow_poll ?? false,
        monitor: r.display_monitor ?? true,
        hoursStart: r.display_hours_start, hoursEnd: r.display_hours_end,
        timezone: r.event_timezone,
      }, now)
      summary.checked++

      const action = nextAction(prev, next, alertedAt, now)
      // Outside business hours an open incident stays open; otherwise record the new state.
      const newState: DisplayState = next === 'closed' ? (isBad(prev) ? prev : 'closed') : next
      const update: Record<string, unknown> = {}
      if (newState !== prev) update.display_state = newState

      const name = esc(r.couple_names)
      const where = r.slug ? ` (${esc(r.slug)})` : ''
      const lastSeen = seenAt ? `${ago(now - seenAt)} ago` : 'never'

      if (action === 'alert' || action === 'remind') {
        const stalled = next === 'stalled'
        const subject = stalled
          ? `${r.couple_names}: display looks frozen`
          : `${r.couple_names}: display is offline`
        const lines = stalled
          ? [`<strong>${name}</strong>${where} is still checking in, but the slideshow has not changed slides for ${ago(now - (advancedAt ?? now))}. It is probably frozen.`,
             `Last check-in: ${lastSeen}.`,
             `Unplugging the Onn for a few seconds and plugging it back in usually fixes it.`]
          : [`<strong>${name}</strong>${where} has not checked in for ${ago(now - (seenAt ?? now))}.`,
             `That means the Onn is unplugged, offline, or the page is not running. It cannot tell us whether the TV itself is on.`,
             `Last check-in: ${lastSeen}.`]
        if (action === 'remind') lines.unshift('<strong>Reminder:</strong> this is still down after a day.')
        await sendAlertEmail(action === 'remind' ? `Still down: ${subject}` : subject, lines)
        update.display_alerted_at = new Date(now).toISOString()
        if (action === 'alert') {
          await admin.from('service_events').insert({
            wedding_id: r.id, kind: stalled ? 'display_stalled' : 'display_offline', severity: 'error', source: 'health-check',
            detail: stalled ? `Slideshow not advancing for ${ago(now - (advancedAt ?? now))}` : `No check-in for ${ago(now - (seenAt ?? now))}`,
            meta: { lastSeen: r.display_seen_at, lastAdvanced: r.display_advanced_at },
          })
          summary.alerts++
        } else summary.reminders++
      } else if (action === 'recover') {
        const downFor = alertedAt ? ago(now - alertedAt) : 'unknown time'
        await sendAlertEmail(`${r.couple_names}: display is back`, [`<strong>${name}</strong>${where} is checking in again and playing normally.`, `It was down for about ${downFor}.`])
        await admin.from('service_events').insert({
          wedding_id: r.id, kind: 'display_recovered', severity: 'info', source: 'health-check',
          detail: `Back online after about ${downFor}`,
        })
        summary.recoveries++
      }

      if (Object.keys(update).length > 0) await admin.from('weddings').update(update).eq('id', r.id)
    } catch (e) {
      console.error('health-check: failed for', r.id, e)
    }
  }

  // ── Upload-failure spike (the failure log fed by guest phones) ──
  try {
    const since = new Date(now - SPIKE_WINDOW_MS).toISOString()
    const { data: errs } = await admin.from('upload_errors').select('wedding_id').gte('created_at', since).limit(2000)
    const counts = new Map<string, number>()
    for (const e of errs ?? []) if (e.wedding_id) counts.set(e.wedding_id, (counts.get(e.wedding_id) ?? 0) + 1)

    for (const [weddingId, n] of counts) {
      if (n < SPIKE_COUNT) continue
      const cool = new Date(now - SPIKE_COOLDOWN_MS).toISOString()
      const { count } = await admin.from('service_events').select('id', { count: 'exact', head: true })
        .eq('wedding_id', weddingId).eq('kind', 'upload_spike').gte('created_at', cool)
      if ((count ?? 0) > 0) continue

      let name = names.get(weddingId)
      if (!name) {
        const { data: w } = await admin.from('weddings').select('couple_names').eq('id', weddingId).maybeSingle()
        name = w?.couple_names ?? weddingId
      }
      await admin.from('service_events').insert({
        wedding_id: weddingId, kind: 'upload_spike', severity: 'error', source: 'health-check',
        detail: `${n} guest photos failed to upload in the last hour`,
      })
      await sendAlertEmail(`${name}: guest uploads are failing`, [
        `<strong>${esc(name)}</strong> had ${n} failed photo uploads in the last hour.`,
        `The reasons are in the issue log on the service health page.`,
      ])
      summary.spikes++
    }
  } catch (e) {
    console.error('health-check: upload spike check failed', e)
  }

  return { statusCode: 200, body: JSON.stringify(summary) }
}
