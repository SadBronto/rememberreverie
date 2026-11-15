import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import CrashGuard from './components/CrashGuard'
import { installGlobalErrorReporting, reportEvent } from './lib/report'
import { clearAttempts } from './lib/recover'

installGlobalErrorReporting()

// A new deploy replaces the hashed files an already-open page was about to load, which
// shows up as a failed lazy import. Reload once to pick up the new build (guarded so a
// genuinely broken file can't cause a reload loop).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  reportEvent('client_error', 'a page file failed to load (probably a new deploy); reloading')
  try {
    const last = Number(sessionStorage.getItem('reverie-chunk-reload') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('reverie-chunk-reload', String(Date.now()))
  } catch { /* storage blocked: fall through and reload once */ }
  window.location.reload()
})

// Once the app has run cleanly for a minute, forget any earlier restart attempts, so the
// backoff starts fresh the next time something goes wrong.
window.setTimeout(clearAttempts, 60_000)

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <CrashGuard>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </CrashGuard>
  </StrictMode>
)
