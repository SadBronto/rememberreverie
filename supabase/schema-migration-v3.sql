-- ============================================================
-- Reverie — Schema Migration v3
-- Non-wedding event support + event cleanup system.
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── 1. Event flag ────────────────────────────────────────────
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS is_event BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Event end date (controls cleanup for non-wedding events)
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS event_end_date DATE NULL;

-- ── 3. Tracks whether the 7-day warning email has been sent ──
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS cleanup_warning_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 4. Make wedding_date nullable (events may have no date) ──
ALTER TABLE weddings ALTER COLUMN wedding_date DROP NOT NULL;

-- ── 5. Tracks whether the 80% photo cap warning email has been sent ──
-- Reset to FALSE whenever photo_cap is changed so the warning can fire again.
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS cap_warning_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 6. Saved QR creator settings (JSON blob) ─────────────────
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS qr_settings JSONB NULL;
