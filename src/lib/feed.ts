import type { Feed, Market, MarketStatus } from './types';
import type { EngagementStat } from './engagement';
import { localizeMarket } from './imageUrl';
import { canonicalCategory, isSportsFamily } from './categories';

/** Editorial sections — how the feed is organized, news-front-page style. */
export type Section =
  | 'top'
  | 'breaking'
  | 'movers'
  | 'trending'
  | 'wall'
  | 'latest'
  | 'past'
  | 'saved';

export const SECTIONS: { key: Section; label: string; hint: string }[] = [
  { key: 'top', label: 'Top', hint: 'The biggest, most-moving stories right now' },
  { key: 'breaking', label: 'Breaking', hint: 'Sudden surges of money and attention' },
  { key: 'movers', label: 'Movers', hint: 'Where the odds swung hardest in the last 24h' },
  { key: 'trending', label: 'Trending', hint: 'The most-traded stories overall' },
  { key: 'wall', label: 'The Wall', hint: 'Every live market, ranked by money' },
  { key: 'latest', label: 'Latest', hint: 'Freshly updated' },
  { key: 'past', label: 'Past', hint: 'Recently resolved' },
  { key: 'saved', label: 'Saved', hint: 'Stories you saved to read later' },
];

/** Label for the article "back to feed" link — reflects the section the reader came
 *  from (and returns to). "stories" is appended only where it reads naturally
 *  ("Top stories", "Latest stories"); "Movers"/"Trending" stand alone. The Record
 *  type makes a new Section a compile error here until its label is added. */
const SECTION_BACK_LABEL: Record<Section, string> = {
  top: 'Top stories',
  breaking: 'Breaking stories',
  movers: 'Movers',
  trending: 'Trending',
  wall: 'The Wall',
  latest: 'Latest stories',
  past: 'Past stories',
  saved: 'Saved stories',
};

export function sectionBackLabel(section: Section): string {
  return SECTION_BACK_LABEL[section];
}

/** Soft levers for the personalized Top order — tuned to keep variety. */
const TOPIC_BOOST = 1.6; // how hard a followed topic floats up
const DIVERSITY = 0.22; // MMR penalty per repeated category FAMILY in the visible order
// Sports/esports run constantly and would otherwise dominate Top by raw volume, so by
// DEFAULT a sports-family story is halved in the Top order — toned down, not hidden (a
// genuinely huge game can still surface). The demotion is LIFTED for a reader who
// follows that bucket: opting into Sports/Esports restores it (and also earns TOPIC_BOOST).
const SPORTS_DEMOTE = 0.5;
// Day-to-day churn for the top 10–20. m.score is volume-anchored and barely moves, so
// stable evergreens otherwise sit at the top indefinitely. This gently decays a story by
// how long since it was last briefed (generatedAt updates whenever the pipeline re-briefs
// on a real odds shift), so freshly-active stories interleave with the evergreens and the
// lead rotates as different stories get re-briefed. Mild + floored — never buries a major
// story, just reshuffles comparable ones. Pairs with the server openFreshness (startDate).
const STALE_FLOOR = 0.65; // most a stale story is dampened (−35%)
const STALE_HALFLIFE_DAYS = 5; // briefing age at which the decay is half-spent

/** Multiplier in [STALE_FLOOR, 1] from a story's briefing age — 1 when freshly briefed,
 * decaying toward the floor with a 5-day half-life. Unbriefed/futureor-dated → neutral 1. */
