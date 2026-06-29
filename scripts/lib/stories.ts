/**
 * The STORY layer — the assignment-desk's editor. Crowdtells is a news platform that
 * uses prediction markets as a tip sheet, so the raw market list is the WRONG unit:
 * one real-world development (US-Iran de-escalation) trades as a dozen separate
 * contracts (the nuclear deal, the Hormuz reopening, the MoU text, the troop entry),
 * and recurring betting props (the rolling "Elon Musk # tweets <range>" series, the
 * daily "Oil Price on <date>", every "<A> vs. <B> - Total Corners" sub-line) flood the
 * feed with non-news. This module folds that catalog into STORIES:
 *
 *   1. collapseProps — recurring/intraday/sub-event props collapse to ONE representative
 *      each (highest-volume), the rest folded out as digest members.
 *   2. clusterMarkets — the remaining standing markets union-find into stories on a
 *      CONSERVATIVE shared-entity rule (>=2 distinctive tokens links directly; a single
 *      shared token or a news-coverage bridge is only a CANDIDATE, confirmed by an
 *      injected adjudicator and never fused on entity-overlap alone).
 *   3. pickLead / composeSubSignals — the broadest, longest-dated facet leads the story;
 *      the rest become render-time SubSignals (the crowd's read across every angle).
 *   4. assignFormat — the story's lifecycle + news footprint pick its editorial desk.
 *
 * Pure + dependency-injected by construction: no network, no Groq, no DB. Token work
 * reuses `salientTokens` (the same alias-normalized tokenizer the Developing layer and
 * cross-platform merge use, so there is ONE notion of "the distinctive words of a
 * title"); the sports guard reuses `isSportsCategory`. The borderline adjudicator and
 * the news-coverage clusters are passed IN, so this file stays unit-testable and the
 * LLM/relevance policy lives at the call site (generate.ts).
 */
import type { MarketSource, StoryFormat, SubSignal } from '../../src/lib/types';
import type { ShapedMarket } from './shaped';
import { salientTokens } from './breaking';
import { isSportsCategory } from './category';

// ── 1. Prop classification ────────────────────────────────────────────────────

/** What KIND of foldable prop a title is, plus the grouping key that collapses its
 * siblings to one. `null` from propShape means "a normal, briefable market". */
export interface PropShape {
  /** 'recurring-series' (a rolling date-stamped series), 'daily-price' (a single-day or
   * end-of-period price/level prop), or 'sub-event' (a Polymarket child contract of a
   * parent match, e.g. "<A> vs. <B> - Total Corners"). */
  shape: 'recurring-series' | 'daily-price' | 'sub-event';
  /** The key all siblings of this prop share, so collapseProps groups them: the parent
   * match for a sub-event, the date-masked stem for a recurring series, the
   * entity+direction+period stem for a daily price. */
  key: string;
}

// Polymarket child-contract suffixes: a title ending " - <suffix>" is a finer line on a
// parent event (a football match, mostly), never its own story. Longest-first so
// "Correct Score" matches before "Score" and "Over 2.5" before a bare "Over". The
// "over X.5" rung is matched by regex below (the literal list can't carry the number).
const SUB_EVENT_SUFFIXES = [
  'both teams to score',
  'first goalscorer',
  'anytime scorer',
  'half time',
  'correct score',
  'total corners',
  'exact score',
  'more markets',
  'top scorer',
  'handicap',
  'corners',
  'winner',
  'cards',
];

/** A trailing " - <suffix>" that marks a Polymarket sub-contract, or null. Returns the
 * parent title (everything before the final " - <suffix>"), lowercased + trimmed, so all
 * the children of one match share a key. The over/under rung ("- Over 2.5") is handled
 * via its own pattern since the threshold varies. */
function subEventParent(title: string): string | null {
  const idx = title.lastIndexOf(' - ');
  if (idx < 0) return null;
  const suffix = title.slice(idx + 3).trim().toLowerCase();
  const hit =
    SUB_EVENT_SUFFIXES.includes(suffix) ||
    /^(over|under) \d+(\.\d+)?$/.test(suffix); // "Over 2.5", "Under 9.5"
  return hit ? title.slice(0, idx).trim().toLowerCase() : null;
}

// Month names (full + the abbreviations Polymarket mixes in), for masking dates out of a
// recurring-series title down to a stable stem. Order-insensitive (used in a set/regex).
const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december' +
  '|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const MONTH_RE = new RegExp(`\\b(?:${MONTHS})\\b`, 'gi');
