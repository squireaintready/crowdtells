-- Crowdtell — comments, likes, and moderation schema.
-- Run this once in your Supabase project (SQL Editor). Safe to re-run.
--
-- Security model: Row-Level Security on every table. Reads are public; writes
-- require an authenticated user and are scoped to their own rows. A trigger
-- rate-limits comments. Profiles are auto-created on signup.

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Validate attacker-controllable profile fields: cap the display name and force
-- avatar URLs to be http(s) (no javascript:/data: beacons). Idempotent.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_len') then
    alter table public.profiles add constraint profiles_display_name_len
      check (display_name is null or char_length(display_name) <= 50);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_scheme') then
    alter table public.profiles add constraint profiles_avatar_url_scheme
      check (avatar_url is null or avatar_url ~ '^https?://');
  end if;
end $$;

-- Create a profile automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, 'member'), '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────── comments ─────────────────────────
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  market_id text not null,
  -- references profiles (not auth.users) so PostgREST can embed the author
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted boolean not null default false,
  -- Optional call-annotation context: set when a comment is posted as a public
  -- note ON the author's own Call (TheCall). Nullable, no default — a plain
  -- comment leaves both null. The "insert own comments" policy (auth.uid() =
  -- user_id) already authorizes these columns; no separate grant is needed.
  -- These are additive — the comments insert path fails soft when they're
  -- absent, so the app keeps working until this migration is re-run.
  call_pick text,        -- 'yes' | 'no' (the author's pick on the market target)
  call_confidence int    -- 55–95 confidence ladder value
);

create index if not exists comments_market_idx on public.comments (market_id, created_at desc);

-- Backfill the optional call-annotation columns. They're declared in the create-table
-- above, but `create table if not exists` NEVER adds columns to an already-existing
-- comments table — so any project created before these columns existed would lack them,
-- and every comment-load SELECT (which requests call_pick/call_confidence) 400s with
-- "column comments.call_pick does not exist". This explicit, idempotent add fixes it.
alter table public.comments add column if not exists call_pick text;
alter table public.comments add column if not exists call_confidence int;

alter table public.comments enable row level security;

-- Deleted comments are hidden from everyone; admins read them via the service role.
drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments for select using (deleted = false);

drop policy if exists "insert own comments" on public.comments;
create policy "insert own comments" on public.comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own comments" on public.comments;
create policy "update own comments" on public.comments for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own comments" on public.comments;
create policy "delete own comments" on public.comments for delete using (auth.uid() = user_id);

-- Integrity guard: the "update own comments" policy alone would let an owner
-- rewrite immutable fields or restore a deleted comment. Lock those down and
-- stamp edits server-side, so the DB (not the client) is the trust boundary.
create or replace function public.guard_comment_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> old.user_id
     or new.market_id <> old.market_id
     or new.created_at <> old.created_at
     or new.parent_id is distinct from old.parent_id then
    raise exception 'Only a comment''s body or deleted flag may change.';
  end if;
  -- A deleted comment cannot be restored by its author — but an ADMIN may unhide
  -- one (the moderation "undo", e.g. a wrongful auto-hide). is_admin() is request-
  -- scoped (auth.uid()), so this lifts ONLY for an actual admin caller; the field-
  -- immutability checks above still apply to everyone, so an admin unhide flips
  -- `deleted` and nothing else. (is_admin() is defined in the ADMIN section below;
  -- plpgsql resolves it at call time, so definition order in this script is fine.)
  if old.deleted and not new.deleted and not public.is_admin() then
    raise exception 'A deleted comment cannot be restored.';
  end if;
  if new.body <> old.body then
    new.edited_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists comment_update_guard on public.comments;
create trigger comment_update_guard
  before update on public.comments for each row execute function public.guard_comment_update();

