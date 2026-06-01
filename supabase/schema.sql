-- ============================================================
-- Reverie — Supabase schema
-- Run this in the Supabase SQL editor after creating a project.
-- ============================================================

-- ── Weddings ────────────────────────────────────────────────
create table if not exists weddings (
  id                   text primary key,
  couple_names         text        not null,
  wedding_date         date        not null,
  welcome_message      text        not null default 'Leave us a memory.',
  allowed_modes        text[]      not null default array['disposable'],
  preferred_orientation text       not null default 'any',
  annotation_mode      text        not null default 'signature',
  slideshow_enabled    boolean     not null default false,
  timestamp_enabled    boolean     not null default true,
  timestamp_style      text        not null default 'orange',
  theme_color          text,
  hero_image_url       text,
  photo_cap            integer,
  is_demo_mode         boolean     not null default false,
  status               text        not null default 'active'
    check (status in ('draft', 'active', 'reception_live', 'archived', 'expired')),
  couple_email         text,
  created_at           timestamptz not null default now()
);

-- ── Sessions (individual photo captures) ────────────────────
create table if not exists sessions (
  id             text        primary key,
  wedding_id     text        not null references weddings(id) on delete cascade,
  mode           text        not null check (mode in ('disposable', 'polaroid', 'super8')),
  output_path    text,           -- Supabase Storage path for processed photo
  annotation_path text,          -- Supabase Storage path for annotation layer
  memory_number  integer,
  captured_at    timestamptz,
  uploaded_at    timestamptz not null default now(),
  status         text        not null default 'active'
    check (status in ('active', 'hidden', 'deleted'))
);

-- Auto-assign sequential memory numbers per wedding
create or replace function assign_memory_number()
returns trigger language plpgsql as $$
begin
  new.memory_number := coalesce(
    (select max(memory_number) from sessions where wedding_id = new.wedding_id),
    0
  ) + 1;
  return new;
end;
$$;

drop trigger if exists sessions_assign_memory_number on sessions;
create trigger sessions_assign_memory_number
  before insert on sessions
  for each row execute procedure assign_memory_number();

-- ── Row-level security ───────────────────────────────────────
alter table weddings enable row level security;
alter table sessions enable row level security;

-- Guests can read wedding configs (required for landing page)
create policy "public_read_weddings"   on weddings for select using (true);

-- Guests can create sessions (required for photo upload)
create policy "public_insert_sessions" on sessions for insert with check (true);

-- Guests can read their own session (for confirmation/memory number)
-- Couples will get a broader read policy via auth (added later)
create policy "public_read_sessions"   on sessions for select using (true);

-- ── Storage bucket ───────────────────────────────────────────
-- Run in the Supabase dashboard: Storage → New bucket → "photos" → public: false
-- Then add these policies in Storage → photos → Policies:
--
--   INSERT: ((bucket_id = 'photos') AND (auth.role() = 'anon'))
--   SELECT: ((bucket_id = 'photos'))   ← couples will scope to their weddingId via RLS later
--
-- Or paste this SQL:

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "anon_upload_photos"
  on storage.objects for insert
  with check (bucket_id = 'photos');

create policy "authenticated_read_photos"
  on storage.objects for select
  using (bucket_id = 'photos');

-- ── Couple auth policies (add after enabling Supabase Auth) ─
-- These allow authenticated couples to read their own wedding's sessions
-- and update session visibility, using their email as the ownership key.
--
-- Run these AFTER enabling Auth in the Supabase dashboard.

-- Couples can read all sessions for their wedding (supersedes the public policy)
create policy "couple_read_own_sessions"
  on sessions for select
  using (
    wedding_id in (
      select id from weddings
      where couple_email = (auth.jwt() ->> 'email')
    )
  );

-- Couples can hide/unhide photos (status: active ↔ hidden)
create policy "couple_update_session_status"
  on sessions for update
  using (
    wedding_id in (
      select id from weddings
      where couple_email = (auth.jwt() ->> 'email')
    )
  )
  with check (status in ('active', 'hidden'));

-- ── Seed data (optional — for dev) ──────────────────────────
-- insert into weddings (id, couple_names, wedding_date, couple_email)
-- values ('dev-wedding', 'Sophia & James', '2026-06-14', 'you@example.com');
