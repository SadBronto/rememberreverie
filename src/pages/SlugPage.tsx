import { useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'

// Resolves a vanity slug (e.g. /corey-and-sarah) → /w/:weddingId
export default function SlugPage() {
  const { slug } = useParams<{ slug: string }>()
  const [weddingId, setWeddingId] = useState<string | null>(null)
  const [notFound,  setNotFound]  = useState(false)

  useEffect(() => {
    if (!slug) { setNotFound(true); return }
    fetch(`/api/slug?slug=${encodeURIComponent(slug.toLowerCase())}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { weddingId: string }) => setWeddingId(d.weddingId))
      .catch(() => setNotFound(true))
  }, [slug])

  if (weddingId) return <Navigate to={`/w/${weddingId}`} replace />

  if (notFound) {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-mono text-cream/25 text-[10px] tracking-[0.4em] uppercase">Remember Reverie</p>
        <p className="font-serif text-cream text-2xl font-light">Page not found</p>
        <p className="text-sans text-cream/40 text-sm">
          This link doesn't match any wedding. Check with your couple for the correct URL.
        </p>
      </div>
    )
  }

  // Loading — no flash of content, just a quiet wait
  return (
    <div className="min-h-screen bg-ink flex items-center justify-center">
      <p className="text-mono text-cream/20 text-[10px] tracking-[0.4em] uppercase animate-pulse">
        Remember Reverie
      </p>
    </div>
  )
}