// dateStem's two month-interpolated patterns, hoisted to module scope so they're compiled
// ONCE — dateStem is called O(N²) by the recurring-series sibling scan, so a per-call
// `new RegExp` here recompiles the same pattern millions of times. Global (`gi`) but used
// ONLY via String.replace (which resets lastIndex), exactly like MONTH_RE — so reuse is safe.
const DATE_RANGE_RE = new RegExp(
  `\\b(?:${MONTHS})\\b\\.?\\s+\\d{1,2}\\s*[-–—]\\s*(?:(?:${MONTHS})\\b\\.?\\s+)?\\d{1,2}`,
  'gi',
);
const SINGLE_DATE_RE = new RegExp(`\\b(?:${MONTHS})\\b\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?`, 'gi');

// Per-title memo. dateStem is pure (a string→string mask) but the recurring-series sibling
// scan re-stems EVERY title once per date-stamped title — O(N²) calls of the SAME stems, the
// single biggest CPU cost of the fold at scale. Keyed by the exact title; the result is an
// immutable string so caching is unconditionally safe. Bounded by the run's distinct titles.
const dateStemMemo = new Map<string, string>();

/** Collapse the DATE-VARYING part of a title to a constant placeholder so a rolling
 * series ("Elon Musk # tweets June 22 - June 24, 2026?" and its nine siblings) reduces to
 * one shared stem. Masks, in order: explicit date ranges ("Jun 22 - Jun 24"), single
 * "<Month> <D>" dates, bare 4-digit years, and any leftover lone month name — then
 * collapses whitespace. Deterministic and lossy by design (that's the point). Memoized. */
