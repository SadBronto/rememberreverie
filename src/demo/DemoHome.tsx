import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoStore } from '@/store/demoStore'
import { useSessionStore } from '@/store/sessionStore'
import FilmGrain from '@/components/FilmGrain'

// Landing for the demo. Engages the demo (so the menu appears) and explains the
// three perspectives. The persistent Guest/Client/Setup bar (DemoMenuBar) does the
// actual navigation; these cards mirror it with a sentence of context each.
export default function DemoHome() {
  const navigate = useNavigate()
  const enter = useDemoStore((s) => s.enter)
  const config = useDemoStore((s) => s.config)
  const splashSeen = useDemoStore((s) => s.splashSeen)
  const requestSplash = useDemoStore((s) => s.requestSplash)
  const setWeddingConfig = useSessionStore((s) => s.setWeddingConfig)

  useEffect(() => { enter() }, [enter])

  // First open of a persona this session → intro splash; then straight in.
  const go = (persona: 'guest' | 'client' | 'setup', path: string, before?: () => void) => {
    before?.()
    enter()
    if (splashSeen[persona]) navigate(path)
    else requestSplash(persona, path)
  }
  const goGuest  = () => go('guest',  `/w/${config.id}`,      () => setWeddingConfig(config))
  const goClient = () => go('client', `/couple/${config.id}`)
  const goSetup  = () => go('setup',  '/demo/setup')

  return (
    <div className="relative min-h-dvh bg-ink flex flex-col items-center px-6 overflow-hidden safe-top">
      <FilmGrain opacity={0.038} />

      <header className="relative z-10 flex flex-col items-center pt-12 text-center">
        <p className="text-mono text-[10px] tracking-[0.3em] text-amber-film/80 uppercase">Live demo</p>
        <h1 className="text-serif text-cream text-4xl font-normal tracking-wide mt-1">Reverie</h1>
        <p className="text-sans text-cream/55 text-sm leading-relaxed max-w-[300px] font-light mt-4">
          See it from every side. Pick a perspective below — your choices carry
          across all three.
        </p>
      </header>

      <div className="relative z-10 flex-1 w-full max-w-sm flex flex-col justify-center gap-3 pb-32">
        <DemoCard
          label="Guest"
          line="Scan, shoot, and sign a photo — the experience your guests get."
          onClick={goGuest}
        />
        <DemoCard
          label="Client"
          line="Browse the gallery, review flagged shots, run the slideshow, design a QR."
          onClick={goClient}
        />
        <DemoCard
          label="Setup"
          line="Build an event start to finish — modes, signing, timestamps, and more."
          onClick={goSetup}
        />
      </div>
    </div>
  )
}

function DemoCard({ label, line, onClick }: { label: string; line: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-ink-light border border-cream/10 rounded-2xl px-5 py-4 active:scale-[0.98] transition-transform duration-100 touch-manipulation"
    >
      <p className="text-sans text-cream text-sm font-medium tracking-widest uppercase">{label}</p>
      <p className="text-sans text-cream/50 text-xs leading-relaxed mt-1.5 font-light">{line}</p>
    </button>
  )
}
