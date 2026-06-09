// Build demo gallery assets from the `DEMO PHOTOS/` drop folder.
//
//   node scripts/build-demo-assets.mjs
//
// - Detects each photo's MODE from its aspect ratio (3:2 or 2:3 = disposable,
//   1:1 = polaroid, 4:3 = super 8).
// - Reads STATUS from the filename prefix (FLAGGED- / FLAGGED_ / HIDDEN- / HIDDEN_,
//   case-insensitive). No prefix = active/visible.
// - Converts photos to JPEG into public/demo-media/photos/ for fast loading.
// - Assigns sig1..sig6 to 6 random ACTIVE polaroids (stable seed, no repeats),
//   compositing each into a transparent polaroid-sized annotation PNG positioned
//   in the signing band.
// - Emits the manifest at src/demo/demoData.ts.
//
// Photos themselves are filtered at RUNTIME through the real processSession
// pipeline (browser canvas) so the demo can't drift from the product.

import sharp from 'sharp'
import { readdirSync, mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'fs'
import { join } from 'path'

const SRC_DIR   = 'DEMO PHOTOS'
const OUT_DIR   = 'public/demo-media/photos'
const PUB_BASE  = '/demo-media/photos'
const MANIFEST  = 'src/demo/demoData.ts'

// Polaroid frame geometry (mirrors src/config/modes.ts polaroid borders applied to
// a 2400px-square photo area) — used to place signatures in the signing band.
const PHOTO = 2400
const bL = Math.round(PHOTO * 0.055), bR = Math.round(PHOTO * 0.055)
const bT = Math.round(PHOTO * 0.055), bB = Math.round(PHOTO * 0.28)
const FRAME_W = PHOTO + bL + bR        // 2664
const FRAME_H = PHOTO + bT + bB        // 3204

function detectMode(w, h) {
  const r = w / h
  const cands = [['disposable', 1.5], ['disposable', 2 / 3], ['polaroid', 1], ['super8', 4 / 3]]
  let best = null, bd = Infinity
  for (const [m, v] of cands) { const d = Math.abs(r - v); if (d < bd) { bd = d; best = m } }
  return bd < 0.05 ? best : null
}

function statusOf(name) {
  if (/^flagged[-_]/i.test(name)) return 'flagged'
  if (/^hidden[-_]/i.test(name))  return 'hidden'
  return 'active'
}

// Deterministic shuffle so the signature assignment is stable across rebuilds.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(0x5EED)

// ── scan source folder ──
const all = readdirSync(SRC_DIR).filter(f => /\.(jpg|jpeg|png|webp|avif)$/i.test(f))
const sigFiles = all.filter(f => /^sig\d/i.test(f)).sort()
const photoFiles = all.filter(f => !/^sig\d/i.test(f))

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const counters = { disposable: 0, polaroid: 0, super8: 0 }
const idPrefix = { disposable: 'd', polaroid: 'p', super8: 's' }

const photos = []
for (const f of photoFiles.sort()) {
  const meta = await sharp(join(SRC_DIR, f)).metadata()
  const mode = detectMode(meta.width, meta.height)
  if (!mode) { console.warn('  ! skipped (unrecognized aspect):', f, `${meta.width}x${meta.height}`); continue }
  const status = statusOf(f)
  const id = `${idPrefix[mode]}${String(++counters[mode]).padStart(2, '0')}`
  const out = `${id}.jpg`
  await sharp(join(SRC_DIR, f)).jpeg({ quality: 88, mozjpeg: true }).toFile(join(OUT_DIR, out))
  photos.push({ id, src: `${PUB_BASE}/${out}`, w: meta.width, h: meta.height, mode, status, sigSrc: null, orig: f })
}

// ── assign signatures to 6 random ACTIVE polaroids ──
const activePolaroids = photos.filter(p => p.mode === 'polaroid' && p.status === 'active')
// stable shuffle
for (let i = activePolaroids.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));[activePolaroids[i], activePolaroids[j]] = [activePolaroids[j], activePolaroids[i]]
}
const chosen = activePolaroids.slice(0, Math.min(sigFiles.length, activePolaroids.length))

for (let i = 0; i < chosen.length; i++) {
  const sig = sigFiles[i]
  const sigId = `${chosen[i].id}.sig.png`
  // trim transparent margins, fit into a box inside the signing band, center it
  const boxW = Math.round(PHOTO * 0.70), boxH = Math.round(bB * 0.62)
  const inked = await sharp(join(SRC_DIR, sig)).trim().resize(boxW, boxH, { fit: 'inside' }).toBuffer()
  const im = await sharp(inked).metadata()
  const left = Math.round((FRAME_W - im.width) / 2)
  const bandCenterY = (FRAME_H - bB) + Math.round(bB / 2)
  const top = Math.round(bandCenterY - im.height / 2)
  await sharp({ create: { width: FRAME_W, height: FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inked, left, top }])
    .png()
    .toFile(join(OUT_DIR, sigId))
  chosen[i].sigSrc = `${PUB_BASE}/${sigId}`
}

// ── synthesize capture order / memory numbers (interleave modes for a natural mix) ──
const byMode = { disposable: [], polaroid: [], super8: [] }
for (const p of photos) byMode[p.mode].push(p)
const ordered = []
let added = true
while (added) {
  added = false
  for (const m of ['disposable', 'polaroid', 'super8']) {
    if (byMode[m].length) { ordered.push(byMode[m].shift()); added = true }
  }
}
const start = new Date('2026-09-19T18:30:00')
ordered.forEach((p, i) => {
  p.memoryNumber = i + 1
  p.capturedAt = new Date(start.getTime() + i * 4 * 60 * 1000).toISOString() // ~every 4 min
})

// ── emit manifest ──
const entries = ordered.map(p => ({
  id: p.id, src: p.src, w: p.w, h: p.h, mode: p.mode, status: p.status,
  sigSrc: p.sigSrc, memoryNumber: p.memoryNumber, capturedAt: p.capturedAt,
}))

const ts = `// GENERATED by scripts/build-demo-assets.mjs — do not edit by hand.
// Re-run \`node scripts/build-demo-assets.mjs\` after changing DEMO PHOTOS/.
import type { CameraModeName } from '@/types/session'

export interface DemoPhoto {
  id: string
  src: string            // raw photo (public path); filtered at runtime via processSession
  w: number
  h: number
  mode: CameraModeName
  status: 'active' | 'flagged' | 'hidden'
  sigSrc: string | null  // pre-composited transparent signature annotation, if any
  memoryNumber: number
  capturedAt: string     // ISO
}

export const DEMO_PHOTOS: DemoPhoto[] = ${JSON.stringify(entries, null, 2)}
`
mkdirSync('src/demo', { recursive: true })
writeFileSync(MANIFEST, ts)

// ── report ──
const tally = photos.reduce((a, p) => { a[`${p.mode}/${p.status}`] = (a[`${p.mode}/${p.status}`] || 0) + 1; return a }, {})
console.log('Photos processed:', photos.length)
console.log('Tally:', tally)
console.log('Signatures applied:', chosen.length, '->', chosen.map(c => c.id).join(', '))
console.log('Manifest:', MANIFEST)
