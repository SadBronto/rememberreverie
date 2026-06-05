-- ============================================================
-- Reverie — Schema Migration (run AFTER schema.sql)
-- Run this in the Supabase SQL editor.
-- Safe to re-run (uses IF EXISTS / IF NOT EXISTS).
-- ============================================================

-- ── 1. Expand the status check constraint ───────────────────
-- Adds: pending_setup (couple hasn't configured yet), paused (hidden from guests)
ALTER TABLE weddings DROP CONSTRAINT IF EXISTS weddings_status_check;

ALTER TABLE weddings
  ADD CONSTRAINT weddings_status_check
  CHECK (status IN ('pending_setup', 'draft', 'active', 'paused', 'reception_live', 'archived', 'expired'));

-- ── 2. Add vanity URL slug column ───────────────────────────
-- Nullable — set by admin in WeddingDetailPage
-- Path: rememberreverie.com/[slug] resolves to the wedding landing page
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS weddings_slug_unique ON weddings (slug) WHERE slug IS NOT NULL;

-- ── 3. Fix timestamp_style default ──────────────────────────
-- Old default was 'orange', new system uses 'classic'|'vertical'|'elegant'
ALTER TABLE weddings ALTER COLUMN timestamp_style SET DEFAULT 'classic';

-- ── 4. Add 'flagged' session status (content moderation) ────
-- Auto-moderation sets photos that read as explicit to 'flagged', which removes
-- them from the slideshow + couple gallery and surfaces them in admin review.
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('active', 'hidden', 'deleted', 'flagged'));

-- ── 5. Store the moderation result (for admin review context) ─
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS moderation_labels text;

-- ── 6. Per-event toggle: let the couple review their own flagged photos ─
-- Default off — moderation review is admin-only unless the admin grants it.
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS couple_review_enabled boolean NOT NULL DEFAULT false;
