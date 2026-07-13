/**
 * Crowdtells — data pipeline.
 *
 * Polymarket + Kalshi (top markets) → newsworthiness ranking → Google News
 * (real headlines per market) → Groq (cross-source briefing) → feed.json.
 * Persists state so odds refresh, movement is tracked, and briefings are
 * generated once and reused.
 *
 * Runs in CI on a schedule; safe to run locally with `--dry-run` (no AI/key).
 */
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';
import { config, llmConfigured } from './lib/config';
import { sleep, resetFetchErrors, getFetchErrors } from './lib/http';
import { fetchTopMarkets as fetchPolymarket, isJunkTag } from './lib/polymarket';
import { fetchTopMarkets as fetchKalshi } from './lib/kalshi';
import type { ShapedMarket } from './lib/shaped';
import { canonicalToken, quantKey, quantMatch, thresholdYesProb } from './lib/canonical';
import { isSportsCategory } from './lib/category';
import { fetchHeadlines, type Headline } from './lib/news';
import {
  summarize,
  summarizeResult,
  adjudicateSame,
  adjudicateStory,
  resetLlmStats,
  getLlmStats,
  type Briefing,
} from './lib/groq';
import { recordPipelineRun } from './lib/ops';
import { resolveEntityImages } from './lib/images';
import { rankAndSelect } from './lib/ranking';
import { backfillSeeds } from './lib/history';
import {
  clusterArticles,
  consolidateClusters,
  dedupePool,
  fetchBreaking,
  fetchRssPool,
  filterRecent,
  pinToMarkets,
  salientTokens,
  type NormArticle,
} from './lib/breaking';
import {
  assignFormat,
  clusterMarkets,
  collapseProps,
  composeSubSignals,
  distinctive,
  propShape,
  type StoryGroup,
} from './lib/stories';
import { fetchEvents } from './lib/events';
import { makeSnippetResolver, snippetPoolFromArticles, type SnippetResolver } from './lib/snippets';
import { loadStore, loadCollisionDecisions, mergeMarkets, writeOutputs } from './lib/store';
import { writeSyndication, indexable } from './lib/syndication';
import { writeOgImages } from './lib/ogImage';
import { captureResolutions } from './lib/resolution';
import { scoreResolvedMarkets } from './lib/scoring';
import { bridgeNotes } from './lib/bridging';
import { hydrateBriefing } from '../src/lib/hydrate';
import { canonicalCategory } from '../src/lib/categories';
import { isDecided } from '../src/lib/signals';
import type { BreakingItem, BriefingRevision, EventItem, Market, Source } from '../src/lib/types';

// Regeneration is CHANGE-DRIVEN, not on a fixed clock: a briefing is rewritten
// only when the story actually moves — (1) the odds swung this many points since
// it was written, or (2) new coverage appeared, or (3) it sat untouched past the
// long idle backstop. This keeps the (free-tier) Groq rewrites — the expensive
// step — proportional to real news rather than wall-clock.
const SWING_PTS = Number(process.env.SWING_PTS ?? 8);
// Idle safety net: a story with NO swing and NO new coverage still gets one
// refresh after this long, so nothing silently rots (7 days).
const IDLE_BACKSTOP_HOURS = Number(process.env.IDLE_BACKSTOP_HOURS ?? 168);
// How often a calm story is re-checked for NEW coverage (one cheap RSS fetch).
// Spread across runs + capped, so the whole feed costs a few fetches per run.
const NEWS_RECHECK_HOURS = Number(process.env.NEWS_RECHECK_HOURS ?? 12);
const NEWS_CHECK_LIMIT = Number(process.env.NEWS_CHECK_LIMIT ?? 24);
// New coverage = at least this many freshly fetched headlines weren't cited last
// time; requiring two (not one) absorbs Google News result jitter.
const NEWS_NEW_MIN = Number(process.env.NEWS_NEW_MIN ?? 2);
/** Cap on the durable coverage union (the opinion timeline's "when news landed"
 * ticks). Most stories stay well under; a long-running story keeps its most recent. */
const COVERAGE_MAX = Number(process.env.COVERAGE_MAX ?? 40);
/** Window (minutes) for the news-footprint coverage clusters — the same 6h "developing"
 * horizon the Developing strip uses (breaking.ts BREAKING_WINDOW_MIN). The raw RSS pool
 * spans many hours; clustering it un-windowed snowballs into one mega-cluster (token
 * union on merge chains unrelated headlines) whose dozens of outlets then get attributed
 * to nearly every market. Scoping to recent articles before clustering keeps footprint a
 * discriminating "who is the press covering RIGHT NOW" signal. */
const FOOTPRINT_WINDOW_MIN = Number(process.env.FOOTPRINT_WINDOW_MIN ?? 360);
// A rewrite is preserved as a saved "revision" only when the odds moved at least
// this far since the current briefing was written (or the favored side flipped),
// so the history captures genuine narrative shifts, not routine refreshes.
const REVISION_MIN_SHIFT = Number(process.env.REVISION_MIN_SHIFT ?? 8);
const REVISION_MAX = 4;
// Once a market settles we write ONE final past-tense result article. Bound the
// work: at most this many per run (oldest-settled first, so a backlog drains),
// and only while the result is still fresh enough to have real coverage.
const RESULT_LIMIT = Number(process.env.RESULT_LIMIT ?? 6);
const RESULT_WINDOW_DAYS = Number(process.env.RESULT_WINDOW_DAYS ?? 7);
const DAY_MS = 86_400_000;

/** Normalize a title for dedup: drop Polymarket sub-event suffixes (so the
 * "France vs. Senegal", "… - More Markets", and "… - Exact Score" variants of
 * one event collapse to a single story), then strip stopwords + punctuation. */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s[-–]\s(more markets|exact score|winner|top scorer|odds|[a-z ]*markets)$/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(will|the|a|an|by|in|on|to|of|for|next)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const isBinary = (favored: string) =>
  favored.toLowerCase() === 'yes' || favored.toLowerCase() === 'no';
const yesProb = (favored: string, oddsPct: number) =>
  favored.toLowerCase() === 'yes' ? oddsPct : 100 - oddsPct;

/**
 * Cross-market gap in points for the same question on two platforms. Binary
 * Yes/No → compare the Yes probability. Otherwise compute it ONLY when both
 * platforms name the SAME favored outcome (a strict gate, so we never compare
 * non-comparable outcomes and manufacture a phantom disagreement). null when
 * the two aren't comparable.
 */
export function crossMarketGap(
  favoredA: string,
  oddsA: number,
  favoredB: string,
  oddsB: number,
): number | null {
  if (isBinary(favoredA) && isBinary(favoredB)) {
    return round1(Math.abs(yesProb(favoredA, oddsA) - yesProb(favoredB, oddsB)));
  }
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  if (norm(favoredA) !== '' && norm(favoredA) === norm(favoredB)) {
    return round1(Math.abs(oddsA - oddsB));
  }
  return null;
}

// Generic question scaffolding — words that two unrelated questions can share
// ("who", "prime minister", "election") and so must NOT count as the distinctive
// entity that proves two markets are the same question.
const QUESTION_WORDS = new Set(
  (
    'who whom whose what when which would win wins won winner after before become becomes ' +
    'first leader chair head deal agreement price above below over under score game match ' +
    'round playoff election presidential president prime minister governor senator nominee ' +
    'party seat race decision rate rates cut sign signs'
  ).split(' '),
);

/** Distinctive content tokens of a title (after dedup-normalization), each
 * mapped to its canonical alias so cross-platform phrasing collapses (bitcoin↔btc,
 * fed↔fomc, jun↔june) before overlap is measured. */
function contentTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((w) => w.length >= 3)
      .map(canonicalToken),
  );
}

// Generic outcome labels that name no specific entity — they must never become
// the shared "distinctive" token that proves two markets are the same question.
const GENERIC_FAVORED = new Set(['yes', 'no', 'tie', 'draw', 'other', 'none', 'neither', 'field']);

/** Distinctive tokens from a market's favored outcome (a team/candidate name), so
 * a name that lives in `favored` on one platform and the `title` on the other can
 * still help prove a match. Generic outcomes (Yes/No/Tie/…) contribute nothing. */
function favoredTokens(favored: string | undefined): string[] {
  if (!favored) return [];
  const f = favored.toLowerCase().trim();
  if (GENERIC_FAVORED.has(f)) return [];
  return f
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .map(canonicalToken);
}

/** Same threshold/price question across platforms, matched on a precise
 * canonical key (entity + threshold + direction + resolution month) — catches
 * "BTC above $150k by 2026" pairs that share almost no surface tokens. */
function quantSame(a: ShapedMarket, b: ShapedMarket): boolean {
  if (a.source === b.source) return false;
  const ka = quantKey(a.title, a.endDate);
  const kb = quantKey(b.title, b.endDate);
  return ka !== null && kb !== null && quantMatch(ka, kb);
}

/** HARD GUARD: a sports matchup is never the same question as a non-sports market
 * — bounds the looser favored-token matching against a cross-category false twin.
 * Uses the coarse sports family (isSportsCategory), so a "Soccer"/"Tennis"/"MLB" market
 * is correctly treated as sports, not just a literal "Sports" tag. */
function categoryCompatible(a: ShapedMarket, b: ShapedMarket): boolean {
  return !(
    a.category &&
    b.category &&
    isSportsCategory(a.category) !== isSportsCategory(b.category)
  );
}

/** HARD GUARD: both resolve within ~2 weeks of each other (or one is undated). */
function withinWindow(a: ShapedMarket, b: ShapedMarket): boolean {
  if (!a.endDate || !b.endDate) return true;
  const days = Math.abs(Date.parse(a.endDate) - Date.parse(b.endDate)) / 86_400_000;
  return !Number.isFinite(days) || days <= 14;
}

/** A market's combined title+favored token set (the matchable signal). */
function questionTokens(m: ShapedMarket): Set<string> {
  return new Set([...contentTokens(m.title), ...favoredTokens(m.favored)]);
}

