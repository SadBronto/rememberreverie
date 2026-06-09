import { useLocation, useNavigate } from 'react-router-dom'
import { useDemoStore } from '@/store/demoStore'
import { useSessionStore } from '@/store/sessionStore'

type Persona = 'guest' | 'client' | 'setup' | 'home'

// Persistent demo menu: a slim fixed bar with three persona buttons
// (Guest · Client · Setup) plus a DEMO badge. Rendered globally in App; it shows
// itself only while the demo is engaged, and floats over whichever real screen
// the active persona has navigated to.
export default function DemoMenuBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const active = useDemoStore((s) => s.active)
  const enter = useDemoStore((s) => s.enter)
  const config = useDemoStore((s) => s.config)
  const splashSeen = useDemoStore((s) => s.splashSeen)
  const requestSplash = useDemoStore((s) => s.requestSplash)
  const setWeddingConfig = useSessionStore((s) => s.setWeddingConfig)

  const path = location.pathname

  // Hide on immersive capture/presentation screens where a bottom bar would
  // cover the controls (camera shutter, signing canvas, fullscreen slideshow).
  const immersive = /^\/w\/demo-[^/]+\/(camera|annotate|slideshow)/.test(path)
  if (immersive) return null

  // Visible whenever the demo is engaged OR the URL is a demo surface (so the bar
  // survives navigation into the real /w/demo- and /couple/demo- screens).
  const onDemoPath =
    path.startsWith('/demo') ||
    path.startsWith('/w/demo-') ||
    path.startsWith('/couple/demo-')
  if (!active && !onDemoPath) return null

  const current: Persona | null =
    path.startsWith('/w/demo-')                                          ? 'guest'
    : path.startsWith('/couple/demo-')                                   ? 'client'
    : path.startsWith('/demo/setup') || path.startsWith('/couple/setup') ? 'setup'
    : path === '/demo' || path === '/demo/'                              ? 'home'
    : null

  // First time a persona is opened this session → show its intro splash; after
  // that, go straight in. `before` runs at click time (e.g. seeding the guest config).
  const go = (persona: 'guest' | 'client' | 'setup', path: string, before?: () => void) => {
    before?.()
    enter()
    if (splashSeen[persona]) navigate(path)
    else requestSplash(persona, path)
  }
  // Seed the demo config into the session store so the real guest screens render it
  // instead of trying to fetch /api/weddings/demo-reverie (which 404s in prod).
  const goGuest  = () => go('guest',  `/w/${config.id}`,      () => setWeddingConfig(config))
  const goClient = () => go('client', `/couple/${config.id}`)
  const goSetup  = () => go('setup',  '/demo/setup')

  return (
    <nav className="fixed bottom-0 inset-x-0 z-[100] safe-bottom select-none pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md m-2 rounded-2xl bg-ink/90 backdrop-blur border border-cream/15 shadow-2xl flex items-center gap-1 p-1.5">
        <span className="text-mono text-[9px] tracking-[0.2em] text-amber-film/80 uppercase px-2">
          Demo
        </span>
        <PersonaButton label="Guest"  activeNow={current === 'guest'}  onClick={goGuest} />
        <PersonaButton label="Client" activeNow={current === 'client'} onClick={goClient} />
        <PersonaButton label="Setup"  activeNow={current === 'setup'}  onClick={goSetup} />
      </div>
    </nav>
  )
}

function PersonaButton({
  label, activeNow, onClick,
}: { label: string; activeNow: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-2.5 rounded-xl text-sans text-xs font-medium tracking-widest uppercase',
        'active:scale-[0.97] transition-all duration-100 touch-manipulation',
        activeNow
          ? 'bg-cream text-ink'
          : 'text-cream/60 hover:text-cream/90',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
