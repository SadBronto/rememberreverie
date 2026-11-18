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
    .select('id, couple_email, slideshow_slides, slideshow_slide_every, slideshow_slide_seconds, slideshow_slide_order')
    .eq('id', weddingId)
    .single()
  if (!wedding) return { statusCode: 404, body: 'Not found' }

  // Admins can manage any event's slides; otherwise the caller must own this event.
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = adminEmails.includes(user.email.toLowerCase())
  if (!isAdmin && wedding.couple_email !== user.email) {
    return { statusCode: 403, body: 'Forbidden' }
  }

  const slides: Slide[] = Array.isArray(wedding.slideshow_slides) ? wedding.slideshow_slides as Slide[] : []
  const prefix = `slides/${weddingId}/`

  // ── GET: list with signed display URLs + timing settings ──
  if (event.httpMethod === 'GET') {
    const urlMap = await getPhotoUrls(slides.map(s => s.path), 3600)
    // Watermark logo, fetched separately so an un-migrated column never breaks slides.
    let watermark: { url: string | null; photos: boolean; slideshow: boolean } | null = null
    let watermarkEnabled = false
    {
      const { data: wm, error: wmErr } = await admin
        .from('weddings').select('watermark_path, watermark_photos, watermark_slideshow').eq('id', weddingId).single()
      watermarkEnabled = !wmErr && !!(wm?.watermark_photos || wm?.watermark_slideshow)
      if (!wmErr && wm?.watermark_path) {
        const u = await getPhotoUrls([wm.watermark_path], 3600)
        watermark = { url: u.get(wm.watermark_path) ?? null, photos: !!wm.watermark_photos, slideshow: !!wm.watermark_slideshow }
      }
    }
    return json({
      watermark,
      watermarkEnabled,
      slides: slides.map(s => ({ id: s.id, path: s.path, url: urlMap.get(s.path) ?? null })),
      every: wedding.slideshow_slide_every ?? 7,
      seconds: wedding.slideshow_slide_seconds ?? 12,
      order: wedding.slideshow_slide_order ?? 'rotate',
    })
  }

  // ── POST: upload-url | save | settings ──
  if (event.httpMethod === 'POST') {
    let body: { op?: string; contentType?: string; slides?: Slide[]; every?: number; seconds?: number; order?: string; path?: string }
    try { body = JSON.parse(event.body ?? '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }

    if (body.op === 'settings') {
      const every = Math.max(1, Math.min(50, Math.round(Number(body.every) || 7)))
      const seconds = Math.max(3, Math.min(60, Math.round(Number(body.seconds) || 12)))
      const order = ['rotate', 'together', 'random'].includes(body.order ?? '') ? body.order! : (wedding.slideshow_slide_order ?? 'rotate')
      const { error } = await admin
        .from('weddings')
        .update({ slideshow_slide_every: every, slideshow_slide_seconds: seconds, slideshow_slide_order: order })
        .eq('id', weddingId)
      if (error) return { statusCode: 500, body: 'Failed to save settings' }
      return json({ ok: true, every, seconds, order })
    }

    // Logo watermark: transparent PNG/WebP, one per event.
    if (body.op === 'watermark-upload-url') {
      const ext = ({ 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[(body.contentType ?? '').toLowerCase()]
      if (!ext) return { statusCode: 400, body: 'Use a PNG or WebP image (transparent works best)' }
      const path = `watermarks/${weddingId}/logo-${Date.now()}.${ext}`
      const uploadUrl = await getUploadUrl(path)
      if (!uploadUrl) return { statusCode: 500, body: 'Could not create upload URL' }
      return json({ path, uploadUrl })
    }
    if (body.op === 'watermark-save') {
      const path = (body as { path?: string }).path ?? ''
      if (!path.startsWith(`watermarks/${weddingId}/`)) return { statusCode: 400, body: 'Bad path' }
      const { data: prev } = await admin.from('weddings').select('watermark_path').eq('id', weddingId).single()
      const { error } = await admin.from('weddings').update({ watermark_path: path }).eq('id', weddingId)
      if (error) return { statusCode: 500, body: 'Failed to save watermark' }
      if (prev?.watermark_path && prev.watermark_path !== path) await deletePhotos([prev.watermark_path])
      return json({ ok: true })
    }
    if (body.op === 'watermark-remove') {
      const { data: prev } = await admin.from('weddings').select('watermark_path').eq('id', weddingId).single()
      const { error } = await admin.from('weddings').update({ watermark_path: null }).eq('id', weddingId)
      if (error) return { statusCode: 500, body: 'Failed to remove watermark' }
      if (prev?.watermark_path) await deletePhotos([prev.watermark_path])
      return json({ ok: true })
    }

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
