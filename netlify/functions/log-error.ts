import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

// POST /api/log-error
// Fire-and-forget telemetry from browsers. Unauthenticated on purpose (a crashed or
// failing page can't be expected to sign in), best-effort, and bounded: only a handful
// of short fields are stored, and a per-kind hourly cap stops a runaway page from
// filling the table. Reviewed on the admin service-health page.
//
// Two shapes:
//   - { kind: 'client_crash' | 'client_error' | 'boot_failure' | 'slug_resolve_failed', ... }
//       -> service_events (the running log of notable events)
//   - no kind (the upload code) -> upload_errors, as before
const CLIENT_KINDS = new Set(['client_crash', 'client_error', 'boot_failure', 'slug_resolve_failed'])
const HOURLY_CAP_PER_KIND = 300

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  let b: Record<string, unknown>
  try { b = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }

  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)

  try {
    const kind = typeof b.kind === 'string' ? b.kind : null

    if (kind && CLIENT_KINDS.has(kind)) {
      const path = str(b.path, 200) ?? ''
      const host = str(b.host, 100) ?? ''
      const onDisplay = host.startsWith('slideshow.')

      // Work out which event this belongs to, so the log says WHICH venue had the problem.
      let weddingId = str(b.weddingId, 100)
      if (!weddingId) {
        const m = /^\/(?:w|host)\/([0-9a-f-]{36})/i.exec(path)
        if (m) weddingId = m[1]!
      }
      if (!weddingId && onDisplay) {
        const slug = path.replace(/^\/+|\/+$/g, '').toLowerCase()
        if (/^[a-z0-9-]{1,60}$/.test(slug)) {
          const { data } = await admin.from('weddings').select('id').eq('slug', slug).maybeSingle()
          if (data?.id) weddingId = data.id
        }
      }

      // Runaway guard.
      const since = new Date(Date.now() - 60 * 60_000).toISOString()
      const { count } = await admin.from('service_events').select('id', { count: 'exact', head: true })
        .eq('kind', kind).gte('created_at', since)
      if ((count ?? 0) >= HOURLY_CAP_PER_KIND) return { statusCode: 204, body: '' }

      await admin.from('service_events').insert({
        wedding_id: weddingId,
        kind,
        severity: kind === 'client_error' ? 'warn' : 'error',
        source: onDisplay ? 'display' : 'client',
        detail: str(b.detail, 500),
        meta: { path, host, build: str(b.build, 40), ua: str(b.ua, 160) },
      })
      return { statusCode: 204, body: '' }
    }

    // Legacy shape: failed guest uploads.
    await admin.from('upload_errors').insert({
      wedding_id:   str(b.weddingId, 100),
      session_id:   str(b.sessionId, 100),
      device_token: str(b.deviceToken, 100),
      stage:        str(b.stage, 40),
      status:       num(b.status),
      detail:       str(b.detail, 500),
      attempt:      num(b.attempt),
      retry:        typeof b.retry === 'boolean' ? b.retry : null,
    })
  } catch {
    // Logging must never surface an error to the caller.
  }
  return { statusCode: 204, body: '' }
}