function dateStem(title: string): string {
  const cached = dateStemMemo.get(title);
  if (cached !== undefined) return cached;
  const stem = title
    .toLowerCase()
    // "<Mon> <D> - <Mon> <D>" or "<Mon> <D>-<D>" ranges → one token. Run BEFORE the
    // single-date mask so a range collapses as a unit (not two single dates + a dash).
    .replace(DATE_RANGE_RE, '<daterange>')
    // single "<Month> <D>" (optionally "<D>th"), and ISO-ish "<D>/<D>" tails
    .replace(SINGLE_DATE_RE, '<date>')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '<date>')
    .replace(/\b(?:19|20)\d{2}\b/g, '<year>') // bare year
    .replace(MONTH_RE, '<month>') // any lone leftover month
    .replace(/[^a-z0-9<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  dateStemMemo.set(title, stem);
  return stem;
}

// A daily-price / level prop reads about a known market subject. Entities are matched as
// whole words so "soil" can't trip "oil"; "s&p" is matched separately (the & is stripped
// by the word boundary otherwise).
const PRICE_ENTITY_RE = /\b(price|oil|wti|crude|btc|bitcoin|eth|ether|silver|gold|nasdaq|s&p|spx|dow|crypto|net worth|temperature)\b/i;
// A single calendar date in the title: "on Jun 23", "by end of June", "on June 30".
const ON_DATE_RE = new RegExp(`\\bon (?:${MONTHS})\\w*\\.?\\s+\\d{1,2}`, 'i');
const PERIOD_RE = new RegExp(`\\b(?:on|by end of|by)\\b`, 'i');

/** A daily-price / hit-$X-by stem (entity + direction + period, date masked out), or null.
 * Conservative: only fires on a clear "<subject> ... on <date>" or "<subject> ... hit $X by
 * <period>" shape, so a one-off "Bitcoin above $150k by December?" standing market is NOT
 * swept up — only the rolling daily/period rungs collapse. */
function dailyPriceStem(title: string): string | null {
  const hasOnDate = ON_DATE_RE.test(title); // "Oil Price (WTI) on Jun 23, 2026?"
  const hasPriceWord = PRICE_ENTITY_RE.test(title);
  const dollarOrLevel = /\$\s*[\d_]/.test(title) || /\bhit\b/i.test(title) || /\babove\b|\bbelow\b/i.test(title);
  const periodic = PERIOD_RE.test(title);
  // Either a literal "on <Month> <day>" date (the daily series), OR a price subject paired
  // with a period word AND a $/level (the "hit $X by end of <period>" rung). Both shapes
  // are date/level-specific rungs of one underlying question.
  if (!(hasOnDate || (hasPriceWord && periodic && dollarOrLevel))) return null;
  // Stem = the title with the date AND any explicit money level masked out, so "$70 by end
  // of June" and a hypothetical "$75 by end of July" of the SAME subject share a key.
  const stem = dateStem(title)
    .replace(/\$\s*[\d_][\d_,]*(?:\.\d+)?\s*[kmb]?\b/gi, '<level>')
    .replace(/\b(?:end of|by)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stem || null;
}

/**
 * Classify a market as a foldable prop, or null if it's a normal briefable question.
 * Checked in order — sub-event, then recurring-series, then daily-price — because the
 * checks shade into each other (a date-stamped sub-line is a sub-event first). A title
 * is a recurring-series only if its date-masked stem actually REPEATS across
 * `allTitles` (>=2 share it): a lone date-stamped title with no siblings is a normal
 * one-off market, not a series.
 */
export function propShape(title: string, allTitles: string[]): PropShape | null {
  // sub-event — a Polymarket child contract of a parent match.
  const parent = subEventParent(title);
  if (parent) return { shape: 'sub-event', key: parent };

  // recurring-series — a date-stamped title whose stem repeats on the board.
  const stem = dateStem(title);
  if (stem.includes('<daterange>') || stem.includes('<date>') || stem.includes('<year>') || stem.includes('<month>')) {
    let siblings = 0;
    for (const other of allTitles) {
      if (dateStem(other) === stem) {
        siblings++;
        if (siblings >= 2) break; // self + >=1 other
      }
    }
    if (siblings >= 2) return { shape: 'recurring-series', key: stem };
  }

  // daily-price — a single-day or end-of-period price/level prop.
  const price = dailyPriceStem(title);
  if (price) return { shape: 'daily-price', key: `price:${price}` };

  return null;
}

// ── 2. Prop collapse ──────────────────────────────────────────────────────────

/** Stable sort by volume desc, id asc — so a tied pair always orders the same way and the
 * "representative" / "lead" picks are reproducible across runs. */
function byVolumeDescIdAsc(a: ShapedMarket, b: ShapedMarket): number {
  return b.volume - a.volume || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Group the markets by prop key, keep ONE representative per group (highest volume), and
 * fold the rest. `survivors` is every non-prop market plus each group's representative, in
 * a deterministic order; `folded` maps a representative's id → its absorbed siblings, so
 * the caller can attach them as sub-signals / digest members. Pure. */
export function collapseProps(markets: ShapedMarket[]): {
  survivors: ShapedMarket[];
  folded: Map<string, ShapedMarket[]>;
} {
  const allTitles = markets.map((m) => m.title);
  const groups = new Map<string, ShapedMarket[]>();
  const survivors: ShapedMarket[] = [];
  const folded = new Map<string, ShapedMarket[]>();

  for (const m of markets) {
    const shape = propShape(m.title, allTitles);
    if (!shape) {
      survivors.push(m); // a normal market — passes through untouched
      continue;
    }
    const bucket = groups.get(shape.key);
    if (bucket) bucket.push(m);
    else groups.set(shape.key, [m]);
  }

  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      // A prop with no siblings this run isn't worth folding — it stands alone.
      survivors.push(bucket[0]!);
      continue;
    }
    const sorted = [...bucket].sort(byVolumeDescIdAsc);
    const [rep, ...rest] = sorted;
    survivors.push(rep!);
    folded.set(rep!.id, rest);
  }

  survivors.sort(byVolumeDescIdAsc);
  return { survivors, folded };
}

// ── 3. Distinctive tokens + clustering ─────────────────────────────────────────

// Tokens that survive salientTokens but carry NO story identity in a market title — pure
// scaffolding/outcome words, calendar tokens (months/years already pass the breaking
// stoplist), and bare directions. Removed before clustering so two unrelated date-stamped
// questions can't fuse on a shared "june"/"2026", and a generic "will/next/who" can't link
// anything. (salientTokens already drops most scaffolding; this is the clustering-specific
// extra layer.)
const GENERIC = new Set(
  (
    'yes no tie draw will next which who whom whose by for the and not any all per via ' +
    'above below over under hit reach price level total point points value range high low ' +
    'higher lower more less above record date day days week weeks month months year years ' +
    'january february march april may june july august september october november december ' +
    'jan feb mar apr jun jul aug sep sept oct nov dec ' +
    '2024 2025 2026 2027 2028 2029 2030 ' +
    // Election/contest PROCESS vocabulary — present in dozens of unrelated races, so two
    // different elections must not chain together on "primary"+"margin"+"victory". The
    // distinctive ENTITY (a place/person/party name) is what actually identifies the race
    // and survives this layer; these procedural words do not. (Real-data validation caught
    // an 8-market false-fusion blob — NY primaries + Brazil + Colombia + S. Carolina —
    // chaining transitively through exactly these tokens, with NO token common to all.)
    'primary winner margin victory runoff election presidential governor democratic ' +
    'republican nominee nomination ballot vote votes candidate race seat district'
  ).split(/\s+/),
);

// A short (len 2-3) token is normally dropped as non-distinctive, EXCEPT these known
// short entities (country/league/asset/agency codes) that genuinely identify a story.
const SHORT_ENTITIES = new Set([
  'btc', 'eth', 'sol', 'xrp', 'doge', 'fed', 'cpi', 'gdp', 'ecb', 'boj', 'imf', 'opec',
  'nba', 'nfl', 'nhl', 'mlb', 'ufc', 'wnba', 'epl', 'mls', 'nato', 'gop',
  'usa', 'uae', 'iran', 'gaza', 'ukraine', 'russia', 'china', 'nyc',
  'trump', 'biden', 'putin', 'musk', 'xi',
]);

// Per-title memo. distinctive() is a pure function of the title and is recomputed many
// times for the SAME title across one run (footprintFor per survivor, clusterMarkets'
// `toks`, buildGroup's `sets`, pickLead's comparator, assembleStoryLeads' isProp), so a
// single-shot run re-tokenizes each title ~10× without this. Keyed by the exact title
// string; the cached Set is returned directly — every caller treats it as read-only (it is
// only iterated / counted / spread / copied via `new Set(...)`, never mutated). Bounded by
// the run's distinct-title count and lives only for the one process; no eviction needed.
const distinctiveMemo = new Map<string, Set<string>>();

/** The story-identifying tokens of a market title: salientTokens minus the GENERIC layer,
 * keeping a token when it is len>=4 OR a known short entity. This is the unit ALL of the
 * clustering decisions count overlap in. Memoized per title (pure; see distinctiveMemo). */
export function distinctive(title: string): Set<string> {
  const cached = distinctiveMemo.get(title);
  if (cached) return cached;
  const out = new Set<string>();
  for (const t of salientTokens(title)) {
    if (GENERIC.has(t)) continue;
    if (t.length >= 4 || SHORT_ENTITIES.has(t)) out.add(t);
  }
  distinctiveMemo.set(title, out);
  return out;
}

/** Count shared members of two sets (the smaller is iterated). */
function overlap(a: Set<string>, b: Set<string>): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const t of small) if (big.has(t)) n++;
  return n;
}

