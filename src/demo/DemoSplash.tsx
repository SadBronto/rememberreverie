import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoStore } from '@/store/demoStore'
import FilmGrain from '@/components/FilmGrain'

// Per-persona intro shown the first time each is opened in a session. Fades in over
// the current screen; on Continue it navigates underneath, then fades out to reveal
// the demo screen — an elegant cross-fade.
const COPY = {
  guest: {
    eyebrow: 'The guest view',
    title:   'What your guests see',
    body:    'When a guest scans your QR code — or opens your customizable event link — this is exactly what they’ll see. Take a photo, watch it develop, and sign it.',
  },
  client: {
    eyebrow: 'Your gallery',
    title:   'Where it all collects',
    body:    'Every photo your guests capture lands here, privately — to browse, download, and review. It’s also where you design your QR code, manage your settings, and approve or remove flagged photos.',
  },
  setup: {
    eyebrow: 'Setting up',
    title:   'Make it yours',
    body:    'This is how you’ll set up your event — walk through it just like the real thing.',
  },
}

export default function DemoSplash() {
  const pending = useDemoStore((s) => s.pendingSplash)
  const clearSplash = useDemoStore((s) => s.clearSplash)
  const navigate = useNavigate()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!pending) { setShown(false); return }
    const id = requestAnimationFrame(() => setShown(true)) // next frame → fade in
    return () => cancelAnimationFrame(id)
  }, [pending])

  if (!pending) return null
  const copy = COPY[pending.persona]

  const onContinue = () => {
    const path = pending.path
    navigate(path)                                  // destination mounts behind the opaque overlay
    setShown(false)                                 // fade the overlay out → reveals the demo screen
    window.setTimeout(() => clearSplash(), 480)     // unmount once the fade completes
  }

  return (
    <div
      className="fixed inset-0 z-[120] bg-ink flex flex-col items-center justify-center px-8 text-center transition-opacity duration-[450ms] ease-out"
      style={{ opacity: shown ? 1 : 0 }}
    >
      <FilmGrain opacity={0.04} />
      <div className="relative z-10 max-w-sm flex flex-col items-center">
        <p className="text-mono text-amber-film/80 text-[10px] tracking-[0.3em] uppercase">{copy.eyebrow}</p>
        <h2 className="text-serif text-cream text-3xl font-normal mt-3 leading-tight">{copy.title}</h2>
        <p className="text-sans text-cream/55 text-sm leading-relaxed font-light mt-4">{copy.body}</p>
        <button
          onClick={onContinue}
          className="mt-9 px-10 py-3.5 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform duration-100 touch-manipulation"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
