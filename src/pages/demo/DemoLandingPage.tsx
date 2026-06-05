import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function DemoLandingPage() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // demo.rememberreverie.com should drop users straight into the setup wizard,
    // not the marketing landing page.
    if (window.location.hostname === 'demo.rememberreverie.com') {
      navigate('/demo/setup', { replace: true })
      return
    }
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [navigate])

  return (
    <div className="relative min-h-dvh bg-ink flex flex-col overflow-hidden">

      {/* Subtle grain texture overlay */}
      <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundSize: '200px 200px' }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)' }}
      />

      {/* Wordmark */}
      <header
        className="relative z-10 flex justify-center pt-10 transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-8px)' }}
      >
        <span className="text-mono text-cream/30 text-[10px] tracking-[0.35em] uppercase">Reverie</span>
      </header>

      {/* Center content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">

        {/* Film strip decoration */}
        <div
          className="flex gap-3 mb-10 transition-all duration-1000 delay-100"
          style={{ opacity: visible ? 0.18 : 0 }}
        >
          {[40, 60, 80, 60, 40].map((h, i) => (
            <div key={i} className="w-[3px] bg-cream rounded-full" style={{ height: h }} />
          ))}
        </div>

        <div
          className="transition-all duration-700 delay-150"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(12px)' }}
        >
          <h1 className="text-serif text-cream font-normal leading-[1.2] max-w-[340px] mx-auto"
            style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}
          >
            The best moments aren't planned.
          </h1>
        </div>

        <div
          className="mt-6 transition-all duration-700 delay-300"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(8px)' }}
        >
          <p className="text-sans text-cream/45 text-sm font-light leading-relaxed max-w-[260px] mx-auto">
            A premium disposable camera experience built for weddings.
          </p>
        </div>

        {/* CTAs */}
        <div
          className="mt-12 flex flex-col items-center gap-3 w-full max-w-xs transition-all duration-700 delay-500"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(8px)' }}
        >
          <button
            onClick={() => navigate('/couple/login')}
            className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform duration-100 touch-manipulation"
          >
            Client Portal
          </button>
          <button
            onClick={() => navigate('/demo/setup')}
            className="w-full py-3.5 rounded-full border border-cream/20 text-cream/60 text-sans text-sm font-light tracking-widest uppercase active:scale-[0.97] transition-transform duration-100 touch-manipulation"
          >
            Try a Demo
          </button>
          <a
            href="https://www.thirddegreeentertainment.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-mono text-cream/28 text-[10px] tracking-[0.25em] uppercase touch-manipulation hover:text-cream/50 transition-colors duration-150"
          >
            Book for your wedding →
          </a>
        </div>
      </main>

      {/* Bottom attribution + legitimacy links */}
      <footer
        className="relative z-10 flex flex-col items-center gap-2.5 pb-8 transition-all duration-700 delay-700"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <p className="text-mono text-cream/15 text-[9px] tracking-[0.3em] uppercase">
          Every wedding. Every memory.
        </p>
        <p className="text-mono text-cream/20 text-[9px] tracking-[0.2em]">
          Reverie by Third Degree Entertainment
          {' · '}
          <a href="https://www.thirddegreeentertainment.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-cream/40 transition-colors">Contact</a>
          {' · '}
          <Link to="/privacy" className="hover:text-cream/40 transition-colors">Privacy</Link>
        </p>
      </footer>
    </div>
  )
}