/** Token Jaccard between two markets' question tokens (0 when either is empty). */
function tokenJaccard(ta: Set<string>, tb: Set<string>): number {
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** A token specific enough to help prove two markets are the same question: long
 * enough to be a name, not a bare year, not generic question scaffolding. */
function isDistinctiveToken(w: string): boolean {
  return w.length >= 4 && !/^\d{4}$/.test(w) && !QUESTION_WORDS.has(w);
}

// Coarse sport from a market's tags + title. By shape time the CATEGORY is already
// canonicalized to "Sports" (so it can't tell basketball from baseball), but
// Polymarket keeps its fine tags ("NBA") and titles often carry a league or a
// championship name. Each token is unambiguous on purpose — an undeterminable sport
// returns null, and callers only ever BLOCK on two KNOWN, DIFFERING sports (so a
// wrong guess can never manufacture a merge, only — harmlessly — keep two apart).
const SPORT_TOKENS: [RegExp, string][] = [
  [/\b(nba|wnba|ncaab|basketball)\b/, 'basketball'],
  [/\b(mlb|baseball|world series)\b/, 'baseball'],
  [/\b(nfl|ncaaf|super bowl|college football)\b/, 'gridiron'],
  [/\b(nhl|hockey|stanley cup)\b/, 'hockey'],
  [/\b(soccer|mls|epl|uefa|fifa|la liga|bundesliga|serie a|ligue 1|premier league|champions league|europa league|world cup)\b/, 'soccer'],
  [/\b(atp|wta|tennis|wimbledon|roland garros|australian open)\b/, 'tennis'],
  [/\b(pga|golf|masters|ryder cup)\b/, 'golf'],
  [/\b(ufc|mma|boxing|wwe|wrestling)\b/, 'combat'],
  [/\b(nascar|formula 1|formula one|grand prix|motogp|indycar)\b/, 'motorsport'],
  [/\b(cricket|ipl)\b/, 'cricket'],
  [/\b(rugby)\b/, 'rugby'],
];
function sportKey(m: ShapedMarket): string | null {
  const hay = `${(m.tags ?? []).join(' ')} ${m.title}`.toLowerCase();
  for (const [re, sport] of SPORT_TOKENS) if (re.test(hay)) return sport;
  return null;
}

// City / region / state tokens that name a LOCALE shared by multiple franchises —
// they must never be the SOLE distinctive token that fuses two sports markets
// ("Miami Heat" [NBA] vs "Miami Marlins" [MLB] share only "miami"). Sports branch
// ONLY: in Geopolitics a country/city legitimately IS the distinctive entity ("next
// president of Brazil"), so this list is never consulted off the sports path. Tokens
// are post-canonicalToken, lowercase, len>=4. Partial coverage is safe — a miss just
// falls back to the prior behavior, never a wrong merge.
const PLACE_TOKENS = new Set([
  // US metros with 2+ franchises (the real collision risk), incl. multiword sub-tokens
  'miami', 'york', 'angeles', 'francisco', 'diego', 'antonio', 'orleans', 'jose',
  'vegas', 'kansas', 'boston', 'chicago', 'dallas', 'houston', 'phoenix', 'denver',
  'detroit', 'cleveland', 'atlanta', 'washington', 'toronto', 'seattle', 'portland',
  'milwaukee', 'indianapolis', 'charlotte', 'orlando', 'tampa', 'pittsburgh',
  'cincinnati', 'baltimore', 'buffalo', 'nashville', 'memphis', 'sacramento',
  'brooklyn', 'philadelphia', 'oakland', 'minneapolis', 'montreal', 'vancouver',
  // US states / regions used as team names
  'texas', 'arizona', 'colorado', 'utah', 'indiana', 'tennessee', 'carolina',
  'florida', 'georgia', 'michigan', 'jersey', 'england', 'dakota', 'golden',
  // Major international football cities (Manchester United vs Manchester City, etc.)
  'london', 'manchester', 'madrid', 'barcelona', 'munich', 'liverpool', 'paris',
  'milan', 'naples', 'turin', 'lisbon', 'dortmund', 'sevilla', 'valencia',
]);

/**
 * Two SPORTS markets that name different sports, or that overlap ONLY on a shared
 * locale (a city/region) rather than a team/competitor, are NOT the same question —
 * the guard that keeps "Miami Heat" and "Miami Marlins" two separate stories. Returns
 * false for any non-sports pair (so it never touches Politics/Geopolitics/etc.).
 */
function sportsConflict(a: ShapedMarket, b: ShapedMarket): boolean {
  if (!isSportsCategory(a.category) || !isSportsCategory(b.category)) return false;
  const sa = sportKey(a);
  const sb = sportKey(b);
  if (sa && sb && sa !== sb) return true; // basketball vs baseball, hockey vs soccer…
  const tb = questionTokens(b);
  let sharedDistinctive = false;
  let sharedNonPlace = false;
  for (const w of questionTokens(a)) {
    if (tb.has(w) && isDistinctiveToken(w)) {
      sharedDistinctive = true;
      if (!PLACE_TOKENS.has(w)) sharedNonPlace = true;
    }
  }
  // They share an entity, but every shared entity is just a locale → different teams.
  return sharedDistinctive && !sharedNonPlace;
}

/**
 * Are two markets the SAME question across platforms when the exact-title group
 * missed them because each platform phrases it differently? Strict on purpose:
 * high token overlap AND a shared DISTINCTIVE token (a specific entity, not a
 * generic question word) AND a matching resolution window — so "next PM of
 * Israel" can never match "next PM of Romania".
 */
export function sameQuestion(a: ShapedMarket, b: ShapedMarket): boolean {
  if (a.source === b.source) return false;
  if (!categoryCompatible(a, b)) return false;
  // Two different sports, or two sports sharing only a city, are never one question
  // (a shared "miami" must not fuse the Heat and the Marlins). Non-sports pairs pass.
  if (sportsConflict(a, b)) return false;
  // Fold the favored outcome into each side's token set (see favoredTokens), so a
  // team/candidate named only in `favored` on one platform still counts.
  const ta = questionTokens(a);
  const tb = questionTokens(b);
  if (tokenJaccard(ta, tb) < 0.45) return false;
  let sharedDistinctive = false;
  // A shared bare year (e.g. "2028") is NOT distinctive — "Republican nominee 2028"
  // and "Democratic nominee 2028" are different questions (see isDistinctiveToken).
  for (const w of ta) if (tb.has(w) && isDistinctiveToken(w)) sharedDistinctive = true;
  if (!sharedDistinctive) return false;
  return withinWindow(a, b);
}

// PURE-refinement tokens only: words that restate the SAME question without narrowing
// the outcome or the resolution period. We deliberately EXCLUDE temporal narrowers
// (weekdays, months, "deadline"/"soon"/"today"/"date"): "Lakers win series" vs "…on
// Saturday" and "Bitcoin record high" vs "…in June" look like containments but resolve
// DIFFERENTLY, so merging them would silently drop a distinct question from the feed.
// (True same-event story grouping across different resolutions is a separate, harder
// problem — handled, where safe, by the cross-platform same-question matcher, not here.)
const QUALIFIER_TOKENS = new Set(['official', 'officially']);

/**
 * Same real-world question at finer granularity within ONE platform: one title's
 * content tokens strictly CONTAIN the other's, and every extra token is only a PURE
 * refinement ("official"/"officially") that doesn't change WHAT or WHEN it resolves —
 * never a new entity ("Trump wins" vs "Trump wins Iowa") and never a period/timing
 * narrower ("… on Friday", "… in June") that would make it a different bet.
 * Same-platform only — cross-platform twins go through sameQuestion/quantSame, which
 * also attach the divergence gap. Guarded by the same category + resolution window.
 */
export function sameEventContainment(a: ShapedMarket, b: ShapedMarket): boolean {
  if (a.source !== b.source) return false;
  if (!categoryCompatible(a, b) || !withinWindow(a, b)) return false;
  const ta = contentTokens(a.title);
  const tb = contentTokens(b.title);
  if (ta.size === 0 || tb.size === 0 || ta.size === tb.size) return false; // identical → exact-group
  const [small, large] = ta.size < tb.size ? [ta, tb] : [tb, ta];
  for (const w of small) if (!large.has(w)) return false; // not a containment
  for (const w of large) {
    if (small.has(w)) continue;
    if (!QUALIFIER_TOKENS.has(w)) return false; // an extra real entity → a different facet
  }
  return true; // strict superset whose extra tokens are all qualifiers
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Cross-platform pairs the deterministic matcher left UNMATCHED but that are
 * CLOSE — token Jaccard in [0.25, 0.45), compatible category, same window — the
 * borderline zone where an LLM adjudicator can safely add recall. Most-similar
 * first, capped. Pure (no LLM). Exported for tests.
 */
export function borderlinePairs(
  candidates: ShapedMarket[],
  max: number,
): [ShapedMarket, ShapedMarket][] {
  const open = candidates.filter((c) => !c.alt); // only ones the deterministic pass left alone
  const scored: { a: ShapedMarket; b: ShapedMarket; j: number }[] = [];
  for (let i = 0; i < open.length; i++) {
    for (let k = i + 1; k < open.length; k++) {
      const a = open[i]!;
      const b = open[k]!;
      if (a.source === b.source || !categoryCompatible(a, b) || !withinWindow(a, b)) continue;
      if (sportsConflict(a, b)) continue; // don't even ask the LLM about a cross-sport twin
      const j = tokenJaccard(questionTokens(a), questionTokens(b));
      if (j >= 0.25 && j < 0.45) scored.push({ a, b, j });
    }
  }
  return scored
    .sort((x, y) => y.j - x.j)
    .slice(0, max)
    .map((p) => [p.a, p.b]);
}

// A story is corroborated by at most this many sibling markets (the rest just drop
// from the feed). Keeps the cluster — and feed.json — bounded.
const PEERS_MAX = 4;

/** The slim reading recorded for a sibling market — satisfied by ShapedMarket, an
 * already-attached alt, and a peer alike. */
type PeerReading = Pick<ShapedMarket, 'source' | 'favored' | 'oddsPct' | 'volume' | 'marketUrl'>;

/** Record `other` as a sibling market corroborating the SAME event on `primary` —
 * a data point for the briefing and a "tracked across N markets" trust signal. The
 * single best cross-platform twin still also lives on `primary.alt` (with the gap).
 * De-duped by market URL and capped. */
function addPeer(primary: ShapedMarket, other: PeerReading): void {
  if (other.marketUrl && other.marketUrl === primary.marketUrl) return;
  const peers = (primary.peers ??= []);
  if (peers.length >= PEERS_MAX || peers.some((p) => p.marketUrl === other.marketUrl)) return;
  peers.push({
    source: other.source,
    favored: other.favored,
    oddsPct: other.oddsPct,
    volume: other.volume,
    marketUrl: other.marketUrl,
  });
}

/** Attach `other` as the cross-platform alt + compute the divergence gap. */
function attachAlt(primary: ShapedMarket, other: ShapedMarket): void {
  primary.alt = {
    source: other.source,
    favored: other.favored,
    oddsPct: other.oddsPct,
    volume: other.volume,
    marketUrl: other.marketUrl,
  };
  // For a matched threshold question, compare P(threshold met) on each platform
  // (handles "Yes/No" vs "$150k or above" framings); otherwise the binary /
  // same-outcome gap.
  const ka = quantKey(primary.title, primary.endDate);
  const kb = quantKey(other.title, other.endDate);
  if (ka && kb && quantMatch(ka, kb)) {
    primary.divergence = round1(
      Math.abs(
        thresholdYesProb(primary.favored, primary.oddsPct, ka) -
          thresholdYesProb(other.favored, other.oddsPct, kb),
      ),
    );
  } else {
    primary.divergence = crossMarketGap(
      primary.favored,
      primary.oddsPct,
      other.favored,
      other.oddsPct,
    );
  }
}

/**
 * Combine sources, keeping ONE story per question but attaching the same question
 * on the other platform as `alt` + the cross-market `divergence` (the arb/gap).
 * The primary is the one already in the store (stable ids) or the higher-volume one.
 * A second pass merges cross-platform pairs the exact-title grouping missed
 * because the platforms phrase the same question differently.
 */
function mergeSources(lists: ShapedMarket[][], priorIds: Set<string>): ShapedMarket[] {
  const groups = new Map<string, ShapedMarket[]>();
  for (const m of lists.flat()) {
    const key = normalizeTitle(m.title);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }

  const out: ShapedMarket[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => b.volume - a.volume);
    const primary = group.find((m) => priorIds.has(m.id)) ?? group[0]!;
    const other = group.find((m) => m.source !== primary.source);
    if (other) attachAlt(primary, other);
    for (const m of group) if (m !== primary) addPeer(primary, m); // every member corroborates
    out.push(primary);
  }

  // Second pass: cross-platform same-question pairs phrased differently (→ alt + gap),
  // and same-PLATFORM near-duplicates that are the same question at finer granularity.
  // Both absorb the sibling as a corroborating peer; one primary can gather several,
  // so a 3+ market cluster keeps all readings.
  const merged = new Set<string>();
  for (let i = 0; i < out.length; i++) {
    const a = out[i]!;
    if (merged.has(a.id)) continue;
    for (let j = i + 1; j < out.length; j++) {
      const b = out[j]!;
      if (merged.has(b.id)) continue;
      const cross = !a.alt && !b.alt && (sameQuestion(a, b) || quantSame(a, b));
      const same = sameEventContainment(a, b);
      if (!cross && !same) continue;
      const primary = a.volume >= b.volume ? a : b;
      const absorbed = primary === a ? b : a;
      if (cross && !primary.alt) attachAlt(primary, absorbed); // cross-platform → gap
      // If we absorbed the market that held the cross-platform twin (its alt + the
      // divergence gap), inherit it so collapsing a same-platform duplicate never
      // silently drops the Polymarket-vs-Kalshi gap from the surviving story.
      if (!primary.alt && absorbed.alt) {
        primary.alt = absorbed.alt;
        primary.divergence = absorbed.divergence;
      }
      addPeer(primary, absorbed);
      for (const p of absorbed.peers ?? []) addPeer(primary, p); // keep a 3+ cluster's readings
      merged.add(absorbed.id); // the absorbed one drops out of the feed
      if (primary === b) break; // `a` was absorbed — stop scanning its row
    }
  }

  return out.filter((m) => !merged.has(m.id)).sort((a, b) => b.volume - a.volume);
}

/**
 * LLM collision tier: adjudicate the borderline cross-platform pairs the
 * deterministic matcher left unmatched, and PROMOTE the high-confidence sames to
 * merged. Decisions are cached by pair-id (persisted in the store) so reruns are
 * stable and no pair is re-asked. PROMOTE-ONLY: an LLM "yes" still re-checks the
 * hard date + category guards, so it can never merge across them. Best-effort — a
 * null verdict (Groq down) counts as "not the same". Returns the reduced list.
 */
async function mergeBorderline(
  candidates: ShapedMarket[],
  decisions: Record<string, boolean>,
): Promise<ShapedMarket[]> {
  const merged = new Set<string>();
  for (const [a, b] of borderlinePairs(candidates, config.collisionAdjudicateMax)) {
    if (merged.has(a.id) || merged.has(b.id) || a.alt || b.alt) continue;
    const key = pairKey(a.id, b.id);
    let same = decisions[key];
    if (same === undefined) {
      const verdict = await adjudicateSame(a, b, config);
      same = verdict !== null && verdict.same && verdict.confidence === 'high';
      decisions[key] = same; // cache the decision (incl. negatives) so we never re-ask
      // Pace adjudication like every other Groq loop — avoids a 429 burst when a
      // run has several uncached borderline pairs (the smallest model's per-model TPM
      // is the binding free-tier cap, so we stay conservative).
      if (!config.dryRun) await sleep(config.requestDelayMs);
    }
    // PROMOTE-ONLY: an LLM "yes" still cannot cross the hard date/category/sport guards.
    if (!same || !categoryCompatible(a, b) || !withinWindow(a, b) || sportsConflict(a, b)) continue;
    const primary = a.volume >= b.volume ? a : b;
    const absorbed = primary === a ? b : a;
    attachAlt(primary, absorbed);
    addPeer(primary, absorbed);
    merged.add(absorbed.id);
  }
  return candidates.filter((c) => !merged.has(c.id));
}

// At most this many "related on the board" links per story (the most-traded siblings).
const RELATED_MAX = 3;

// Words that are distinctive by length but name no ENTITY — temporal terms, common
// sports nouns, ordinals. A shared one of these must NOT make two markets "related"
// (every "…tonight" or "…the title" market would otherwise link), so relatedness
// keys on real entities (teams, people, places) — on top of QUESTION_WORDS.
const RELATED_STOP = new Set([
  'tonight', 'today', 'tomorrow', 'week', 'weekend', 'month', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday', 'summer', 'winter', 'spring', 'autumn', 'fall',
  'season', 'series', 'title', 'final', 'finals', 'champion', 'champions', 'championship', 'game',
  'match', 'tournament', 'open', 'league', 'playoff', 'playoffs', 'this', 'next', 'first', 'last',
  'year', 'years', 'time', 'team', 'cup',
  // common scaffolding the raw-title `via` scan would otherwise surface
  'will', 'with', 'from', 'have', 'that', 'into', 'about', 'their', 'them', 'when', 'what', 'than',
  'between', 'during', 'against', 'another', 'whether', 'while', 'where', 'there', 'these', 'those',
  'could', 'should', 'being', 'around', 'through',
  // month names (canonicalToken maps jun→june, etc.): two markets resolving in the same
  // month are NOT "related" — a shared "June" must not link LA temperature to Chicago rain.
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december',
]);

// Short canonical tokens (below the >=4 distinctiveness gate) that ARE real entities —
// the crypto tickers + the Fed — so two Bitcoin/Fed markets still link as related even
// though canonicalToken collapses "bitcoin"→"btc" (len 3). Mirrors canonical.ts aliases.
const RELATED_ALIAS = new Set(['btc', 'eth', 'sol', 'doge', 'xrp', 'fed']);

/** The longest 4+ letter ENTITY word the two titles literally share (case-insensitive,
 * excluding question scaffolding + non-entity terms), title-cased — the readable "why
 * related". '' when they overlap only by canonical alias (e.g. bitcoin↔btc). */
function sharedWord(titleA: string, titleB: string): string {
  const wb = new Set(titleB.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  let best = '';
  for (const w of titleA.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    if (wb.has(w) && !QUESTION_WORDS.has(w) && !RELATED_STOP.has(w) && w.length > best.length) {
      best = w;
    }
  }
  return best ? best.charAt(0).toUpperCase() + best.slice(1) : '';
}

/**
 * Surface OTHER live markets that share a salient entity (a team, person, place…) with
 * each market but are a DIFFERENT question — a "related on the board" link, never a
 * merge. The same shared-locale signal that (rightly) no longer FUSES "Miami Heat" and
 * "Miami Marlins" instead LINKS them. Same canonical category, ranked by the sibling's
 * volume, capped, bidirectional. Runs over the final published set so every related id
 * is a live (active) feed entry the client can open.
 */
export function attachRelated(markets: Market[]): void {
  for (const m of markets) delete m.related; // recomputed fresh each run — never carry stale links
  // A digest (sports line / recurring prop) has no in-app article, so it must never be
  // offered as a "related on the board" link (the link would open a content-less view).
  const live = markets.filter((m) => m.status === 'active' && m.format !== 'digest');
  const toks = new Map<string, Set<string>>(
    live.map((m) => [m.id, new Set([...contentTokens(m.title), ...favoredTokens(m.favored)])]),
  );
  const hits = new Map<string, { m: Market; via: string }[]>();
  const add = (from: Market, to: Market, via: string) =>
    (hits.get(from.id) ?? hits.set(from.id, []).get(from.id)!).push({ m: to, via });
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.category !== b.category) continue; // same beat only — keeps the links sane
      // The shared entity: a raw >=4-char title word (the clean, label-able signal), OR a
      // canonical-token match — which catches cross-spellings (Bitcoin/BTC, Fed/FOMC) and
      // the short tickers the >=4 distinctiveness gate would otherwise drop (btc/eth/…).
      const via = sharedWord(a.title, b.title);
      let shared = via !== '';
      if (!shared) {
        const tb = toks.get(b.id)!;
        for (const w of toks.get(a.id)!) {
          if (tb.has(w) && ((isDistinctiveToken(w) && !RELATED_STOP.has(w)) || RELATED_ALIAS.has(w))) {
            shared = true; // a shared ENTITY token (team/person/place/ticker), not scaffolding
            break;
          }
        }
      }
      if (!shared) continue;
      add(a, b, via);
      add(b, a, via);
    }
  }
  for (const m of live) {
    const list = hits.get(m.id);
    if (!list?.length) continue;
    m.related = list
      .sort((x, y) => y.m.volume - x.m.volume)
      .slice(0, RELATED_MAX)
      // Prefer the related market's editorial HEADLINE (hook) over its dry contract title
      // ("Illinois on pace for a record tornado year" > "Number of tornadoes in Jun 2026?").
      .map(({ m: r, via }) => ({ id: r.id, title: r.hook?.trim() || r.title, oddsPct: r.oddsPct, via }));
  }
}

