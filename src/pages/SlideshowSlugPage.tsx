import { useEffect, useState } from 'react'
import SlideshowPage from './SlideshowPage'

interface Props {
  slug: string
}

// Used when the app is loaded on the slideshow subdomain.
// Resolves `slideshow.rememberreverie.com/corey-and-stephanie`
// → fetches weddingId from /api/slug → renders the slideshow.
export default function SlideshowSlugPage({ slug }: Props) {
  const [weddingId, setWeddingId] = useState<string | null>(null)
  const [notFound,  setNotFound]  = useState(false)

  useEffect(() => {
    if (!slug) { setNotFound(true); return }

    fetch(`/api/slug?slug=${encodeURIComponent(slug)}`)
      .then(r => {
        if (!r.ok) { setNotFound(true); return null }
        return r.json()
      })
      .then(data => {
        if (data?.weddingId) setWeddingId(data.weddingId)
        else setNotFound(true)
      })
      .catch(() => setNotFound(true))
  }, [slug])

  if (notFound) {
    return (
      <div className="min-h-dvh bg-black flex flex-col items-center justify-center gap-4 text-center px-8">
        <p className="text-serif text-cream/40 text-xl italic">Slideshow not found</p>
        <p className="text-mono text-cream/20 text-xs tracking-widest">
          Check the URL with your couple — the slug may not be set up yet.
        </p>
      </div>
    )
  }

  if (!weddingId) {
    // Resolving…
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-cream/10 border-t-cream/30 animate-spin" />
      </div>
    )
  }

  return <SlideshowPage weddingId={weddingId} />
}
