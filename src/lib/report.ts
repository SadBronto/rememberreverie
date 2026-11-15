// Fire-and-forget reporting of notable browser-side problems (crashes, page errors, a page
// that failed to start) to /api/log-error, which stores them in the running issue log.
// Never throws, never blocks, and is rate-limited per page load.

const MAX_PER_PAGE = 5
const DEDUPE_MS = 60_000
let sentThisPage = 0
const recent = new Map<string, number>()

// Browser noise that carries no useful information and would just fill the log.
const NOISE = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection|Loading chunk .* failed.*Prerender|AbortError|The operation was aborted|Load failed$|Failed to fetch$|NetworkError/i

export function reportEvent(
  kind: 'client_crash' | 'client_error' | 'boot_failure' | 'slug_resolve_failed',
  detail: string,
  extra: Record<string, unknown> = {},
): void {
  try {
    if (sentThisPage >= MAX_PER_PAGE) return
    if (kind === 'client_error' && NOISE.test(detail)) return
    const key = `${kind}|${detail.slice(0, 80)}`
    const now = Date.now()
    if ((recent.get(key) ?? 0) > now - DEDUPE_MS) return
    recent.set(key, now)
    sentThisPage++

    const body = JSON.stringify({
      kind,
      detail: detail.slice(0, 500),
      path: location.pathname,
      host: location.hostname,
      build: __BUILD_ID__,
      ua: navigator.userAgent.slice(0, 160),
      ...extra,
    })
    // sendBeacon survives the page being torn down (e.g. right before an auto-reload).
    if (typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon('/api/log-error', new Blob([body], { type: 'application/json' }))) return
    }
    void fetch('/api/log-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch { /* reporting must never cause a problem of its own */ }
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (e) => {
    reportEvent('client_error', `${e.message || 'error'} @ ${(e.filename ?? '').split('/').pop()}:${e.lineno ?? 0}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    reportEvent('client_error', `unhandled rejection: ${r?.message ?? String(r)}`)
  })
}
