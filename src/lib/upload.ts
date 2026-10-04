import type { CaptureSession } from '@/types/session'

interface UploadResult {
  success: boolean
  permanent: boolean   // true = server rejected it in a way retrying can't fix (4xx)
  memoryNumber: number | null
  retryCount: number
}

const MAX_RETRIES = 4
const RETRY_DELAYS_MS = [1000, 2500, 5000, 10000]

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// A stable per-device id (this browser), so the server can rate-limit one phone
// without affecting everyone on the venue's shared Wi-Fi. Best-effort: if storage
// is blocked we just send a throwaway id.
function getDeviceToken(): string {
  try {
    let t = localStorage.getItem('reverie-device')
    if (!t) {
      t = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem('reverie-device', t)
    }
    return t
  } catch {
    return `anon-${Math.random().toString(36).slice(2, 10)}`
  }
}

// Upload a blob to a signed URL via HTTP PUT
async function putBlob(signedUrl: string, blob: Blob, contentType: string): Promise<boolean> {
  try {
    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    })
    return res.ok
  } catch {
    return false
  }
}

export async function uploadSession(session: CaptureSession): Promise<UploadResult> {
  let retryCount = 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1])
      retryCount = attempt
    }

    try {
      // Step 1: Register the session — server creates DB record + returns signed upload URLs
      const registerRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId:     session.id,
          weddingId:     session.weddingId,
          mode:          session.mode,
          capturedAt:    session.capturedAt.toISOString(),
          hasAnnotation: !!session.annotation,
          deviceToken:   getDeviceToken(),
        }),
      })

      // 429 = rate-limited (too many from this device just now). NOT permanent: keep
      // it queued so it uploads once the short window clears, rather than dropping it.
      if (registerRes.status === 429) {
        return { success: false, permanent: false, memoryNumber: null, retryCount }
      }

      // 4xx = non-retryable (bad request, wedding not found or deleted, etc.). Mark it
      // PERMANENT so the recovery queue discards it instead of retrying a dead photo
      // forever.
      if (registerRes.status >= 400 && registerRes.status < 500) {
        console.warn('Upload register non-retryable error:', registerRes.status)
        return { success: false, permanent: true, memoryNumber: null, retryCount }
      }

      if (!registerRes.ok) throw new Error(`Register failed: ${registerRes.status}`)

      const { memoryNumber, uploadUrl, annotationUploadUrl } = await registerRes.json()

      // Step 2: Upload photo blob directly to storage (bypasses Netlify size limits)
      if (session.outputImage && uploadUrl) {
        const ok = await putBlob(uploadUrl, session.outputImage, 'image/jpeg')
        if (!ok) throw new Error('Photo upload to storage failed')
      }

      // Step 3: Upload annotation PNG if present (failure is non-fatal)
      if (session.annotation && annotationUploadUrl) {
        try {
          const annotRes = await fetch(session.annotation.dataUrl)
          const annotBlob = await annotRes.blob()
          await putBlob(annotationUploadUrl, annotBlob, 'image/png')
        } catch {
          // Annotation upload failure doesn't fail the whole session
        }
      }

      // Step 4: trigger content moderation. Fire-and-forget — `keepalive` lets the
      // request finish server-side even if the guest immediately navigates away.
      // No-ops on the server if no Vision key is configured; never blocks the upload.
      try {
        void fetch('/api/moderate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
          keepalive: true,
        }).catch(() => {})
      } catch { /* moderation must never break a successful upload */ }

      return { success: true, permanent: false, memoryNumber: memoryNumber ?? null, retryCount }
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error('Upload failed after max retries:', err)
        return { success: false, permanent: false, memoryNumber: null, retryCount }
      }
    }
  }

  return { success: false, permanent: false, memoryNumber: null, retryCount }
}
