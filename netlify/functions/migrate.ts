import type { Handler } from '@netlify/functions'

// POST /.netlify/functions/migrate?secret=MIGRATE_SECRET
// Called automatically by Netlify's outgoing webhook after each successful deploy.
// Uses the Supabase Management API — no database password required.
// Env vars needed: MIGRATE_SECRET, SUPABASE_ACCESS_TOKEN

const PROJECT_REF = 'zeksicwmmwaijjdsacod'
const MGMT_URL    = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

// ── Migration registry ────────────────────────────────────────────────────────
// Add new entries here for every schema change going forward.
// IDs must be unique and never change once applied.
// SQL must be idempotent (IF NOT EXISTS etc.) in case of partial failures.
const MIGRATIONS: Array<{ id: string; sql: string[] }> = [
  {
    id: 'v3_event_support_and_qr',
    sql: [
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS is_event BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS event_end_date DATE NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS cleanup_warning_sent BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE weddings ALTER COLUMN wedding_date DROP NOT NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS cap_warning_sent BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS qr_settings JSONB NULL`,
    ],
  },
  {
    id: 'v4_geofence',
    sql: [
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS geofence_lat DOUBLE PRECISION NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS geofence_lng DOUBLE PRECISION NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS geofence_bypass_code TEXT NULL`,
    ],
  },
  {
    id: 'v5_selfie',
    sql: [
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS selfie_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
    ],
  },
  {
    id: 'v6_slideshow_fullscreen',
    sql: [
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_auto_fullscreen BOOLEAN NOT NULL DEFAULT FALSE`,
    ],
  },
  {
    id: 'v7_slideshow_poll',
    sql: [
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_slow_poll BOOLEAN NOT NULL DEFAULT FALSE`,
    ],
  },
  {
    id: 'v8_v2_foundation',
    sql: [
      // Tier: 'basic' (Reverie) | 'live' (Reverie Live). Drives slideshow + moderation.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'basic'`,
      // Unified capture window (mandatory end date; timezone for correct date-gating).
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS capture_start DATE NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS capture_end DATE NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS event_timezone TEXT NULL`,
      // Unified retention: photos + slug deleted after this date (base = capture_end + 90d).
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS retention_until DATE NULL`,
      // Paid add-ons.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS addon_unlimited BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS addon_geofence BOOLEAN NOT NULL DEFAULT FALSE`,
      // When a photo was run through Vision — powers the global daily cost ceiling.
      `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL`,
    ],
  },
  {
    id: 'v9_timestamp_and_border',
    sql: [
      // Per-event timestamp size (small | medium | large).
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS timestamp_size TEXT NOT NULL DEFAULT 'medium'`,
    ],
  },
  {
    id: 'v10_timestamp_outline',
    sql: [
      // Outline on the light "elegant" timestamp: 'off' | 'small' | 'medium' | 'large'.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS timestamp_outline TEXT NOT NULL DEFAULT 'medium'`,
    ],
  },
  {
    id: 'v11_provisioning',
    sql: [
      // Self-serve provisioning: link a Lemon Squeezy order to its event (the
      // unique index makes re-delivered webhooks idempotent), and record amount +
      // time for the future escrow / refund readout.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS ls_order_id TEXT NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS order_amount INTEGER NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS weddings_ls_order_id_key ON weddings (ls_order_id) WHERE ls_order_id IS NOT NULL`,
    ],
  },
  {
    id: 'v12_staff_moderation',
    sql: [
      // Per-event shared password for the on-site staff moderation page
      // (/staff/:slug) — lets bar/venue staff remove a bad photo without a login.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS staff_code TEXT NULL`,
      // Who removed a photo ('staff' | 'host' | 'admin' | NULL) so staff-removed
      // photos are identifiable in the hidden archive for review.
      `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS removed_by TEXT NULL`,
    ],
  },
  {
    id: 'v13_pinned_photos',
    sql: [
      // Pinned ("kept") photos are exempt from the rolling photo-cap deletion.
      `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE`,
    ],
  },
  {
    id: 'v14_slide_timing',
    sql: [
      // How often a custom slide appears (after every N photos) and how long it stays.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_slide_every INTEGER NOT NULL DEFAULT 7`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_slide_seconds INTEGER NOT NULL DEFAULT 12`,
    ],
  },
  {
    id: 'v15_device_token',
    sql: [
      // Per-device anti-spam rate limiting: the client stamps each upload with a
      // random per-device token so we can throttle a single phone without blocking
      // a whole venue (which shares one IP).
      `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_token TEXT NULL`,
      `CREATE INDEX IF NOT EXISTS sessions_device_rate_idx ON sessions (wedding_id, device_token, uploaded_at)`,
    ],
  },
  {
    id: 'v16_upload_errors',
    sql: [
      // Server-side log of failed uploads, so recurring failures can be reviewed and
      // fixed. Written (fire-and-forget) by the client on a terminal upload failure;
      // read by the admin-only /api/admin/upload-errors dump. RLS on; the functions
      // use the service key, so the anon key can never read it.
      `CREATE TABLE IF NOT EXISTS upload_errors (
        id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        wedding_id   TEXT NULL,
        session_id   TEXT NULL,
        device_token TEXT NULL,
        stage        TEXT NULL,
        status       INTEGER NULL,
        detail       TEXT NULL,
        attempt      INTEGER NULL,
        retry        BOOLEAN NULL
      )`,
      `ALTER TABLE upload_errors ENABLE ROW LEVEL SECURITY`,
      `CREATE INDEX IF NOT EXISTS upload_errors_created_idx ON upload_errors (created_at DESC)`,
    ],
  },
  {
    id: 'v17_spotlight_new',
    sql: [
      // Per-event option: a freshly taken photo jumps the queue and plays right after
      // the current slide, then also takes its normal place at the end of the rotation.
      // Off by default so existing events behave exactly as before until enabled.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_spotlight_new BOOLEAN NOT NULL DEFAULT FALSE`,
    ],
  },
  {
    id: 'v18_service_health',
    sql: [
      // Display heartbeat: the slideshow reports in on each poll, so we can tell when a
      // venue's screen goes quiet or freezes. State/alert columns drive the scheduled
      // health check (one alert per incident, a recovery notice, a daily reminder).
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_seen_at TIMESTAMPTZ NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_advanced_at TIMESTAMPTZ NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_visible BOOLEAN NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_build TEXT NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_state TEXT NOT NULL DEFAULT 'unknown'`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_alerted_at TIMESTAMPTZ NULL`,
      // Per-event monitoring controls: on/off, and optional business hours (HH:MM in the
      // event timezone) so a display that is switched off at night doesn't page anyone.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_monitor BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_hours_start TEXT NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS display_hours_end TEXT NULL`,
      // Running log of NOTABLE events only (crashes, boot failures, display offline /
      // recovered, upload-failure spikes). Not a request log: routine traffic is never
      // stored. Kept 90 days, pruned by the daily cleanup job.
      `CREATE TABLE IF NOT EXISTS service_events (
        id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        wedding_id TEXT NULL,
        kind       TEXT NOT NULL,
        severity   TEXT NOT NULL DEFAULT 'warn',
        source     TEXT NULL,
        detail     TEXT NULL,
        meta       JSONB NULL
      )`,
      `ALTER TABLE service_events ENABLE ROW LEVEL SECURITY`,
      `CREATE INDEX IF NOT EXISTS service_events_created_idx ON service_events (created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS service_events_wedding_kind_idx ON service_events (wedding_id, kind, created_at DESC)`,
    ],
  },
  {
    id: 'v19_qr_slide_timing',
    sql: [
      // Per-event timing for the "scan to share" slide: show it after every N photos,
      // and keep it on screen for N seconds. Defaults match the old fixed behavior.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_qr_every INTEGER NOT NULL DEFAULT 10`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_qr_seconds INTEGER NOT NULL DEFAULT 12`,
    ],
  },
  {
    id: 'v20_session_modes',
    sql: [
      // The original check only allowed disposable/polaroid/super8, so every Noir,
      // Flash and Champagne photo was rejected at insert and sat in the guest's
      // "waiting to upload" queue forever. Allow all six camera modes.
      `ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_mode_check`,
      `ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check CHECK (mode IN ('disposable','polaroid','super8','noir','flash','champagne'))`,
    ],
  },
  {
    id: 'v21_slide_order',
    sql: [
      // How custom slides play when it is their turn: 'rotate' (one per turn, in order),
      // 'together' (all of them back to back), 'random' (shuffled, no repeats until all shown).
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_slide_order TEXT NOT NULL DEFAULT 'rotate'`,
    ],
  },
  {
    id: 'v22_privacy_watermark',
    sql: [
      // Private slideshow: each display must be approved by the owner before it plays.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slideshow_private BOOLEAN NOT NULL DEFAULT FALSE`,
      `CREATE TABLE IF NOT EXISTS display_approvals (
         wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
         display_id  TEXT NOT NULL,
         approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         approved_by TEXT NULL,
         PRIMARY KEY (wedding_id, display_id)
       )`,
      `ALTER TABLE display_approvals ENABLE ROW LEVEL SECURITY`,
      // Logo watermark: stored path, plus where it is applied (burned into new photos, and/or over the TV).
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS watermark_path TEXT NULL`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS watermark_photos BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS watermark_slideshow BOOLEAN NOT NULL DEFAULT FALSE`,
    ],
  },
  {
    id: 'v23_watermark_controls',
    sql: [
      // Client-chosen watermark placement and strength.
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS watermark_position TEXT NOT NULL DEFAULT 'bottom-left'`,
      `ALTER TABLE weddings ADD COLUMN IF NOT EXISTS watermark_opacity INTEGER NOT NULL DEFAULT 85`,
      // Throttle for "email the owner to approve this screen" requests.
      `CREATE TABLE IF NOT EXISTS display_requests (
         wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
         display_id   TEXT NOT NULL,
         requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (wedding_id, display_id)
       )`,
      `ALTER TABLE display_requests ENABLE ROW LEVEL SECURITY`,
    ],
  },
  // Future migrations go here:
  // { id: 'v24_...', sql: [`ALTER TABLE ...`] },
]

async function run(sql: string, token: string): Promise<unknown> {
  const res = await fetch(MGMT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`SQL error: ${await res.text()}`)
  return res.json()
}

export const handler: Handler = async (event) => {
  const secret = event.queryStringParameters?.secret ?? event.headers['x-migrate-secret']
  if (!secret || secret !== process.env.MIGRATE_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) return { statusCode: 500, body: 'SUPABASE_ACCESS_TOKEN not set' }

  try {
    // Ensure migrations tracking table exists with RLS enabled
    await run(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `, token)
    await run(`ALTER TABLE _migrations ENABLE ROW LEVEL SECURITY`, token)

    // Find already-applied migrations
    const rows = await run(`SELECT id FROM _migrations`, token) as Array<{ id: string }>
    const applied = new Set(rows.map(r => r.id))

    const results: string[] = []

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) {
        results.push(`skip: ${migration.id}`)
        continue
      }

      for (const stmt of migration.sql) {
        await run(stmt, token)
      }

      await run(`INSERT INTO _migrations (id) VALUES ('${migration.id}') ON CONFLICT DO NOTHING`, token)
      results.push(`applied: ${migration.id}`)
      console.log(`migrate: applied ${migration.id}`)
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, results }) }
  } catch (err) {
    console.error('migrate error:', err)
    return { statusCode: 500, body: String(err) }
  }
}