function buildQuery(m: Market): string {
  return m.title
    .replace(/\?+\s*$/, '')
    .replace(/["']/g, '')
    .trim();
}

/**
 * A broadened news query for when the exact title finds nothing. Threshold/ladder
 * titles ("Will Silver (SI) hit $60 by end of June?") are unsearchable on Google
 * News — the ticker, the strike, and the date make the phrase match no article —
 * so we fall back to the bare SUBJECT: drop the parenthetical ticker and the
 * leading "Will", then cut everything from the threshold verb or first number on.
 * '' when nothing meaningful remains.
 */
export function broadenQuery(title: string): string {
  const core = title
    .replace(/\([^)]*\)/g, ' ') // "(SI)", "(CL)" tickers
    .replace(/^\s*will\s+/i, '') // leading "Will"
    .replace(/['’]s\b/gi, ''); // "SpaceX's" → "SpaceX"
  const cut = core.search(/\b(hit|above|below|reach|exceed|tops?|crosses?)\b|[$\d]/i);
  return (cut > 0 ? core.slice(0, cut) : core)
    .replace(/[?"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// US city/airport abbreviations that appear in Kalshi weather/event titles, expanded so
// Google News searches the real place — a bare "LA"/"DC" substring-matches noise ("LA"
// pulled "La Farfalla", "La Ronge SK"). Lowercase keys.
const LOCATION_ALIASES: Record<string, string> = {
  la: 'Los Angeles', lax: 'Los Angeles', nyc: 'New York City', ny: 'New York',
  dc: 'Washington DC', sf: 'San Francisco', sfo: 'San Francisco', chi: 'Chicago',
  ord: 'Chicago', phl: 'Philadelphia', atl: 'Atlanta', mia: 'Miami', sea: 'Seattle',
  den: 'Denver', bos: 'Boston', hou: 'Houston', dfw: 'Dallas', phx: 'Phoenix',
  jfk: 'New York City', lga: 'New York City', dca: 'Washington DC', iad: 'Washington DC',
  vegas: 'Las Vegas',
};
const expandLocation = (loc: string): string =>
  LOCATION_ALIASES[loc.trim().toLowerCase()] ?? loc.trim();

/**
 * A REAL, searchable Google News query for a market — the SUBJECT, not the raw contract
 * title. Kalshi/ladder titles ("Highest temperature in LA on Jun 23, 2026?") are no real
 * headline, so Google News substring-matches noise. We extract the subject: weather →
 * "<city> weather forecast"; otherwise drop the question scaffolding + trailing
 * date/threshold and fold in a distinctive favored entity (a team/candidate/person).
 * Pure → unit-tested.
 */
export function newsQuery(m: Market): string {
  const title = m.title.replace(/["']/g, '').trim();
  // Weather markets → "<city> weather forecast".
  const wx = title.match(
    /\b(?:highest|lowest|high|low|max|min)?\s*(?:temperature|temp|rain(?:fall)?|snow(?:fall)?|weather|heat index)\b[^?]*?\bin\s+([A-Za-z .'-]+?)\s+(?:on|in|by|this|tomorrow|today|\d|$)/i,
  );
  if (wx?.[1]) return `${expandLocation(wx[1])} weather forecast`;
  // General: drop leading scaffolding, then the trailing date/threshold clause (broadenQuery).
  let q = (broadenQuery(title) || title)
    .replace(/^\s*(?:the\s+)?(?:number of|how many|how much|highest|lowest|total|will)\s+/i, '')
    .trim();
  // Fold in a distinctive favored entity so coverage is about the ACTUAL contract — never
  // a bare Yes/No or a numeric/range rung (unsearchable, dilutes the query).
  const fav = m.favored.replace(/["']/g, '').trim();
  const favDistinctive =
    fav !== '' &&
    !/\d/.test(fav) &&
    !GENERIC_FAVORED.has(fav.toLowerCase()) &&
    [...salientTokens(fav)].some(isDistinctiveToken);
  if (favDistinctive && !q.toLowerCase().includes(fav.toLowerCase())) q = `${q} ${fav}`;
  return q.replace(/\s+/g, ' ').trim() || buildQuery(m);
}

// Dilution cap on cited sources: 8 results of which several are tangential read worse than
// 4-5 tight, on-topic ones. The relevance gate ranks by overlap; this caps the survivors.
const NEWS_CITE_MAX = 5;

/** The market's "want" tokens — salient tokens of its title + favored + named entities —
 * the relevance currency a candidate headline must share to be cited. */
function wantTokens(m: Market): Set<string> {
  const entities = (m.entities ?? []).map((e) => e.name).join(' ');
  return salientTokens(`${m.title} ${m.favored} ${entities}`);
}

/** Score each headline by weighted salient-token overlap with the market (a distinctive
 * entity match counts double), dropping a self-restating "source" whose title IS the
 * market question (never reporting). Most-relevant first. */
function scoreHeadlines(
  headlines: Headline[],
  m: Market,
  want: Set<string>,
): { h: Headline; score: number }[] {
  const mq = normHeadline(m.title);
  return headlines
    .filter((h) => {
      const hn = normHeadline(h.title);
      return hn !== '' && hn !== mq && !hn.includes(mq) && !mq.includes(hn);
    })
    .map((h) => {
      let score = 0;
      for (const w of salientTokens(h.title)) if (want.has(w)) score += isDistinctiveToken(w) ? 2 : 1;
      return { h, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Keep only headlines that actually share a DISTINCTIVE entity with the market (score>=2 =
 * >=1 distinctive token, or >=2 generic shared tokens), ranked + capped — the relevance
 * gate the cited sources were missing. [] when nothing clears the bar (the caller applies
 * a one-result floor so a thin story is never stranded). When the market has no salient
 * tokens to match on, keep the originals (capped). Pure → unit-tested.
 */
export function relevantHeadlines(headlines: Headline[], m: Market): Headline[] {
  if (headlines.length === 0) return headlines;
  const want = wantTokens(m);
  const scored = scoreHeadlines(headlines, m, want);
  if (want.size === 0) return scored.slice(0, NEWS_CITE_MAX).map((s) => s.h);
  return scored
    .filter((s) => s.score >= 2)
    .slice(0, NEWS_CITE_MAX)
    .map((s) => s.h);
}

/**
 * Headlines for a market, with one broadened-query retry. An over-specific title
 * returns nothing on Google News, which would strand the story un-briefed on the
 * "gathering sources…" placeholder forever; retry on the bare subject so a
 * thin-but-real story (commodity prices, valuations) still gets sourced. The
 * platform/odds domains are filtered out downstream, so a broad query can't pull
 * the market back in as its own source.
 */
async function fetchMarketHeadlines(m: Market): Promise<Headline[]> {
  const want = wantTokens(m);
  const primary = newsQuery(m);
  const raw = await fetchHeadlines(primary, config);
  let hits = relevantHeadlines(raw, m);
  // Nothing on-topic from the subject query → broaden to the bare subject, but RE-TIGHTEN
  // against the ORIGINAL market's tokens so a broad query can't pull in off-topic citations.
  if (hits.length === 0) {
    const broad = broadenQuery(m.title);
    if (broad && broad.toLowerCase() !== primary.toLowerCase()) {
      const widened = relevantHeadlines(await fetchHeadlines(broad, config), m);
      if (widened.length > 0)
        console.log(`  ↻ broadened "${primary}" → "${broad}" (${widened.length} sources)`);
      hits = widened;
    }
  }
  // Floor: nothing cleared the relevance bar on either query. Rather than strand the story
  // un-briefed, keep the single best-scoring non-clone candidate — but ONLY if it shares at
  // least one token (never cite a totally unrelated source; a zero-overlap story is skipped).
  if (hits.length === 0 && raw.length > 0) {
    const best = scoreHeadlines(raw, m, want)[0];
    if (best && best.score >= 1) hits = [best.h];
  }
  return hits;
}

/** Sibling-market readings for the briefing context — the corroborating markets on
 * this same event, minus the one already surfaced to the model as {altOdds}, each
 * mapped to a display source label. [] when this story stands alone. */
function peersForBriefing(m: Market): { source: string; favored: string; oddsPct: number }[] {
  return (m.peers ?? [])
    .filter((p) => p.marketUrl !== m.alt?.marketUrl)
    .map((p) => ({
      source: p.source === 'kalshi' ? 'Kalshi' : 'Polymarket',
      favored: p.favored,
      oddsPct: p.oddsPct,
    }));
}

function hoursSince(iso: string, nowMs: number): number {
  return (nowMs - Date.parse(iso)) / 3_600_000;
}

/** A short "in 3 days" / "2h ago" phrase for an event clock, relative to now. '' when
 * the timestamp is missing/unparseable. */
function whenPhrase(iso: string | undefined, nowMs: number): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const ahead = t - nowMs;
  const a = Math.abs(ahead);
  const unit =
    a < 5_400_000
      ? `${Math.max(1, Math.round(a / 60_000))}m`
      : a < 129_600_000
        ? `${Math.round(a / 3_600_000)}h`
        : `${Math.round(a / 86_400_000)}d`;
  return ahead >= 0 ? `in ${unit}` : `${unit} ago`;
}

/**
 * Real scheduled/settled events pinned to a story, as factual lines for the briefing
 * prompt. Events are now built+pinned BEFORE the brief loop (see main()), so these are
 * THIS run's fresh pins. We still SKIP `live` events on purpose: a briefing is written
 * once and persists until re-briefed, so an in-progress score baked into the prose would
 * go stale within minutes — whereas a kick-off time or a final result stays accurate.
 * Capped, newest-clock first.
 */
export function eventContextLines(events: EventItem[] | undefined, nowMs: number): string[] {
  if (!events || events.length === 0) return [];
  return events
    .filter((e) => e.status === 'scheduled' || e.status === 'final')
    .slice(0, 3)
    .map((e) => {
      if (e.status === 'final') {
        return e.detail ? `${e.title} — ${e.detail}.` : `${e.title} — settled.`;
      }
      const when = whenPhrase(e.startTime, nowMs);
      const tail = e.detail ? ` (${e.detail})` : '';
      return when ? `${e.title} — scheduled ${when}${tail}.` : `${e.title} — upcoming${tail}.`;
    });
}

/** Corroborated developing-coverage clusters pinned to a story, as untrusted-context
 * lines (cluster headline + how many outlets + freshness). Capped at 2, freshest first. */
export function developingContextLines(
  breaking: BreakingItem[] | undefined,
  nowMs: number,
): string[] {
  if (!breaking || breaking.length === 0) return [];
  return breaking.slice(0, 2).map((b) => {
    const n = b.outlets?.length ?? 0;
    const corr = n > 0 ? `, ${n} outlet${n === 1 ? '' : 's'}` : '';
    const age = whenPhrase(b.lastSeen ?? b.firstSeen, nowMs);
    return `${b.title} (developing${corr}${age ? `, ${age}` : ''}).`;
  });
}

/** The recorded odds nearest a briefing's generation time — what the market
 * "said" when the story was written, so we can detect a swing since. */
function oddsAtGeneration(m: Market): number | null {
  if (!m.generatedAt || m.oddsHistory.length === 0) return null;
  const g = Date.parse(m.generatedAt);
  let best = m.oddsHistory[0]!;
  for (const p of m.oddsHistory) {
    if (Math.abs(Date.parse(p.t) - g) < Math.abs(Date.parse(best.t) - g)) best = p;
  }
  return best.p;
}

/** How far the odds have moved since the briefing was written (points). */
export function swingSince(m: Market): number {
  const at = oddsAtGeneration(m);
  return at === null ? 0 : Math.abs(m.oddsPct - at);
}

/** The per-run regeneration plan. `regen` = stories we KNOW changed (rewritten
 * outright). `newsCheck` = otherwise-calm stories due a coverage re-check; the
 * caller fetches their headlines and rewrites ONLY those with genuinely new
 * news. */
export interface RegenPlan {
  regen: Market[];
  newsCheck: Market[];
}

/**
 * Change-driven selection (no fixed rewrite clock). `regen`, in priority order:
 * new markets, incomplete stubs, stories whose odds swung >= SWING_PTS since they
 * were written (biggest first), then anything idle past the long backstop —
 * de-duplicated and capped at the generation budget. `newsCheck`: calm, briefed
 * stories not already regenerating whose coverage hasn't been re-checked within
 * NEWS_RECHECK_HOURS (oldest check first, capped) — the caller rewrites these
 * only if `newsChanged` finds genuinely new reporting, else just bumps checkedAt.
 */
export function pickCandidates(markets: Market[], nowMs: number): RegenPlan {
  // A 'digest' (a folded prop rep / sports line) is never briefed — its crowd number
  // rides the feed as an "On the board" row. Exclude digests from every briefing pool so
  // no Groq is ever spent on one (the brief loop also hard-stops on format, defense in
  // depth). Records briefed before formats existed have format undefined → still eligible.
  const active = markets.filter((m) => m.status === 'active' && m.format !== 'digest');
  const fresh = active.filter((m) => !m.generatedAt);
  const incomplete = active.filter((m) => m.generatedAt && !m.synthesis);
  const swung = active
    .filter(
      (m) =>
        m.generatedAt &&
        m.synthesis &&
        hoursSince(m.generatedAt, nowMs) >= 2 && // not just-written
        swingSince(m) >= SWING_PTS,
    )
    .sort((a, b) => swingSince(b) - swingSince(a));
  const backstop = active
    .filter(
      (m) =>
        m.generatedAt && m.synthesis && hoursSince(m.generatedAt, nowMs) >= IDLE_BACKSTOP_HOURS,
    )
    .sort((a, b) => Date.parse(a.generatedAt!) - Date.parse(b.generatedAt!));

  const seen = new Set<string>();
  const regen = [...fresh, ...incomplete, ...swung, ...backstop]
    .filter((m) => !seen.has(m.id) && (seen.add(m.id), true))
    .slice(0, config.generateLimit);

  // Calm briefed stories due a coverage re-check (oldest check first), excluding
  // anything already being regenerated this run. `checkedAt` falls back to
  // `generatedAt` for records written before change-driven regeneration.
  const lastCheck = (m: Market) => Date.parse(m.checkedAt ?? m.generatedAt!);
  const newsCheck = active
    .filter(
      (m) =>
        m.generatedAt &&
        m.synthesis &&
        !seen.has(m.id) &&
        hoursSince(m.checkedAt ?? m.generatedAt, nowMs) >= NEWS_RECHECK_HOURS,
    )
    .sort((a, b) => lastCheck(a) - lastCheck(b))
    .slice(0, NEWS_CHECK_LIMIT);

  return { regen, newsCheck };
}

/** Normalize a headline/source title for set comparison: drop a trailing
 * " - Publisher", punctuation, and case so the same article matches across runs. */
function normHeadline(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+[–-]\s+[^–-]+$/, '') // strip trailing " - Publisher"
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Has the coverage materially changed since this briefing was written? True when
 * at least NEWS_NEW_MIN freshly fetched headlines were NOT among the sources we
 * cited last time — so a real wave of new reporting triggers a rewrite, while
 * reordered or duplicate results do not. Empty current coverage → no change
 * (nothing new to report); empty prior citations → treat any news as new.
 */
export function newsChanged(headlines: Headline[], sources: Source[]): boolean {
  if (headlines.length === 0) return false;
  const cited = new Set(sources.map((s) => normHeadline(s.title ?? '')).filter((t) => t !== ''));
  if (cited.size === 0) return true;
  let fresh = 0;
  for (const h of headlines) {
    const t = normHeadline(h.title);
    if (t && !cited.has(t)) fresh++;
  }
  return fresh >= NEWS_NEW_MIN;
}

/** The dedupe key for a cited source: the article link if we have it, else the
 * publisher URL, else a normalized title — so the same article collapses to one
 * coverage tick from one run to the next. */
function coverageKey(s: Source): string {
  return s.articleUrl ?? s.url ?? normHeadline(s.title ?? '');
}

/**
 * Fold freshly-cited sources into the durable coverage union for the opinion
 * timeline: dedupe by article, KEEP THE EARLIEST publishedAt for a given article
 * (so a tick marks when the news first landed, not when it was last re-cited),
 * prefer the richer record otherwise, and cap to the most recent `max` by publish
 * time so a long-running story stays bounded. Pure → unit-tested.
 */
export function mergeCoverage(prev: Source[], fresh: Source[], max: number): Source[] {
  const byKey = new Map<string, Source>();
  for (const s of [...prev, ...fresh]) {
    const k = coverageKey(s);
    if (!k) continue;
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, s);
      continue;
    }
    const ep = existing.publishedAt;
    const sp = s.publishedAt;
    const earliest = !ep ? sp : !sp ? ep : sp < ep ? sp : ep;
    byKey.set(k, { ...existing, ...s, ...(earliest ? { publishedAt: earliest } : {}) });
  }
  const all = [...byKey.values()].sort((a, b) =>
    (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''),
  );
  return max > 0 && all.length > max ? all.slice(all.length - max) : all;
}

/** Set the briefing's current citations AND fold them into the durable coverage
 * union, so regenerating a briefing never discards the earlier coverage timeline. */
function applyCoverage(m: Market, headlines: Headline[]): void {
  m.sources = headlines.map((h) => h.source);
  m.coverage = mergeCoverage(m.coverage ?? [], m.sources, COVERAGE_MAX);
}

/** A plain-language shape of the odds over the tracked history, so the briefing
 * can tell the story over time. '' when there isn't enough history to judge. */
export function oddsTrajectory(m: Market): string {
  const ps = m.oddsHistory.map((p) => p.p);
  if (ps.length < 3) return '';
  const net = ps[ps.length - 1]! - ps[0]!;
  const range = Math.max(...ps) - Math.min(...ps);
  if (range < 3) return 'have held roughly steady';
  if (Math.abs(net) >= range * 0.6) return net > 0 ? 'have climbed' : 'have slipped';
  return 'have swung back and forth';
}

/** The absolute resolution date as "June 23, 2026" (US Eastern, matching the byline
 * clock), or null. For a date-specific bet the date IS the defining specific. */
function formatResolveDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** Whole days until the market resolves, or null if unbounded/past/unknown. */
function resolvesInDays(m: Market, nowMs: number): number | null {
  if (!m.endDate) return null;
  const end = Date.parse(m.endDate);
  if (!Number.isFinite(end)) return null;
  const days = Math.round((end - nowMs) / 86_400_000);
  return days >= 0 ? days : null;
}

/**
 * Before a rewrite, freeze the OUTGOING briefing as a revision — but ONLY for a
 * real, grounded briefing (synthesis present, so fallback/dry-run stubs are never
 * preserved) and ONLY on a genuine shift (odds moved >= REVISION_MIN_SHIFT since
 * it was written, or the favored side flipped). Keeps the most recent REVISION_MAX.
 */
export function snapshotRevision(m: Market, force = false): void {
  if (!m.generatedAt || !m.hook || !m.synthesis) return; // nothing real to preserve
  const prevOdds = m.briefedOddsPct ?? oddsAtGeneration(m) ?? m.oddsPct;
  const flipped = m.briefedFavored != null && m.briefedFavored !== m.favored;
  // `force` (the final result rewrite) always preserves the last pre-result read,
  // even when the settle wasn't itself an >=8pt odds shift.
  if (!force && Math.abs(m.oddsPct - prevOdds) < REVISION_MIN_SHIFT && !flipped) return;
  // Freeze the outgoing body as FINAL prose: hydrate its {tokens} against the
  // then-live context ({odds} = this version's own odds) so an expanded past
  // version reads with its then-numbers and needs no client-side hydration.
  const thenOdds = Math.round(prevOdds * 10) / 10;
  const thenFavored = m.briefedFavored ?? m.favored;
  const thenCtx: Market = { ...m, oddsPct: thenOdds, favored: thenFavored };
  const rev: BriefingRevision = {
    generatedAt: m.generatedAt,
    oddsPct: thenOdds,
    favored: thenFavored,
    hook: m.hook,
    dek: m.dek ?? '',
    analysis: hydrateBriefing(m.analysis, thenCtx),
  };
  if (m.take) rev.take = hydrateBriefing(m.take, thenCtx);
  if (m.marketRead) rev.marketRead = hydrateBriefing(m.marketRead, thenCtx);
  m.revisions = [rev, ...(m.revisions ?? [])].slice(0, REVISION_MAX);
}

/** Stamp the live context of the briefing we just wrote, so a future rewrite can
 * snapshot it with the correct then-values. */
export function stampBriefing(m: Market): void {
  m.briefedOddsPct = m.oddsPct;
  m.briefedFavored = m.favored;
  // Freeze the FIRST briefed read exactly once — never overwritten on rewrites or
  // the result pass — so /accuracy can calibrate against what we initially told
  // readers, not the near-settlement odds.
  m.firstBriefedOddsPct ??= m.oddsPct;
  m.firstBriefedFavored ??= m.favored;
}

/** Without a Groq key the feed still ships real markets + real news links. */
export function applyFallback(m: Market, headlines: Headline[], nowIso: string): void {
  const top = headlines[0];
  m.hook = top ? top.title : `${m.favored} leads at ${Math.round(m.oddsPct)}%`;
  m.dek = '';
  // Reader-safe placeholder ONLY — never leak build/config detail into HTML.
  // synthesis stays null below, so hasBriefing() keeps this record out of the
  // search index, the sitemaps, and the durable archive until it's really briefed.
  m.analysis = `${headlines.length} outlet${headlines.length === 1 ? '' : 's'} covering this. Leading report: “${top?.title}” (${top?.outlet}).`;
  m.background = '';
  m.whatToWatch = '';
  m.take = '';
  m.marketRead = '';
  m.crowdVsCoverage = '';
  m.synthesis = null;
  m.entities = [];
  m.precedents = [];
  // No model → no entities; keep the platform thumbnail as a single figure.
  m.images =
    m.image && /^https:\/\//.test(m.image)
      ? [{ url: m.image, type: 'topic', name: '', source: 'polymarket' }]
      : [];
  m.hero = null;
  applyCoverage(m, headlines);
  m.grounded = headlines.length > 0;
  m.generatedAt = nowIso;
  m.checkedAt = nowIso;
  stampBriefing(m); // keep the briefing-context stamp in sync (snapshots still gate on synthesis)
  m.updatedAt = nowIso;
}

/** Write a generated briefing (preview or result mode) onto the market record —
 * the shared field-mapping both generation paths use, including the high-
 * confidence precedent gate and the briefing-context stamp. Imagery (async,
 * best-effort) is resolved by the caller. */
function applyBriefing(m: Market, brief: Briefing, headlines: Headline[], nowIso: string): void {
  m.hook = brief.hook;
  m.dek = brief.dek;
  m.analysis = brief.analysis;
  m.background = brief.background;
  m.whatToWatch = brief.whatToWatch;
  m.take = brief.take;
  m.marketRead = brief.marketRead;
  m.crowdVsCoverage = brief.crowdVsCoverage;
  m.synthesis = brief.synthesis;
  m.entities = brief.entities;
  // Keep only the precedents the model vouches for (high confidence); drop the rest.
  m.precedents = brief.precedents.filter((p) => p.confidence === 'high').map((p) => p.fact);
  applyCoverage(m, headlines);
  m.grounded = true;
  m.generatedAt = nowIso;
  m.checkedAt = nowIso;
  stampBriefing(m); // record this briefing's context for the next rewrite's snapshot
  m.updatedAt = nowIso;
}

/** Qualitative odds band for a story SUB-SIGNAL, so the briefing can note where the
 * story's facets agree or split WITHOUT ever seeing a live digit (the model stays
 * number-blind; exact values are hydrated at render time). A small local copy that
 * mirrors the spirit of groq's internal oddsBand — the SubSignals are render-time data,
 * so the band is computed here at the call site rather than exported from groq. */
function oddsBandLocal(p: number): string {
  return p >= 85
    ? 'a strong favorite'
    : p >= 65
      ? 'favored'
      : p >= 55
        ? 'leaning yes'
        : p > 45
          ? 'a coin toss'
          : p > 35
            ? 'leaning no'
            : p >= 15
              ? 'unlikely'
              : 'a long shot';
}

async function generateFor(
  m: Market,
  today: string,
  nowIso: string,
  prefetched?: Headline[],
  resolver?: SnippetResolver,
): Promise<'ok' | 'skip'> {
  const headlines = prefetched ?? (await fetchMarketHeadlines(m));

  if (config.dryRun) {
    m.hook = `${m.favored} holds at ${Math.round(m.oddsPct)}%`;
    m.dek = '';
    m.analysis = `[dry-run] ${headlines.length} headlines retrieved for "${m.title}".`;
    m.background = '';
    m.whatToWatch = '';
    m.take = '';
    m.marketRead = '';
    m.crowdVsCoverage = '';
    m.synthesis = null; // drop any prior Groq synthesis so the record stays consistent
    m.entities = [];
    m.precedents = [];
    m.images = [];
    m.hero = null;
    applyCoverage(m, headlines);
    m.grounded = headlines.length > 0;
    m.generatedAt = nowIso;
    m.checkedAt = nowIso;
    stampBriefing(m);
    m.updatedAt = nowIso;
    return 'ok';
  }

  if (headlines.length === 0) {
    // Visible, so a story stranded on the "gathering sources…" placeholder shows
    // up in the run log instead of vanishing into the bare `skipped=N` count.
    console.log(`  · skipped "${m.title}" — no sources found`);
    return 'skip'; // never brief without real sources
  }

  if (!llmConfigured()) {
    applyFallback(m, headlines, nowIso);
    return 'ok';
  }

  try {
    const sourceSnippets = resolver ? await resolver.forMarket(m, headlines) : [];
    const brief = await summarize(
      {
        title: m.title,
        category: m.category,
        description: m.description,
        favored: m.favored,
        oddsPct: m.oddsPct,
        movement7d: m.movement7d,
        movement24h: m.movement24h,
        volume: m.volume,
        volume24h: m.volume24h,
        divergence: m.divergence,
        altOddsPct: m.alt ? m.alt.oddsPct : null,
        altSource: m.alt ? (m.alt.source === 'kalshi' ? 'Kalshi' : 'Polymarket') : null,
        peers: peersForBriefing(m),
        trajectory: oddsTrajectory(m),
        resolvesInDays: resolvesInDays(m, Date.parse(nowIso)),
        resolvesOn: formatResolveDate(m.endDate),
        decided: isDecided(m, Date.parse(nowIso)),
        eventLines: eventContextLines(m.events, Date.parse(nowIso)),
        developingLines: developingContextLines(m.breaking, Date.parse(nowIso)),
        sourceSnippets,
        // Story layer: the editorial desk (only feature/update/explainer reach summarize;
        // digest/result never do) + the crowd's read across the story's other facets, as
        // qualitative bands so the lead can note where the facets agree or split.
        format: m.format === 'update' || m.format === 'explainer' ? m.format : 'feature',
        storySignals: (m.subSignals ?? [])
          .slice(0, 6)
          .map((s) => ({ title: s.title, favored: s.favored, band: oddsBandLocal(s.oddsPct) })),
      },
      headlines,
      config,
      today,
    );
    // Preserve the outgoing version (when the odds shifted enough) before overwriting.
    snapshotRevision(m);
    applyBriefing(m, brief, headlines, nowIso);
    // Best-effort imagery (never throws): real photos/flags/logos for the entities,
    // with the platform thumbnail as a last-resort figure.
    const { images, hero } = await resolveEntityImages(brief.entities, m.image);
    m.images = images;
    m.hero = hero;
    return 'ok';
  } catch (err) {
    console.warn(`  ! groq failed for "${m.title}": ${(err as Error).message}`);
    return 'skip';
  }
}

/**
 * Settled markets due their one-time result article: a real briefing whose
 * outcome we captured, none written yet, still fresh enough to have coverage.
 * Oldest-settle first (so a backlog drains across runs) and capped. Exported for
 * tests.
 */
export function pendingResults(markets: Market[], nowMs: number): Market[] {
  return markets
    .filter(
      (m) =>
        m.resolvedOutcome != null &&
        m.calledCorrectly != null &&
        m.synthesis != null && // only real briefings earn a result article (not stubs)
        !m.resultAt &&
        m.resolvedAt != null &&
        nowMs - Date.parse(m.resolvedAt) <= RESULT_WINDOW_DAYS * DAY_MS,
    )
    .sort((a, b) => Date.parse(a.resolvedAt!) - Date.parse(b.resolvedAt!))
    .slice(0, RESULT_LIMIT);
}

/**
 * Write the one-time PAST-TENSE result article for a market that just settled:
 * fetch fresh coverage of the OUTCOME, regenerate the briefing in result mode
 * (event-first, with the crowd verdict), and force-preserve the last pre-result
 * read in the "trace our read" timeline so the story closes on its own arc.
 * Returns 'skip' (retried a later run) when it can't be written.
 */
async function generateResult(
  m: Market,
  today: string,
  nowIso: string,
  resolver?: SnippetResolver,
): Promise<'ok' | 'skip'> {
  if (config.dryRun || !llmConfigured()) return 'skip';
  if (!m.resolvedOutcome || m.calledCorrectly == null) return 'skip';
  const headlines = await fetchMarketHeadlines(m);
  if (headlines.length === 0) {
    console.log(`  · skipped result "${m.title}" — no coverage found`);
    return 'skip'; // never write a result without real coverage
  }
  try {
    const sourceSnippets = resolver ? await resolver.forMarket(m, headlines) : [];
    const brief = await summarizeResult(
      {
        title: m.title,
        category: m.category,
        description: m.description,
        favored: m.favored,
        oddsPct: m.oddsPct,
        movement7d: m.movement7d,
        movement24h: m.movement24h,
        volume: m.volume,
        volume24h: m.volume24h,
        divergence: m.divergence,
        altOddsPct: m.alt ? m.alt.oddsPct : null,
        altSource: m.alt ? (m.alt.source === 'kalshi' ? 'Kalshi' : 'Polymarket') : null,
        peers: peersForBriefing(m),
        trajectory: oddsTrajectory(m),
        resolvesInDays: null, // settled — nothing left to resolve
        resolvesOn: formatResolveDate(m.endDate),
        eventLines: eventContextLines(m.events, Date.parse(nowIso)),
        developingLines: developingContextLines(m.breaking, Date.parse(nowIso)),
        sourceSnippets,
        outcome: m.resolvedOutcome,
        crowdCalledIt: m.calledCorrectly,
      },
      headlines,
      config,
      today,
    );
    snapshotRevision(m, true); // always keep the final pre-result version in the timeline
    applyBriefing(m, brief, headlines, nowIso);
    m.resultAt = nowIso; // gate: write the result article exactly once
    const { images, hero } = await resolveEntityImages(brief.entities, m.image);
    m.images = images;
    m.hero = hero;
    return 'ok';
  } catch (err) {
    console.warn(`  ! result groq failed for "${m.title}": ${(err as Error).message}`);
    return 'skip';
  }
}

/**
 * A story's NEWS FOOTPRINT: the count of DISTINCT outlet domains that have published a
 * recent article STRONGLY about this story — an article sharing >=2 of the title's
 * distinctive tokens. Counted PER ARTICLE, never per cluster: each article carries only ITS
 * OWN title's tokens, so an outlet is credited only when it actually wrote about THIS story.
 * This avoids the token-union snowball that makes cluster-attribution over-credit unrelated
 * outlets (which collapsed the signal to a useless bimodal 0-or-~40). This is the primary
 * ranking axis, so a story the press is covering hard outranks a high-volume but unreported
 * betting line. Pure → unit-tested. Exported.
 */
export function footprintFor(m: ShapedMarket, articles: NormArticle[]): number {
  // Token base = title + favored side: a race's title is often generic ("Next UK Prime
  // Minister…" is all stoplisted process vocabulary) while the favored outcome carries
  // the name the press actually prints ("Kemi Badenoch"). Same title+favored idiom
  // events.ts uses to pin events to markets; a binary "Yes"/"No" adds no tokens.
  const dt = distinctive(`${m.title} ${m.favored}`);
  if (dt.size === 0) return 0;
  const outlets = new Set<string>();
  for (const a of articles) {
    if (outlets.has(a.domain)) continue; // this outlet is already counted
    let inter = 0;
    for (const t of dt) {
      if (a.tokens.has(t) && ++inter >= 2) break;
    }
    if (inter >= 2) outlets.add(a.domain);
  }
  return outlets.size;
}

/**
 * Collapse the clustered stories to the RANKED INPUT: exactly one LEAD market per story,
 * carrying the story identity + the crowd's read across its other facets, with the rest of
 * the catalog SUPPRESSED (the sub-markets ride on the lead as render-time sub-signals and
 * are never ranked or briefed). Each lead is mutated in place (storyId/isStoryLead/
 * subSignals/format) and every non-lead facet is tagged with the storyId for a future
 * sub→lead deep-link redirect. `folded` maps a lead id → its absorbed prop siblings (from
 * collapseProps), so the lead of a collapsed prop group is a 'digest' and pulls its
 * siblings in as facets too. Deterministic; pure aside from the documented in-place stamps.
 * Exported for unit testing.
 */
export function assembleStoryLeads(
  stories: StoryGroup[],
  folded: Map<string, ShapedMarket[]>,
  priorById: Map<string, Market>,
  nowMs: number,
): ShapedMarket[] {
  const leadInputs: ShapedMarket[] = [];
  for (const st of stories) {
    const lead = st.lead;
    // The story's other facets = its clustered members PLUS any folded-prop siblings of
    // ANY member (a member may itself be a prop rep with collapsed siblings, even when it
    // isn't the elected lead — those siblings would otherwise be orphaned from every story).
    const allFacets = [...st.members, ...st.members.flatMap((mem) => folded.get(mem.id) ?? [])];
    const subs = composeSubSignals(lead, allFacets); // excludes the lead, volume-sorted, cap 8
    lead.storyId = st.storyId;
    lead.isStoryLead = true;
    if (subs.length) lead.subSignals = subs;
    // A prop representative, a sports line, OR a lone daily-price/sub-event prop (one with no
    // siblings to fold, so it survived collapseProps but is still a price/level tick, e.g.
    // "Oil Price on Jun 24") is routine → 'digest' (a number, no AI briefing, demoted in rank).
    const isProp =
      folded.has(lead.id) ||
      isSportsCategory(lead.category) ||
      propShape(lead.title, []) !== null;
    // A story whose odds swung past SWING_PTS since its last briefing routes to the
    // 'update' desk (the regen pool brings it back to summarize; the newsCheck path that
    // also sets 'update' never sees a swung story). Measure the move with the prior
    // briefing's recorded odds-at-generation against the CURRENT live odds.
    const prior = priorById.get(lead.id);
    const advancedSinceLast =
      !!prior?.generatedAt && swingSince({ ...prior, oddsPct: lead.oddsPct }) >= SWING_PTS;
    lead.format = assignFormat({
      isProp,
      isDecided: isDecided(lead, nowMs),
      hasPriorBriefing: !!prior?.generatedAt,
      advancedSinceLast,
      newsFootprint: lead.newsFootprint ?? 0,
    });
    // Tag every non-lead facet with the storyId (for a future sub→lead deep-link redirect);
    // these are NOT ranked or briefed this pass.
    for (const sub of allFacets) sub.storyId = st.storyId;
    leadInputs.push(lead);
  }
  return leadInputs;
}

async function main(): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  resetLlmStats(); // fresh per-run LLM + fetch telemetry for the admin Operations console
  resetFetchErrors();
  const today = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

  console.log(`Crowdtells — ${nowIso}${config.dryRun ? ' (dry-run)' : ''}`);
  const llmPool = [
    config.nvidiaKeys.length && `NVIDIA ${config.nvidiaKeys.length}×${config.nvidiaModels.length}`,
    config.geminiKeys.length &&
      `Gemini ${config.geminiKeys.length}×${config.geminiModels.length}` +
        (config.geminiReasoningEffort ? ` (think:${config.geminiReasoningEffort})` : ''),
    config.groqKeys.length && `Groq ${config.groqKeys.length}×${config.groqModels.length}`,
  ].filter(Boolean);
  console.log(
    `LLM pool: ${llmPool.length ? `${llmPool.join(' → ')} (preference order)` : 'NONE (briefings disabled)'}`,
  );

  const prior = loadStore(config.storePath);
  // Stories that ALREADY have a live indexable /s/ page (before this run), so we
  // can tell which pages are brand-new this run and worth a prompt deploy.
  const priorIndexable = new Set(prior.filter(indexable).map((p) => p.id));
  const decisions = loadCollisionDecisions(config.storePath);
  const [poly, kalshi] = await Promise.all([fetchPolymarket(config), fetchKalshi(config)]);
  const priorIds = new Set(prior.map((p) => p.id));
  let candidates = mergeSources([poly, kalshi], priorIds);
  // LLM collision tier (best-effort, OFF in dry-run / no-key): promote borderline
  // cross-platform twins the deterministic matcher left unmatched — cached by
  // pair-id + re-checked against the hard date/category guards (promote-only).
  if (!config.dryRun && llmConfigured()) {
    const before = candidates.length;
    candidates = await mergeBorderline(candidates, decisions);
    if (candidates.length < before) {
      console.log(`LLM collision tier: merged ${before - candidates.length} borderline pair(s)`);
    }
  }
  // ── STORY LAYER ──────────────────────────────────────────────────────────────
  // Crowdtells ranks STORIES, not raw contracts: one development trades as many
  // markets and recurring props flood the catalog. Fold the candidates into stories,
  // rank ONE lead per story, and carry the rest as the lead's render-time sub-signals.

  // 1. Publisher-RSS pool, fetched ONCE here (moved up from the brief loop) and reused
  //    by both this layer (footprint + coverage bridge) and the later Developing fetch.
  //    Ungated + best-effort: in dry-run it still grounds footprint/clustering, and any
  //    fetch failure degrades to an empty pool rather than aborting the run.
  let rssPool: NormArticle[] = [];
  try {
    rssPool = await fetchRssPool(config);
  } catch {
    rssPool = [];
  }
  // Corroborated news clusters (>=2 distinct outlets) → footprint + coverage-bridge refs.
  // MIRRORS the Developing strip's pipeline (fetchBreaking): scope the raw pool to the
  // recent window, dedupe per-domain repeats (footprint counts DISTINCT outlets, so a
  // publisher's many feeds must not inflate it), cluster, then consolidate near-dupes —
  // WITHOUT this the un-windowed 1500+ article pool snowballs into one mega-cluster whose
  // ~40 outlets get attributed to almost every market (footprint stops discriminating).
  const recentPool = dedupePool(filterRecent(rssPool, nowMs, FOOTPRINT_WINDOW_MIN * 60_000));
  const newsClusters = consolidateClusters(clusterArticles(recentPool))
    .map((c) => ({ tokens: c.tokens, outlets: [...c.domains] }))
    .filter((c) => c.outlets.length >= 2);

  // 2. Fold recurring/intraday/sub-event PROPS to one representative each.
  const { survivors, folded } = collapseProps(candidates);

  // 3. Stamp newsFootprint on every survivor = distinct outlets that wrote an article
  //    strongly about it (PER ARTICLE over the full recent pool — no clustering, so no
  //    snowball; the primary ranking axis; see footprintFor). newsClusters above stay for
  //    the coverage-bridge in clusterMarkets only.
  for (const m of survivors) m.newsFootprint = footprintFor(m, rssPool);

  // 4. Hydrate prior churn state (when each survivor last LED, and when its current
  //    continuous feed run began) so ranking can dip a recently-led story and fatigue a
  //    calm evergreen — the feed rotates day to day instead of pinning the same leads.
  const priorById = new Map(prior.map((p) => [p.id, p]));
  for (const m of survivors) {
    const p = priorById.get(m.id);
    if (p?.lastLedAt) m.lastLedAt = p.lastLedAt;
    // The tenure clock continues only through an UNBROKEN active run — a story that
    // fell out of the feed and returns is news again, not a stale holdover.
    if (p?.status === 'active' && p.firstLedAt) m.firstLedAt = p.firstLedAt;
  }

  // 5. Cluster survivors into stories. The conservative entity rule runs deterministically;
  //    the borderline coverage-bridge / 1-token candidates are confirmed by Groq, capped at
  //    8/run and CACHED in the same store under a `story:` key (stable reruns). Off in
  //    dry-run / no-key — borderlines simply never fuse (the conservative default).
  const canBrief = !config.dryRun && llmConfigured();
  const adjudicate = canBrief
    ? async (a: ShapedMarket, b: ShapedMarket): Promise<boolean> => {
        const key = `story:${[a.id, b.id].sort().join('|')}`;
        if (key in decisions) return decisions[key]!;
        const v = await adjudicateStory(
          { title: a.title, category: a.category },
          { title: b.title, category: b.category },
          config,
        );
        const same = v === true; // null (failure) → treat as "not one story"
        decisions[key] = same;
        return same;
      }
    : undefined;
  const stories = await clusterMarkets(survivors, { newsClusters, nowMs, adjudicate, adjudicateMax: 8 });

  // 6. Assemble the RANKED INPUT = one LEAD per story (sub-markets suppressed onto the lead
  //    as sub-signals; lead carries storyId/isStoryLead/format). See assembleStoryLeads.
  const leadInputs = assembleStoryLeads(stories, folded, priorById, nowMs);

  // 7. Rank the LEADS (one item per story) — replaces ranking the raw candidate list.
  const shaped = rankAndSelect(leadInputs, config, nowMs);

  // 8. Stamp churn: every selected lead is leading NOW (consumed next run by ranking's
  //    dip), and starts its tenure clock if this is the first run of an unbroken stay
  //    (consumed by ranking's evergreen fatigue).
  for (const s of shaped) {
    s.lastLedAt = nowIso;
    s.firstLedAt ??= nowIso;
  }

  console.log(
    `Polymarket: ${poly.length} | Kalshi: ${kalshi.length} | ` +
      `candidates: ${candidates.length} → ranked feed: ${shaped.length} | store: ${prior.length}`,
  );
  const covered = leadInputs.filter((m) => (m.newsFootprint ?? 0) >= 2).length;
  console.log(
    `Stories: ${stories.length} from ${candidates.length} candidates | ` +
      `folded props: ${candidates.length - survivors.length} | leads ranked: ${leadInputs.length} | ` +
      `footprint≥2: ${covered} | news clusters: ${newsClusters.length}`,
  );

  // Backfill real price history for newly-discovered markets (best-effort, bounded)
  // so a brand-new market's first chart shows a true trend, not just a flat line.
  const seeded = await backfillSeeds(shaped, priorIds, config);
  if (seeded > 0) console.log(`Backfilled price history for ${seeded} new market(s)`);

  // Floor guard: a run that ranked nothing (total upstream outage, or every
  // candidate filtered) must NOT overwrite the durable store — doing so would
  // flip every active story to 'archived' and publish a feed with no live
  // stories. Abort with a non-zero exit so the last good site + store stand.
  if (shaped.length === 0 && prior.length > 0) {
    console.error(
      `FATAL: ranked feed is empty but the store holds ${prior.length} markets — ` +
        `refusing to overwrite. Skipping outputs; last good deploy stands.`,
    );
    process.exitCode = 1;
    return;
  }

  const markets = mergeMarkets(prior, shaped, nowIso, config);

  // Collapse every market's raw source tag to the canonical taxonomy (~12 buckets).
  // New candidates already arrive canonical from the source adapters; this upgrades
  // the carried-forward ARCHIVE in place each run (no re-brief needed), so the stored
  // feed, /topic hubs, filters, and category leveling all speak one clean vocabulary.
  // Records shaped before the tag-picking filter may still carry a Polymarket ops
  // label ("Hide From New") as their category — scrub those to the default bucket
  // rather than rendering an internal label as a beat.
  for (const m of markets)
    m.category = isJunkTag(m.category) ? 'Markets' : canonicalCategory(m.category);

  // Cross-link live markets that share a salient entity but are different questions
  // (e.g. two same-city teams) as "related on the board" — computed on canonical
  // categories, over the published set, so every related id is a live feed entry.
  attachRelated(markets);

  // Record real outcomes for any markets that just settled (powers the Past-tab
  // recaps + accuracy scoreboard). Free, keyless lookups; usually a handful.
  const captured = await captureResolutions(markets, nowIso, config);
  if (captured > 0) console.log(`Resolutions captured this run: ${captured}`);

  // Grade readers' Calls on any market that has settled but isn't yet scored —
  // bounded to recent resolutions so the bulk check stays cheap, and self-healing
  // (the scorer skips already-scored markets). Best-effort: no-ops without a
  // service key (local/dry) and never throws, so it can't trip the floor guard.
  const RESCORE_WINDOW_MS = 30 * 86_400_000;
  const recentlyResolved = markets.filter(
    (m) =>
      m.resolvedOutcome != null &&
      m.resolvedAt != null &&
      Date.parse(nowIso) - Date.parse(m.resolvedAt) < RESCORE_WINDOW_MS,
  );
  const scored = await scoreResolvedMarkets(recentlyResolved, nowIso);
  if (scored > 0) console.log(`Reader calls scored on ${scored} newly-resolved market(s)`);

  // Recompute community-note bridging (cross-viewpoint helpfulness). Heavier than
  // scoring (global recompute over all ratings), so it's skipped on the dominant
  // 15-min market-hours cron (BRIDGING_SKIP) and refreshed on every other tier —
  // notes don't move fast. Best-effort; no-op without a service key.
  if (!process.env.BRIDGING_SKIP) {
    const bridged = await bridgeNotes(nowIso);
    if (bridged > 0) console.log(`Community-note bridging refreshed: ${bridged} note(s)`);
  }

  const { regen, newsCheck } = pickCandidates(markets, nowMs);
  // News re-checks only matter when we can actually rewrite (real Groq key, live run).
  const canRewrite = !config.dryRun && llmConfigured();
  console.log(
    `Regenerate: ${regen.length} (changed) | news re-checks: ${canRewrite ? newsCheck.length : 0}`,
  );

  let generated = 0;
  let skipped = 0;
  let refreshedFromNews = 0;
  let calm = 0;

  // Live layers + briefing prose — built ONCE, BEFORE the brief loop, so each briefing can
  // read FRESH event/developing pins (this run, not last) and ground its body in real
  // reporting. The SINGLE publisher-RSS fetch (`rssPool`, pulled up at the top of the run
  // for the story layer's footprint + coverage bridge) is REUSED here for the Developing
  // strip's clustering and the snippet layer's excerpts — never fetched twice.
  // pinToMarkets/pinEventsToMarkets read only pre-briefing fields (status/title/favored),
  // so pinning here is safe.
  let breaking: BreakingItem[] = [];
  let events: EventItem[] = [];
  let resolver: SnippetResolver | undefined;
  if (!config.dryRun) {
    breaking = await fetchBreaking(config, nowIso, rssPool);
    const pinned = pinToMarkets(breaking, markets);
    if (breaking.length) {
      console.log(`Developing: ${breaking.length} cluster(s) | pinned to ${pinned} market(s)`);
    }
    events = await fetchEvents(config, markets, nowIso);
    if (events.length) {
      const live = events.filter((e) => e.status === 'live').length;
      console.log(`Events: ${events.length} (${live} live)`);
    }
    if (config.snippetsEnabled) {
      const snippetPool = snippetPoolFromArticles(rssPool);
      resolver = makeSnippetResolver(snippetPool, config);
      if (snippetPool.length > 0) {
        console.log(`Snippet pool: ${snippetPool.length} publisher excerpt(s)`);
      }
    }
  }

  // Stories we KNOW changed (new, swung, or idle past the backstop) → rewrite.
  for (const m of regen) {
    // A digest (a folded prop rep or a sports line) is NEVER briefed — its crowd
    // number rides the feed as an "On the board" row with NO Groq spent. This is the
    // budget win of the story layer: the catalog folds out before it costs a call.
    if (m.format === 'digest') {
      skipped++;
      continue;
    }
    const outcome = await generateFor(m, today, nowIso, undefined, resolver);
    if (outcome === 'ok') {
      generated++;
      console.log(
        `  ✓ ${m.title} ${m.grounded ? `(${m.sources.length} sources)` : '(ungrounded)'}`,
      );
    } else {
      skipped++;
    }
    if (!config.dryRun) await sleep(config.requestDelayMs);
  }

  // Calm stories due a coverage re-check → fetch headlines and rewrite ONLY when
  // genuinely new reporting appeared; otherwise just reset the re-check clock (no
  // Groq spent). Stops once the per-run generation budget is exhausted.
  if (canRewrite) {
    for (const m of newsCheck) {
      if (generated >= config.generateLimit) break; // no budget left this run
      // fetchMarketHeadlines (not bare fetchHeadlines) so an over-specific title gets
      // the same broaden-on-empty retry the generate/regen paths use — otherwise a
      // niche story could never trigger a coverage rewrite here.
      const headlines = await fetchMarketHeadlines(m);
      if (newsChanged(headlines, m.sources)) {
        // The story genuinely advanced AND the reader has the basics already (it had a
        // prior briefing) → switch the desk to 'update' so the lead opens on what's new
        // instead of re-running the evergreen background.
        if (m.generatedAt) m.format = 'update';
        const outcome = await generateFor(m, today, nowIso, headlines, resolver);
        if (outcome === 'ok') {
          generated++;
          refreshedFromNews++;
          console.log(`  ✦ ${m.title} (new coverage · ${m.sources.length} sources)`);
        } else {
          skipped++;
        }
        await sleep(config.requestDelayMs);
      } else {
        // Calm: reset the re-check clock only. Do NOT touch updatedAt — nothing was
        // rewritten, and updatedAt is the "Latest" sort key (src/lib/feed.ts), so
        // bumping it would resurface every unchanged story to the top of the feed
        // every run ("same story keeps reappearing"). checkedAt is the re-check clock.
        m.checkedAt = nowIso;
        calm++;
      }
    }
  }
  console.log(
    `  (rewrites from new coverage: ${refreshedFromNews} | unchanged on re-check: ${calm})`,
  );

  // Final result pass: a market that just settled gets ONE past-tense result
  // article (event-first, with the crowd verdict). Bounded + oldest-settle first
  // so a backlog drains across runs; only while the result is still fresh enough
  // to have coverage. Independent of the regen budget (resolutions are rare).
  let results = 0;
  if (canRewrite) {
    for (const m of pendingResults(markets, nowMs)) {
      if ((await generateResult(m, today, nowIso, resolver)) === 'ok') {
        results++;
        console.log(
          `  ⚑ RESULT: ${m.hook} (crowd ${m.calledCorrectly ? 'called it' : 'missed it'})`,
        );
      }
      await sleep(config.requestDelayMs);
    }
    if (results > 0) console.log(`Result articles written this run: ${results}`);
  }

  // (Developing + Events were built and pinned before the brief loop, above, so briefings
  // could read them; `breaking`/`events` carry through to the feed here.)
  const feed = writeOutputs(markets, nowIso, config, breaking, decisions, events);
  // OG cards are best-effort: never let them block the critical syndication
  // surface (RSS, sitemaps, article/hub pages). On failure, fall back to /og.png.
  let ogSlugs = new Set<string>();
  try {
    ogSlugs = await writeOgImages(feed, config); // per-story OG cards (offline raster)
  } catch (err) {
    console.warn(
      `OG image step failed; stories fall back to /og.png: ${err instanceof Error ? err.message : err}`,
    );
  }
  writeSyndication(feed, config, nowMs, ogSlugs); // RSS + sitemaps + hubs + article pages

  // Brand-new INDEXABLE pages this run = stories that just earned their first
  // /s/ page (real briefing, not noindex single-match sports) and so don't exist
  // on the live site yet. Surfaced to the CI deploy gate ($GITHUB_OUTPUT): the
  // market-hours data-only tier flips to build+deploy ONLY when this is > 0, so a
  // story that breaks mid-session reaches Google News + its share link promptly
  // instead of waiting for the next build tier — without paying a build on the
  // (common) runs that produce no new pages. No-op locally (no $GITHUB_OUTPUT).
  const newPages = feed.markets.filter((m) => indexable(m) && !priorIndexable.has(m.id)).length;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `new_static_pages=${newPages}\n`);
  }

  const active = feed.markets.filter((m) => m.status === 'active').length;
  const briefed = feed.markets.filter((m) => m.generatedAt).length;
  console.log(
    `Done. generated=${generated} skipped=${skipped} new-pages=${newPages} | ` +
      `active=${active} resolved=${feed.markets.length - active} briefed=${briefed}`,
  );

  // Operations telemetry (best-effort): snapshot LLM usage + run health, persist to Supabase
  // for the admin Operations console, and alert on a Gemini availability transition. Wrapped
  // so observability can never break the run.
  try {
    const llm = getLlmStats();
    const gemini = llm.filter((u) => u.provider === 'gemini');
    const geminiTried = gemini.reduce((n, u) => n + u.requests, 0);
    const geminiOk = gemini.reduce((n, u) => n + u.ok, 0);
    await recordPipelineRun({
      at: new Date().toISOString(),
      durationMs: Date.now() - nowMs,
      generated,
      skipped,
      refreshed: refreshedFromNews,
      results,
      newPages,
      active,
      resolved: feed.markets.length - active,
      briefed,
      candidates: candidates.length,
      stories: stories.length,
      llm,
      geminiDown: config.geminiKeys.length > 0 && geminiTried > 0 && geminiOk === 0,
      sourceErrors: getFetchErrors(),
      commit: (process.env.GITHUB_SHA || '').slice(0, 7),
      runId: process.env.GITHUB_RUN_ID || '',
    });
  } catch (err) {
    console.warn(`Operations telemetry skipped: ${err instanceof Error ? err.message : err}`);
  }
}

// Run only when invoked as the entrypoint (so tests can import the pure helpers
// above without kicking off a live pipeline run).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