function stalenessFactor(generatedAt: string | null, nowMs: number): number {
  if (!generatedAt) return 1;
  const ageDays = (nowMs - Date.parse(generatedAt)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return STALE_FLOOR + (1 - STALE_FLOOR) * Math.pow(0.5, ageDays / STALE_HALFLIFE_DAYS);
}
// A near-duplicate of an already-picked story (same event phrased differently, e.g.
// three "Elon tweet count" markets across different categories) is pushed down hard —
// a penalty, not a hard drop, so a genuinely huge story isn't suppressed by a thin twin.
const EVENT_SIM = 0.45; // headline-token Jaccard at/above which two stories are "the same thing"
const EVENT_PENALTY = 0.55;

// NOTE: release-recency now lives in the pipeline score (scripts/lib/ranking.ts,
// openFreshness — gated to non-sports), so m.score already carries the freshness tilt
// and rankTop just reads it. Keeping recency in ONE place avoids double-counting it
// on the client display order.

// Live engagement velocity — how much our OWN readers liking/commenting on a story
// in the last day lifts it in Top. A surge of genuine reader attention is exactly
// what "the biggest stories right now" should reflect, so this floats a story the
// crowd is reacting to. Brigade-resistant: it keys on DISTINCT users (not raw
// actions), and the ramp is ANCHORED AT THE FLOOR — a small ring of throwaway
// accounts (magic-link signup is ~free) earns ≈0%, and the boost only becomes
// material once a real crowd of TENS of distinct users shows up. Log-damped + capped,
// so it reshuffles comparable stories but never vaults a trivial one over a major
// event. No-ops entirely when no engagement data is present.
const ENG_MAX_BOOST = 0.45; // up to +45% at saturation
const ENG_MIN_USERS = 10; // ramp origin: <10 distinct users earns NOTHING ("a lot", not a few)
const ENG_SATURATION = 200; // distinct users where the boost maxes out

/** Multiplier in [1, 1+ENG_MAX_BOOST] from a story's recent distinct-user engagement.
 * The ramp is normalized between ENG_MIN_USERS and ENG_SATURATION (not from 1), so the
 * cheap low end — where a sockpuppet brigade lives — yields almost nothing. */
export function engagementBoost(stat: EngagementStat | undefined): number {
  if (!stat || stat.users < ENG_MIN_USERS) return 1;
  const lo = Math.log10(ENG_MIN_USERS);
  const ramp = Math.min(
    Math.max((Math.log10(stat.users) - lo) / (Math.log10(ENG_SATURATION) - lo), 0),
    1,
  );
  return 1 + ENG_MAX_BOOST * ramp;
}

/**
 * Normalize a raw market for the client, IDENTICALLY on every ingestion path (the
 * static loadFeed AND the Model-B realtime feed) so the two can never diverge:
 * repair legacy flagcdn URLs to self-hosted /flags, and collapse the raw source tag
 * to the canonical category taxonomy. Pure + idempotent (safe to re-apply).
 */
export function hydrateMarket(m: Market): Market {
  return { ...localizeMarket(m), category: canonicalCategory(m.category) };
}

/** Fetch and validate the published feed. Resolves relative to the app base path. */
export async function loadFeed(signal?: AbortSignal): Promise<Feed> {
  const url = `${import.meta.env.BASE_URL}feed.json?ts=${Math.floor(Date.now() / 60000)}`;
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load feed (${res.status})`);
  const data = (await res.json()) as Feed;
  if (!data || !Array.isArray(data.markets)) throw new Error('Malformed feed');
  // Normalize every market for client display (see hydrateMarket). Pure + idempotent.
  data.markets = data.markets.map(hydrateMarket);
  return data;
}

const DEDUP_STOP = new Set([
  'the',
  'a',
  'an',
  'will',
  'of',
  'to',
  'in',
  'on',
  'for',
  'and',
  'by',
  'is',
  'are',
  'it',
  'at',
  'vs',
  'with',
  'as',
  'this',
  'that',
  'over',
  'after',
  'before',
]);

function eventTokens(m: Market): Set<string> {
  return new Set(
    (m.hook || m.title)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !DEDUP_STOP.has(w)),
  );
}

function eventJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Drop near-duplicate stories (the same event phrased two ways) so a compact list
 * like Catch-me-up spans distinct stories rather than repeating one. The pipeline
 * already collapses sibling markets into one story; this is a client-side safety net
 * for any residual near-twins. Input should be in priority order — the first of each
 * near-duplicate cluster (by headline token overlap) is kept.
 */
export function dedupeByEvent(markets: Market[], limit: number): Market[] {
  const kept: Market[] = [];
  const seen: Set<string>[] = [];
  for (const m of markets) {
    const t = eventTokens(m);
    if (seen.some((s) => eventJaccard(s, t) >= 0.6)) continue;
    kept.push(m);
    seen.push(t);
    if (kept.length >= limit) break;
  }
  return kept;
}

/**
 * Distinct categories present in a set of markets, sorted by frequency. `minCount`
 * (default 1 = all) drops thin categories: the filter rail and topic picker pass 2,
 * mirroring the /topic HUB_MIN=2 convention, so a one-off tag the canonical map
 * hasn't learned yet never clutters the chips — while a genuinely new beat that's
 * earned 2+ markets still surfaces (and flags itself for the map). Categories are
 * already canonicalized upstream (hydrateMarket), so these are the ~12 clean buckets.
 */
export function categoriesOf(markets: Market[], minCount = 1): string[] {
  const counts = new Map<string, number>();
  for (const m of markets) {
    if (!m.category) continue;
    counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}

/**
 * Whether a market carries a real, model-written cross-source briefing — the
 * single gate for an indexable /s/ page, a permanent archive entry, and any
 * homepage/hub surfacing. `synthesis` is set ONLY on a genuine Groq success;
 * fallback (no key) and dry-run records both null it, so this cleanly excludes
 * thin/placeholder stubs from the indexed corpus and the durable archive.
 */
export function hasBriefing(m: Market): boolean {
  return m.generatedAt != null && m.synthesis != null;
}

function matchesQuery(m: Market, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    m.title.toLowerCase().includes(needle) ||
    m.hook.toLowerCase().includes(needle) ||
    m.analysis.toLowerCase().includes(needle) ||
    m.category.toLowerCase().includes(needle)
  );
}

const sectionStatus = (s: Section): MarketStatus => (s === 'past' ? 'resolved' : 'active');
const byId = (a: Market, b: Market): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Breaking = sudden surge weighted by the absolute money behind it, so a tiny
 * fully-churned market can't top a giant that moved millions today. */
function breakingScore(m: Market): number {
  const share = m.volume > 0 ? Math.min(m.volume24h / m.volume, 1) : 0;
  return share * Math.log10(m.volume24h + 1);
}

const absMove = (m: Market): number => Math.abs(m.movement24h ?? 0);

function compareForSection(a: Market, b: Market, section: Section): number {
  switch (section) {
    case 'breaking':
      return breakingScore(b) - breakingScore(a) || byId(a, b);
    case 'movers':
      return absMove(b) - absMove(a) || b.volume24h - a.volume24h || byId(a, b);
    case 'latest': {
      // Real release recency: every market shares one pipeline-run updatedAt, so that
      // field carries no per-story signal — sort by startDate (when the bet opened),
      // newest first, so "Latest" actually surfaces the freshest bets.
      const ta = a.startDate ? Date.parse(a.startDate) : 0;
      const tb = b.startDate ? Date.parse(b.startDate) : 0;
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0) || byId(a, b);
    }
    case 'past':
      return (
        (b.endDate ? Date.parse(b.endDate) : 0) - (a.endDate ? Date.parse(a.endDate) : 0) ||
        byId(a, b)
      );
    case 'trending':
    case 'wall': // the league table — every live market, ranked by money
    default:
      return b.volume - a.volume || byId(a, b);
  }
}

/**
 * The default "Top" / "For You" order: the persisted newsScore, multiplied by a
 * boost for followed topics AND a live engagement-velocity boost (our readers
 * reacting now), then lightly diversified (MMR) so no single category clumps at the
 * top. With no topics and no engagement data it's a pure top-stories view.
 */
function rankTop(
  markets: Market[],
  topics: Set<string>,
  engagement?: Map<string, EngagementStat>,
): Market[] {
  // Precompute headline tokens once (not per MMR iteration) for the near-duplicate
  // penalty. Score blends the baked newsScore (which already carries the recency tilt)
  // with followed-topic + live-engagement boosts, a default sports demotion (lifted when
  // the bucket is followed), and a briefing-age decay so the top churns day-to-day.
  const nowMs = Date.now();
  const scored = markets.map((m) => {
    const family = canonicalCategory(m.category);
    const followed = topics.size > 0 && topics.has(family);
    return {
      m,
      family,
      tokens: eventTokens(m),
      s:
        m.score *
        (followed ? TOPIC_BOOST : 1) *
        (isSportsFamily(m.category) && !followed ? SPORTS_DEMOTE : 1) *
        stalenessFactor(m.generatedAt, nowMs) *
        engagementBoost(engagement?.get(m.id)),
    };
  });
  const maxS = Math.max(1, ...scored.map((x) => x.s));
  const pool = scored.sort((a, b) => b.s - a.s || byId(a.m, b.m));

  const out: Market[] = [];
  const perFamily = new Map<string, number>();
  const pickedTokens: Set<string>[] = [];
  while (pool.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const x = pool[i]!;
      // Repeated-family penalty (collapses sports / scattered beats) + a near-duplicate
      // penalty when this headline closely overlaps something already placed.
      let maxJ = 0;
      for (const t of pickedTokens) {
        const j = eventJaccard(x.tokens, t);
        if (j > maxJ) maxJ = j;
      }
      const val =
        x.s / maxS -
        (perFamily.get(x.family) ?? 0) * DIVERSITY -
        (maxJ >= EVENT_SIM ? EVENT_PENALTY : 0);
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    const [picked] = pool.splice(bestIdx, 1);
    out.push(picked!.m);
    perFamily.set(picked!.family, (perFamily.get(picked!.family) ?? 0) + 1);
    pickedTokens.push(picked!.tokens);
  }
  return out;
}

export interface FeedView {
  section: Section;
  query: string;
  category: string | null;
  /** Followed-interest categories; personalizes the Top order when present. */
  topics?: string[];
  /** Live per-story engagement (distinct-user likes/comments); floats stories the
   * crowd is reacting to up the Top order. Absent → ranking uses the baked score. */
  engagement?: Map<string, EngagementStat>;
}

/** Apply section/search/category to produce the visible story list. */
export function selectStories(markets: Market[], view: FeedView): Market[] {
  const status = sectionStatus(view.section);
  const filtered = markets
    .filter((m) => m.status === status)
    .filter((m) => (view.category ? m.category === view.category : true))
    .filter((m) => matchesQuery(m, view.query));

  // Movers only lists markets whose odds actually swung.
  const list = view.section === 'movers' ? filtered.filter((m) => absMove(m) >= 1) : filtered;
  if (view.section === 'top') return rankTop(list, new Set(view.topics ?? []), view.engagement);
  const sorted = list.sort((a, b) => compareForSection(a, b, view.section));
  // Movers/Breaking sort on raw movement axes, so a high-move digest (the exact
  // prop-odds-swing the DIGEST_DAMP score penalty exists to suppress) could otherwise top
  // those sections. Stable-partition digests to the end so a real briefed story always
  // leads them. (Money views — Wall/Trending — rank purely by volume and are left as-is.)
  if (view.section === 'movers' || view.section === 'breaking') {
    return [
      ...sorted.filter((m) => m.format !== 'digest'),
      ...sorted.filter((m) => m.format === 'digest'),
    ];
  }
  return sorted;
}

export function countByStatus(markets: Market[], status: MarketStatus): number {
  return markets.reduce((n, m) => (m.status === status ? n + 1 : n), 0);
}

export interface Scoreboard {
  /** Resolved markets whose favored side matched the actual outcome. */
  correct: number;
  /** Resolved markets with a captured outcome (the denominator). */
  total: number;
  /** Hit rate, 0–100. */
  pct: number;
}

/** Track record of the crowd: across resolved markets we recorded an outcome
 * for, how often did the favored side win? */
export function scoreboard(markets: Market[]): Scoreboard {
  const judged = markets.filter((m) => m.status === 'resolved' && m.calledCorrectly != null);
  const total = judged.length;
  const correct = judged.reduce((n, m) => (m.calledCorrectly ? n + 1 : n), 0);
  return { correct, total, pct: total > 0 ? Math.round((correct / total) * 100) : 0 };
}
