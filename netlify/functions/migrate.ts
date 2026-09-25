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
  // Future migrations go here:
  // { id: 'v10_...', sql: [`ALTER TABLE ...`] },
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
