import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoStore } from '@/store/demoStore'
import FilmGrain from '@/components/FilmGrain'

// ─────────────────────────────────────────────────────────────────────────────
// Guided tour (v2 demo). A linear, tap-through walkthrough of the whole product
// story: guest capture → gallery → the big screen → host controls → setup, then
// it releases the prospect into the existing free-roam demo (/demo).
//
// Built PARALLEL to the live demo: this is a self-contained route (/tour) that
// reuses the real seed photos but touches none of the live surfaces (/, /demo,
// /pricing). When approved, /pricing's "Try the demo" flips to point here.
//
// Agreed shape (confirmed with Corey):
//  - advances on a Next tap, never auto-advances between steps
//  - the big-screen step is a canned slideshow loop, not a live embed
//  - /pricing becomes the front door (wired on approval, not here)
// ─────────────────────────────────────────────────────────────────────────────

const photo = (n: string) => `/demo-media/photos/${n}.jpg`

// Curated seed subsets (all exist in public/demo-media/photos).
const MOSAIC = ['d03', 'p03', 's01', 'd05', 'p05', 's03', 'd07', 'p06', 's05']
const SLIDES: { src: string; n: number }[] = [
  { src: 'd03', n: 7 },
  { src: 's05', n: 15 },
  { src: 'p06', n: 17 },
  { src: 'd11', n: 30 },
  { src: 's09', n: 27 },
]

// Every photo the tour shows, warmed on mount so each step paints fully formed
// instead of popping its images in a beat after the copy.
const PRELOAD = [
  ...new Set(['p02', 'd03', 'p03', 's01', 'd05', 'p05', 's03', 'd07', 'p06', 's05', 'd11', 's09']),
].map(photo)
PRELOAD.push('/demo-media/photos/p02.sig.png')

type Kind = 'intro' | 'feature' | 'close'
interface Step {
  kind: Kind
  eyebrow: string
  title: string
  body: string
  visual?: 'guest' | 'gallery' | 'live' | 'host' | 'setup'
}

const STEPS: Step[] = [
  {
    kind: 'intro',
    eyebrow: 'Guided tour',
    title: 'See Reverie from every angle.',
    body: 'A short walk through the whole experience. Tap through at your own pace.',
  },
  {
    kind: 'feature',
    eyebrow: 'The guest',
    title: 'Scan and Shoot!',
    body: 'Guests scan a code and get a disposable-style camera on their phone. One real photo, no retakes, no edits, then they sign it. Nothing to download.',
    visual: 'guest',
  },
  {
    kind: 'feature',
    eyebrow: 'The gallery',
    title: 'It all develops in one place.',
    body: 'Every photo lands in one private gallery, yours to browse and download in full resolution. The whole night, through everyone’s eyes.',
    visual: 'gallery',
  },
  {
    kind: 'feature',
    eyebrow: 'Reverie Live',
    title: 'On the screen in seconds.',
    body: 'With Reverie Live, photos appear on the big screen moments after they’re taken. The room watches the night unfold in real time.',
    visual: 'live',
  },
  {
    kind: 'feature',
    eyebrow: 'Behind the scenes',
    title: 'You’re in control.',
    body: 'Pin your favorites to keep them for good: a pinned photo is never removed, even when a busy gallery fills up and older shots roll off to make room. You can also review anything flagged, add your own slides, and design the QR.',
    visual: 'host',
  },
  {
    kind: 'feature',
    eyebrow: 'Your event',
    title: 'You decide how it feels.',
    body: 'Choose your looks, how guests sign, and when the camera is open. It takes a few minutes, and the same setup fits a wedding, a birthday, or a night at the bar.',
    visual: 'setup',
  },
  {
    kind: 'close',
    eyebrow: 'That’s Reverie',
    title: 'Now make it yours.',
    body: 'Explore the live demo on your own, or take a look at pricing.',
  },
]

