// Self-recovery rules shared by the crash catcher (CrashGuard) and the boot watchdog in
// index.html (which uses the same sessionStorage key and the same backoff).
//
// A display (the slideshow subdomain) must keep trying forever, because nobody is there
// to reload it. A guest's phone retries a few times, then stops and shows a button, so a
// genuinely broken build can never put someone's phone into an endless reload loop.

const KEY = 'reverie-recover'

export const GUEST_MAX_AUTO_RELOADS = 3

// 5s, 10s, 20s ... capped at 5 minutes, so a display that can't recover (say the venue's
// Wi-Fi is down) settles into one quiet retry every 5 minutes instead of hammering.
export function nextRecoveryDelay(attempt: number, baseMs = 5000, capMs = 5 * 60_000): number {
  return Math.min(baseMs * 2 ** Math.max(0, attempt), capMs)
}

export function shouldAutoReload(attemptsSoFar: number, isKiosk: boolean): boolean {
  return isKiosk || attemptsSoFar < GUEST_MAX_AUTO_RELOADS
}

export function isKioskHost(): boolean {
  try { return /^slideshow\./.test(location.hostname) } catch { return false }
}

export function readAttempts(): number {
  try {
    const n = JSON.parse(sessionStorage.getItem(KEY) ?? '{}')?.n
    return typeof n === 'number' && n >= 0 ? n : 0
  } catch { return 0 }
}

export function recordAttempt(): number {
  const n = readAttempts() + 1
  try { sessionStorage.setItem(KEY, JSON.stringify({ n, t: Date.now() })) } catch { /* storage blocked */ }
  return n
}

export function clearAttempts(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* storage blocked */ }
}