/** A news-coverage cluster (passed in from the Developing layer): the salient tokens of a
 * corroborated event and the outlet domains covering it. Only clusters with >=2 distinct
 * outlets are trusted as a corroboration bridge. */
export interface NewsClusterRef {
  tokens: Set<string>;
  outlets: string[];
}

/** A clustered story: the lead facet, all member markets (lead included), and the
 * distinctive tokens common to EVERY member (the story's identity). */
export interface StoryGroup {
  storyId: string;
  lead: ShapedMarket;
  members: ShapedMarket[];
  sharedTokens: string[];
}

interface ClusterOpts {
  /** Corroborated news clusters, for the coverage-bridge candidate rule. */
  newsClusters?: NewsClusterRef[];
  /** Wall-clock now, for pickLead's undated→far-future tie-break. */
  nowMs: number;
  /** Confirms a BORDERLINE candidate pair (1 shared token, or a coverage bridge). When
   * absent (tests / entity-only dry runs) borderlines are NEVER fused — the conservative
   * default. */
  adjudicate?: (a: ShapedMarket, b: ShapedMarket) => Promise<boolean>;
  /** Cap on adjudicator calls per run (cost guard). */
  adjudicateMax?: number;
}

/** A minimal union-find over market indices, for assembling clusters from pairwise links. */
class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[i] !== root) {
      const next = this.parent[i]!;
      this.parent[i] = root;
      i = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/**
 * CONSERVATIVE union-find clustering of standing markets into stories.
 *
 * Sports/esports are SKIPPED — they fold to digests elsewhere, so each sports market
 * returns as its own singleton group (never clustered: a shared "vs." or city name must
 * not braid two different matches into one "story").
 *
 * For the rest, links are formed at two confidence tiers:
 *   • DIRECT (no LLM): two markets share >=2 distinctive tokens → union immediately. This
 *     is the high-precision rule (e.g. the two "Strait of Hormuz traffic" markets share
 *     hormuz+strait+traffic+normal).
 *   • BORDERLINE (needs confirmation): they share EXACTLY 1 distinctive token, OR a
 *     coverage bridge — both markets each share >=2 distinctive tokens with the SAME
 *     corroborated (outlets>=2) news cluster while sharing <2 tokens with each other.
 *     These are only CANDIDATES; sorted most-overlapping first, up to `adjudicateMax`
 *     (default 8) are confirmed via `adjudicate` and unioned only on `true`. With no
 *     adjudicator, none of them fuse.
 *
 * Two markets that share zero distinctive tokens and no corroborated bridge are NEVER
 * unioned. Each resulting component is a StoryGroup; its sharedTokens are the tokens
 * common to ALL members (sorted), its storyId is derived from those (or the lead's
 * distinctive tokens for a singleton), and its lead is pickLead(members).
 */
export async function clusterMarkets(
  markets: ShapedMarket[],
  opts: ClusterOpts,
): Promise<StoryGroup[]> {
  const adjudicateMax = opts.adjudicateMax ?? 8;
  const news = (opts.newsClusters ?? []).filter((c) => c.outlets.length >= 2);

  // Sports/esports never cluster — set aside as forced singletons.
  const singletons: ShapedMarket[] = [];
  const pool: ShapedMarket[] = [];
  for (const m of markets) {
    if (isSportsCategory(m.category)) singletons.push(m);
    else pool.push(m);
  }

  const toks = pool.map((m) => distinctive(m.title));
  const uf = new UnionFind(pool.length);

  // Pass 1 — DIRECT links (>=2 shared distinctive tokens). Also collect 1-token candidate
  // pairs for the borderline pass.
  interface Candidate {
    i: number;
    j: number;
    score: number; // ordering weight (more shared / corroborated first)
    reason: 'token' | 'bridge';
  }
  const candidates: Candidate[] = [];
  // Per-market: which corroborated news clusters it strongly matches (>=2 tokens) — for
  // the coverage bridge. Computed once.
  const newsHits: number[][] = pool.map((_, i) =>
    news.flatMap((c, ci) => (overlap(toks[i]!, c.tokens) >= 2 ? [ci] : [])),
  );

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const shared = overlap(toks[i]!, toks[j]!);
      if (shared >= 2) {
        uf.union(i, j); // direct, high-confidence
      } else if (shared === 1) {
        candidates.push({ i, j, score: 100, reason: 'token' }); // 1 shared token
      } else {
        // shared === 0: a coverage bridge only if both hit the SAME corroborated cluster.
        const sharedCluster = newsHits[i]!.some((ci) => newsHits[j]!.includes(ci));
        if (sharedCluster) candidates.push({ i, j, score: 50, reason: 'bridge' });
      }
    }
  }

  // Pass 2 — BORDERLINE confirmation. Most-overlapping first (1-token pairs before bridge
  // pairs), then by index for determinism. Skip pairs already unioned transitively.
  candidates.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
  if (opts.adjudicate) {
    let used = 0;
    for (const c of candidates) {
      if (used >= adjudicateMax) break;
      if (uf.find(c.i) === uf.find(c.j)) continue; // already linked via another path
      used++;
      if (await opts.adjudicate(pool[c.i]!, pool[c.j]!)) uf.union(c.i, c.j);
    }
  }
  // (no adjudicator → borderlines are dropped; conservative default)

  // Assemble components.
  const comps = new Map<number, ShapedMarket[]>();
  for (let i = 0; i < pool.length; i++) {
    const root = uf.find(i);
    const arr = comps.get(root);
    if (arr) arr.push(pool[i]!);
    else comps.set(root, [pool[i]!]);
  }

  const groups: StoryGroup[] = [];
  for (const members of comps.values()) {
    groups.push(buildGroup(members, opts.nowMs));
  }
  // Each sports market is its own story (forced singleton).
  for (const m of singletons) {
    groups.push(buildGroup([m], opts.nowMs));
  }
  // Deterministic group order: by lead id.
  groups.sort((a, b) => (a.lead.id < b.lead.id ? -1 : a.lead.id > b.lead.id ? 1 : 0));
  return groups;
}