-- Rate limit: at most 5 comments per user per minute. The advisory lock
-- serializes a user's concurrent inserts so the count can't be raced past 5.
create or replace function public.enforce_comment_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (
    select count(*) from public.comments
    where user_id = new.user_id and created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'Slow down — too many comments in a short time.';
  end if;
  return new;
end; $$;

drop trigger if exists comment_rate_limit on public.comments;
create trigger comment_rate_limit
  before insert on public.comments for each row execute function public.enforce_comment_rate();

-- ─────────────────────── comment likes ──────────────────────
-- PRIVACY: raw rows (who liked what) are readable ONLY by their owner. The public
-- sees just aggregate counts, via the SECURITY DEFINER rpcs at the end of this
-- file. This keeps the "who liked/voted what" graph from de-anonymizing anyone
-- while still showing everyone the counts.
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

drop policy if exists "comment likes are public" on public.comment_likes;
drop policy if exists "read own comment likes" on public.comment_likes;
create policy "read own comment likes" on public.comment_likes for select using (auth.uid() = user_id);

drop policy if exists "like comments" on public.comment_likes;
create policy "like comments" on public.comment_likes for insert with check (auth.uid() = user_id);

drop policy if exists "unlike comments" on public.comment_likes;
create policy "unlike comments" on public.comment_likes for delete using (auth.uid() = user_id);

-- ──────────────────────── story likes ───────────────────────
create table if not exists public.story_likes (
  market_id text not null,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (market_id, user_id)
);

alter table public.story_likes enable row level security;

drop policy if exists "story likes are public" on public.story_likes;
drop policy if exists "read own story likes" on public.story_likes;
create policy "read own story likes" on public.story_likes for select using (auth.uid() = user_id);

drop policy if exists "like stories" on public.story_likes;
create policy "like stories" on public.story_likes for insert with check (auth.uid() = user_id);

drop policy if exists "unlike stories" on public.story_likes;
create policy "unlike stories" on public.story_likes for delete using (auth.uid() = user_id);

-- ─────────────────────── reports (mod) ──────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

alter table public.reports enable row level security;

-- Users can file reports; reports are not publicly readable (admins read via service role).
drop policy if exists "file reports" on public.reports;
create policy "file reports" on public.reports for insert with check (auth.uid() = user_id);

-- ───────────────────── claim votes (fact vs opinion) ─────────────────────
-- Each disputed claim in a story's synthesis gets a poll. The claim id is a
-- deterministic hash of (market_id, claim text) computed on the client, so a
-- poll survives feed regeneration without a server-side claims table.
create table if not exists public.claim_votes (
  claim_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  choice text not null check (choice in ('accurate', 'inaccurate', 'unsure')),
  created_at timestamptz not null default now(),
  primary key (claim_id, user_id)
);

create index if not exists claim_votes_claim_idx on public.claim_votes (claim_id);

-- One vote primitive, three surfaces. `kind` distinguishes the poll: 'dispute' (where
-- sources disagree), 'consensus' (what the coverage agrees on — does it hold up?), and
-- 'perspective' (an outlet's framing — fact or opinion?). The claim_id hash already
-- separates surfaces by their text, so a single (claim_id, user_id) primary key still
-- holds; `kind` selects the choice domain + the right labels client-side. Existing rows
-- are 'dispute'. Added after first ship, so an explicit alter (create-table won't add it).
alter table public.claim_votes add column if not exists kind text not null default 'dispute';

do $$ begin
  -- Bind the (widened) choice domain to its poll kind, replacing the original inline
  -- accurate/inaccurate/unsure check. Consensus reuses the accuracy choices (holds up /
  -- overstated / unsure); perspective adds fact/opinion. Idempotent.
  alter table public.claim_votes drop constraint if exists claim_votes_choice_check;
  if not exists (select 1 from pg_constraint where conname = 'claim_votes_kind_valid') then
    alter table public.claim_votes add constraint claim_votes_kind_valid
      check (kind in ('dispute', 'consensus', 'perspective'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'claim_votes_kind_choice') then
    alter table public.claim_votes add constraint claim_votes_kind_choice check (
      (kind in ('dispute', 'consensus') and choice in ('accurate', 'inaccurate', 'unsure'))
      or (kind = 'perspective' and choice in ('fact', 'opinion', 'unsure'))
    );
  end if;
end $$;

alter table public.claim_votes enable row level security;

drop policy if exists "claim votes are public" on public.claim_votes;
drop policy if exists "read own claim votes" on public.claim_votes;
-- Secret ballot: a voter can read only their OWN vote; tallies come from the rpc.
create policy "read own claim votes" on public.claim_votes for select using (auth.uid() = user_id);

drop policy if exists "cast own vote" on public.claim_votes;
create policy "cast own vote" on public.claim_votes for insert with check (auth.uid() = user_id);

drop policy if exists "change own vote" on public.claim_votes;
create policy "change own vote" on public.claim_votes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "retract own vote" on public.claim_votes;
create policy "retract own vote" on public.claim_votes for delete using (auth.uid() = user_id);

-- Rate limit: max 30 votes/min/user, advisory-locked so it can't be raced.
create or replace function public.enforce_vote_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 1));
  if (
    select count(*) from public.claim_votes
    where user_id = new.user_id and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Slow down — too many votes too fast.';
  end if;
  return new;
end; $$;

drop trigger if exists claim_vote_rate_limit on public.claim_votes;
create trigger claim_vote_rate_limit
  before insert on public.claim_votes for each row execute function public.enforce_vote_rate();

-- ───────────────────── newsletter subscribers ─────────────────────
-- Public can subscribe (insert only); the list is NEVER publicly readable. The
-- weekly digest sender reads it server-side with the service role (which bypasses
-- RLS), so no select policy is granted to anon/authenticated.
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'web',
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

-- Email-shape + length guard at the DB boundary (blunts junk inserts; idempotent).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscribers_email_format') then
    alter table public.subscribers add constraint subscribers_email_format
      check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254);
  end if;
end $$;

alter table public.subscribers enable row level security;

-- Direct table writes are DISABLED. The bundled anon key must NOT INSERT rows
-- itself: a direct insert could set confirmed_at/confirm_token/unsubscribed_at
-- (force-confirming a victim) or probe which emails exist via unique-violation
-- (201 vs 409 oracle). All writes go through the SECURITY DEFINER subscribe() RPC
-- below, which validates input and always leaves a web signup UNCONFIRMED. With
-- RLS on and NO insert policy, direct inserts are denied; the definer RPC works.
drop policy if exists "anyone can subscribe" on public.subscribers;
revoke insert on public.subscribers from anon, authenticated;

-- Rate limit: cap total signups/min, advisory-locked so it can't be raced, to
-- blunt automated signup spam (volume is low, so a single global lock is fine).
create or replace function public.enforce_subscriber_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('subscribers_rate', 1));
  if (
    select count(*) from public.subscribers where created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Too many signups right now — please try again shortly.';
  end if;
  return new;
end; $$;

drop trigger if exists subscriber_rate_limit on public.subscribers;
create trigger subscriber_rate_limit
  before insert on public.subscribers for each row execute function public.enforce_subscriber_rate();

-- Email PREFERENCES (idempotent). frequency = how often; topics = category filter
-- (empty array = all categories); breaking = opt-in to breaking alerts. Double
-- opt-in: confirmed_at is null until the subscriber clicks the confirm link
-- (confirm_token), and the digest sender only emails confirmed addresses — so a
-- web signup never receives mail until verified. Signed-in subscribers are
-- auto-confirmed (their email is already verified by auth).
alter table public.subscribers
  add column if not exists frequency text not null default 'weekly',
  add column if not exists topics text[] not null default '{}',
  add column if not exists breaking boolean not null default false,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirm_token uuid not null default gen_random_uuid();

-- When the double-opt-in confirm email was sent (null = not yet emailed). The
-- confirmation sender (scripts/send-confirmations.ts) reads/writes this via the
-- service role so it only ever emails an unconfirmed row ONCE — without it, every
-- scheduled run would re-mail the same pending signups.
alter table public.subscribers
  add column if not exists confirm_sent_at timestamptz;

-- Per-subscriber unsubscribe token. Each digest embeds a first-party opt-out link
-- (crowdtells.com/?unsubscribe=<token>) so the click lands on OUR domain — valid
-- cert, and it writes unsubscribed_at straight back here (vs. relying on Mailgun's
-- hosted page, which lives on the tracking subdomain). The token is the only
-- credential, so the link works without the reader being signed in.
alter table public.subscribers
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscribers_frequency_chk') then
    alter table public.subscribers add constraint subscribers_frequency_chk
      check (frequency in ('daily', 'weekly'));
  end if;
end $$;

-- Public subscribe WITH preferences (case-insensitive upsert). Idempotent:
-- re-subscribing updates the prefs and clears any prior unsubscribe. SECURITY
-- DEFINER so anon can upsert without table UPDATE rights (the table stays
-- insert-only via RLS for direct writes). New web signups are left UNCONFIRMED.
--
-- Returns a STATUS so the client can show an honest post-signup message — the
-- anon caller can't read the table, so without this it can't tell whether a
-- confirm email is actually coming, and the footer would say "check your inbox"
-- even when no mail will ever be sent:
--   'pending'  — a confirm email WILL be sent: a new signup, an existing-but-
--                never-confirmed row, or a re-subscribe that resurrected an opt-out
--                (confirmation + send-stamp reset below, so the cron re-mails).
--   'already'  — already confirmed AND still subscribed; no mail is sent, so the
--                UI must NOT tell them to check their inbox.
-- This mirrors the confirm cron's own filter (scripts/send-confirmations.ts only
-- mails rows that are unconfirmed, not unsubscribed, and not yet sent), so the
-- status the caller sees matches what actually gets delivered.
--
-- Return type changed void → text, so DROP first (CREATE OR REPLACE can't change it).
drop function if exists public.subscribe(text, text, text[], boolean);
create function public.subscribe(
  p_email text,
  p_frequency text default 'weekly',
  p_topics text[] default '{}',
  p_breaking boolean default false
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_was_confirmed boolean;
  v_was_unsubscribed boolean;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email';
  end if;
  if coalesce(p_frequency, 'weekly') not in ('daily', 'weekly') then p_frequency := 'weekly'; end if;

  -- Snapshot the prior state BEFORE the upsert so the returned status reflects
  -- whether a confirm email is genuinely pending. No row → both null → 'pending'.
  select confirmed_at is not null, unsubscribed_at is not null
    into v_was_confirmed, v_was_unsubscribed
    from public.subscribers where email = v_email;

  insert into public.subscribers (email, source, frequency, topics, breaking)
    values (v_email, 'web', p_frequency, coalesce(p_topics, '{}'), coalesce(p_breaking, false))
  on conflict (email) do update
    set frequency = excluded.frequency,
        topics = excluded.topics,
        breaking = excluded.breaking,
        -- Honor a prior opt-out: re-subscribing an address that had UNSUBSCRIBED
        -- must not silently resume mail. Force a fresh double-opt-in (reset
        -- confirmation + rotate the token) so the confirmed-only digest won't send
        -- until they re-confirm. A still-subscribed row keeps its confirmation.
        confirmed_at = case when public.subscribers.unsubscribed_at is not null
                            then null else public.subscribers.confirmed_at end,
        confirm_token = case when public.subscribers.unsubscribed_at is not null
                             then gen_random_uuid() else public.subscribers.confirm_token end,
        -- Clear the send-stamp so the confirm cron re-mails a fresh link, in TWO
        -- cases: (1) a RESURRECTED opt-out (unsubscribed_at set) — force a clean
        -- re-confirm; (2) a still-UNCONFIRMED address re-subscribing after a short
        -- cooldown — the first confirm was missed/lost (spam, wrong inbox, a typo'd
        -- address), so a re-submit should actually RE-SEND instead of silently doing
        -- nothing (the old behavior: 'pending' returned + "check your inbox" shown,
        -- but no mail — the bug that made signups look broken). The 5-min cooldown
        -- caps resends per address; the global per-minute rate limit is the other
        -- guard. A CONFIRMED + still-subscribed row keeps its stamp (no needless mail).
        confirm_sent_at = case
          when public.subscribers.unsubscribed_at is not null then null
          when public.subscribers.confirmed_at is null
               and public.subscribers.confirm_sent_at < now() - interval '5 minutes' then null
          else public.subscribers.confirm_sent_at end,
        -- Rotate the opt-out token too when resurrecting an unsubscribed address, so
        -- a stale /?unsubscribe=<token> link in an OLD digest (e.g. a forwarded copy)
        -- can't silently re-opt-out someone who just re-subscribed. Mirrors the
        -- confirm_token lifecycle above; a still-subscribed row keeps its token.
        unsubscribe_token = case when public.subscribers.unsubscribed_at is not null
                                 then gen_random_uuid() else public.subscribers.unsubscribe_token end,
        unsubscribed_at = null;

  -- Already confirmed AND still subscribed (not a resurrected opt-out) → no mail.
  if coalesce(v_was_confirmed, false) and not coalesce(v_was_unsubscribed, false) then
    return 'already';
  end if;
  return 'pending';
end; $$;
-- Re-grant co-located with the DROP+CREATE above: DROP FUNCTION discards the
-- function's privileges, so this block must restore EXECUTE to stay self-contained
-- (applying just this block must not silently strip anon/authenticated access).
-- The consolidated grants near the bottom of this file re-issue it too — harmless,
-- grants are idempotent.
grant execute on function public.subscribe(text, text, text[], boolean) to anon, authenticated;

-- Confirm a double-opt-in signup via its token (idempotent; clears unsubscribe).
create or replace function public.confirm_subscription(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  update public.subscribers
    set confirmed_at = coalesce(confirmed_at, now()), unsubscribed_at = null
    where confirm_token = p_token
    returning true into v_found;
  return coalesce(v_found, false);
end; $$;

-- The signed-in caller's subscription (0 or 1 row), matched by their auth email.
create or replace function public.my_subscription()
returns table (
  email text, frequency text, topics text[], breaking boolean,
  confirmed boolean, subscribed boolean
) language sql security definer set search_path = public stable as $$
  select s.email, s.frequency, s.topics, s.breaking,
         s.confirmed_at is not null, s.unsubscribed_at is null
  from public.subscribers s
  join auth.users u on lower(u.email) = lower(s.email)
  where u.id = auth.uid();
$$;

-- Save the signed-in caller's email preferences (upsert by their auth email).
-- Auto-confirmed: their email is already verified by auth, so no double opt-in.
create or replace function public.save_my_subscription(
  p_frequency text, p_topics text[], p_breaking boolean
) returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then raise exception 'not signed in'; end if;
  if coalesce(p_frequency, 'weekly') not in ('daily', 'weekly') then p_frequency := 'weekly'; end if;
  insert into public.subscribers (email, source, frequency, topics, breaking, confirmed_at)
    values (v_email, 'account', p_frequency, coalesce(p_topics, '{}'), coalesce(p_breaking, false), now())
  on conflict (email) do update
    set frequency = excluded.frequency,
        topics = excluded.topics,
        breaking = excluded.breaking,
        confirmed_at = coalesce(public.subscribers.confirmed_at, now()),
        unsubscribed_at = null;
end; $$;

-- In-app unsubscribe for the signed-in caller (no email round-trip needed).
create or replace function public.unsubscribe_me()
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then raise exception 'not signed in'; end if;
  update public.subscribers set unsubscribed_at = now() where lower(email) = v_email;
end; $$;

-- One-click unsubscribe from an email link, keyed by the per-subscriber token (no
-- sign-in needed — the token IS the credential). Idempotent: returns true whenever
-- the token matches a row, even if already unsubscribed, so the link always lands
-- on a clean "you're unsubscribed" confirmation. SECURITY DEFINER so anon can flip
-- the flag without table UPDATE rights. A random/forged token simply matches
-- nothing and returns false (no enumeration: the row is never read back).
create or replace function public.unsubscribe_by_token(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.subscribers
    set unsubscribed_at = coalesce(unsubscribed_at, now())
    where unsubscribe_token = p_token;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

grant execute on function public.subscribe(text, text, text[], boolean) to anon, authenticated;
grant execute on function public.confirm_subscription(uuid) to anon, authenticated;
grant execute on function public.my_subscription() to authenticated;
grant execute on function public.save_my_subscription(text, text[], boolean) to authenticated;
grant execute on function public.unsubscribe_me() to authenticated;
grant execute on function public.unsubscribe_by_token(uuid) to anon, authenticated;

-- ───────────────────── breaking-alert dedup ─────────────────────
-- The breaking-news alert sender (scripts/send-breaking.ts) runs on a frequent
-- schedule against the same published feed, so it MUST never email the same event
-- twice. This is the durable, atomic "have we alerted this event yet?" ledger:
-- one row per event_key (e.g. `resolved:<marketId>`, `swing:<marketId>:<favored>`,
-- `final:<marketId>:<eventId>`, `developing:<marketId>:<clusterId>`). The sender
-- claims a key before sending and only emails when the claim is NEW — so two
-- overlapping runs (or a retried run) can't double-send. Server-only: written by
-- the service role; never client-read (RLS on, no policy → anon/authenticated
-- denied; the service key bypasses RLS).
create table if not exists public.breaking_alerts (
  event_key text primary key,
  market_id text not null,
  kind text not null,
  alerted_at timestamptz not null default now()
);

alter table public.breaking_alerts enable row level security;

-- Atomically claim an event for alerting. Returns true exactly once per event_key
-- (the first caller inserts the row); every later call conflicts and returns false,
-- so the sender emails an event once and only once. SECURITY DEFINER so it runs
-- regardless of RLS; intended for the service role (the sender) only — not granted
-- to anon/authenticated, since clients never alert.
create or replace function public.claim_breaking_alert(
  p_event_key text,
  p_market_id text,
  p_kind text
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.breaking_alerts (event_key, market_id, kind)
    values (p_event_key, p_market_id, p_kind)
    on conflict (event_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

-- ───────────────────── comment reply notifications ─────────────────────
-- A retention loop: when someone replies to your comment, we email you "someone
-- replied." The sender (scripts/send-replies.ts) runs on a frequent schedule, so
-- this is the durable, atomic "have we emailed this reply yet?" ledger — one row
-- per reply id. The sender claims a reply BEFORE sending and only emails when the
-- claim is NEW, so two overlapping runs (or a retried run) never double-send.
-- Server-only: written by the service role; never client-read (RLS on, no policy →
-- anon/authenticated denied; the service key bypasses RLS).
create table if not exists public.reply_notifications (
  comment_id uuid primary key references public.comments on delete cascade,
  notified_at timestamptz not null default now()
);

alter table public.reply_notifications enable row level security;

-- Per-profile reply-notification preference (default ON — industry standard) and a
-- first-party one-click opt-out token. The token is the only credential, so the
-- email's "turn these off" link works without the reader being signed in. Distinct
-- from the newsletter unsubscribe_token, so opting out of reply pings does NOT touch
-- the newsletter (and vice versa). Additive + idempotent: the email reachability join
-- and the sender fail soft until this migration is re-run.
alter table public.profiles
  add column if not exists reply_notify boolean not null default true,
  add column if not exists reply_unsub_token uuid not null default gen_random_uuid();

-- Detect the reply notifications still owed: replies (parent_id not null, not
-- deleted) created within the lookback window whose PARENT author opted in, has a
-- real email, ISN'T the replier (no self-notify), and hasn't been emailed yet (no
-- ledger row). Returns the parent author's email + opt-out token + a short body
-- snippet + the replier's display name, so the service role reads auth email safely
-- and RLS-correctly in ONE call. SECURITY DEFINER (reads auth.users + every profile);
-- service-role only — not granted to anon/authenticated, since clients never notify.
-- p_since bounds the backlog; the claim below enforces true at-most-once.
create or replace function public.pending_reply_notifications(
  p_since timestamptz,
  p_limit int default 200
) returns table (
  comment_id uuid,
  market_id text,
  parent_email text,
  reply_unsub_token uuid,
  replier_name text,
  snippet text
) language sql security definer set search_path = public stable as $$
  select
    r.id as comment_id,
    r.market_id,
    lower(au.email) as parent_email,
    pp.reply_unsub_token,
    coalesce(rp.display_name, 'Someone') as replier_name,
    left(r.body, 280) as snippet
  from public.comments r
  join public.comments parent on parent.id = r.parent_id
  join public.profiles pp on pp.id = parent.user_id          -- the parent author (the recipient)
  join auth.users au on au.id = parent.user_id
  left join public.profiles rp on rp.id = r.user_id          -- the replier (for their name)
  where r.parent_id is not null
    and r.deleted = false
    and parent.deleted = false
    and parent.user_id <> r.user_id                          -- never email a self-reply
    and pp.reply_notify = true                               -- respect the opt-out
    and au.email is not null
    and r.created_at >= p_since
    and not exists (select 1 from public.reply_notifications n where n.comment_id = r.id)
  order by r.created_at
  limit greatest(p_limit, 0);
$$;

-- Atomically claim a reply for notifying. Returns true exactly once per comment_id
-- (the first caller inserts the row); every later call conflicts and returns false,
-- so the reply is emailed once and only once. SECURITY DEFINER so it runs regardless
-- of RLS; service-role only — not granted to anon/authenticated.
create or replace function public.claim_reply_notification(p_comment_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.reply_notifications (comment_id)
    values (p_comment_id)
    on conflict (comment_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

-- One-click opt-out of reply-notification emails, keyed by the per-profile token (no
-- sign-in needed — the token IS the credential). Idempotent: returns true whenever the
-- token matches, even if already off, so the link always lands on a clean confirmation.
-- SECURITY DEFINER so anon can flip the flag without table UPDATE rights. A forged token
-- matches nothing and returns false (no enumeration: the row is never read back).
create or replace function public.unsubscribe_replies_by_token(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.profiles set reply_notify = false where reply_unsub_token = p_token;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

grant execute on function public.unsubscribe_replies_by_token(uuid) to anon, authenticated;

-- ───────────────────── social post ledger (resolution cards) ─────────────────────
-- At-most-once dedup for the gated resolution-card auto-poster (scripts/send-social.ts):
-- when a tracked market settles we render a "we called it" card and post it to
-- Bluesky/Mastodon, keyed `social:<marketId>`. The sender claims a key before posting
-- and only posts when the claim is NEW — so two overlapping runs (or a retried run)
-- can't double-post. Server-only: written by the service role; never client-read
-- (RLS on, no policy → anon/authenticated denied; the service key bypasses RLS).
create table if not exists public.social_posts (
  event_key text primary key,
  market_id text not null,
  posted_at timestamptz not null default now()
);

alter table public.social_posts enable row level security;

-- Atomically claim a resolution for posting. Returns true exactly once per event_key
-- (the first caller inserts the row); every later call conflicts and returns false, so
-- the sender posts a card once and only once. SECURITY DEFINER so it runs regardless of
-- RLS; intended for the service role (the sender) only — not granted to anon/authenticated.
create or replace function public.claim_social_post(
  p_event_key text,
  p_market_id text
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.social_posts (event_key, market_id)
    values (p_event_key, p_market_id)
    on conflict (event_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

-- ───────────────────── saved stories (cloud sync) ─────────────────────
-- A signed-in reader's read-later list, synced across devices. Private to the
-- owner. Unsaves are kept as tombstones (deleted=true) so a re-sync from another
-- device can't resurrect a story they deliberately removed (union-merge on the
-- client; see src/lib/sync.ts). References profiles so it cascades on deletion.
create table if not exists public.saved_stories (
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id text not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, market_id)
);

alter table public.saved_stories enable row level security;

drop policy if exists "own saved read" on public.saved_stories;
create policy "own saved read" on public.saved_stories for select using (auth.uid() = user_id);
drop policy if exists "own saved insert" on public.saved_stories;
create policy "own saved insert" on public.saved_stories for insert with check (auth.uid() = user_id);
drop policy if exists "own saved update" on public.saved_stories;
create policy "own saved update" on public.saved_stories for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own saved delete" on public.saved_stories;
create policy "own saved delete" on public.saved_stories for delete using (auth.uid() = user_id);

-- ───────────────────── reading interests (cloud sync) ─────────────────────
-- A signed-in reader's followed topics + onboarding flag, one row per user,
-- last-write-wins by updated_at. Private to the owner. Theme is NOT synced.
create table if not exists public.user_interests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  topics text[] not null default '{}',
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_interests enable row level security;

drop policy if exists "own interests read" on public.user_interests;
create policy "own interests read" on public.user_interests for select using (auth.uid() = user_id);
drop policy if exists "own interests insert" on public.user_interests;
create policy "own interests insert" on public.user_interests for insert with check (auth.uid() = user_id);
drop policy if exists "own interests update" on public.user_interests;
create policy "own interests update" on public.user_interests for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own interests delete" on public.user_interests;
create policy "own interests delete" on public.user_interests for delete using (auth.uid() = user_id);

-- ───────────────── public aggregates (privacy-preserving) ─────────────────
-- The like/vote tables only expose a user's OWN rows (RLS above). The public
-- still needs counts/tallies, so these SECURITY DEFINER functions read across all
-- rows but return ONLY aggregates — never a user_id. This is the standard pattern
-- for "public counts, private ballots". Granted to anon + authenticated.

create or replace function public.comment_like_counts(p_market_id text)
returns table (comment_id uuid, like_count bigint)
language sql security definer set search_path = public stable as $$
  select cl.comment_id, count(*)::bigint
  from public.comment_likes cl
  join public.comments c on c.id = cl.comment_id
  where c.market_id = p_market_id and c.deleted = false
  group by cl.comment_id;
$$;

create or replace function public.story_like_count(p_market_id text)
returns bigint
language sql security definer set search_path = public stable as $$
  select count(*)::bigint from public.story_likes where market_id = p_market_id;
$$;

-- Generic secret-ballot tally: per claim, the count for each choice present (any choice
-- set / kind). One row per (claim_id, choice); the client shapes it per surface. Replaces
-- the old fixed accurate/inaccurate/unsure columns. Never returns a user_id, so the ballot
-- stays secret — the distribution is revealed only after the viewer has cast their own vote.
drop function if exists public.claim_vote_tallies(text[]);
create or replace function public.claim_poll_tallies(p_claim_ids text[])
returns table (claim_id text, choice text, n bigint)
language sql security definer set search_path = public stable as $$
  select claim_id, choice, count(*)::bigint
  from public.claim_votes
  where claim_id = any(p_claim_ids)
  group by claim_id, choice;
$$;

-- Bulk recent-engagement aggregate for ranking the live feed: per market, the count
-- of story likes + comments since p_since, plus the DISTINCT number of users behind
-- them (the anti-brigade signal — one person doing several things counts once).
-- Counts only, never a user_id, so the "what's hot" signal can't de-anonymize anyone.
-- One round trip for the whole visible feed.
create or replace function public.story_engagement(p_market_ids text[], p_since timestamptz)
returns table (market_id text, likes bigint, comments bigint, engaged_users bigint)
language sql security definer set search_path = public stable as $$
  with events as (
    select market_id, user_id, 1 as is_like, 0 as is_comment
    from public.story_likes
    where market_id = any(p_market_ids) and created_at >= p_since
    union all
    select market_id, user_id, 0 as is_like, 1 as is_comment
    from public.comments
    where market_id = any(p_market_ids) and created_at >= p_since and deleted = false
  )
  select market_id,
    sum(is_like)::bigint as likes,
    sum(is_comment)::bigint as comments,
    count(distinct user_id)::bigint as engaged_users
  from events
  group by market_id;
$$;

grant execute on function public.comment_like_counts(text) to anon, authenticated;
grant execute on function public.story_like_count(text) to anon, authenticated;
grant execute on function public.claim_poll_tallies(text[]) to anon, authenticated;
grant execute on function public.story_engagement(text[], timestamptz) to anon, authenticated;

-- ───────────────── indexes for own-row reads + cascade deletes ─────────────────
-- The like/vote/report tables are queried by user_id (own-row RLS reads) and
-- cascade-deleted by user; their composite PKs don't lead with user_id, so add
-- supporting indexes. Idempotent.
create index if not exists comment_likes_user_idx on public.comment_likes (user_id);
create index if not exists story_likes_user_idx on public.story_likes (user_id);
create index if not exists reports_user_idx on public.reports (user_id);
create index if not exists claim_votes_user_idx on public.claim_votes (user_id);
create index if not exists saved_stories_user_idx on public.saved_stories (user_id);

-- ───────────────── consistent author FKs (all → profiles) ─────────────────
-- comments + claim_votes reference profiles; repoint the like/report tables the
-- same way so the data model is uniform and a profile delete cascades all of a
-- user's rows. Safe: every authenticated user has a profile (handle_new_user),
-- so no existing row is orphaned. Idempotent — re-pointing only when needed.
do $$
declare
  t text;
  old_fk text;
begin
  foreach t in array array['comment_likes', 'story_likes', 'reports'] loop
    -- Drop ANY existing FK on user_id that targets auth.users — found by
    -- definition, not by a hard-coded name, so a non-default constraint name
    -- (from an older/hand-edited migration) is still reconciled cleanly.
    select c.conname into old_fk
    from pg_constraint c
    where c.conrelid = ('public.' || t)::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.conkey = array[
        (select attnum from pg_attribute
          where attrelid = ('public.' || t)::regclass and attname = 'user_id')
      ]
    limit 1;
    if old_fk is not null then
      execute format('alter table public.%I drop constraint %I', t, old_fk);
    end if;
    -- Add the profiles FK if it isn't there yet.
    if not exists (
      select 1 from pg_constraint
      where conname = t || '_user_id_profiles_fkey' and conrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) '
        || 'references public.profiles (id) on delete cascade',
        t, t || '_user_id_profiles_fkey'
      );
    end if;
  end loop;
end $$;

-- ───────────────── case-insensitive subscriber uniqueness ─────────────────
-- The column-level unique is case-sensitive, so "News@x" and "news@x" could both
-- insert. A functional unique index collapses them (the client also lowercases).
-- First collapse any pre-existing case-variant duplicates (keep the earliest
-- subscription) so the unique-index build can't hard-fail on existing data and
-- leave this re-runnable script partially applied.
delete from public.subscribers a
  using public.subscribers b
  where lower(a.email) = lower(b.email)
    and (a.created_at, a.id) > (b.created_at, b.id);
create unique index if not exists subscribers_email_lower_idx
  on public.subscribers (lower(email));

-- ───────────────── realtime: live comments ─────────────────
-- The discussion subscribes to comment changes; ensure the table is in the
-- realtime publication (guarded so it doesn't error if already added/missing).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
     ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- ───────────────── self-serve account deletion (GDPR/CCPA) ─────────────────
-- Lets a signed-in user erase their own account from the browser, with no server
-- runtime: SECURITY DEFINER so it can remove the auth user (cascading profiles →
-- comments, likes, votes, saved_stories, user_interests) and the email-keyed
-- subscriber row. Honors the deletion promise in public/privacy.html. The
-- operator CLI scripts/delete-user.ts is the equivalent for support requests.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  -- Subscribers have no FK to auth.users; remove the matching-email row first.
  -- Best-effort: if auth.users.email is NULL (only possible if phone/anonymous
  -- auth is ever enabled — today it's Google + magic-link, always email-bearing)
  -- this matches nothing; such a user must use the operator CLI (--email) to also
  -- clear a subscription. The account + all its content still delete below.
  delete from public.subscribers s
    using auth.users u
    where u.id = uid and lower(s.email) = lower(u.email);
  -- Cascades profiles → comments, comment_likes, story_likes, reports,
  -- claim_votes, saved_stories, user_interests, and the gamification tables
  -- (calls, call_revisions, call_scores, reads, user_trust, user_badges,
  -- claim_notes, note_ratings → note_status).
  delete from auth.users where id = uid;
end; $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ════════════════════════ GAMIFICATION ════════════════════════
-- "The Calibration Desk" — opt-in, anti-casino. The scoring math (Brier/peer)
-- lives in pure TS (src/lib/gamify.ts, used by the pipeline scorer); the streak +
-- tier RULES are mirrored here (kept tiny). Same dual pattern as above: PRIVATE
-- per-user rows via RLS auth.uid()=user_id; PUBLIC data only via SECURITY DEFINER
-- aggregates that never leak a user_id (the one exception is the OPT-IN avatar
-- facepile and the PUBLIC tier mark, both intentional). Resolved-call SCORES are
-- written by the pipeline with the service role (BYPASSRLS) — no client write path.

-- Opt-out for public attribution of STORY likes (the avatar facepile). Defaults on:
-- a public "I like this story" is low-stakes positive social proof. COMMENT likes
-- stay secret-ballot regardless (retaliation risk on charged threads). New rows get
-- the default via the column; handle_new_user() needs no change.
alter table public.profiles add column if not exists likes_public boolean not null default true;

-- ───────────────────────── calls (reader predictions) ─────────────────────────
-- One private "Call" per user per market: will the FAVORED outcome (frozen by name
-- at call time, so a later lead-flip can't move the goalposts) actually happen, and
-- how sure? Confidence is constrained to the honest ladder (never 50 or 100).
--
-- A call is FINAL once made — no edit, no retract. This is the integrity guarantee:
-- you can't un-call a prediction that's aging badly, so the calibration record is
-- honest. The only mutable field is `hidden`, a private view toggle — hiding a call
-- clears it from YOUR screen but it STILL counts toward scoring + the distribution
-- (so hiding can't be used to game the game). Enforced by the guard trigger below.
create table if not exists public.calls (
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id text not null,
  target_outcome text not null check (char_length(target_outcome) <= 200),
  pick text not null check (pick in ('yes', 'no')),
  confidence smallint not null check (confidence in (55, 65, 75, 85, 95)),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, market_id)
);
-- Backfill the column on an already-created table (idempotent).
alter table public.calls add column if not exists hidden boolean not null default false;
-- The market's category, stamped at call time (the client knows it then) — powers the per-category
-- percentile. Nullable: older calls predate it and are simply excluded from category ranking.
alter table public.calls add column if not exists category text;

create index if not exists calls_market_idx on public.calls (market_id);

alter table public.calls enable row level security;

-- Secret ballot: a reader reads only their OWN live call (else copy-herding).
drop policy if exists "read own calls" on public.calls;
create policy "read own calls" on public.calls for select using (auth.uid() = user_id);
drop policy if exists "make own call" on public.calls;
create policy "make own call" on public.calls for insert with check (auth.uid() = user_id);
-- An update is allowed (so the owner can toggle `hidden`), but the guard trigger
-- below rejects any change to the actual prediction. There is NO delete policy: a
-- call cannot be retracted.
drop policy if exists "update own call" on public.calls;
create policy "update own call" on public.calls for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "retract own call" on public.calls;

-- A call is immutable except its `hidden` flag. Block any change to the prediction
-- itself, and stamp updated_at on the (hidden-only) change. The DB is the trust
-- boundary — the client can't rewrite a call by crafting an update.
create or replace function public.guard_call_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> old.user_id
     or new.market_id <> old.market_id
     or new.target_outcome <> old.target_outcome
     or new.pick <> old.pick
     or new.confidence <> old.confidence
     or new.created_at <> old.created_at then
    raise exception 'A call is final — only its hidden flag may change.';
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists calls_updated_at on public.calls;
drop trigger if exists calls_guard on public.calls;
create trigger calls_guard before update on public.calls
  for each row execute function public.guard_call_update();

-- A timestamped record of each call's creation (one row per call, since calls are
-- immutable). Kept as a lightweight audit trail of when reads were locked in.
create table if not exists public.call_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id text not null,
  target_outcome text not null,
  pick text not null,
  confidence smallint not null,
  created_at timestamptz not null default now()
);

create index if not exists call_revisions_user_idx on public.call_revisions (user_id);

alter table public.call_revisions enable row level security;
drop policy if exists "read own call revisions" on public.call_revisions;
create policy "read own call revisions" on public.call_revisions
  for select using (auth.uid() = user_id);

create or replace function public.record_call_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.call_revisions (user_id, market_id, target_outcome, pick, confidence)
    values (new.user_id, new.market_id, new.target_outcome, new.pick, new.confidence);
  return new;
end; $$;
-- INSERT-only: a call is immutable, so there is exactly one revision (its creation).
-- (A `hidden` toggle is an update, but must NOT log a revision.)
drop trigger if exists call_revision_log on public.calls;
create trigger call_revision_log after insert on public.calls
  for each row execute function public.record_call_revision();

-- Rate limit: max 20 NEW calls/min/user, advisory-locked so it can't be raced
-- (matches the comments/votes pattern; slot 2 follows slots 0 and 1).
create or replace function public.enforce_call_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 2));
  if (
    select count(*) from public.calls
    where user_id = new.user_id and created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Slow down — too many calls too fast.';
  end if;
  return new;
end; $$;
drop trigger if exists call_rate_limit on public.calls;
create trigger call_rate_limit before insert on public.calls
  for each row execute function public.enforce_call_rate();

-- ───────────────── market resolutions (the durability mirror) ─────────────────
-- Server-only mirror of a settled market's real outcome + the scored aggregates,
-- written by the pipeline (service role). This is what lets calibration survive the
-- 14-day client-feed pruning + archival. Publicly readable (aggregates only).
create table if not exists public.market_resolutions (
  market_id text primary key,
  resolved_outcome text not null,
  resolved_at timestamptz not null,
  n_calls int not null default 0,
  median_brier real,
  our_brier real
);

alter table public.market_resolutions enable row level security;
drop policy if exists "resolutions are public" on public.market_resolutions;
create policy "resolutions are public" on public.market_resolutions for select using (true);
-- No insert/update policy: only the service role (BYPASSRLS) writes these.

-- ───────────────── call scores (graded results, per resolved market) ─────────────────
-- Written by the pipeline scorer (service role). `prob` is the probability the
-- reader assigned to the target outcome occurring; `won` is whether it did. Brier
-- and peer (Brier − this market's median) are computed in src/lib/gamify.ts.
create table if not exists public.call_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id text not null,
  prob real not null,
  won boolean not null,
  brier real not null,
  peer real not null,
  scored_at timestamptz not null default now(),
  primary key (user_id, market_id)
);

create index if not exists call_scores_user_idx on public.call_scores (user_id);

alter table public.call_scores enable row level security;
-- Own-read only (a private track record); the only writer is the service role.
drop policy if exists "read own call scores" on public.call_scores;
create policy "read own call scores" on public.call_scores for select using (auth.uid() = user_id);

-- ───────────────── reads (reading streak + tier consumption signal) ─────────────────
-- One row the first time a signed-in reader dwells on a story (dedup per market),
-- written via touch_read(). Powers the gentle reading streak + the tier's reading
-- count. Private to the owner.
create table if not exists public.reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id text not null,
  first_read_at timestamptz not null default now(),
  primary key (user_id, market_id)
);

create index if not exists reads_user_idx on public.reads (user_id);

alter table public.reads enable row level security;
drop policy if exists "read own reads" on public.reads;
create policy "read own reads" on public.reads for select using (auth.uid() = user_id);
-- Writes only via touch_read() (SECURITY DEFINER) — no direct insert policy.

-- ───────────────── user trust (the earned ladder) ─────────────────
-- Tier + the counts behind it + the reading streak. Tier is recomputed from source
-- tables over a rolling 90-day window (so it DECAYS when a reader goes quiet). The
-- detail is own-read; the tier MARK is exposed publicly via author_tiers().
create table if not exists public.user_trust (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tier text not null default 'reader' check (tier in ('reader', 'contributor', 'steward')),
  briefings_read int not null default 0,
  calls_made int not null default 0,
  resolved_calls int not null default 0,
  comments_posted int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_read_date date,
  updated_at timestamptz not null default now()
);

-- Standing: a merit score + a 1..7 level derived from it (mirrors src/lib/gamify.ts
-- meritScore + levelFor), plus the verification stats behind the new badges. Read by both
-- the owner's panel (my_trust) and the opt-in public profile, so they never disagree.
-- Added after first ship, so explicit alters (create-table-if-not-exists won't add columns).
alter table public.user_trust
  add column if not exists merit int not null default 0,
  add column if not exists level int not null default 1,
  add column if not exists helpful_notes int not null default 0,
  add column if not exists claims_voted int not null default 0,
  add column if not exists aligned_votes int not null default 0;

alter table public.user_trust enable row level security;
drop policy if exists "read own trust" on public.user_trust;
create policy "read own trust" on public.user_trust for select using (auth.uid() = user_id);
-- Writes only via the SECURITY DEFINER rpcs below.

-- ───────────────── user badges (recognition) ─────────────────
create table if not exists public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  metadata jsonb,
  primary key (user_id, badge_id)
);

create index if not exists user_badges_user_idx on public.user_badges (user_id);

alter table public.user_badges enable row level security;
drop policy if exists "read own badges" on public.user_badges;
create policy "read own badges" on public.user_badges for select using (auth.uid() = user_id);
-- Awarded only via the SECURITY DEFINER rpcs below.

-- ───────────────── moderation: report category + scoped auto-hide ─────────────────
-- A category on reports drives the ONLY auto-hide path: a Steward flag, a
-- rule-breaking category, on a brand-NEW account. Everything else just queues.
alter table public.reports add column if not exists category text not null default 'other';

create table if not exists public.moderation_log (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null,
  actor_id uuid not null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.moderation_log enable row level security;
-- No public policies: an audit trail read by the service role / operators only.

-- ───────────────── community notes (bridged helpfulness) ─────────────────
-- Short, sourced context a reader can add to a DISPUTED claim (keyed by the same
-- deterministic claim_id hash the polls use — src/lib/claims.ts). Authoring is
-- gated to the Contributor+ tier (RLS); anyone signed-in can RATE a note helpful or
-- not (secret ballot). A note is surfaced as "helpful" only when it earns
-- CROSS-VIEWPOINT agreement — computed by the pipeline bridging job (scripts/lib/
-- bridging.ts) into note_status — never by raw helpful-vote volume.
create table if not exists public.claim_notes (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists claim_notes_claim_idx on public.claim_notes (claim_id);
create index if not exists claim_notes_user_idx on public.claim_notes (user_id);

alter table public.claim_notes enable row level security;

drop policy if exists "notes are public" on public.claim_notes;
create policy "notes are public" on public.claim_notes for select using (deleted = false);

-- Authoring is earned: only Contributor/Steward may add context. The tier subquery
-- reads the author's OWN user_trust row, so this is self-scoped + cheap.
drop policy if exists "contributor adds note" on public.claim_notes;
create policy "contributor adds note" on public.claim_notes for insert
  with check (
    auth.uid() = user_id
    and coalesce(
      (select tier from public.user_trust where user_id = auth.uid()), 'reader'
    ) in ('contributor', 'steward')
  );

-- The author may remove their own note (ratings cascade). No edit path — notes are
-- short; to change one, delete and re-add (keeps the bridging history honest).
drop policy if exists "author deletes note" on public.claim_notes;
create policy "author deletes note" on public.claim_notes for delete using (auth.uid() = user_id);

-- Helpful/not ratings — the bridging INPUT. Secret ballot (own-read), open to any
-- signed-in reader (a broad, viewpoint-diverse rater pool is what makes bridging work).
create table if not exists public.note_ratings (
  note_id uuid not null references public.claim_notes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  helpful boolean not null,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists note_ratings_user_idx on public.note_ratings (user_id);

alter table public.note_ratings enable row level security;

drop policy if exists "read own note ratings" on public.note_ratings;
create policy "read own note ratings" on public.note_ratings for select using (auth.uid() = user_id);
drop policy if exists "rate notes" on public.note_ratings;
create policy "rate notes" on public.note_ratings for insert with check (auth.uid() = user_id);
drop policy if exists "change note rating" on public.note_ratings;
create policy "change note rating" on public.note_ratings for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "unrate notes" on public.note_ratings;
create policy "unrate notes" on public.note_ratings for delete using (auth.uid() = user_id);

-- Rate limit: max 40 note ratings/min/user (advisory slot 3, after comments/votes/calls).
create or replace function public.enforce_note_rating_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 3));
  if (
    select count(*) from public.note_ratings
    where user_id = new.user_id and created_at > now() - interval '1 minute'
  ) >= 40 then
    raise exception 'Slow down — too many ratings too fast.';
  end if;
  return new;
end; $$;
drop trigger if exists note_rating_rate_limit on public.note_ratings;
create trigger note_rating_rate_limit before insert on public.note_ratings
  for each row execute function public.enforce_note_rating_rate();

-- The bridged verdict per note, written by the pipeline (service role, BYPASSRLS).
-- Publicly readable (status + count only; rater identities never leave note_ratings).
create table if not exists public.note_status (
  note_id uuid primary key references public.claim_notes (id) on delete cascade,
  intercept real,
  status text not null default 'pending' check (status in ('helpful', 'pending', 'not_helpful')),
  n_raters int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.note_status enable row level security;
drop policy if exists "note status public" on public.note_status;
create policy "note status public" on public.note_status for select using (true);
-- No insert/update policy: only the service role writes these.

-- ───────────────── gamification rpcs (privacy-preserving) ─────────────────

-- Anonymized distribution of how readers are calling an OPEN market: counts only,
-- never identities, never individual confidences (that would leak the secret ballot).
create or replace function public.call_distribution(p_market_id text)
returns table (n bigint, yes_target bigint, no_target bigint)
language sql security definer set search_path = public stable as $$
  select count(*)::bigint,
    count(*) filter (where pick = 'yes')::bigint,
    count(*) filter (where pick = 'no')::bigint
  from public.calls where market_id = p_market_id;
$$;

-- The signed-in caller's calibration: rolling Brier + peer, per-confidence-bucket
-- hit rates (the calibration curve), n resolved, and the platform's own aggregate
-- calibration for comparison. Reads only the caller's own scores (auth.uid()).
create or replace function public.my_calibration()
returns jsonb language sql security definer set search_path = public stable as $$
  with mine as (
    select prob, won, brier, peer from public.call_scores where user_id = auth.uid()
  ), buckets as (
    select round(prob * 100)::int as conf,
           count(*)::int as n,
           avg(case when won then 1 else 0 end)::real as hit_rate
    from mine group by round(prob * 100)
  )
  select jsonb_build_object(
    'n_resolved', (select count(*) from mine),
    'correct', (select count(*) from mine where (prob >= 0.5) = won),
    'mean_brier', (select avg(brier) from mine),
    'avg_peer', (select avg(peer) from mine),
    'buckets', coalesce(
      (select jsonb_agg(jsonb_build_object('conf', conf, 'n', n, 'hit_rate', hit_rate) order by conf)
       from buckets), '[]'::jsonb),
    'platform_our_brier',
      (select avg(our_brier) from public.market_resolutions where our_brier is not null)
  );
$$;

-- "How do I stack up?" — a PRIVATE percentile among callers; the deliberate anti-leaderboard.
-- Aggregate only: the caller's own rank BAND by calibration (mean Brier, lower = sharper) within
-- the cohort of readers who also have a track record. Never returns a name, another reader's
-- score, or a small-cohort count that could finger an individual. Stays dark until BOTH the
-- caller (>= 8 resolved calls) and the cohort (>= 8 callers) clear a floor, so a tiny early
-- userbase can't be reverse-identified and one loud caller can't be singled out.
create or replace function public.my_percentile()
returns jsonb language sql security definer set search_path = public stable as $$
  with per_user as (
    select user_id, avg(brier) as mb
    from public.call_scores group by user_id having count(*) >= 8
  ), me as (
    select mb from per_user where user_id = auth.uid()
  ), mine_n as (
    select count(*)::int as n from public.call_scores where user_id = auth.uid()
  )
  select case
    when (select count(*) from me) = 0 then jsonb_build_object(
      'ranked', false, 'reason', 'need_calls', 'need', 8,
      'n_resolved', (select n from mine_n))
    when (select count(*) from per_user) < 8 then jsonb_build_object(
      'ranked', false, 'reason', 'cohort_small',
      'cohort', (select count(*) from per_user), 'n_resolved', (select n from mine_n))
    else jsonb_build_object(
      'ranked', true,
      'cohort', (select count(*) from per_user),
      'n_resolved', (select n from mine_n),
      -- share of the cohort STRICTLY less sharp than me (higher Brier), clamped off 0/100 so it
      -- never implies a unique extreme. "Sharper than <percentile>% of callers."
      'percentile', greatest(1, least(99, round(
        100.0 * (select count(*) from per_user pu where pu.mb > (select mb from me))::numeric
        / (select count(*) from per_user))::int)))
  end;
$$;
revoke all on function public.my_percentile() from public, anon;
grant execute on function public.my_percentile() to authenticated;

-- The same private rank band, sliced PER CATEGORY ("Top 5% on Economics"). Joins each scored call
-- to its calls row for the category stamped at call time. Same privacy floors, scaled down for the
-- thinner per-category cohorts (>= 5 of the caller's own calls in a category, and >= 5 callers in
-- it). Returns a JSON ARRAY of {category, n, cohort, percentile}, most-called first; empty until a
-- category clears both floors. Aggregate only — never an identity.
create or replace function public.my_category_percentile()
returns jsonb language sql security definer set search_path = public stable as $$
  with scored as (
    select cs.user_id, cs.brier, c.category
    from public.call_scores cs
    join public.calls c on c.user_id = cs.user_id and c.market_id = cs.market_id
    where c.category is not null and c.category <> ''
  ), per as (
    select user_id, category, avg(brier) as mb, count(*) as n
    from scored group by user_id, category having count(*) >= 5
  ), mine as (
    select category, mb, n from per where user_id = auth.uid()
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category', m.category,
        'n', m.n,
        'cohort', (select count(*) from per p where p.category = m.category),
        'percentile', greatest(1, least(99, round(
          100.0 * (select count(*) from per p where p.category = m.category and p.mb > m.mb)::numeric
          / (select count(*) from per p where p.category = m.category))::int))
      )
      order by m.n desc
    ) filter (where (select count(*) from per p where p.category = m.category) >= 5),
    '[]'::jsonb
  )
  from mine m;
$$;
revoke all on function public.my_category_percentile() from public, anon;
grant execute on function public.my_category_percentile() to authenticated;

-- The avatar facepile for a story's likes: display name + avatar for OPTED-IN
-- likers only (likes_public), most-recent first, capped. Never returns a user_id or
-- an opted-out liker — so the secret ballot holds for anyone who opted out.
create or replace function public.story_like_facepile(p_market_id text, p_limit int default 5)
returns table (display_name text, avatar_url text)
language sql security definer set search_path = public stable as $$
  select p.display_name, p.avatar_url
  from public.story_likes sl
  join public.profiles p on p.id = sl.user_id
  where sl.market_id = p_market_id and coalesce(p.likes_public, true) = true
  order by sl.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 12));
$$;

-- Record a read + advance the gentle reading streak. A FREE auto-freeze covers a
-- single missed day (gap ≤ 2 keeps the run going); two+ missed days reset to 1.
-- Mirrors src/lib/gamify.ts nextStreak(). Returns the current streak.
create or replace function public.touch_read(p_market_id text)
returns int language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  prev_date date;
  cur int;
  lng int;
  gap int;
begin
  if uid is null then return 0; end if;
  insert into public.reads (user_id, market_id) values (uid, p_market_id)
    on conflict (user_id, market_id) do nothing;
  insert into public.user_trust (user_id) values (uid) on conflict (user_id) do nothing;
  select last_read_date, current_streak, longest_streak into prev_date, cur, lng
    from public.user_trust where user_id = uid for update;
  if prev_date is null then
    cur := 1;
  else
    gap := today - prev_date;
    if gap <= 0 then
      null;                       -- same day: no double-count
    elsif gap <= 2 then
      cur := cur + 1;             -- the free grace day
    else
      cur := 1;
    end if;
  end if;
  lng := greatest(coalesce(lng, 0), cur);
  update public.user_trust
    set current_streak = cur, longest_streak = lng, last_read_date = today, updated_at = now()
    where user_id = uid;
  if cur >= 7 then
    insert into public.user_badges (user_id, badge_id) values (uid, 'on_a_roll')
      on conflict do nothing;
  end if;
  -- streak tiers: a month, then a hundred days. Permanent once reached (a later reset can't
  -- revoke them), so they reward having sustained the habit, not currently being on a run.
  if cur >= 30 then
    insert into public.user_badges (user_id, badge_id) values (uid, 'devoted') on conflict do nothing;
  end if;
  if cur >= 100 then
    insert into public.user_badges (user_id, badge_id) values (uid, 'stalwart') on conflict do nothing;
  end if;
  return cur;
end; $$;

-- Recompute a user's tier + award badges from source tables over a rolling 90-day
-- window. THE single place tier/badge logic lives (mirrors src/lib/gamify.ts
-- tierFor). Called by recompute_my_trust() (self) and the pipeline (service role).
create or replace function public.recompute_trust(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  br int; cl int; cm int; rc int; ap real; hn int; lastact timestamptz; daysinact int;
  cv int; tv int; av int; merit int; raw_lvl int; lvl int;
  t text; today date := (now() at time zone 'utc')::date;
begin
  select count(*) into br from public.reads
    where user_id = p_user_id and first_read_at > now() - interval '90 days';
  select count(*) into cl from public.calls
    where user_id = p_user_id and created_at > now() - interval '90 days';
  select count(*) into cm from public.comments
    where user_id = p_user_id and deleted = false and created_at > now() - interval '90 days';
  select count(*), avg(peer) into rc, ap from public.call_scores
    where user_id = p_user_id and scored_at > now() - interval '90 days';
  rc := coalesce(rc, 0);
  ap := coalesce(ap, 0);
  -- community notes that bridged to cross-viewpoint 'helpful' — feeds both merit and the
  -- corrected_the_record badge (note_status is written by the pipeline bridging job).
  select count(*) into hn from public.claim_notes n
    join public.note_status s on s.note_id = n.id
    where n.user_id = p_user_id and n.deleted = false and s.status = 'helpful';
  hn := coalesce(hn, 0);
  select greatest(
    coalesce((select max(first_read_at) from public.reads where user_id = p_user_id), 'epoch'),
    coalesce((select max(created_at) from public.calls where user_id = p_user_id), 'epoch'),
    coalesce((select max(created_at) from public.comments where user_id = p_user_id), 'epoch')
  ) into lastact;
  daysinact := today - lastact::date;
  -- tier (mirrors gamify.ts tierFor)
  if br >= 5 and (cl + cm) >= 3 then
    if rc >= 10 and cm >= 10 and ap <= 0 and daysinact <= 14 then
      t := 'steward';
    else
      t := 'contributor';
    end if;
  else
    t := 'reader';
  end if;

  -- claim-vote verification stats (drive the standing + the two new badges): how many
  -- distinct claims the reader weighed in on, and — among claims with a real quorum
  -- (>= 5 voters) — how many of their votes match the secret-ballot plurality.
  select count(distinct claim_id) into cv from public.claim_votes where user_id = p_user_id;
  cv := coalesce(cv, 0);
  with my_claims as (
    select distinct claim_id from public.claim_votes where user_id = p_user_id
  ), counts as (
    select claim_id, choice, count(*) as c from public.claim_votes
    where claim_id in (select claim_id from my_claims) group by claim_id, choice
  ), plural as (
    select cc.claim_id, sum(cc.c) as total, (array_agg(cc.choice order by cc.c desc))[1] as top_choice
    from counts cc group by cc.claim_id
  )
  select
    coalesce(count(*) filter (where p.total >= 5), 0),
    coalesce(count(*) filter (where p.total >= 5 and v.choice = p.top_choice), 0)
  into tv, av
  from public.claim_votes v join plural p on p.claim_id = v.claim_id
  where v.user_id = p_user_id;
  tv := coalesce(tv, 0);
  av := coalesce(av, 0);

  -- merit (mirrors gamify.ts meritScore + MERIT_WEIGHTS): accuracy (resolved calls + the
  -- −peer edge) and bridged-helpful notes dominate; reads + comments are CAPPED so volume
  -- alone can't climb. Non-negative, so round() matches JS Math.round.
  merit := round(
    least(greatest(br, 0), 25)::real
    + greatest(cl, 0) * 3
    + greatest(rc, 0) * 6
    + greatest(0::real, -ap) * greatest(rc, 0) * 80
    + least(greatest(cm, 0), 20) * 2
    + greatest(hn, 0) * 30
  )::int;
  -- level (mirrors gamify.ts levelFor): merit picks the raw rung, then clamp into the
  -- tier's band [reader 1-3, contributor 4-5, steward 6-7] — un-farmable past your tier.
  raw_lvl := case
    when merit >= 650 then 7 when merit >= 380 then 6 when merit >= 230 then 5
    when merit >= 120 then 4 when merit >= 70 then 3 when merit >= 25 then 2 else 1 end;
  if t = 'steward' then lvl := least(greatest(raw_lvl, 6), 7);
  elsif t = 'contributor' then lvl := least(greatest(raw_lvl, 4), 5);
  else lvl := least(greatest(raw_lvl, 1), 3); end if;

  insert into public.user_trust (
      user_id, tier, briefings_read, calls_made, resolved_calls, comments_posted,
      merit, level, helpful_notes, claims_voted, aligned_votes, updated_at)
    values (p_user_id, t, br, cl, rc, cm, merit, lvl, hn, cv, av, now())
  on conflict (user_id) do update
    set tier = excluded.tier, briefings_read = excluded.briefings_read,
        calls_made = excluded.calls_made, resolved_calls = excluded.resolved_calls,
        comments_posted = excluded.comments_posted, merit = excluded.merit,
        level = excluded.level, helpful_notes = excluded.helpful_notes,
        claims_voted = excluded.claims_voted, aligned_votes = excluded.aligned_votes,
        updated_at = now();
  -- badges (idempotent; the award thresholds live HERE — gamify.ts BADGES holds
  -- only the label/blurb/mark. Keep the two in sync: 'calibrated' mirrors
  -- gamify.ts MIN_CALLS_FOR_VERDICT (20); the rest are documented in BADGES blurbs.)
  if cl >= 1 then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'first_call') on conflict do nothing;
  end if;
  if rc >= 20 then -- mirrors gamify.ts MIN_CALLS_FOR_VERDICT
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'calibrated') on conflict do nothing;
  end if;
  if rc >= 5 and ap < 0 then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'sharp') on conflict do nothing;
  end if;
  -- Sharp tiers: a sustained crowd-beating edge over a larger resolved sample (windowed rc).
  if rc >= 15 and ap < 0 then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'sharp_ii') on conflict do nothing;
  end if;
  if rc >= 35 and ap < 0 then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'sharp_iii') on conflict do nothing;
  end if;
  -- 'called it': nailed a high-confidence call (≥85% either way) the crowd was
  -- unsure about (beat the market median). Either a confident YES that happened
  -- or a confident NO that didn't.
  if exists (
    select 1 from public.call_scores
    where user_id = p_user_id and peer < 0
      and ((prob >= 0.85 and won) or (prob <= 0.15 and not won))
  ) then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'called_it') on conflict do nothing;
  end if;
  -- 'corrected the record': authored a community note that bridged to HELPFUL.
  if hn >= 1 then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'corrected_the_record') on conflict do nothing;
  end if;
  -- claim-verification badges: 'fact_checker' = a real body of consensus-aligned reads;
  -- 'bridge_builder' additionally requires landing WITH the room most of the time (so it
  -- rewards reading the cross-viewpoint consensus, not just voting a lot).
  if av >= 15 then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'fact_checker') on conflict do nothing;
  end if;
  if av >= 30 and tv > 0 and av::real / tv >= 0.7 then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'bridge_builder') on conflict do nothing;
  end if;
  if t in ('contributor', 'steward') then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'contributor') on conflict do nothing;
  end if;
  if t = 'steward' then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'steward') on conflict do nothing;
  end if;
  -- 'founding reader': a tenure badge for the early cohort — un-farmable (the signup date can't
  -- be backdated). The cutoff bounds the founding window; bump it only to widen that cohort.
  if exists (
    select 1 from public.profiles where id = p_user_id and created_at < '2026-09-01'
  ) then
    insert into public.user_badges (user_id, badge_id) values (p_user_id, 'founding_reader') on conflict do nothing;
  end if;
