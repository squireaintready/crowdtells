import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BreakingItem, EventItem, Feed, Market, OddsPoint } from '../../src/lib/types';
import { hasBriefing } from '../../src/lib/feed';
import type { ShapedMarket } from './shaped';
import type { Config } from './config';

const DAY_MS = 86_400_000;

/** Read the persisted store; tolerant of a missing or legacy file. */
export function loadStore(path: string): Market[] {
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw) as Partial<Feed>;
    return Array.isArray(data.markets) ? data.markets : [];
  } catch {
    return [];
  }
}

/** Read the persisted cross-platform collision decisions (the LLM-tier cache),
 * keyed by sorted pair-id → same/not. Lives inside store.json so it persists with
 * the store (the pipeline only force-pushes store.json); never shipped to clients. */
export function loadCollisionDecisions(path: string): Record<string, boolean> {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<Feed>;
    return data.collisionDecisions ?? {};
  } catch {
    return {};
  }
}

/** Keep only the collision decisions whose BOTH markets are still in the kept set.
 * A market that has aged out of the (bounded) archive can never recur as a
 * candidate, so its cached decisions would otherwise accrete forever in the
 * every-30-min force-pushed store.json. Keys are `idA|idB` and market ids are
 * `|`-free (`kalshi:…` / numeric), so the split is exact. Pure → unit-tested.
 *
 * The story-grouping adjudicator (generate.ts) caches its verdicts under a
 * `story:<idA>|<idB>` key in the SAME store. We strip the `story:` prefix before
 * splitting so the verdict is pruned on its EMBEDDED market ids, not exempted: a
 * live-pair verdict survives (no Groq re-ask), but a pair whose markets have BOTH
 * aged out is dropped — keeping the store bounded like every other key. */
export function pruneCollisionDecisions(
  decisions: Record<string, boolean>,
  liveIds: Set<string>,
): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(decisions).filter(([k]) =>
      (k.startsWith('story:') ? k.slice(6) : k).split('|').every((id) => liveIds.has(id)),
    ),
  );
}

function skeleton(s: ShapedMarket, nowIso: string, config: Config): Market {
  // Seed from real backfilled history when we have it (so a brand-new market's
  // first chart shows a true trend), with the live point appended so the chart
  // ends exactly at the current odds; otherwise a single point that renders as a
  // flat baseline.
  const seed = s.seedHistory ?? [];
  const merged = seed.length
    ? [...seed, { t: nowIso, p: s.oddsPct }]
    : [{ t: nowIso, p: s.oddsPct }];
  return {
    ...liveFields(s),
    oddsHistory: config.historyMax > 0 ? merged.slice(-config.historyMax) : merged,
    oddsDaily: dailyFrom(merged, config.oddsDailyMax),
    status: 'active',
    hook: '',
    analysis: '',
    take: '',
    marketRead: '',
    crowdVsCoverage: '',
    synthesis: null,
    sources: [],
    grounded: false,
    generatedAt: null,
    updatedAt: nowIso,
    resolvedOutcome: null,
    calledCorrectly: null,
    resolvedAt: null,
  };
}

/** The source-provided fields that get refreshed every run. */
function liveFields(s: ShapedMarket) {
  return {
    id: s.id,
    source: s.source,
    title: s.title,
    marketUrl: s.marketUrl,
    image: s.image,
    category: s.category,
    description: s.description,
    favored: s.favored,
    oddsPct: s.oddsPct,
    alt: s.alt,
    divergence: s.divergence,
    peers: s.peers ?? [],
    movement24h: s.movement24h,
    movement7d: s.movement7d,
    volume: s.volume,
    volume24h: s.volume24h,
    liquidity: s.liquidity,
    openInterest: s.openInterest,
    comments: s.comments,
    score: s.score,
    startDate: s.startDate,
    endDate: s.endDate,
    // ── Story layer ── stamped pre-ranking; refreshed each run so a re-clustered
    // story (lead re-election, new sub-signals, format change) updates in place.
    // TODO(story-v2): key the living-record (oddsDaily/coverage) on storyId so a lead
    // re-election keeps the curve; v1 keeps it on the lead market id (the lead carries
    // the story), with storyId for stable identity + sub→lead redirect only.
    storyId: s.storyId,
    isStoryLead: s.isStoryLead,
    subSignals: s.subSignals,
    format: s.format,
    newsFootprint: s.newsFootprint,
    // lastLedAt is a PERSISTED stamp the generator sets AFTER selection on this run's
    // ShapedMarket; carrying s.lastLedAt (not prev's) lets liveFields win the
    // `...prev, ...liveFields(s)` spread so the fresh stamp is never clobbered.
    lastLedAt: s.lastLedAt,
  };
}

