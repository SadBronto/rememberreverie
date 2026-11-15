import { useEffect, useState } from 'react'
import SlideshowPage from './SlideshowPage'
import { nextRecoveryDelay } from '@/lib/recover'
import { reportEvent } from '@/lib/report'

interface Props {
  slug: string
}

// Used when the app is loaded on the slideshow subdomain.
// Resolves `slideshow.rememberreverie.com/corey-and-stephanie`
// → fetches weddingId from /api/slug → renders the slideshow.
//
// This is the very first thing a venue's display does after it boots, and it can easily
// run before the venue's Wi-Fi is up. So a failed lookup must NEVER be final: it keeps
// retrying (5s, 10s, 20s ... up to once a minute) until it succeeds, and only shows
// "not found" when the server genuinely says the slug doesn't exist.
export default function SlideshowSlugPage({ slug }: Props) {
  const [weddingId, setWeddingId] = useState<string | null>(null)
  const [status, setStatus] = useState<'resolving' | 'notfound' | 'offline'>('resolving')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (weddingId) return
    if (!slug) { setStatus('notfound'); return }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const ctl = new AbortController()
    const abortTimer = setTimeout(() => ctl.abort(), 15_000)   // a hung request must not wait forever

    const retry = () => {
      if (cancelled) return
      retryTimer = setTimeout(() => setAttempt(a => a + 1), Math.min(nextRecoveryDelay(attempt), 60_000))
    }

    fetch(`/api/slug?slug=${encodeURIComponent(slug)}`, { signal: ctl.signal })
      .then(async r => {
        if (cancelled) return
        if (r.ok) {
          const data = await r.json()
          if (data?.weddingId) { setWeddingId(data.weddingId); return }
        }
        setStatus(r.status === 404 ? 'notfound' : 'offline')
        if (attempt === 2) reportEvent('slug_resolve_failed', `HTTP ${r.status} looking up "${slug}"`)
        retry()
      })
      .catch(() => {
        if (cancelled) return
        setStatus('offline')
        if (attempt === 2) reportEvent('slug_resolve_failed', `network error looking up "${slug}"`)
        retry()
      })
      .finally(() => clearTimeout(abortTimer))

    return () => {
      cancelled = true
      clearTimeout(abortTimer)
      if (retryTimer) clearTimeout(retryTimer)
      ctl.abort()
    }
  }, [slug, attempt, weddingId])

  if (weddingId) return <SlideshowPage weddingId={weddingId} />

  if (status === 'notfound') {
    return (
      <div className="min-h-dvh bg-black flex flex-col items-center justify-center gap-4 text-center px-8">
        <p className="text-serif text-cream/40 text-xl italic">Slideshow not found</p>
        <p className="text-mono text-cream/20 text-xs tracking-widest">
          Check the URL with your couple. The slug may not be set up yet.
        </p>
      </div>
    )
  }

  // Resolving, or offline and quietly retrying.
  return (
    <div className="min-h-dvh bg-black flex flex-col items-center justify-center gap-5">
      <div className="w-6 h-6 rounded-full border-2 border-cream/10 border-t-cream/30 animate-spin" />
      {status === 'offline' && (
        <p className="text-mono text-cream/20 text-[10px] tracking-[0.3em] uppercase">Reconnecting</p>
      )}
    </div>
  )
}