end; $$;

-- Self-service: recompute the caller's own trust (e.g. when they open the panel).
create or replace function public.recompute_my_trust()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.recompute_trust(auth.uid());
end; $$;

-- The caller's tier + counts + streak (freshened on read).
create or replace function public.my_trust()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  perform public.recompute_trust(auth.uid());
  return (select to_jsonb(t) from (
    select tier, briefings_read, calls_made, resolved_calls, comments_posted,
           current_streak, longest_streak, merit, level,
           helpful_notes, claims_voted, aligned_votes
    from public.user_trust where user_id = auth.uid()
  ) t);
end; $$;

-- Public tier MARK for the authors in a discussion (so a small "Steward" chip can
-- sit by their name). Returns only non-reader tiers and only the comment author's
-- user_id — which is ALREADY public via the comments embed, so no new exposure.
create or replace function public.author_tiers(p_market_id text)
returns table (user_id uuid, tier text)
language sql security definer set search_path = public stable as $$
  select distinct ut.user_id, ut.tier
  from public.user_trust ut
  join public.comments c on c.user_id = ut.user_id
  where c.market_id = p_market_id and c.deleted = false and ut.tier <> 'reader';
$$;

-- File a flag with a category, and apply the SCOPED auto-hide: ONLY a Steward's
-- flag, ONLY a rule-breaking category, ONLY on a brand-NEW account (the spam/brigade
-- vector) hides a comment (pending review, logged + reversible). Disagreement or a
-- non-steward flag never hides anything — it just queues for review.
create or replace function public.flag_comment(p_comment_id uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  flagger_tier text;
  author uuid;
  author_created timestamptz;
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.reports (comment_id, user_id, reason, category)
    values (p_comment_id, uid, 'flagged', coalesce(p_category, 'other'))
  on conflict (comment_id, user_id) do update set category = excluded.category;
  select tier into flagger_tier from public.user_trust where user_id = uid;
  if flagger_tier = 'steward' and p_category in ('spam', 'abuse', 'rules') then
    select c.user_id, p.created_at into author, author_created
      from public.comments c join public.profiles p on p.id = c.user_id
      where c.id = p_comment_id and c.deleted = false;
    if author is not null and author <> uid and author_created > now() - interval '7 days' then
      update public.comments set deleted = true where id = p_comment_id;
      insert into public.moderation_log (comment_id, actor_id, action, reason)
        values (p_comment_id, uid, 'auto_hide', p_category);
    end if;
  end if;
end; $$;

-- Public notes + their bridged status for a set of claims. Returns the note
-- AUTHOR's identity (notes are attributed, like comments — not a secret ballot) and
-- the bridged status + rater COUNT, but never a rater's identity. Pending until the
-- bridging job runs (coalesced), so a freshly-added note shows as proposed.
create or replace function public.note_helpfulness(p_claim_ids text[])
returns table (
  note_id uuid, claim_id text, user_id uuid, body text, author_name text, author_avatar text,
  status text, n_raters int, created_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select n.id, n.claim_id, n.user_id, n.body, p.display_name, p.avatar_url,
         coalesce(s.status, 'pending'), coalesce(s.n_raters, 0), n.created_at
  from public.claim_notes n
  join public.profiles p on p.id = n.user_id
  left join public.note_status s on s.note_id = n.id
  where n.claim_id = any(p_claim_ids) and n.deleted = false
  order by (coalesce(s.status, 'pending') = 'helpful') desc, n.created_at desc;
$$;

-- The caller's tier, a cheap READ (no recompute) — gates the "add context" UI so we
-- don't offer authoring to readers who haven't earned it. Defaults to 'reader'.
create or replace function public.my_tier()
returns text language sql security definer set search_path = public stable as $$
  select coalesce((select tier from public.user_trust where user_id = auth.uid()), 'reader');
$$;

create index if not exists call_revisions_market_idx on public.call_revisions (market_id);

grant execute on function public.call_distribution(text) to anon, authenticated;
grant execute on function public.my_calibration() to authenticated;
grant execute on function public.story_like_facepile(text, int) to anon, authenticated;
grant execute on function public.touch_read(text) to authenticated;
grant execute on function public.recompute_my_trust() to authenticated;
grant execute on function public.my_trust() to authenticated;
grant execute on function public.author_tiers(text) to anon, authenticated;
grant execute on function public.flag_comment(uuid, text) to authenticated;
grant execute on function public.note_helpfulness(text[]) to anon, authenticated;
grant execute on function public.my_tier() to authenticated;
-- Hardening: the personal-action rpcs self-guard on auth.uid(), but revoke the
-- default PUBLIC execute so only signed-in (authenticated) roles can call them.
revoke all on function public.my_calibration() from public, anon;
revoke all on function public.touch_read(text) from public, anon;
revoke all on function public.recompute_my_trust() from public, anon;
revoke all on function public.my_trust() from public, anon;
revoke all on function public.flag_comment(uuid, text) from public, anon;
revoke all on function public.my_tier() from public, anon;
-- recompute_trust(uuid) is internal: callable by the definer rpcs above (they run
-- as the owner) and by the pipeline's service role — never directly by clients.
revoke all on function public.recompute_trust(uuid) from public, anon, authenticated;
grant execute on function public.recompute_trust(uuid) to service_role;

-- ════════════════════════ ADMIN CONSOLE ════════════════════════
-- An operator back-office (support + moderation) for the in-app /?admin panel. The
-- privilege model mirrors the rest of this schema: THE SERVER IS THE TRUST BOUNDARY.
-- There is exactly ONE new primitive — an allowlist of admin user_ids — and every
-- privileged read/action is a SECURITY DEFINER rpc that (1) checks the caller is on
-- that allowlist via is_admin() and raises 'forbidden' otherwise, and (2) records an
-- audit row. The browser admin UI is convenience only: it can grant itself nothing,
-- because nothing trusts the client. No service-role key ever reaches the browser —
-- admins call these with their OWN authenticated JWT + the public anon key, and the
-- definer functions (owned by the schema owner) supply the elevated reach to read
-- auth.users and perform privileged writes. Same hardening as above: revoke the
-- default PUBLIC/anon execute, grant only to authenticated, gate inside on is_admin().

-- The allowlist. RLS on with NO policy → unreadable/unwritable by anon/authenticated;
-- only the definer rpcs (owner context) and the service role touch it. Bootstrap the
-- FIRST admin with scripts/grant-admin.ts (service role) — there's no admin yet to do
-- it in-app. References profiles so it cascades if the user is deleted.
create table if not exists public.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid                                  -- the granting admin (no FK: survives their deletion)
);

alter table public.admins enable row level security;
-- No policies: deny all to anon/authenticated. Access is exclusively via the rpcs below.

-- Is the CURRENT caller an admin? Reads request-scoped auth.uid() (which is unchanged
-- inside a SECURITY DEFINER function), so it answers "is the signed-in user an admin"
-- both as the UI gate (granted to authenticated) AND as the internal guard each admin
-- rpc opens with. SECURITY DEFINER so it can read the policy-less admins table. STABLE.
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Append-only audit trail of every privileged action. RLS on, NO policy → read only
-- via admin_list_audit(). actor_id has no FK so the trail survives the actor's deletion.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- No policies: written by the admin rpcs (owner), read via admin_list_audit() only.

-- Internal: append an audit row, stamping the acting admin (auth.uid()). Called ONLY
-- from the admin_* rpcs (owner context); never granted to clients.
create or replace function public.admin_log(
  p_action text, p_target_type text, p_target_id text, p_detail jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_detail);
$$;
revoke all on function public.admin_log(text, text, text, jsonb) from public, anon, authenticated;

-- ───────────────── admin reads ─────────────────

-- A page of users with identity (incl. auth.users fields), trust tier, admin flag,
-- subscription status, and per-user activity counts. Server-side search (email /
-- display name / exact id), whitelisted sort, and pagination with a window total.
-- Efficient: the cheap base columns are filtered/sorted/paged first; the heavier
-- per-user aggregate subqueries are projected only for the returned page.
create or replace function public.admin_list_users(
  p_search text default null,
  p_sort text default 'created_at',   -- created_at|last_sign_in_at|email|display_name|tier
  p_dir text default 'desc',          -- asc|desc
  p_limit int default 50,
  p_offset int default 0
) returns table (
  user_id uuid, email text, display_name text, avatar_url text,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed_at timestamptz,
  banned_until timestamptz, providers text[], is_admin boolean, tier text,
  comments_count bigint, calls_count bigint, resolved_calls bigint, saved_count bigint,
  likes_count bigint, reports_filed bigint, is_subscriber boolean,
  subscriber_confirmed boolean, total_count bigint
) language plpgsql security definer set search_path = public stable as $$
declare
  v_dir text := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_sort text := lower(coalesce(p_sort, 'created_at'));
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  with filtered as (
    select u.id as uid, u.email::text as em, p.display_name as dn, p.avatar_url as av,
           u.created_at as ca, u.last_sign_in_at as lsi, u.email_confirmed_at as ec,
           u.banned_until as bu, u.raw_app_meta_data as meta,
           coalesce(t.tier, 'reader') as tr,
           exists (select 1 from public.admins a where a.user_id = u.id) as isadm
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_trust t on t.user_id = u.id
    where v_q is null
       or u.email ilike '%' || v_q || '%'
       or p.display_name ilike '%' || v_q || '%'
       or u.id::text = v_q
  ), counted as (select f.*, count(*) over () as tc from filtered f)
  select
    c.uid, c.em, c.dn, c.av, c.ca, c.lsi, c.ec, c.bu,
    coalesce(
      (select array_agg(x order by x) from jsonb_array_elements_text(c.meta->'providers') as q(x)),
      case when c.meta->>'provider' is not null then array[c.meta->>'provider'] else array[]::text[] end
    ),
    c.isadm, c.tr,
    (select count(*) from public.comments cm where cm.user_id = c.uid and cm.deleted = false),
    (select count(*) from public.calls ca2 where ca2.user_id = c.uid),
    (select count(*) from public.call_scores cs where cs.user_id = c.uid),
    (select count(*) from public.saved_stories s where s.user_id = c.uid and s.deleted = false),
    (select count(*) from public.story_likes sl where sl.user_id = c.uid)
      + (select count(*) from public.comment_likes cl where cl.user_id = c.uid),
    (select count(*) from public.reports r where r.user_id = c.uid),
    exists (select 1 from public.subscribers s where lower(s.email) = lower(c.em) and s.unsubscribed_at is null),
    exists (select 1 from public.subscribers s where lower(s.email) = lower(c.em) and s.confirmed_at is not null and s.unsubscribed_at is null),
    c.tc
  from counted c
  order by
    case when v_sort = 'created_at'      and v_dir = 'asc'  then c.ca end asc nulls last,
    case when v_sort = 'created_at'      and v_dir = 'desc' then c.ca end desc nulls last,
    case when v_sort = 'last_sign_in_at' and v_dir = 'asc'  then c.lsi end asc nulls last,
    case when v_sort = 'last_sign_in_at' and v_dir = 'desc' then c.lsi end desc nulls last,
    case when v_sort = 'email'           and v_dir = 'asc'  then c.em end asc nulls last,
    case when v_sort = 'email'           and v_dir = 'desc' then c.em end desc nulls last,
    case when v_sort = 'display_name'    and v_dir = 'asc'  then c.dn end asc nulls last,
    case when v_sort = 'display_name'    and v_dir = 'desc' then c.dn end desc nulls last,
    case when v_sort = 'tier'            and v_dir = 'asc'  then c.tr end asc nulls last,
    case when v_sort = 'tier'            and v_dir = 'desc' then c.tr end desc nulls last,
    c.ca desc, c.uid
  limit v_limit offset v_offset;
end; $$;

-- A single user's complete record as one jsonb blob: auth fields, profile, trust,
-- badges, subscription, activity counts, and recent comments/calls/reports.
create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'phone', u.phone,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at,
    'banned_until', u.banned_until,
    'providers', coalesce(
      (select array_agg(x order by x) from jsonb_array_elements_text(u.raw_app_meta_data->'providers') as q(x)),
      case when u.raw_app_meta_data->>'provider' is not null then array[u.raw_app_meta_data->>'provider'] else array[]::text[] end),
    'user_metadata', u.raw_user_meta_data,
    'is_admin', exists (select 1 from public.admins a where a.user_id = u.id),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = u.id),
    'trust', (select to_jsonb(t) from public.user_trust t where t.user_id = u.id),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('badge_id', b.badge_id, 'earned_at', b.earned_at) order by b.earned_at desc)
                        from public.user_badges b where b.user_id = u.id), '[]'::jsonb),
    'subscription', (select jsonb_build_object(
        'email', s.email, 'source', s.source, 'frequency', s.frequency, 'topics', s.topics,
        'breaking', s.breaking, 'confirmed', s.confirmed_at is not null, 'subscribed', s.unsubscribed_at is null,
        'created_at', s.created_at, 'confirmed_at', s.confirmed_at, 'unsubscribed_at', s.unsubscribed_at)
      from public.subscribers s where lower(s.email) = lower(u.email)),
    'counts', jsonb_build_object(
      'comments', (select count(*) from public.comments c where c.user_id = u.id and c.deleted = false),
      'comments_deleted', (select count(*) from public.comments c where c.user_id = u.id and c.deleted = true),
      'calls', (select count(*) from public.calls c where c.user_id = u.id),
      'resolved_calls', (select count(*) from public.call_scores cs where cs.user_id = u.id),
      'saved', (select count(*) from public.saved_stories s where s.user_id = u.id and s.deleted = false),
      'story_likes', (select count(*) from public.story_likes sl where sl.user_id = u.id),
      'comment_likes', (select count(*) from public.comment_likes cl where cl.user_id = u.id),
      'claim_votes', (select count(*) from public.claim_votes cv where cv.user_id = u.id),
      'notes', (select count(*) from public.claim_notes n where n.user_id = u.id and n.deleted = false),
      'reads', (select count(*) from public.reads r where r.user_id = u.id),
      'reports_filed', (select count(*) from public.reports r where r.user_id = u.id),
      'reports_against', (select count(*) from public.reports r join public.comments c on c.id = r.comment_id where c.user_id = u.id)),
    'recent_comments', coalesce((select jsonb_agg(j) from (
        select jsonb_build_object('id', c.id, 'market_id', c.market_id, 'body', c.body,
          'created_at', c.created_at, 'edited_at', c.edited_at, 'deleted', c.deleted, 'parent_id', c.parent_id) as j
        from public.comments c where c.user_id = u.id order by c.created_at desc limit 25) sub), '[]'::jsonb),
    'recent_calls', coalesce((select jsonb_agg(j) from (
        select jsonb_build_object('market_id', c.market_id, 'target_outcome', c.target_outcome,
          'pick', c.pick, 'confidence', c.confidence, 'hidden', c.hidden, 'created_at', c.created_at) as j
        from public.calls c where c.user_id = u.id order by c.created_at desc limit 25) sub), '[]'::jsonb),
    'reports_filed_recent', coalesce((select jsonb_agg(j) from (
        select jsonb_build_object('comment_id', r.comment_id, 'category', r.category, 'reason', r.reason, 'created_at', r.created_at) as j
        from public.reports r where r.user_id = u.id order by r.created_at desc limit 25) sub), '[]'::jsonb)
  ) into v
  from auth.users u
  where u.id = p_user_id;
  if v is null then raise exception 'user not found'; end if;
  return v;
