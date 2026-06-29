-- Crowdtell — Model B live-feed tables (markets + meta) for the Supabase
-- realtime data layer. Run this ONCE in your Supabase project (SQL Editor),
-- after schema.sql. Safe to re-run.
--
-- Design: the published CLIENT feed (what public/feed.json already contains) is
-- mirrored here so the SPA can read it live and subscribe via Realtime — no site
-- rebuild per update. store.json stays the server source of truth; these tables
-- hold ONLY the client-visible feed, each market as a JSONB blob (proven lossless
-- in src/test/modelbRoundtrip.test.ts). Server-internal state (the collision
-- cache, briefedOddsPct/Favored, the full archive) NEVER lands here.
--
-- Security: RLS on. Reads are public (the feed is public). There are NO write
-- policies — only the pipeline's service_role key writes (it bypasses RLS), so
-- the browser can never mutate the feed.

-- ───────────────────────── feed_markets ─────────────────────────
-- One row per live market. `id` matches the market_id used by comments/story_likes
-- so the feed and the social tables share a single identifier.
create table if not exists public.feed_markets (
  id text primary key,
  status text not null,                 -- 'active' | 'resolved' (archived never reaches the client feed)
  score real not null default 0,        -- newsworthiness; default ACTIVE-tier ordering (resolved/archived sort client-side from data)
  category text,
  updated_at timestamptz not null default now(),
  data jsonb not null                   -- the full client Market object
);

create index if not exists feed_markets_status_score on public.feed_markets (status, score desc);
create index if not exists feed_markets_updated on public.feed_markets (updated_at desc);

alter table public.feed_markets enable row level security;

drop policy if exists "feed is public" on public.feed_markets;
create policy "feed is public" on public.feed_markets for select using (true);

-- ─────────────────────────── feed_meta ──────────────────────────
-- A single row carrying feed-level state: the global "Developing" strip, the
-- "Events" strip, and the snapshot timestamp. Kept separate so a strip update
-- touches one small row.
create table if not exists public.feed_meta (
  id text primary key default 'singleton',
  generated_at timestamptz,
  breaking jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb
);

-- Additive migration for an existing feed_meta created before the events strip.
-- Safe + idempotent: the client reads feed_meta with `select *` and falls back to
-- [] until this runs, so the realtime feed never breaks during the gap.
alter table public.feed_meta add column if not exists events jsonb not null default '[]'::jsonb;

alter table public.feed_meta enable row level security;

drop policy if exists "feed meta is public" on public.feed_meta;
create policy "feed meta is public" on public.feed_meta for select using (true);

-- ─────────────────── realtime publication (idempotent) ───────────────────
-- Add both tables to Supabase's realtime publication so the SPA gets live
-- INSERT/UPDATE/DELETE events. Guarded so re-running is safe.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_markets'
    ) then
      alter publication supabase_realtime add table public.feed_markets;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_meta'
    ) then
      alter publication supabase_realtime add table public.feed_meta;
    end if;
  end if;
end $$;