/** When a source gives no 24h delta, derive one from stored history (~24h ago). */
function movementFromHistory(history: OddsPoint[], current: number, nowMs: number): number | null {
  const target = nowMs - 24 * 3_600_000;
  let chosen: OddsPoint | null = null;
  for (const p of history) {
    const t = Date.parse(p.t);
    if (t <= target)
      chosen = p; // latest point at/just before 24h ago
    else break;
  }
  if (!chosen) return null;
  // Don't claim a "24h" delta from a point that's much older than 24h.
  if (Date.parse(chosen.t) < target - 12 * 3_600_000) return null;
  return Math.round((current - chosen.p) * 10) / 10;
}

/** Append an odds observation, de-duplicating rapid identical points. */
function appendHistory(
  prev: OddsPoint[],
  oddsPct: number,
  nowIso: string,
  max: number,
): OddsPoint[] {
  const last = prev[prev.length - 1];
  if (last) {
    const recent = Date.parse(nowIso) - Date.parse(last.t) < 10 * 60_000;
    const unchanged = Math.abs(last.p - oddsPct) < 0.1;
    if (recent && unchanged) return prev;
  }
  const next = [...prev, { t: nowIso, p: oddsPct }];
  return max > 0 ? next.slice(-max) : []; // slice(-0) would keep everything
}

/** UTC calendar day (YYYY-MM-DD) of an ISO timestamp. */
const utcDay = (iso: string): string => iso.slice(0, 10);

/** Append at most ONE crowd-belief point per UTC day (the first reading of each
 * day, then frozen), capped at `max`. Same-day re-runs return `prev` unchanged, so
 * the durable daily series stays referentially stable within a day — which keeps
 * the Realtime mirror from re-fanning it out every run (it changes ≤1×/day). */
function appendDaily(prev: OddsPoint[], oddsPct: number, nowIso: string, max: number): OddsPoint[] {
  const last = prev[prev.length - 1];
  if (last && utcDay(last.t) === utcDay(nowIso)) return prev; // today already captured
  const next = [...prev, { t: nowIso, p: oddsPct }];
  return max > 0 ? next.slice(-max) : next;
}

/** Collapse a high-res odds series to ≤1 point per UTC day (last reading wins) — used
 * to seed the durable daily series from a market's existing recent history on first
 * migration, so the long-arc chart isn't blank for already-tracked markets. Pure. */
function dailyFrom(history: OddsPoint[], max: number): OddsPoint[] {
  const byDay = new Map<string, OddsPoint>();
  for (const p of history) byDay.set(utcDay(p.t), p); // later same-day point wins
  const daily = [...byDay.values()];
  return max > 0 ? daily.slice(-max) : daily;
}

/** A market worth keeping as a permanent, indexable page after it leaves the
 * live feed: it has a real cross-source briefing (not an empty/fallback stub).
 * Shares the one indexing gate (hasBriefing) so the durable archive and the
 * search index can never disagree about what counts as a real story. */
function briefed(m: Market): boolean {
  return hasBriefing(m);
}

/**
 * Merge freshly-shaped top markets with prior state:
 * refresh live odds + history for current markets, retire recently-ended markets
 * to the "resolved" set for a retention window, and ARCHIVE every other briefed
 * market (keeping its /s/ page) rather than deleting it. Only un-briefed stubs
 * and over-age archives are dropped.
 *
 * This makes the published library append-only instead of a ~feedSize rotating
 * window that silently 404s every story it cycles out — and it means a transient
 * total upstream outage flips active stories to 'archived' (recoverable) instead
 * of wiping them (the data-loss path the floor guard in generate.ts also blocks).
 */