end; $$;

-- Newsletter subscribers (the email-keyed list, otherwise opaque to clients), with a
-- status filter and the linked auth user id when the email matches an account. Tokens
-- (confirm/unsubscribe) are deliberately NEVER returned — they are credentials.
create or replace function public.admin_list_subscribers(
  p_search text default null,
  p_status text default 'all',        -- all|confirmed|unconfirmed|unsubscribed
  p_sort text default 'created_at',   -- created_at|email
  p_dir text default 'desc',
  p_limit int default 50,
  p_offset int default 0
) returns table (
  id uuid, email text, source text, frequency text, topics text[], breaking boolean,
  created_at timestamptz, confirmed_at timestamptz, confirm_sent_at timestamptz,
  unsubscribed_at timestamptz, linked_user_id uuid, total_count bigint
) language plpgsql security definer set search_path = public stable as $$
declare
  v_dir text := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_sort text := lower(coalesce(p_sort, 'created_at'));
  v_status text := lower(coalesce(p_status, 'all'));
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  with filtered as (
    select s.id, s.email, s.source, s.frequency, s.topics, s.breaking, s.created_at,
           s.confirmed_at, s.confirm_sent_at, s.unsubscribed_at,
           (select u.id from auth.users u where lower(u.email) = lower(s.email) limit 1) as luid
    from public.subscribers s
    where (v_q is null or s.email ilike '%' || v_q || '%')
      and (v_status = 'all'
        or (v_status = 'confirmed' and s.confirmed_at is not null and s.unsubscribed_at is null)
        or (v_status = 'unconfirmed' and s.confirmed_at is null and s.unsubscribed_at is null)
        or (v_status = 'unsubscribed' and s.unsubscribed_at is not null))
  ), counted as (select f.*, count(*) over () as tc from filtered f)
  select c.id, c.email, c.source, c.frequency, c.topics, c.breaking, c.created_at,
         c.confirmed_at, c.confirm_sent_at, c.unsubscribed_at, c.luid, c.tc
  from counted c
  order by
    case when v_sort = 'email' and v_dir = 'asc' then c.email end asc nulls last,
    case when v_sort = 'email' and v_dir = 'desc' then c.email end desc nulls last,
    case when v_sort = 'created_at' and v_dir = 'asc' then c.created_at end asc nulls last,
    case when v_sort = 'created_at' and v_dir = 'desc' then c.created_at end desc nulls last,
    c.created_at desc, c.id
  limit v_limit offset v_offset;
