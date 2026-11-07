import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import LooksPreview from '@/components/LooksPreview'

// Public sales / pricing page. Restrained, editorial, event-neutral (works for a
// wedding or a corporate night). Lives at /pricing for now; becomes the front
// door when we rework the landing/demo flow. "Looks", never "filters".
export default function PricingPage() {
  const navigate = useNavigate()
  const bookHref = 'mailto:hello@rememberreverie.com?subject=Reverie%20for%20my%20event'

  return (
    <div className="relative min-h-dvh bg-ink text-cream overflow-hidden safe-top safe-bottom">

      {/* Subtle grain texture overlay (identical to the home page) */}
      <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundSize: '200px 200px' }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)' }}
      />

      <div className="relative z-10 mx-auto w-full max-w-4xl px-6">

        {/* ── Hero ── */}
        <header className="pt-16 pb-24 text-center flex flex-col items-center">
          <p className="text-mono text-[10px] tracking-[0.4em] text-cream/30 uppercase">Reverie</p>
          <h1
            className="text-serif text-cream font-normal mt-6 leading-[1.15]"
            style={{ fontSize: 'clamp(2.2rem, 8vw, 3.4rem)' }}
          >
            Your event, through
            <br />everyone's eyes.
          </h1>
          <p className="text-sans text-cream/55 text-base leading-relaxed max-w-[420px] mt-6 font-light">
            Hand every guest a disposable-style camera on their phone. They scan, shoot, and
            sign. Every photo develops into one gallery that's yours to keep.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-10 w-full max-w-xs sm:max-w-md">
            <button
              onClick={() => navigate('/demo')}
              className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
            >
              Try the demo
            </button>
            <a
              href={bookHref}
              className="w-full py-4 rounded-full border border-cream/25 text-cream/70 text-sans text-sm font-medium tracking-widest uppercase text-center active:scale-[0.97] transition-transform touch-manipulation"
            >
              Get started
            </a>
          </div>
        </header>

        <Divider />

        {/* ── How it works ── */}
        <section className="py-20">
          <SectionLabel>How it works</SectionLabel>
          <div className="mt-10 flex flex-col gap-10">
            <Step n="01" title="Share a code">
              Put out a QR code. Guests scan it with their phone camera. Nothing to download,
              no account to make.
            </Step>
            <Step n="02" title="Everyone shoots">
              A real disposable-camera feel: one shot, no retakes, no edits. Choose the look
              that fits the night, and let guests sign their photos.
            </Step>
            <Step n="03" title="It all develops">
              Every photo lands in one private gallery, yours to browse and download in full
              resolution. On Reverie Live, they appear on the big screen as they're taken.
            </Step>
          </div>
        </section>

        <Divider />

        {/* ── The looks ── */}
        <section className="py-20 text-center">
          <SectionLabel>Six looks to set the mood</SectionLabel>
          <p className="text-sans text-cream/45 text-sm leading-relaxed max-w-[380px] mx-auto mt-6 font-light">
            From flash-lit candids to warm, creamy film. The same moment, six ways. Pick the feeling that fits your event.
          </p>
          <LooksPreview />
        </section>

        <Divider />

        {/* ── Pricing ── */}
        <section className="py-20">
          <SectionLabel center>Simple pricing</SectionLabel>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <PlanCard
              name="Reverie"
              price="$100"
              tagline="Everything you need."
              features={[
                'QR code + guest camera',
                'All six looks',
                'Guest signatures',
                'Private gallery',
                'Full-resolution download',
              ]}
            />
            <PlanCard
              name="Reverie Live"
              price="$200"
              tagline="Live on the big screen."
              features={[
                'Everything in Reverie',
                'Live slideshow as guests shoot',
                'Automatic photo screening',
              ]}
            />
            <PlanCard
              name="Reverie Pro"
              price="$250"
              tagline="Live, plus every add-on."
              highlight
              badge="Best value"
              features={[
                'Everything in Reverie Live',
                'Unlimited photos',
                'Your gallery kept an extra year',
                'Venue lock',
                'Extended capture window',
              ]}
            />
          </div>

          <p className="text-sans text-cream/45 text-sm leading-relaxed text-center max-w-[520px] mx-auto mt-10 font-light">
            Add on when you need it. Unlimited photos <Money>+$25</Money> · Keep your gallery &amp;
            link another year <Money>+$25/yr</Money> · Venue lock <Money>+$15</Money> · Extended
            capture window <Money>+$40</Money>.
          </p>
        </section>

        <Divider />

        {/* ── Safe on the big screen (moderation) ── */}
        <section className="py-20 text-center">
          <SectionLabel center>Safe on the big screen</SectionLabel>
          <p className="text-sans text-cream/55 text-sm leading-relaxed max-w-[480px] mx-auto mt-6 font-light">
            On Reverie Live, every photo is checked the moment it is taken, before it ever reaches
            the screen. We use Google's vision service to catch anything explicit or unsafe, so what
            shows in the room stays right for your event. Anything it flags is held back for you or
            your staff to review, never shown on its own.
          </p>
        </section>

        <Divider />

        {/* ── Closing CTA ── */}
        <section className="py-20 text-center flex flex-col items-center">
          <h2 className="text-serif text-cream font-normal" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.4rem)' }}>
            See it for yourself.
          </h2>
          <p className="text-sans text-cream/50 text-sm mt-4 max-w-[360px] font-light leading-relaxed">
            Walk through the whole experience, as a guest, as the host, and behind the scenes.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-8 w-full max-w-xs sm:max-w-md">
            <button
              onClick={() => navigate('/demo')}
              className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform touch-manipulation"
            >
              Try the demo
            </button>
            <a
              href={bookHref}
              className="w-full py-4 rounded-full border border-cream/25 text-cream/70 text-sans text-sm font-medium tracking-widest uppercase text-center active:scale-[0.97] transition-transform touch-manipulation"
            >
              Get started
            </a>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="pb-12 pt-6 text-center">
          <p className="text-mono text-cream/25 text-[10px] tracking-[0.25em] uppercase">Remember Reverie</p>
          <p className="text-mono text-cream/15 text-[9px] tracking-[0.2em] mt-3">
            <a href="mailto:hello@rememberreverie.com" className="hover:text-cream/40 transition-colors">Contact</a>
            {' · '}
            <Link to="/terms" className="hover:text-cream/40 transition-colors">Terms</Link>
            {' · '}
            <Link to="/privacy" className="hover:text-cream/40 transition-colors">Privacy</Link>
          </p>
        </footer>
      </div>
    </div>
  )
}

