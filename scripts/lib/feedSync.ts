/**
 * Model B — mirror the published CLIENT feed (public/feed.json) into Supabase so
 * the SPA can read it live and subscribe via Realtime, with no per-update site
 * rebuild. store.json stays the server source of truth; only the client-visible
 * feed is mirrored here (each market as a JSONB blob — proven lossless in
 * src/test/modelbRoundtrip.test.ts). Plain PostgREST via the service key, reusing
 * scripts/lib/admin.ts (no supabase-js on the server). Runs post-deploy from a
 * trusted shell only — NEVER in the browser.
 */
import { readFileSync } from 'node:fs';
import type { Feed, Market } from '../../src/lib/types';
import { type AdminCtx, restDelete, restSelect, restUpsert } from './admin';

export interface FeedMarketRow {
  id: string;
  status: string;
  score: number;
  category: string | null;
  updated_at: string;
  data: Market;
}

export interface FeedMetaRow {
  id: 'singleton';
  generated_at: string;
  breaking: unknown[];
  events: unknown[];
}

/** Map the published client feed → Supabase rows. Pure (unit-tested). */
export function feedToRows(feed: Feed): { markets: FeedMarketRow[]; meta: FeedMetaRow } {
  // Every row MUST have identical keys or PostgREST bulk upsert 400s with PGRST102
  // ("All object keys must match"). A market with no category would otherwise drop
  // the `category` key (JSON omits undefined) and mismatch the rows that have one —
  // so coerce the nullable columns to an explicit value that's always serialized.
  const markets: FeedMarketRow[] = feed.markets.map((m) => ({
    id: m.id,
    status: m.status,
    score: m.score ?? 0,
    category: m.category ?? null,
    updated_at: m.updatedAt,
    data: m,
  }));
  const meta: FeedMetaRow = {
    id: 'singleton',
    generated_at: feed.generatedAt,
    breaking: feed.breaking ?? [],
    events: feed.events ?? [],
  };
  return { markets, meta };
}

/** The ids present in the prior Supabase mirror but no longer in the live feed —
 * the (small) set to prune. Pure. */
export function departedIds(prior: Iterable<string>, current: FeedMarketRow[]): string[] {
  const live = new Set(current.map((r) => r.id));
  return [...prior].filter((id) => !live.has(id));
}

/** PostgREST `id=in.(…)` filter for a specific id set (the departed rows), or null
 * when empty. Scales with churn, not feed size — a `not.in` over the whole feed
 * would blow PostgREST's URL limit on a large feed. */
export function inFilter(ids: string[]): string | null {
  if (ids.length === 0) return null;
  return `id=in.(${ids.map((id) => encodeURIComponent(`"${id}"`)).join(',')})`;
}

/** Load the published client feed — the exact artifact the SPA fetches today. */
export function loadClientFeed(path: string): Feed {
  return JSON.parse(readFileSync(path, 'utf8')) as Feed;
}

/**
 * Stable JSON (recursively sorted keys, undefined keys dropped to match JSONB) so
 * a market's stored row and its freshly-built row compare equal regardless of key
 * order — Postgres JSONB does not preserve key order. Pure (unit-tested).
 */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

// Fields that churn every run without changing what a reader sees, so they are
// excluded from change-detection — otherwise EVERY active market would re-upsert
// (and re-fan-out) each run: updatedAt/checkedAt are wall-clock, and oddsHistory
// gets a fresh point appended even when the odds are flat.
const NOISY_KEYS = new Set(['updatedAt', 'checkedAt', 'oddsHistory']);

// Max ids per prune DELETE, so a large-churn run can't exceed PostgREST's URL
// length with one giant id=in.(…) filter (which would 400 and orphan the rows).
const PRUNE_CHUNK = 100;

/** A market reduced to its reader-visible signal (noisy timestamp/history fields
 * dropped), so an unmoved market compares equal run-to-run. Pure. */
export function signalOf(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) if (!NOISY_KEYS.has(k)) out[k] = o[k];
  return out;
}

/**
 * Only the rows whose market is new or whose READER-VISIBLE signal changed since
 * the last sync (odds/favored/volume/briefing/status…), so a flat market does NOT
 * re-upsert — this is what actually bounds Realtime fan-out (a market that merely
 * ticked its wall-clock updatedAt / appended an odds point is skipped). Pure.
 */
export function pickChanged(rows: FeedMarketRow[], existing: Map<string, unknown>): FeedMarketRow[] {
  return rows.filter(
    (r) => !existing.has(r.id) || canonical(signalOf(existing.get(r.id))) !== canonical(signalOf(r.data)),
  );
}

/**
 * Upsert the singleton meta row, tolerating a feed_meta that predates the `events`
 * column: on the first failure, retry once WITHOUT `events` so the breaking strip +
 * timestamp still sync (events ride the static feed.json until the additive
 * migration in modelb-schema.sql runs). Self-corrects to the full upsert the moment
 * the column exists, so this never needs a code change after the owner migrates.
 */
export async function upsertMeta(ctx: AdminCtx, meta: FeedMetaRow): Promise<void> {
  try {
    await restUpsert(ctx, 'feed_meta', [meta]);
  } catch (err) {
    const slim = { id: meta.id, generated_at: meta.generated_at, breaking: meta.breaking };
    try {
      await restUpsert(ctx, 'feed_meta', [slim]);
    } catch {
      throw err; // a slimmed upsert also failed → it's a real error, surface the original
    }
  }
}

/**
 * Mirror the published feed into Supabase: upsert only the markets that CHANGED
 * since the last sync (minimising Realtime fan-out), refresh the meta row, then
 * prune rows whose market departed. The caller guards on env and swallows
 * failures (the static feed.json already shipped, so a sync hiccup is non-fatal).
 */
export async function syncFeed(
  ctx: AdminCtx,
  feed: Feed,
): Promise<{ changed: number; total: number; pruned: number }> {
  const { markets, meta } = feedToRows(feed);
  const prior = await restSelect<{ id: string; data: unknown }>(ctx, 'feed_markets', 'select=id,data');
  const existing = new Map(prior.map((r) => [r.id, r.data]));
  const changed = pickChanged(markets, existing);
  await restUpsert(ctx, 'feed_markets', changed);
  await upsertMeta(ctx, meta);
  // Prune departed rows — but NEVER against an empty feed (floor guard), and only
  // the small departed set, so the DELETE URL scales with churn not feed size.
  let pruned = 0;
  if (markets.length > 0) {
    const gone = departedIds(existing.keys(), markets);
    // Delete in bounded chunks so a large departed set (e.g. after a feedSize change)
    // can't blow PostgREST's URL limit on one id=in.(…) — which would 400 and leave
    // orphan rows lingering in the Realtime mirror.
    for (let i = 0; i < gone.length; i += PRUNE_CHUNK) {
      const filter = inFilter(gone.slice(i, i + PRUNE_CHUNK));
      if (filter) await restDelete(ctx, 'feed_markets', filter);
    }
    pruned = gone.length;
  }
  return { changed: changed.length, total: markets.length, pruned };
}