end; $$;

-- All comments (including deleted — admins see them; the public RLS hides them), with
-- author name and live report count. For the moderation comment browser.
create or replace function public.admin_list_comments(
  p_search text default null,
  p_include_deleted boolean default true,
  p_sort text default 'created_at',   -- created_at
  p_dir text default 'desc',
  p_limit int default 50,
  p_offset int default 0
) returns table (
  id uuid, market_id text, user_id uuid, author_name text, body text,
  created_at timestamptz, edited_at timestamptz, deleted boolean, parent_id uuid,
  report_count bigint, total_count bigint
) language plpgsql security definer set search_path = public stable as $$
declare
  v_dir text := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  with filtered as (
    select c.id, c.market_id, c.user_id, p.display_name as author_name, c.body,
           c.created_at, c.edited_at, c.deleted, c.parent_id
    from public.comments c
    left join public.profiles p on p.id = c.user_id
    where (coalesce(p_include_deleted, true) or c.deleted = false)
      and (v_q is null or c.body ilike '%' || v_q || '%' or c.market_id ilike '%' || v_q || '%')
  ), counted as (select f.*, count(*) over () as tc from filtered f)
  select c.id, c.market_id, c.user_id, c.author_name, c.body, c.created_at, c.edited_at,
         c.deleted, c.parent_id,
         (select count(*) from public.reports r where r.comment_id = c.id), c.tc
  from counted c
  order by
    case when v_dir = 'asc' then c.created_at end asc,
    case when v_dir = 'desc' then c.created_at end desc,
    c.created_at desc, c.id
  limit v_limit offset v_offset;