/** Build a StoryGroup from a finished component: shared tokens common to all members, a
 * derived storyId, and the elected lead. */
function buildGroup(members: ShapedMarket[], nowMs: number): StoryGroup {
  const lead = pickLead(members, nowMs);
  // sharedTokens = distinctive tokens present in EVERY member.
  const sets = members.map((m) => distinctive(m.title));
  let shared = new Set<string>(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    const next = new Set<string>();
    for (const t of shared) if (sets[i]!.has(t)) next.add(t);
    shared = next;
  }
  const sharedTokens = [...shared].sort();
  const idTokens = sharedTokens.length ? sharedTokens : [...distinctive(lead.title)].sort();
  return { storyId: storyIdFor(idTokens), lead, members, sharedTokens };
}

// ── 4. Lead election ────────────────────────────────────────────────────────

const FAR_FUTURE = Number.MAX_SAFE_INTEGER;

/** Elect the story's lead: the BROADEST, most durable facet. Prefers the FEWEST
 * distinctive tokens (the most general question — "US-Iran nuclear deal" over "Strait of
 * Hormuz 20+ ships by June 30"), then the latest endDate (an undated/open question sorts
 * as far-future, i.e. most durable), then highest volume, then id. Fully deterministic.
 */
export function pickLead(members: ShapedMarket[], nowMs = Date.now()): ShapedMarket {
  void nowMs; // reserved for future recency weighting; undated already sorts far-future
  return [...members].sort((a, b) => {
    const da = distinctive(a.title).size;
    const db = distinctive(b.title).size;
    if (da !== db) return da - db; // fewest distinctive tokens = broadest question
    const ea = a.endDate ? Date.parse(a.endDate) : FAR_FUTURE;
    const eb = b.endDate ? Date.parse(b.endDate) : FAR_FUTURE;
    const eav = Number.isFinite(ea) ? ea : FAR_FUTURE;
    const ebv = Number.isFinite(eb) ? eb : FAR_FUTURE;
    if (eav !== ebv) return ebv - eav; // latest end date = most durable
    if (a.volume !== b.volume) return b.volume - a.volume; // most-traded
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0]!;
}

// ── 5. Sub-signals ────────────────────────────────────────────────────────────

/** Map every member EXCEPT the lead to a render-time SubSignal (the crowd's read across
 * the story's other facets), volume-sorted, capped at 8 — the panel size on the article.
 * Numbers ride along for the chip; the briefing prompt stays number-blind. */
export function composeSubSignals(lead: ShapedMarket, members: ShapedMarket[]): SubSignal[] {
  return members
    .filter((m) => m.id !== lead.id)
    .sort(byVolumeDescIdAsc)
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      title: m.title,
      source: m.source as MarketSource,
      favored: m.favored,
      oddsPct: m.oddsPct,
      movement24h: m.movement24h,
      volume: m.volume,
      marketUrl: m.marketUrl,
    }));
}

