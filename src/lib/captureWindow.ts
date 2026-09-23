import type { WeddingConfig } from '@/types/session'

export type CaptureWindowStatus = 'open' | 'before' | 'ended' | 'none'

// Today's calendar date ('YYYY-MM-DD') in a given IANA timezone.
function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Whether guests may capture right now, based on the event's capture window.
//
// Fail-open by design: with no end date set, or an invalid timezone, we return
// 'none' (ungated) so a config glitch can never wrongly lock out a live event.
// Dates are plain calendar days interpreted in the event's timezone (falling
// back to the guest's local timezone when none is stored). Comparison is on the
// 'YYYY-MM-DD' string, which sorts chronologically.
export function captureWindowStatus(
  config: Pick<WeddingConfig, 'captureStart' | 'captureEnd' | 'eventTimezone'> | null | undefined,
): CaptureWindowStatus {
  if (!config?.captureEnd) return 'none'

  const tz =
    config.eventTimezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC'

  let today: string
  try {
    today = todayInTz(tz)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 'none'
  } catch {
    return 'none'
  }

  if (config.captureStart && today < config.captureStart) return 'before'
  if (today > config.captureEnd) return 'ended'
  return 'open'
}

// Pretty calendar date for guest-facing copy, e.g. "June 14, 2026".
export function formatWindowDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