end; $$;

-- The moderation queue: comments that have been reported, ranked by report volume
-- then recency, with a per-category breakdown and the comment + author.
create or replace function public.admin_moderation_queue(
  p_limit int default 50, p_offset int default 0
) returns table (
  comment_id uuid, market_id text, user_id uuid, author_name text, body text,
  deleted boolean, created_at timestamptz, n_reports bigint, categories jsonb,
  last_reported_at timestamptz, total_count bigint
) language plpgsql security definer set search_path = public stable as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  with rep as (
    select g.comment_id,
           sum(g.cnt)::bigint as n_reports,
           max(g.last_at) as last_reported_at,
           jsonb_object_agg(g.category, g.cnt) as categories
    from (select rp.comment_id, rp.category, count(*)::int as cnt, max(rp.created_at) as last_at
          from public.reports rp group by rp.comment_id, rp.category) g
    group by g.comment_id
  ), counted as (select rep.*, count(*) over () as tc from rep)
  select r.comment_id, c.market_id, c.user_id, p.display_name, c.body, c.deleted,
         c.created_at, r.n_reports, r.categories, r.last_reported_at, r.tc
  from counted r
  join public.comments c on c.id = r.comment_id
  left join public.profiles p on p.id = c.user_id
  order by r.n_reports desc, r.last_reported_at desc, r.comment_id
  limit v_limit offset v_offset;