// ── 6. Format assignment ────────────────────────────────────────────────────

/** Pick the editorial desk for a story from its lifecycle + news footprint (see
 * StoryFormat). A folded prop is always a 'digest'; a settled market is a 'result'; a
 * never-before-briefed story with thin coverage is an 'explainer' (>=2 corroborating
 * outlets makes even a new story a 'feature'); a story that genuinely advanced since last
 * time is an 'update'; otherwise the evergreen 'feature'. Pure. */
export function assignFormat(input: {
  isProp: boolean;
  isDecided: boolean;
  hasPriorBriefing: boolean;
  advancedSinceLast: boolean;
  newsFootprint: number;
}): StoryFormat {
  if (input.isProp) return 'digest';
  if (input.isDecided) return 'result';
  if (!input.hasPriorBriefing && input.newsFootprint < 2) return 'explainer';
  if (input.advancedSinceLast) return 'update';
  return 'feature';
}

// ── 7. Stable story id ────────────────────────────────────────────────────────

/** A stable, dependency-free short id for a story, derived from its sorted distinctive
 * tokens — NOT a market id, so the story (and its living-record odds curve) survives the
 * lead market being re-elected when one facet resolves. Order-independent (tokens are
 * sorted) and deterministic across runs via a 32-bit FNV-1a hash, rendered as 8 hex
 * chars: `st_<8hex>`. An empty token set hashes the empty string to the FNV-1a offset
 * basis — a fixed, stable sentinel (`st_811c9dc5`). */
export function storyIdFor(tokens: string[]): string {
  const key = [...tokens].sort().join('|');
  // FNV-1a 32-bit — tiny, deterministic, no crypto import. >>> 0 keeps it unsigned.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `st_${(h >>> 0).toString(16).padStart(8, '0')}`;
}
