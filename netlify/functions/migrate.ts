import type { Handler } from '@netlify/functions'
import { Client } from 'pg'

// POST /.netlify/functions/migrate?secret=MIGRATE_SECRET
// Called automatically by Netlify's outgoing webhook after each deploy.
// Applies any pending SQL migrations to the Supabase database.
// Protected by MIGRATE_SECRET env var — no secret, no run.

// ── Migration registry ────────────────────────────────────────────────────────
// Add new migrations here as { id, sql } entries.
// IDs must be unique and never change once applied.
// SQL must be idempotent (use IF NOT EXISTS, IF EXISTS, etc.).
const MIGRATIONS: Array<{ id: string; sql: string }> = [
  {
    id: 'v3_event_support_and_qr',
    sql: `
      ALTER TABLE weddings ADD COLUMN IF NOT EXISTS is_event BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE weddings ADD COLUMN IF NOT EXISTS event_end_date DATE NULL;
      ALTER TABLE weddings ADD COLUMN IF NOT EXISTS cleanup_warning_sent BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE weddings ALTER COLUMN wedding_date DROP NOT NULL;
      ALTER TABLE weddings ADD COLUMN IF NOT EXISTS cap_warning_sent BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE weddings ADD COLUMN IF NOT EXISTS qr_settings JSONB NULL;
    `,
  },
  // Add future migrations here:
  // { id: 'v4_whatever', sql: `ALTER TABLE ...` },
]

export const handler: Handler = async (event) => {
  // Auth check
  const secret = event.queryStringParameters?.secret
               ?? event.headers['x-migrate-secret']
  if (!secret || secret !== process.env.MIGRATE_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) return { statusCode: 500, body: 'DATABASE_URL not set' }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Find which migrations have already been applied
    const { rows } = await client.query(`SELECT id FROM _migrations`)
    const applied = new Set(rows.map((r: { id: string }) => r.id))

    const results: string[] = []

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) {
        results.push(`skip: ${migration.id}`)
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(`INSERT INTO _migrations (id) VALUES ($1)`, [migration.id])
        await client.query('COMMIT')
        results.push(`applied: ${migration.id}`)
        console.log(`migrate: applied ${migration.id}`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`migrate: failed ${migration.id}`, err)
        throw err
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, results }),
    }
  } catch (err) {
    console.error('migrate: error', err)
    return { statusCode: 500, body: String(err) }
  } finally {
    await client.end()
  }
}