end; $$;

-- The admin allowlist itself, with each admin's identity and who granted them.
create or replace function public.admin_list_admins()
returns table (
  user_id uuid, email text, display_name text, avatar_url text,
  added_at timestamptz, added_by uuid, added_by_name text
) language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select a.user_id, u.email::text, p.display_name, p.avatar_url, a.added_at, a.added_by, ap.display_name
  from public.admins a
  left join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  left join public.profiles ap on ap.id = a.added_by
  order by a.added_at asc;
end; $$;

-- The audit trail (most-recent first), with the acting admin's display name.
create or replace function public.admin_list_audit(
  p_limit int default 100, p_offset int default 0
) returns table (
  id uuid, actor_id uuid, actor_name text, action text, target_type text,
  target_id text, detail jsonb, created_at timestamptz, total_count bigint
) language plpgsql security definer set search_path = public stable as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 100), 500));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  with counted as (select l.*, count(*) over () as tc from public.admin_audit_log l)
  select c.id, c.actor_id, p.display_name, c.action, c.target_type, c.target_id,
         c.detail, c.created_at, c.tc
  from counted c
  left join public.profiles p on p.id = c.actor_id
  order by c.created_at desc, c.id
  limit v_limit offset v_offset;
end; $$;

-- ───────────────── admin actions (all gated + audited) ─────────────────