export default function TourPage() {
  const navigate = useNavigate()
  const enter = useDemoStore((s) => s.enter)
  const [step, setStep] = useState(0)
  const total = STEPS.length
  const current = STEPS[step]

  const go = (d: number) => setStep((s) => Math.min(total - 1, Math.max(0, s + d)))

  // Hand off into the existing free-roam demo (Guest / Client / Setup on the real
  // screens). enter() wakes the persistent demo menu before we land on /demo.
  const explore = () => {
    enter()
    navigate('/demo')
  }

  // Warm every tour photo on mount so steps don't pop their images in late.
  useEffect(() => {
    PRELOAD.forEach((src) => {
      const img = new Image()
      img.src = src
    })
  }, [])

  // Desktop convenience: arrow keys page through. Deliberately no Enter binding,
  // so it can't double-advance alongside a focused Next button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isIntro = current.kind === 'intro'
  const isClose = current.kind === 'close'
  // Progress is shown across the feature steps + close (everything after intro).
  const progressTotal = total - 1
  const progressCurrent = step // 1..total-1 once past the intro

  return (
    <div className="relative min-h-dvh bg-ink text-cream overflow-hidden safe-top safe-bottom flex flex-col">
      <FilmGrain opacity={0.038} />
      <Vignette />

      {/* ── Top bar: progress + skip (hidden on the cover) ── */}
      {!isIntro && (
        <div className="relative z-10 flex items-center gap-4 px-6 pt-6">
          <div className="flex-1 flex items-center gap-1.5 max-w-[260px]">
            {Array.from({ length: progressTotal }).map((_, i) => (
              <span
                key={i}
                className="h-[3px] flex-1 rounded-full bg-cream/15 overflow-hidden"
              >
                <span
                  className="block h-full bg-cream/70 transition-all duration-500 ease-out"
                  style={{ width: i < progressCurrent ? '100%' : '0%' }}
                />
              </span>
            ))}
          </div>
          {!isClose && (
            <button
              onClick={explore}
              className="ml-auto text-mono text-cream/30 text-[10px] tracking-[0.25em] uppercase hover:text-cream/60 transition-colors touch-manipulation"
            >
              Skip
            </button>
          )}
        </div>
      )}

      {/* ── Stage: visual + copy, re-revealed on each step (keyed). Scroll-safe so
             short / landscape viewports never clip the controls below. ── */}
      <div key={step} className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-4 overflow-y-auto">
        <Reveal>
          {isIntro ? (
            <IntroCover step={current} onBegin={() => go(1)} onExplore={explore} />
          ) : (
            <div className="w-full max-w-md flex flex-col items-center">
              {current.visual && (
                <div className="w-full flex items-center justify-center mb-6">
                  <Visual which={current.visual} />
                </div>
              )}
              <div className="text-center max-w-sm">
                <p className="text-mono text-amber-film/80 text-[10px] tracking-[0.3em] uppercase">
                  {current.eyebrow}
                </p>
                <h2 className="text-serif text-cream text-3xl font-normal leading-tight mt-3">
                  {current.title}
                </h2>
                <p className="text-sans text-cream/55 text-sm leading-relaxed font-light mt-4">
                  {current.body}
                </p>
              </div>
            </div>
          )}
        </Reveal>
      </div>

      {/* ── Bottom controls ── */}
      {!isIntro && (
        <div className="relative z-10 px-6 pb-8 pt-2">
          {isClose ? (
            <div className="mx-auto w-full max-w-xs flex flex-col gap-3">
              <button
                onClick={explore}
                className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
              >
                Explore on your own
              </button>
              <button
                onClick={() => navigate('/pricing')}
                className="w-full py-3.5 rounded-full border border-cream/20 text-cream/60 text-sans text-sm font-light tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
              >
                See pricing
              </button>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-xs flex items-center gap-3">
              <button
                onClick={() => go(-1)}
                className="px-5 py-3.5 rounded-full border border-cream/15 text-cream/45 text-sans text-xs tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
              >
                Back
              </button>
              <button
                onClick={() => go(1)}
                className="flex-1 py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Cover (intro) ────────────────────────────────────────────────────────────
function IntroCover({
  step,
  onBegin,
  onExplore,
}: {
  step: Step
  onBegin: () => void
  onExplore: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center max-w-sm">
      {/* Film-strip motif, echoing the home page */}
      <div className="flex gap-3 mb-10 opacity-20">
        {[40, 60, 80, 60, 40].map((h, i) => (
          <div key={i} className="w-[3px] bg-cream rounded-full" style={{ height: h }} />
        ))}
      </div>
      <p className="text-mono text-amber-film/80 text-[10px] tracking-[0.35em] uppercase">
        {step.eyebrow}
      </p>
      <h1
        className="text-serif text-cream font-normal leading-[1.15] mt-4"
        style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}
      >
        {step.title}
      </h1>
      <p className="text-sans text-cream/50 text-sm leading-relaxed font-light mt-5 max-w-[300px]">
        {step.body}
      </p>
      <button
        onClick={onBegin}
        className="mt-10 w-full max-w-xs py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
      >
        Begin
      </button>
      <button
        onClick={onExplore}
        className="mt-4 text-mono text-cream/30 text-[10px] tracking-[0.25em] uppercase hover:text-cream/55 transition-colors touch-manipulation"
      >
        Skip to explore
      </button>
    </div>
  )
}

// ── Visual switch ──────────────────────────────────────────────────────────
function Visual({ which }: { which: NonNullable<Step['visual']> }) {
  if (which === 'guest') return <GuestVisual />
  if (which === 'gallery') return <GalleryVisual />
  if (which === 'live') return <LiveVisual />
  if (which === 'host') return <HostVisual />
  return <SetupVisual />
}

// Step 1 - a photo developing on a phone, then a signature settling over it.
function GuestVisual() {
  const [developed, setDeveloped] = useState(false)
  const [signed, setSigned] = useState(false)
  useEffect(() => {
    const a = window.setTimeout(() => setDeveloped(true), 160)
    const b = window.setTimeout(() => setSigned(true), 1500)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])
  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="relative w-full aspect-square">
          <img
            src={photo('p02')}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover transition-all duration-[1600ms] ease-out"
            style={{
              filter: developed ? 'none' : 'blur(16px) brightness(0.35) saturate(0.6)',
              transform: developed ? 'scale(1)' : 'scale(1.04)',
            }}
          />
          <img
            src="/demo-media/photos/p02.sig.png"
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[900ms] ease-out"
            style={{ opacity: signed ? 1 : 0 }}
          />
        </div>
      </div>
      <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
        <span className="text-mono text-cream/40 text-[8px] tracking-[0.35em] uppercase">Reverie</span>
      </div>
    </PhoneFrame>
  )
}

// Step 2 - the gallery assembling, photos fading in staggered.
function GalleryVisual() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className="mx-auto w-full max-w-[340px] grid grid-cols-3 gap-1.5">
      {MOSAIC.map((p, i) => (
        <div
          key={p}
          className="relative aspect-square overflow-hidden rounded-[3px] bg-ink-light transition-all duration-700 ease-out"
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? 'none' : 'translateY(10px) scale(0.96)',
            transitionDelay: `${i * 55}ms`,
          }}
        >
          <img
            src={photo(p)}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      ))}
    </div>
  )
}

