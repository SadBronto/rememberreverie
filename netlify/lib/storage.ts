import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ── Shared storage layer ───────────────────────────────────────────────────────
// Reads/writes photos from Cloudflare R2 when the R2_* env vars are all present
// (zero-egress public-CDN delivery); otherwise falls back to the original Supabase
// Storage path. This lets the R2 code deploy safely and stay completely inert until
// the env vars are set — the deliberate "flip" that happens AFTER the backfill.

const SUPABASE_BUCKET = 'photos'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE,
} = process.env

export const R2_ENABLED = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE,
)

const s3 = R2_ENABLED
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID as string,
        secretAccessKey: R2_SECRET_ACCESS_KEY as string,
      },
    })
  : null

const PUBLIC_BASE = (R2_PUBLIC_BASE ?? '').replace(/\/+$/, '')

// Map each storage path → a display URL.
//   • R2:       stable public CDN URL (no signing, no egress, edge-cached)
//   • Supabase: short-lived signed URL (batched in one request)
export async function getPhotoUrls(paths: string[], expiry = 3600): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const clean = paths.filter(Boolean)
  if (clean.length === 0) return map

  if (R2_ENABLED) {
    for (const p of clean) map.set(p, `${PUBLIC_BASE}/${p}`)
    return map
  }

  const { data } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrls(clean, expiry)
  for (const item of data ?? []) {
    if (item.signedUrl && !item.error && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

// A URL the client can PUT a blob to. R2 → presigned PUT; Supabase → signed upload.
export async function getUploadUrl(path: string): Promise<string | null> {
  if (R2_ENABLED && s3) {
    // No ContentType in the command, so the client's Content-Type header is accepted
    // and stored — images then serve with the correct MIME from the CDN.
    return getSignedUrl(s3, new PutObjectCommand({ Bucket: R2_BUCKET as string, Key: path }), { expiresIn: 3600 })
  }
  const { data } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUploadUrl(path, { upsert: true })
  return data?.signedUrl ?? null
}

// Delete a set of storage paths (R2 or Supabase). Tolerant of empty/null entries.
export async function deletePhotos(paths: (string | null | undefined)[]): Promise<void> {
  const clean = paths.filter((p): p is string => Boolean(p))
  if (clean.length === 0) return

  if (R2_ENABLED && s3) {
    for (let i = 0; i < clean.length; i += 1000) {
      const Objects = clean.slice(i, i + 1000).map((Key) => ({ Key }))
      await s3.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET as string, Delete: { Objects } }))
    }
    return
  }

  for (let i = 0; i < clean.length; i += 100) {
    await supabase.storage.from(SUPABASE_BUCKET).remove(clean.slice(i, i + 100))
  }
}
