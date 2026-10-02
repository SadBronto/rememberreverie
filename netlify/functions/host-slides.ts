import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getPhotoUrls, getUploadUrl, deletePhotos } from '../lib/storage'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

interface Slide { id: string; path: string }

// Promo / logo slides shown in the Reverie Live slideshow between photos.
//   GET    /api/host/slides?weddingId=xxx                  → list with signed URLs
//   POST   /api/host/slides?weddingId=xxx {op:'upload-url', contentType} → signed PUT URL
//   POST   /api/host/slides?weddingId=xxx {op:'save', slides:[{id,path}]} → persist the set
//   DELETE /api/host/slides?weddingId=xxx&slideId=yyy      → remove + delete the image
// Host-authed: the caller must own the event (couple_email === token user's email).
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}
const MAX_SLIDES = 20

function json(obj: unknown) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

export const handler: Handler = async (event) => {
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: 'Unauthorized' }
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user?.email) return { statusCode: 401, body: 'Invalid token' }

  const weddingId = event.queryStringParameters?.weddingId
  if (!weddingId) return { statusCode: 400, body: 'Missing weddingId' }

  const { data: wedding } = await admin
    .from('weddings')
    .select('id, couple_email, slideshow_slides')
    .eq('id', weddingId)
    .single()
  if (!wedding) return { statusCode: 404, body: 'Not found' }

  // Admins can manage any event's slides; otherwise the caller must own this event.
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = adminEmails.includes(user.email.toLowerCase())
  if (!isAdmin && wedding.couple_email && wedding.couple_email !== user.email) {
    return { statusCode: 403, body: 'Forbidden' }
  }

  const slides: Slide[] = Array.isArray(wedding.slideshow_slides) ? wedding.slideshow_slides as Slide[] : []
  const prefix = `slides/${weddingId}/`

  // ── GET: list with signed display URLs ──
  if (event.httpMethod === 'GET') {
    const urlMap = await getPhotoUrls(slides.map(s => s.path), 3600)
    return json({ slides: slides.map(s => ({ id: s.id, path: s.path, url: urlMap.get(s.path) ?? null })) })
  }

  // ── POST: upload-url | save ──
  if (event.httpMethod === 'POST') {
    let body: { op?: string; contentType?: string; slides?: Slide[] }
    try { body = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }

    if (body.op === 'upload-url') {
      if (slides.length >= MAX_SLIDES) return { statusCode: 400, body: `Limit is ${MAX_SLIDES} slides` }
      const ext = ALLOWED[(body.contentType ?? '').toLowerCase()]
      if (!ext) return { statusCode: 400, body: 'Use a JPG, PNG, or WebP image' }
      const slideId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const path = `${prefix}${slideId}.${ext}`
      const uploadUrl = await getUploadUrl(path)
      if (!uploadUrl) return { statusCode: 500, body: 'Could not create upload URL' }
      return json({ slideId, path, uploadUrl })
    }

    if (body.op === 'save') {
      const incoming = Array.isArray(body.slides) ? body.slides : []
      // Only accept slides whose path lives in THIS event's slides folder.
      const clean = incoming
        .filter(s => s && typeof s.id === 'string' && typeof s.path === 'string' && s.path.startsWith(prefix))
        .slice(0, MAX_SLIDES)
        .map(s => ({ id: s.id, path: s.path }))
      const { error } = await admin.from('weddings').update({ slideshow_slides: clean }).eq('id', weddingId)
      if (error) return { statusCode: 500, body: 'Failed to save slides' }
      return json({ ok: true, slides: clean })
    }

    return { statusCode: 400, body: 'Unknown op' }
  }

  // ── DELETE: remove one slide + its image ──
  if (event.httpMethod === 'DELETE') {
    const slideId = event.queryStringParameters?.slideId
    if (!slideId) return { statusCode: 400, body: 'Missing slideId' }
    const target = slides.find(s => s.id === slideId)
    const next = slides.filter(s => s.id !== slideId)
    const { error } = await admin.from('weddings').update({ slideshow_slides: next }).eq('id', weddingId)
    if (error) return { statusCode: 500, body: 'Failed to remove slide' }
    if (target) await deletePhotos([target.path])
    return json({ ok: true, slides: next })
  }

  return { statusCode: 405, body: 'Method Not Allowed' }
}