// Step 3 - a canned live slideshow loop on a big screen (auto-cycles its photos;
// the step itself still only advances on a Next tap).
function LiveVisual() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setI((v) => (v + 1) % SLIDES.length), 2600)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="mx-auto w-full max-w-[440px]">
      <div className="relative aspect-video rounded-xl border border-cream/15 bg-black overflow-hidden shadow-2xl">
        {SLIDES.map((s, idx) => (
          <img
            key={s.src}
            src={photo(s.src)}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-[1100ms] ease-out"
            style={{ opacity: idx === i ? 1 : 0 }}
          />
        ))}
        <div className="absolute top-3 left-3 pointer-events-none">
          <span className="text-mono text-cream/35 text-[9px] tracking-[0.3em]">#{SLIDES[i].n}</span>
        </div>
        <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-film animate-pulse" />
          <span className="text-mono text-cream/35 text-[8px] tracking-[0.3em] uppercase">Live</span>
        </div>
      </div>
      {/* Minimal stand, to read as a screen in the room */}
      <div className="mx-auto mt-0 w-px h-5 bg-cream/15" />
      <div className="mx-auto w-20 h-1 rounded-full bg-cream/15" />
    </div>
  )
}

// Step 4 - the host's gallery view: tabs, pinned/flagged badges, quiet actions.
function HostVisual() {
  const shots: { p: string; badge: 'pinned' | 'flagged' | null }[] = [
    { p: 'd07', badge: 'pinned' },
    { p: 'p06', badge: null },
    { p: 's05', badge: 'flagged' },
    { p: 'd05', badge: null },
  ]
  return (
    <div className="mx-auto w-full max-w-[330px] rounded-2xl border border-cream/12 bg-ink-light/60 backdrop-blur p-4">
      <div className="flex items-center gap-2 mb-3">
        {['All', 'Flagged', 'Pinned'].map((t, idx) => (
          <span
            key={t}
            className={[
              'text-mono text-[9px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full',
              idx === 0 ? 'bg-cream text-ink' : 'text-cream/40 border border-cream/15',
            ].join(' ')}
          >
            {t}
          </span>
        ))}
        <span className="ml-auto text-mono text-[9px] text-cream/30 tracking-widest">38</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {shots.map((s) => (
          <div key={s.p} className="relative aspect-[4/3] rounded-md overflow-hidden bg-black">
            <img
              src={photo(s.p)}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {s.badge === 'pinned' && (
              <span className="absolute top-1.5 left-1.5 text-mono text-[8px] tracking-[0.15em] uppercase px-1.5 py-0.5 rounded bg-amber-film/90 text-ink">
                Pinned
              </span>
            )}
            {s.badge === 'flagged' && (
              <span className="absolute top-1.5 left-1.5 text-mono text-[8px] tracking-[0.15em] uppercase px-1.5 py-0.5 rounded bg-black/70 text-cream/80 border border-cream/20">
                Flagged
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-sans text-[11px] text-cream/55 px-3 py-1.5 rounded-full border border-cream/15">
          Design QR
        </span>
        <span className="text-sans text-[11px] text-cream/55 px-3 py-1.5 rounded-full border border-cream/15">
          Add a slide
        </span>
      </div>
    </div>
  )
}

// Step 5 - setup: choose looks + a couple of plain-language switches.
function SetupVisual() {
  const looks = ['Disposable', 'Polaroid', 'Super 8', 'Noir', 'Flash', 'Champagne']
  const selected = new Set(['Disposable', 'Polaroid', 'Super 8'])
  return (
    <div className="mx-auto w-full max-w-[330px] rounded-2xl border border-cream/12 bg-ink-light/60 backdrop-blur p-5">
      <p className="text-mono text-[9px] tracking-[0.3em] text-amber-film/70 uppercase">Choose your looks</p>
      <div className="flex flex-wrap gap-2 mt-3">
        {looks.map((l) => (
          <span
            key={l}
            className={[
              'text-sans text-xs px-3 py-1.5 rounded-full border transition-colors',
              selected.has(l) ? 'bg-cream text-ink border-cream' : 'text-cream/50 border-cream/15',
            ].join(' ')}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="h-px bg-cream/10 my-5" />
      <ToggleRow label="Guests sign their photos" on />
      <ToggleRow label="Live slideshow on the big screen" on />
      <ToggleRow label="Lock to the venue" on={false} />
    </div>
  )
}

function ToggleRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sans text-cream/70 text-sm font-light">{label}</span>
      <span
        className={[
          'relative w-9 h-5 rounded-full transition-colors shrink-0',
          on ? 'bg-amber-film/80' : 'bg-cream/15',
        ].join(' ')}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-cream transition-all"
          style={{ left: on ? '18px' : '2px' }}
        />
      </span>
    </div>
  )
}

// ── Shared chrome ─────────────────────────────────────────────────────────────
function PhoneFrame({ children }: { children: React.ReactNode }) {
  // Height-driven with a vh cap so the frame shrinks on short viewports instead of
  // pushing the Next/Back controls off-screen. Width follows from the aspect ratio.
  return (
    <div className="relative mx-auto aspect-[9/19] h-[min(460px,48vh)] max-w-[72vw] rounded-[2.2rem] border border-cream/15 bg-black shadow-2xl overflow-hidden">
      {children}
    </div>
  )
}

function Vignette() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)' }}
    />
  )
}

// Fades + lifts its children in on mount. Because the stage is keyed by step,
// this remounts and replays the reveal on every step change.
function Reveal({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const id = requestAnimationFrame(() => setShown(true))
    return () => {
      mounted.current = false
      cancelAnimationFrame(id)
    }
  }, [])
  return (
    <div
      className="w-full flex flex-col items-center transition-all duration-500 ease-out"
      style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(10px)' }}
    >
      {children}
    </div>
  )
}
