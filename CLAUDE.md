# Crowdtells — project guide

Crowdtells (crowdtells.com) is a **news platform**, not a prediction-markets product. It uses
prediction markets (Polymarket + Kalshi) as an **assignment desk** — the money flags what's worth
covering and supplies data points — then briefs each story from multiple real outlets.

**The moat is time:** Crowdtells keeps a *living record of what the crowd believed* at each point as a
story develops — the market's read (odds over time) **and** the community's read (immutable scored
"Calls", secret-ballot votes over time) on one timeline. Lead positioning with this, not with
"prediction markets." Hero promise: **"A living record of what the crowd believes."** Masthead keeps
the name-pun **"The crowd tells it first."**

## Hard constraints
- **Free stack only.** Groq (free tier), Supabase (free tier), Cloudflare Pages, GitHub Actions. No
  paid APIs, no servers. Don't introduce a dependency that needs a paid plan.
- **CI gates every deploy.** `npm run typecheck && npm run lint && npm run test && npm run build` must
  be green — a red test freezes the Cloudflare deploy. Run the full gate before considering work done.
- **Re-run `supabase/schema.sql` after any schema change ships.** It's idempotent; the owner runs it
  manually in the Supabase SQL editor. Flag this in the summary whenever you touch the schema.

## Architecture (where things live)
- `scripts/` — the GitHub Actions "Pulse Pipeline": `generate.ts` + `scripts/lib/*` pull markets +
  news, **fold props + cluster related markets into STORIES** (`stories.ts`), rank stories **news-led**
  (`ranking.ts`: news footprint primary, volume damp-only), assign each an editorial **format**, and
  write briefings for the story leads; senders (`send-digest`, `send-breaking`, …) email via Mailgun.
- `src/` — the React 19 + TS (strict) SPA, CSS Modules, design tokens in `src/styles/tokens.css`.
- `src/lib/types.ts` — the **single source of truth** for data shapes, imported by both pipeline and
  SPA. Keep the three layers (TS types, SQL schema, pipeline writes) in sync here.
- `supabase/` — `schema.sql` (tables + RLS + RPCs), `functions/` (edge functions), `config.toml`.
- Durable cross-run state lives in `store.json` on the `data` branch; the published feed is
  `public/feed.json`.

## Gotchas (learned the hard way)
- **`public/*.html`, `public/feed.xml`, `public/og.*` are BUILD OUTPUT.** Never edit them directly —
  edit the generators: `scripts/lib/pages.ts`, `syndication.ts`, `prerender.ts`, `ogImage.ts`, and the
  SPA source strings in `index.html` / `src/lib/urlState.ts`.
- **`create table if not exists` does NOT add columns to an existing table.** Any column added after a
  table's first ship needs an explicit `alter table … add column if not exists`.
- The AI briefing prompts (`scripts/lib/groq.ts`) are deliberately **news-first** (markets treated as
  "one source you quote, like a poll"). The model never sees live numbers — odds/volume are hydrated
  at render time. Don't make prompts market-led.
- **The unit of content is a STORY, not a market** (`scripts/lib/stories.ts`). The lead market carries
  the story (`storyId`/`isStoryLead`); absorbed facets ride along as `subSignals`; ranking is news-led
  (`newsFootprint` = distinct corroborating outlets is the primary axis, NOT volume). A `format: 'digest'`
  market (folded prop / sports line) is **never briefed** and must be filtered at EVERY surfacing/sort
  boundary (feed `related[]`, the article open-path, Movers/Breaking sort) or it leaks as an empty article.
- **Commit only your own files.** The owner iterates on `main` in parallel; never cherry-pick their
  in-flight changes into your commit.

## Security posture (keep it this way)
RLS on every table, writes scoped to `auth.uid()`, all `SECURITY DEFINER` functions set
`search_path = public`, secret-ballot voting via aggregate-only RPCs, immutable Calls + bridged
community notes so the public track record can't be gamed. The anon key is public (RLS protects data);
no service-role key ever reaches the browser.