function Divider() {
  return <div className="w-10 h-px bg-cream/15 mx-auto" />
}

function SectionLabel({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <p className={`text-mono text-[10px] tracking-[0.3em] text-amber-film/70 uppercase ${center ? 'text-center' : ''}`}>
      {children}
    </p>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <span className="text-serif text-cream/25 text-2xl leading-none pt-0.5">{n}</span>
      <div>
        <h3 className="text-serif text-cream text-xl font-normal">{title}</h3>
        <p className="text-sans text-cream/50 text-sm leading-relaxed mt-2 font-light max-w-[440px]">{children}</p>
      </div>
    </div>
  )
}

function PlanCard({
  name, price, tagline, features, highlight, badge,
}: { name: string; price: string; tagline: string; features: string[]; highlight?: boolean; badge?: string }) {
  return (
    <div className={`relative rounded-2xl p-7 border ${highlight ? 'border-amber-film/40 bg-amber-film/[0.05]' : 'border-cream/10 bg-cream/[0.02]'}`}>
      {badge && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-mono text-[8px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full bg-amber-film text-ink whitespace-nowrap">
          {badge}
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <h3 className="text-serif text-cream text-xl font-normal">{name}</h3>
        <span className="text-serif text-cream text-2xl">{price}</span>
      </div>
      <p className="text-sans text-cream/45 text-xs mt-1 font-light">{tagline}</p>
      <div className="w-full h-px bg-cream/10 my-5" />
      <ul className="flex flex-col gap-2.5">
        {features.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sans text-cream/65 text-sm font-light">
            <span className="text-amber-film/70 text-xs pt-1">◦</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Money({ children }: { children: React.ReactNode }) {
  return <span className="text-cream/70">{children}</span>
}