export function mergeMarkets(
  prior: Market[],
  shaped: ShapedMarket[],
  nowIso: string,
  config: Config,
): Market[] {
  const nowMs = Date.parse(nowIso);
  const priorById = new Map(prior.map((m) => [m.id, m]));
  const activeIds = new Set(shaped.map((s) => s.id));
  const result: Market[] = [];

  for (const s of shaped) {
    const prev = priorById.get(s.id);
    if (prev) {
      const oddsHistory = appendHistory(prev.oddsHistory, s.oddsPct, nowIso, config.historyMax);
      // Maintain the durable long-arc daily series alongside the high-res window —
      // seeding it from prior high-res history the first time (migration) so the
      // opinion timeline isn't blank for markets tracked before this field existed.
      const oddsDaily = appendDaily(
        prev.oddsDaily ?? dailyFrom(prev.oddsHistory, config.oddsDailyMax),
        s.oddsPct,
        nowIso,
        config.oddsDailyMax,
      );
      result.push({
        ...prev,
        ...liveFields(s),
        // Backfill 24h movement from history when the source gives none (Kalshi).
        movement24h: s.movement24h ?? movementFromHistory(oddsHistory, s.oddsPct, nowMs),
        status: 'active',
        oddsHistory,
        oddsDaily,
        updatedAt: nowIso,
      });
    } else {
      result.push(skeleton(s, nowIso, config));
    }
  }

  const archived: Market[] = [];
  for (const p of prior) {
    if (activeIds.has(p.id)) continue;
    const endMs = p.endDate ? Date.parse(p.endDate) : NaN;
    const ended = Number.isFinite(endMs) && endMs <= nowMs;
    if (ended && (nowMs - endMs) / DAY_MS <= config.resolvedRetainDays) {
      result.push({ ...p, status: 'resolved' }); // fresh enough for the live Past tab
    } else if (briefed(p)) {
      archived.push({ ...p, status: 'archived' }); // keep the page; drop from live feed
    }
    // else: an un-briefed stub that fell out → drop (no content to preserve)
  }

  // Bound the durable archive: keep the most recently briefed pages within the
  // retention window so store.json stays a sane size for the 30-min force-push.
  const cutoff = nowMs - config.archiveRetainDays * DAY_MS;
  const kept = archived
    .filter((m) => Date.parse(m.generatedAt as string) >= cutoff)
    .sort((a, b) => Date.parse(b.generatedAt as string) - Date.parse(a.generatedAt as string))
    .slice(0, config.archiveMax);

  return [...result, ...kept];
}

/** Order markets: active by newsworthiness, then resolved by end date, then
 * archived by when they were briefed (newest first). */
export function sortForFeed(markets: Market[]): Market[] {
  const rank = (m: Market) => (m.status === 'active' ? 0 : m.status === 'resolved' ? 1 : 2);
  const t = (s: string | null) => (s ? Date.parse(s) : 0);
  return [...markets].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.status === 'active') return b.score - a.score || (a.id < b.id ? -1 : 1);
    if (a.status === 'resolved') return t(b.endDate) - t(a.endDate);
    return t(b.generatedAt) - t(a.generatedAt); // archived: newest briefing first
  });
}

/**
 * Write the durable store and the published client feed.
 * - store.json (durable) holds the FULL append-only archive (active + resolved +
 *   archived) and is what the next run restores.
 * - feed.json (client) carries only what the SPA shows (active + recent
 *   resolved); archived stories live on solely as static /s/ pages for search,
 *   so the browser download never bloats with the growing archive.
 * Returns the FULL feed so syndication generates /s/ pages for archived stories too.
 */
export function writeOutputs(
  markets: Market[],
  generatedAt: string,
  config: Config,
  breaking: BreakingItem[] = [],
  collisionDecisions: Record<string, boolean> = {},
  events: EventItem[] = [],
): Feed {
  const ordered = sortForFeed(markets);
  // Prune the collision cache to pairs whose markets are still kept, so it can't
  // grow unbounded in the every-30-min force-pushed store.json (see helper above).
  const liveIds = new Set(ordered.map((m) => m.id));
  const full: Feed = {
    generatedAt,
    version: 1,
    markets: ordered,
    breaking,
    events,
    collisionDecisions: pruneCollisionDecisions(collisionDecisions, liveIds),
  };

  mkdirSync(dirname(config.storePath), { recursive: true });
  writeFileSync(config.storePath, JSON.stringify(full, null, 2));

  // The client feed drops internal-only fields (the briefing-context stamps used
  // server-side to gate revision snapshots, the lastLedAt rotation stamp the ranker
  // uses, and the server-only collision cache) so they never bloat the download.
  const clientMarkets = ordered
    .filter((m) => m.status !== 'archived')
    .map(
      ({
        briefedOddsPct: _o,
        briefedFavored: _f,
        firstBriefedOddsPct: _fo,
        firstBriefedFavored: _ff,
        lastLedAt: _ll,
        ...m
      }) => m,
    );
  const client: Feed = { ...full, markets: clientMarkets, collisionDecisions: undefined };
  mkdirSync(dirname(config.feedPath), { recursive: true });
  writeFileSync(config.feedPath, JSON.stringify(client, null, 2));

  return full;
}
