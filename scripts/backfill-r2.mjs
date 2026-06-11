// One-time copy of every photo from Supabase Storage → Cloudflare R2.
// Safe to re-run: it HEAD-checks R2 and skips objects already there (resumable).
//
// Run it AFTER the R2 bucket exists but BEFORE you set the Netlify env vars
// (the flip). PowerShell:
//
//   $env:SUPABASE_URL="https://<ref>.supabase.co"
//   $env:SUPABASE_SERVICE_KEY="<service role key>"
//   $env:R2_ACCOUNT_ID="<account id>"
//   $env:R2_ACCESS_KEY_ID="<r2 access key>"
//   $env:R2_SECRET_ACCESS_KEY="<r2 secret>"
//   $env:R2_BUCKET="reverie-photos"
//   node scripts/backfill-r2.mjs

import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

// Load a local .env if present, so `node scripts/backfill-r2.mjs` works without
// exporting vars by hand. (No-op if there's no .env — shell env still works.)
try { process.loadEnvFile() } catch { /* no .env file; rely on shell env */ }

const {
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
} = process.env

const missing = Object.entries({
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
}).filter(([, v]) => !v).map(([k]) => k)

if (missing.length) {
  console.error('Missing env vars:', missing.join(', '))
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

const SUPABASE_BUCKET = 'photos'
const contentType = (p) => (p.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')

async function existsInR2(Key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key }))
    return true
  } catch {
    return false
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function copyOne(path) {
  if (await existsInR2(path)) return 'skip'
  const { data: blob, error } = await supabase.storage.from(SUPABASE_BUCKET).download(path)
  if (error || !blob) throw new Error(`download failed: ${error?.message ?? 'no data'}`)
  const body = Buffer.from(await blob.arrayBuffer())
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: path, Body: body, ContentType: contentType(path) }))
  return 'copied'
}

async function main() {
  // Collect every storage path referenced by a non-deleted session.
  const paths = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('sessions')
      .select('output_path, annotation_path')
      .neq('status', 'deleted')
      .range(from, from + PAGE - 1)
    if (error) { console.error('DB query failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const s of data) {
      if (s.output_path) paths.push(s.output_path)
      if (s.annotation_path) paths.push(s.annotation_path)
    }
    if (data.length < PAGE) break
  }

  console.log(`Found ${paths.length} objects to copy.`)
  let copied = 0, skipped = 0, failed = 0

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    const tag = `[${i + 1}/${paths.length}] ${path}`
    // Retry transient network/TLS blips (e.g. "bad record mac") a few times.
    let outcome = null, lastErr = null
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { outcome = await copyOne(path); lastErr = null; break }
      catch (err) { lastErr = err; await sleep(500 * attempt) }
    }
    if (lastErr) { console.warn(`${tag} — failed after retries: ${lastErr.message}`); failed++; continue }
    if (outcome === 'skip') { skipped++; continue }
    copied++
    if (copied % 25 === 0) console.log(`  …${copied} copied`)
  }

  console.log(`\nDone. Copied ${copied}, skipped ${skipped} (already present), failed ${failed}.`)
  if (failed > 0) process.exit(2)
}

main()
