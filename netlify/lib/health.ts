// Display-health logic, kept pure (no database, no network) so it can be tested.
// Used by the scheduled health-check function.

export type DisplayState = 'unknown' | 'ok' | 'offline' | 'stalled' | 'closed'

export interface DisplayInfo {
  seenAt: number | null       // last time the display checked in (ms)
  advancedAt: number | null   // last time it changed slides (ms)
  slowPoll: boolean
  monitor: boolean
  hoursStart: string | null   // 'HH:MM' in the event timezone; null = 24/7
  hoursEnd: string | null
  timezone: string | null
}

// A display that has been silent this long is considered offline. Generous on purpose:
// the slow poll is every 5 minutes, so 15 minutes means about three missed check-ins.
export const OFFLINE_AFTER_MS = 15 * 60_000
// Checking in but not changing slides this long means the show is frozen.
export const STALL_AFTER_MS = 15 * 60_000
// A display that is still down this long after we alerted gets a reminder.
export const REMIND_AFTER_MS = 24 * 60 * 60_000

const DEFAULT_TZ = 'America/Los_Angeles'

function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

// Minutes since local midnight in the given timezone.
function localMinutes(now: number, tz: string | null): number {
  const zone = tz || DEFAULT_TZ
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now))
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now))
  }
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return (h % 24) * 60 + m
}

// Is "now" inside the venue's monitored hours? With no (or invalid) hours the display is
// monitored around the clock. Also reports how long ago today's window opened, so a
// display that was switched off overnight gets a grace period after opening time.
export function monitoredWindow(
  now: number, start: string | null, end: string | null, tz: string | null,
): { inside: boolean; sinceOpenMin: number | null } {
  const s = toMinutes(start), e = toMinutes(end)
  if (s === null || e === null || s === e) return { inside: true, sinceOpenMin: null }
  const m = localMinutes(now, tz)
  const inside = s < e ? (m >= s && m < e) : (m >= s || m < e)
  if (!inside) return { inside: false, sinceOpenMin: null }
  const since = m >= s ? m - s : m + 1440 - s
  return { inside: true, sinceOpenMin: since }
}

export function evaluateDisplay(d: DisplayInfo, now: number): DisplayState {
  if (!d.monitor) return 'unknown'
  if (d.seenAt == null) return 'unknown'

  const win = monitoredWindow(now, d.hoursStart, d.hoursEnd, d.timezone)
  if (!win.inside) return 'closed'

  // Silence is measured from the last check-in, but never longer than the time since
  // opening, so a display switched off overnight isn't flagged the instant the doors open.
  const sinceOpenMs = win.sinceOpenMin !== null ? win.sinceOpenMin * 60_000 : Infinity
  const silent = Math.min(now - d.seenAt, sinceOpenMs)
  if (silent > OFFLINE_AFTER_MS) return 'offline'

  // Same grace for a frozen show: last night's final slide change doesn't count against it.
  if (d.advancedAt != null && Math.min(now - d.advancedAt, sinceOpenMs) > STALL_AFTER_MS) return 'stalled'
  return 'ok'
}

export type Action = 'alert' | 'recover' | 'remind' | 'none'

const isBad = (s: DisplayState) => s === 'offline' || s === 'stalled'

// What to do when a display's state goes from `prev` to `next`.
export function nextAction(
  prev: DisplayState, next: DisplayState, alertedAt: number | null, now: number,
): Action {
  if (next === 'closed') return 'none'            // outside hours: leave any open incident as is
  if (isBad(next) && !isBad(prev)) return 'alert'
  if (isBad(next) && isBad(prev) && prev !== next) return 'alert'
  if (isBad(next) && isBad(prev) && alertedAt != null && now - alertedAt > REMIND_AFTER_MS) return 'remind'
  if (!isBad(next) && isBad(prev)) return 'recover'
  return 'none'
}

export function ago(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'under a minute'
  if (m < 90) return `${m} min`
  const h = m / 60
  if (h < 48) return `${h.toFixed(1)} hours`
  return `${(h / 24).toFixed(1)} days`
}

// Alert recipients: ALERT_EMAIL if set, otherwise the platform admins.
export function alertRecipients(): string[] {
  const raw = process.env.ALERT_EMAIL || process.env.ADMIN_EMAILS || ''
  return raw.split(',').map(e => e.trim()).filter(Boolean)
}

export async function sendAlertEmail(subject: string, bodyLines: string[]): Promise<boolean> {
  const to = alertRecipients()
  const key = process.env.RESEND_API_KEY
  if (to.length === 0 || !key) return false
  const html = `
    <div style="background:#1a1612;color:#f5f0e8;font-family:Georgia,serif;padding:32px;max-width:520px;margin:0 auto;border-radius:12px">
      <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#c8a882;margin:0 0 8px">Reverie Alerts</p>
      <h1 style="font-size:20px;font-weight:normal;margin:0 0 20px">${subject}</h1>
      ${bodyLines.map(l => `<p style="color:#b0a898;font-size:14px;line-height:1.6;margin:0 0 10px">${l}</p>`).join('')}
      <p style="margin:24px 0 0"><a href="https://rememberreverie.com/admin/health" style="display:inline-block;background:#f5f0e8;color:#1a1612;padding:12px 24px;border-radius:100px;font-family:sans-serif;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none">Open service health</a></p>
    </div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: 'Reverie Alerts <hello@rememberreverie.com>', to, subject, html }),
    })
    return res.ok
  } catch {
    return false
  }
}