-- Hide / unhide any comment (moderation). The unhide relies on the guard-trigger
-- exception for admins above; both directions also write the existing moderation_log.
create or replace function public.admin_set_comment_deleted(
  p_comment_id uuid, p_deleted boolean, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.comments set deleted = coalesce(p_deleted, true) where id = p_comment_id;
  if not found then raise exception 'comment not found'; end if;
  insert into public.moderation_log (comment_id, actor_id, action, reason)
    values (p_comment_id, auth.uid(), case when p_deleted then 'admin_hide' else 'admin_unhide' end, p_reason);
  perform public.admin_log(case when p_deleted then 'hide_comment' else 'unhide_comment' end,
                           'comment', p_comment_id::text, jsonb_build_object('reason', p_reason));
end; $$;

-- Recompute a user's trust tier from their activity (the tier is auto-derived and
-- decays; this just refreshes it on demand — there is no manual tier override path).
create or replace function public.admin_recompute_trust(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  perform public.recompute_trust(p_user_id);
  perform public.admin_log('recompute_trust', 'user', p_user_id::text, null);
end; $$;

-- Grant admin to an existing user (must have a profile, i.e. be a real signed-up user).
create or replace function public.admin_grant_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'no such user';
  end if;
  -- Defense in depth: a banned account must not be promotable. Admins are exempt from
  -- ban/delete, so granting admin to a banned user would make them un-bannable —
  -- shrinking the blast radius of a stolen admin token. Unban first if intended.
  if exists (select 1 from auth.users where id = p_user_id and banned_until is not null and banned_until > now()) then
    raise exception 'cannot grant admin to a banned user — unban them first';
  end if;
  insert into public.admins (user_id, added_by) values (p_user_id, auth.uid())
    on conflict (user_id) do nothing;
  perform public.admin_log('grant_admin', 'user', p_user_id::text, null);
end; $$;

-- Revoke admin. Refuses to remove the LAST admin (lockout guard); self-revoke is fine
-- as long as another admin remains.
create or replace function public.admin_revoke_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if (select count(*) from public.admins) <= 1 then
    raise exception 'cannot revoke the last admin';
  end if;
  delete from public.admins where user_id = p_user_id;
  perform public.admin_log('revoke_admin', 'user', p_user_id::text, null);
end; $$;

-- Ban / unban a user (sets auth.users.banned_until — GoTrue refuses tokens while it's
-- in the future). Default ban is effectively permanent; pass p_until for a timed ban.
-- Refuses to ban yourself or another admin (revoke their admin first).
create or replace function public.admin_set_user_banned(
  p_user_id uuid, p_banned boolean, p_until timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot ban yourself'; end if;
  if coalesce(p_banned, false) and exists (select 1 from public.admins a where a.user_id = p_user_id) then
    raise exception 'cannot ban another admin — revoke admin first';
  end if;
  v_until := case when coalesce(p_banned, false) then coalesce(p_until, now() + interval '100 years') else null end;
  update auth.users set banned_until = v_until where id = p_user_id;
  if not found then raise exception 'user not found'; end if;
  perform public.admin_log(case when coalesce(p_banned, false) then 'ban_user' else 'unban_user' end,
                           'user', p_user_id::text, jsonb_build_object('until', v_until));
end; $$;

-- Hard-delete a user + their email-keyed subscriber row (cascades all their content,
-- like delete_my_account but operator-initiated). Audited BEFORE the cascade erases
-- everything. Refuses to delete yourself or another admin (revoke their admin first).
create or replace function public.admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot delete yourself here — use account deletion'; end if;
  if exists (select 1 from public.admins a where a.user_id = p_user_id) then
    raise exception 'cannot delete another admin — revoke admin first';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'user not found'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  perform public.admin_log('delete_user', 'user', p_user_id::text, jsonb_build_object('email', v_email));
  delete from public.subscribers s where v_email is not null and lower(s.email) = v_email;
  delete from auth.users where id = p_user_id;     -- cascades profiles → all user content
end; $$;

-- Mark a subscriber unsubscribed (keeps the row, like the user-facing opt-out).
create or replace function public.admin_unsubscribe_subscriber(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_email = '' then raise exception 'email required'; end if;
  update public.subscribers set unsubscribed_at = coalesce(unsubscribed_at, now()) where lower(email) = v_email;
  if not found then raise exception 'subscriber not found'; end if;
  perform public.admin_log('unsubscribe_subscriber', 'subscriber', v_email, null);
end; $$;

-- Hard-delete a subscriber row (e.g. a junk/abuse address).
create or replace function public.admin_delete_subscriber(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_email = '' then raise exception 'email required'; end if;
  delete from public.subscribers where lower(email) = v_email;
  if not found then raise exception 'subscriber not found'; end if;
  perform public.admin_log('delete_subscriber', 'subscriber', v_email, null);
end; $$;

-- ───────────────── admin grants ─────────────────
-- Each rpc self-guards on is_admin(); grant to authenticated (an admin signs in as a
-- normal user) and revoke the default PUBLIC/anon execute. A non-admin who calls one
-- gets 'forbidden' before any work runs — no data leaks, no action taken.
grant execute on function public.admin_list_users(text, text, text, int, int) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_list_subscribers(text, text, text, text, int, int) to authenticated;
grant execute on function public.admin_list_comments(text, boolean, text, text, int, int) to authenticated;
grant execute on function public.admin_moderation_queue(int, int) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_list_audit(int, int) to authenticated;
grant execute on function public.admin_set_comment_deleted(uuid, boolean, text) to authenticated;
grant execute on function public.admin_recompute_trust(uuid) to authenticated;
grant execute on function public.admin_grant_admin(uuid) to authenticated;
grant execute on function public.admin_revoke_admin(uuid) to authenticated;
grant execute on function public.admin_set_user_banned(uuid, boolean, timestamptz) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_unsubscribe_subscriber(text) to authenticated;
grant execute on function public.admin_delete_subscriber(text) to authenticated;

revoke all on function public.admin_list_users(text, text, text, int, int) from public, anon;
revoke all on function public.admin_user_detail(uuid) from public, anon;
revoke all on function public.admin_list_subscribers(text, text, text, text, int, int) from public, anon;
revoke all on function public.admin_list_comments(text, boolean, text, text, int, int) from public, anon;
revoke all on function public.admin_moderation_queue(int, int) from public, anon;
revoke all on function public.admin_list_admins() from public, anon;
revoke all on function public.admin_list_audit(int, int) from public, anon;
revoke all on function public.admin_set_comment_deleted(uuid, boolean, text) from public, anon;
revoke all on function public.admin_recompute_trust(uuid) from public, anon;
revoke all on function public.admin_grant_admin(uuid) from public, anon;
revoke all on function public.admin_revoke_admin(uuid) from public, anon;
revoke all on function public.admin_set_user_banned(uuid, boolean, timestamptz) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
revoke all on function public.admin_unsubscribe_subscriber(text) from public, anon;
revoke all on function public.admin_delete_subscriber(text) from public, anon;

-- ───────────────── pipeline runs (admin Operations console) ─────────────────
-- One row per Pulse Pipeline run, written by the pipeline (service role, bypasses RLS).
-- Powers the admin Operations console: LLM provider/token usage, limit-hits + fallbacks,
-- briefing counts, run durations, and source-fetch health. Read ONLY via the admin rpc.
create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  duration_ms integer,
  generated integer,
  skipped integer,
  results integer,
  briefed integer,
  gemini_down boolean not null default false,  -- Gemini configured but 0 successful calls
  commit_sha text,
  run_id text,
  detail jsonb,                                -- the full PipelineRunSummary (LLM usage, etc.)
  created_at timestamptz not null default now()
);
create index if not exists pipeline_runs_run_at_idx on public.pipeline_runs (run_at desc);

alter table public.pipeline_runs enable row level security;
-- No policies: written by the pipeline (service role), read only via admin_list_pipeline_runs().

create or replace function public.admin_list_pipeline_runs(p_limit int default 100)
returns table (
  id uuid, run_at timestamptz, duration_ms integer, generated integer, skipped integer,
  results integer, briefed integer, gemini_down boolean, commit_sha text, run_id text,
  detail jsonb, total_count bigint
) language plpgsql security definer set search_path = public stable as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  with counted as (select r.*, count(*) over () as tc from public.pipeline_runs r)
  select c.id, c.run_at, c.duration_ms, c.generated, c.skipped, c.results, c.briefed,
         c.gemini_down, c.commit_sha, c.run_id, c.detail, c.tc
  from counted c
  order by c.run_at desc
  limit v_limit;
end; $$;
grant execute on function public.admin_list_pipeline_runs(int) to authenticated;
revoke all on function public.admin_list_pipeline_runs(int) from public, anon;

-- ════════════════════════ social graph (follow + shared calls) ════════════════════════
-- Opt-in, privacy-first. A reader can follow other readers (from the discussion), and
-- SEPARATELY opt to make their own Calls visible to the people who follow them. Both
-- default OFF for sharing: following someone reveals NOTHING about your own calls, and
-- your calls stay a secret ballot until you flip `calls_public`. The "see how the people
-- you follow called it" view is served by a SECURITY DEFINER rpc that filters to
-- (you-follow-them) AND (they-opted-in) AND (not self-hidden) — the calls table's own
-- "read own calls" RLS is never widened, so nothing leaks.

-- The opt-in: show my Calls to my followers. Default false (secret ballot preserved).
alter table public.profiles add column if not exists calls_public boolean not null default false;

-- Directed follow edges: follower_id follows following_id.
create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint user_follows_no_self check (follower_id <> following_id)
);

create index if not exists user_follows_following_idx on public.user_follows (following_id);

alter table public.user_follows enable row level security;

-- You read your OWN edges (who you follow, and who follows you) — never the whole graph.
drop policy if exists "read own follows" on public.user_follows;
create policy "read own follows" on public.user_follows for select
  using (auth.uid() = follower_id or auth.uid() = following_id);
-- You may only create/remove edges where YOU are the follower.
drop policy if exists "follow others" on public.user_follows;
create policy "follow others" on public.user_follows for insert
  with check (auth.uid() = follower_id);
drop policy if exists "unfollow others" on public.user_follows;
create policy "unfollow others" on public.user_follows for delete
  using (auth.uid() = follower_id);

-- Rate limit: max 60 new follows/min/user, advisory-locked (slot 3 follows 0/1/2).
create or replace function public.enforce_follow_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.follower_id::text, 3));
  if (
    select count(*) from public.user_follows
    where follower_id = new.follower_id and created_at > now() - interval '1 minute'
  ) >= 60 then
    raise exception 'Slow down — too many follows too fast.';
  end if;
  return new;
end; $$;
drop trigger if exists follow_rate_limit on public.user_follows;
create trigger follow_rate_limit before insert on public.user_follows
  for each row execute function public.enforce_follow_rate();

-- How the people YOU follow called a market — names + picks + confidence, but ONLY for
-- followees who opted in (calls_public) and didn't self-hide the call. Definer so it can
-- read across calls without widening that table's secret-ballot RLS; every row is still
-- gated by an edge where auth.uid() is the follower. Returns nothing for anon.
create or replace function public.followed_calls_on_market(p_market_id text)
returns table (display_name text, avatar_url text, pick text, confidence smallint, target_outcome text)
language sql security definer set search_path = public stable as $$
  select p.display_name, p.avatar_url, c.pick, c.confidence, c.target_outcome
  from public.calls c
  join public.user_follows f on f.following_id = c.user_id and f.follower_id = auth.uid()
  join public.profiles p on p.id = c.user_id
  where c.market_id = p_market_id
    and coalesce(p.calls_public, false) = true
    and c.hidden = false
  order by c.confidence desc, p.display_name asc;
$$;

-- Follower / following counts for a profile (public, counts only).
create or replace function public.follow_counts(p_user_id uuid)
returns table (followers bigint, following bigint)
language sql security definer set search_path = public stable as $$
  select
    (select count(*) from public.user_follows where following_id = p_user_id)::bigint,
    (select count(*) from public.user_follows where follower_id = p_user_id)::bigint;
$$;

-- How a market's reader Calls accrued over time: per-day yes/no counts (counts only,
-- never identities — same secret-ballot guarantee as call_distribution). The client
-- cumulates these into a "share calling YES over time" line. Capped to a 120-day window.
create or replace function public.call_distribution_series(p_market_id text, p_days int default 45)
returns table (day date, yes_target bigint, no_target bigint)
language sql security definer set search_path = public stable as $$
  select (created_at at time zone 'utc')::date as day,
    count(*) filter (where pick = 'yes')::bigint,
    count(*) filter (where pick = 'no')::bigint
  from public.calls
  where market_id = p_market_id
    and created_at > now() - (greatest(1, least(coalesce(p_days, 45), 120)) || ' days')::interval
  group by day
  order by day;
$$;

grant execute on function public.followed_calls_on_market(text) to authenticated;
grant execute on function public.follow_counts(uuid) to authenticated, anon;
grant execute on function public.call_distribution_series(text, int) to authenticated, anon;
-- Lock the followed-calls rpc to signed-in callers only (Postgres grants EXECUTE to
-- PUBLIC by default; the grant above doesn't remove that). The function is already
-- safe for anon — its auth.uid() join returns nothing — but matching the documented
-- authenticated-only posture is defense-in-depth, mirroring the admin-fn revokes below.
revoke all on function public.followed_calls_on_market(text) from public, anon;

-- ───────────────── opt-in public profile (no leaderboard) ─────────────────
-- A reader can opt to make their STANDING shareable as a single self-page: level, tier,
-- earned badges, reading streak, and — only if they ALSO share their Calls (calls_public)
-- — their calibration record. There is no leaderboard and no ranking; a profile is
-- reachable only by its own ?u= link. Everything is OFF by default. The rpc is definer so
-- it can read the otherwise own-read trust/badge/score tables, but it returns NOTHING
-- unless the owner flipped profile_public — and never a raw vote or a rater identity.
alter table public.profiles add column if not exists profile_public boolean not null default false;

create or replace function public.public_profile(p_user_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  with prof as (
    select id, display_name, avatar_url, created_at, calls_public
    from public.profiles
    where id = p_user_id and coalesce(profile_public, false) = true
  )
  select case when not exists (select 1 from prof) then null else (
    select jsonb_build_object(
      'display_name', pr.display_name,
      'avatar_url', pr.avatar_url,
      'member_since', pr.created_at,
      'tier', coalesce(ut.tier, 'reader'),
      'level', coalesce(ut.level, 1),
      'current_streak', coalesce(ut.current_streak, 0),
      'longest_streak', coalesce(ut.longest_streak, 0),
      'badges', coalesce((
        select jsonb_agg(b.badge_id order by b.earned_at)
        from public.user_badges b where b.user_id = pr.id), '[]'::jsonb),
      -- Calibration only when they ALSO chose to share their Calls (else null).
      'calibration', case when pr.calls_public then (
        select jsonb_build_object(
          'n_resolved', count(*),
          'correct', count(*) filter (where (prob >= 0.5) = won),
          'mean_brier', avg(brier)
        ) from public.call_scores where user_id = pr.id
      ) else null end
    )
    from prof pr left join public.user_trust ut on ut.user_id = pr.id
  ) end;
$$;

grant execute on function public.public_profile(uuid) to anon, authenticated;
