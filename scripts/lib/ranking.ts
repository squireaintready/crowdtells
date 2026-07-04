import type { ShapedMarket } from './shaped';
import type { Config } from './config';
import { isSportsCategory } from './category';

/**
 * Newsworthiness ranking — which markets earn a place in the feed, and in what
 * order the reader sees them.
 *
 * AXIS ORDER (news-led, not money-led). This deck is a NEWSROOM whose assignment
 * desk happens to be a prediction market — the money flags what's worth covering,
 * it does NOT decide the front page. So the score is built in this priority:
 *
 *   1. NEWS FOOTPRINT (primary). How many DISTINCT outlets are actually covering
 *      this story right now (m.newsFootprint, stamped upstream). Real-world
 *      corroboration is the dominant term: a story four outlets are reporting
 *      beats a prop a thousand wallets are trading but no desk has touched.
 *   2. ODDS MOVEMENT (breaking backstop). A sharp 24h swing can still surface a
 *      market BEFORE coverage arrives — the crowd often moves first — so a big
 *      move carries real weight even at footprint 0. This is the one path by
 *      which a no-coverage market still earns a slot.
 *   3. SECONDARY editorial modifiers — contestedness, discussion, and imminent
 *      resolution of a long-standing question — nudge, they don't dominate.
 *   4. VOLUME is a DAMP-ONLY GATE (LIQUIDITY_GATE). A deep-liquid market isn't
 *      penalized; a near-zero-volume one is softly discounted (thin markets are
 *      noisier). Money can MULTIPLY a score DOWN but can NEVER push a no-news
 *      market above a well-covered one — the inversion the old volume-anchored
 *      score caused, where a $1M "Elon tweet count" prop outranked real news.
 *
 * The score is persisted on each market so the client orders by it instead of
 * re-deriving a weaker single-axis sort.
 */
const YEAR_MS = 365 * 24 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * The live figures the score reads. Mostly a Pick of ShapedMarket, intersected
 * with the two STORY-LAYER fields the generator stamps onto each market BEFORE
 * ranking — they live on Market (src/lib/types.ts) but not on the leaner
 * ShapedMarket interface, so we declare them here (optional) to read them without
 * widening ShapedMarket. Both default to "absent" → footprint 0, no led-dip.
 */
type Scorable = Pick<
  ShapedMarket,
  | 'volume'
  | 'volume24h'
  | 'oddsPct'
  | 'movement24h'
  | 'comments'
  | 'endDate'
  | 'openInterest'
  | 'category'
  | 'startDate'
  | 'format'
> & {
  /** Count of distinct corroborating outlet domains covering this story (0 if none). */
  newsFootprint?: number;
  /** ISO time this story last held a feed slot, for the churn dip (absent until it leads). */
  lastLedAt?: string;
  /** ISO time this story's current continuous feed run began, for the evergreen-fatigue
   * decay (absent until it first leads; reset when it drops out and returns). */
  firstLedAt?: string;
};

// ── News-led score weights ───────────────────────────────────────────────────
// Footprint and a big move dominate; the rest are gentle modifiers. Env-overridable
// so the desk can retune without a deploy.
const NEWS_W = Number(process.env.RANK_NEWS_W ?? 1.0); // outlet corroboration — the primary axis
const MOVE_W = Number(process.env.RANK_MOVE_W ?? 0.7); // 24h swing — the breaking backstop
const BUZZ_W = Number(process.env.RANK_BUZZ_W ?? 0.3); // discussion
const RESOLVE_W = Number(process.env.RANK_RESOLVE_W ?? 0.35); // a long-standing question resolving
const CONTEST_W = Number(process.env.RANK_CONTEST_W ?? 0.25); // a genuinely live (near-50/50) call
// Digests (folded props + sports lines, format:'digest') are never briefed and must never
// outrank real reporting: a prop's odds SWING is not pending news, so the breaking backstop
// would otherwise lift an Elon-tweet-count series above the Iran story. Damp the final score
// hard so the whole digest tier sits BELOW the news as "on the board" rows.
const DIGEST_DAMP = Number(process.env.RANK_DIGEST_DAMP ?? 0.3);

// Outlet count that SATURATES the footprint term (footprintTerm reaches 1 here).
// Eight independent desks on one story is "fully corroborated, major".
const FOOTPRINT_SAT = Number(process.env.RANK_FOOTPRINT_SAT ?? 8);

const MOVE_NORM = Number(process.env.RANK_MOVE_NORM ?? 25); // a 25-pt 24h swing saturates the move term

// Liquidity damp gate: score is multiplied by this 0.5..1 factor. LIQ_FULL is the
// 24h volume at which there's NO damp (gate = 1); below it the gate falls toward
// LIQ_FLOOR (a thin market keeps half its earned, news-driven score — softly
// discounted for noise, never zeroed, and the gate can only ever pull DOWN).
const LIQ_FULL = Number(process.env.RANK_LIQ_FULL ?? 1e6);
const LIQ_FLOOR = Number(process.env.RANK_LIQ_FLOOR ?? 0.5);

// Recency tilt: a small, fast-decaying lift for recently-OPENED markets so the Top
// view turns over with new stories instead of ossifying on long-established ones.
// Floors at 1 (never penalizes an old-but-major market) and is excluded for sports —
// they're already imminence-damped, and a routine fresh kickoff isn't news. This is
// the SINGLE recency signal: it lives in the score, so the client reads it via m.score
// rather than re-applying its own.
const FRESH_MAX = 0.15; // +15% on a just-opened non-sports market, → 1 as it ages
const FRESH_HALFLIFE_DAYS = 12;
function openFreshness(category: string, startDate: string | null, nowMs: number): number {
  if (isSportsCategory(category) || !startDate) return 1;
  const t = Date.parse(startDate);
  if (!Number.isFinite(t)) return 1;
  const days = (nowMs - t) / DAY_MS;
  if (days <= 0) return 1 + FRESH_MAX;
  return 1 + FRESH_MAX * Math.pow(0.5, days / FRESH_HALFLIFE_DAYS);
}

function surgeShare(m: Scorable): number {
  return m.volume > 0 ? Math.min(m.volume24h / m.volume, 1) : 0;
}

/** 0..1 ramp that rises as resolution nears and fades for far-dated novelty. */
function resolveProximity(endDate: string | null, nowMs: number): number {
  if (!endDate) return 0.3; // unknown horizon → mild
  const days = (Date.parse(endDate) - nowMs) / DAY_MS;
  if (!Number.isFinite(days)) return 0.3;
  if (days <= 0) return 0;
  if (days <= 2) return 1; // resolving within two days → max news value
  if (days >= 365) return 0; // a year+ out → no urgency
  return Math.max(0, 1 - Math.log10(days) / Math.log10(365));
}

// A sports game resolves every single day — an imminent kickoff is the BASELINE,
// not breaking news — so imminent resolution earns much less news credit for sports
// than for a question the world has been waiting on.
const SPORTS_IMMINENCE = 0.3;

/**
 * How long a question has STOOD OPEN, as a 0.25..1 ramp on the imminence bonus.
 * "Resolving soon" is only genuine news when the question has been live for a while
 * and the wait is finally ending. A market opened a couple of days before it settles
 * (a same-week sports game, a daily print) is routine; one open for weeks/months that
 * is now about to resolve is the real signal. An unknown open date → moderate (0.6).
 */
function standingFactor(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0.6;
  const lead = (Date.parse(endDate) - Date.parse(startDate)) / DAY_MS;
  if (!Number.isFinite(lead) || lead <= 3) return 0.25; // opened just before it resolves
  if (lead >= 30) return 1; // a long-standing question finally resolving
  return 0.25 + 0.75 * ((lead - 3) / 27);
}

/**
 * How much "the wait is ending" value imminent resolution actually carries for this
 * market. Sports is damped to a flat baseline (games resolve constantly); everything
 * else scales with how long the question has stood open. This is the lever that stops
 * a routine same-day match from topping Top purely because it kicks off tomorrow.
 */
export function imminenceWeight(
  category: string,
  startDate: string | null,
  endDate: string | null,
): number {
  return isSportsCategory(category) ? SPORTS_IMMINENCE : standingFactor(startDate, endDate);
}

/**
 * Composite newsworthiness score; also the default feed ordering.
 *
 * News-led (see AXIS ORDER at the top of the file): footprint is the primary term
 * and a big odds move is the breaking backstop; the rest are gentle modifiers.
 * Volume enters ONLY as a damp-only gate (liquidityGate) — it can pull a score
 * down for a thin market but can never inflate one, so a well-corroborated story
 * always beats a money-only prop of equal news weight.
 *
 *   base  = NEWS_W·footprint + MOVE_W·move + BUZZ_W·buzz + RESOLVE_W·resolve + CONTEST_W·contested
 *   score = base · liquidityGate · openFreshness
 */
export function newsScore(m: Scorable, nowMs: number): number {
  // Primary axis: how many distinct outlets corroborate the story. log-scaled and
  // normalized so FOOTPRINT_SAT outlets → 1.0; clamped to [0,1].
  const footprint = m.newsFootprint ?? 0;
  const footprintTerm = Math.min(
    1,
    Math.max(0, Math.log10(footprint + 1) / Math.log10(FOOTPRINT_SAT + 1)),
  );
  // Breaking backstop: a sharp 24h swing the crowd made before the desks arrived.
  const move = Math.min(Math.abs(m.movement24h ?? 0) / MOVE_NORM, 1);
  // Secondary modifiers.
  const contested = 1 - Math.abs(m.oddsPct - 50) / 50;
  const buzz = Math.min(Math.log10(m.comments + 1) / 4, 1);
  // Imminence credit, gated so a routine same-day sports game doesn't earn the full
  // "the wait is ending" bonus a long-standing question resolving soon deserves.
  const resolve =
    resolveProximity(m.endDate, nowMs) * imminenceWeight(m.category, m.startDate, m.endDate);

  const base =
    NEWS_W * footprintTerm +
    MOVE_W * move +
    BUZZ_W * buzz +
    RESOLVE_W * resolve +
    CONTEST_W * contested;
  const score = base * liquidityGate(m) * openFreshness(m.category, m.startDate, nowMs);
  // A digest (folded prop / sports line) is demoted below the news tier regardless of how
  // hard its odds moved — a prop's movement is not breaking news.
  return m.format === 'digest' ? score * DIGEST_DAMP : score;
}

/**
 * Damp-only liquidity gate: 0.5..1, multiplied into the final score. A deep-liquid
 * market (≥ LIQ_FULL of 24h volume) is undamped; a near-zero-volume one is softly
 * discounted toward LIQ_FLOOR. Crucially it is bounded ABOVE at 1, so money can only
 * ever pull a score DOWN — never push a no-news market above a well-covered one.
 */
function liquidityGate(m: Scorable): number {
  const ramp = Math.log10(Math.max(m.volume24h, 0) + 1) / Math.log10(LIQ_FULL + 1);
  return Math.min(1, Math.max(LIQ_FLOOR, ramp));
}

/** Reject ephemeral price ticks, illiquid, already-settled, or far-dated markets. */
export function isNewsworthy(m: ShapedMarket, config: Config, nowMs: number): boolean {
  if (m.kind === 'ephemeral') return false; // recurring/intraday price ladder — never news
  // Lifetime volume alone blackballs a JUST-LISTED market that's already trading real
  // money today (its lifetime total hasn't caught up yet) — the exact "trending bet we
  // never covered" gap. Genuine 24h flow (half the lifetime floor in a single day) is
  // at least as strong an activity signal, so either clears the gate.
  if (m.volume < config.minVolume && m.volume24h < config.minVolume / 2) return false;

  // "Settled" only applies to binary Yes/No markets — a 5% leader in a 20-way
  // race is not settled, it's just a wide field.
  const binary = m.favored.toLowerCase() === 'yes' || m.favored.toLowerCase() === 'no';
  const settled = binary && (m.oddsPct >= 98 || m.oddsPct <= 2);
  const quiet = surgeShare(m) < 0.05 && Math.abs(m.movement24h ?? 0) < 1;
  if (settled && quiet) return false; // foregone conclusion with no fresh action

  if (m.endDate) {
    const years = (Date.parse(m.endDate) - nowMs) / YEAR_MS;
    if (years > 3 && m.volume24h < 50_000) return false; // long-dated novelty
  }
  return true;
}

const cmpId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// How hard category-relative leveling pulls, and the bound that keeps it from ever
// dominating the genuine signal. A small, symmetric nudge — not a category blacklist.
const LEVEL_STRENGTH = 0.15;
const LEVEL_CAP = 0.25;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// Sports HARD slot cap. A general-news front page leads with hard news — a
// diplomatic agreement, an election, a market shock — not the sports section, even
// when a World Cup group match out-trades a geopolitical story by an order of
// magnitude. The old soft 0.8× demotion still let sports flood the feed on volume
// alone; this replaces it with a HARD cap on how many sports/esports markets may be
// SELECTED. (Trending, Movers, and the Sports tab order on their own axes and never
// call rankAndSelect, so they're unaffected.) One deliberately-tunable constant.
const SPORTS_SLOT_CAP = Number(process.env.RANK_SPORTS_SLOT_CAP ?? 6);
// A sports market this imminent-and-long-awaited is EXEMPT from the cap — a World Cup
// final resolving inside ~36h is genuine news and shouldn't be capped out behind
// routine tennis lines. Gauged on the (sports-damped) imminence credit, so only a
// long-standing competition about to settle clears the bar, not a daily kickoff.
const SPORTS_EXEMPT_HOURS = Number(process.env.RANK_SPORTS_EXEMPT_HOURS ?? 36);
// …but bound HOW MANY exempt majors may bypass the cap, so a fixture-dense day (ten
// imminent World Cup group games are all "imminent") can't flood the feed past the sports
// cap. Total sports is therefore at most SPORTS_SLOT_CAP + SPORTS_EXEMPT_CAP; the exempt
// slots go to the highest-scoring imminent majors (a final/decider), not every kickoff.
const SPORTS_EXEMPT_CAP = Number(process.env.RANK_SPORTS_EXEMPT_CAP ?? 2);

/** True for a sports/esports market major enough to bypass the slot cap: resolving
 *  within SPORTS_EXEMPT_HOURS AND carrying real imminence credit (a final/decider,
 *  not a routine same-day line). Non-sports markets are never gated, so this only
 *  ever runs on sports candidates. */
function sportsExempt(m: Scorable, nowMs: number): boolean {
  if (!m.endDate) return false;
  const hours = (Date.parse(m.endDate) - nowMs) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 0 || hours > SPORTS_EXEMPT_HOURS) return false;
  // resolveProximity is ~1 inside two days; imminenceWeight is the standing factor.
  return resolveProximity(m.endDate, nowMs) * imminenceWeight(m.category, m.startDate, m.endDate) >
    SPORTS_IMMINENCE * 0.9;
}

// Subtle day-to-day churn. A story that LED a feed slot recently is dipped a touch so
// which open stories surface rotates instead of ossifying on the same few standing
// markets — but the dip is SMALL (comparable to one diversity step) and decays over
// LED_HALFLIFE_H, so a genuinely dominant developing story is NOT displaced before it
// resolves. A market with no lastLedAt (never led) gets no dip. The generator stamps
// lastLedAt AFTER selection; ranking only CONSUMES it.
const LED_DIP = Number(process.env.RANK_LED_DIP ?? 0.06);
const LED_HALFLIFE_H = Number(process.env.RANK_LED_HALFLIFE_H ?? 36);

/** The recency dip for a market by how long ago it last led (0 if it never led). */
function ledDip(m: Scorable, nowMs: number): number {
  if (!m.lastLedAt) return 0;
  const t = Date.parse(m.lastLedAt);
  if (!Number.isFinite(t)) return 0;
  const ageHours = (nowMs - t) / 3_600_000;
  if (ageHours <= 0) return LED_DIP; // led now/in the future → full dip
  return LED_DIP * Math.exp(-ageHours / LED_HALFLIFE_H);
}

// ── Evergreen fatigue ────────────────────────────────────────────────────────
// A standing question that holds a feed slot for DAYS with no press corroboration and
// calm odds ("Bitcoin at the end of 2026", a 2028 nominee) reads as the same report
// over and over — the money never stopped flagging it, but there is no story TODAY.
// After a grace period, decay a calm-and-uncovered tenured story toward a floor so the
// front page rotates. Any sign of life exempts it entirely: outlets on the story or
// odds genuinely moving means it IS developing — that's the living record, not fatigue.
// Distinct from ledDip (a tiny next-run churn nudge) and stalenessDecay (post-endDate):
// this is the only lever that ages out a still-open story nothing is happening to.
const FATIGUE_GRACE_DAYS = Number(process.env.RANK_FATIGUE_GRACE_DAYS ?? 2);
const FATIGUE_HALFLIFE_DAYS = Number(process.env.RANK_FATIGUE_HALFLIFE_DAYS ?? 3);
const FATIGUE_FLOOR = Number(process.env.RANK_FATIGUE_FLOOR ?? 0.35); // demoted, never buried
const FATIGUE_EXEMPT_FOOTPRINT = 2; // ≥2 distinct outlets = actively corroborated
const FATIGUE_EXEMPT_MOVE = 8; // pts/24h — mirrors the SWING_PTS re-brief trigger

/** Tenure decay for a calm, uncovered story by how long its current feed run has
 *  lasted (1 = no decay). Consumes firstLedAt, stamped by the generator after
 *  selection and reset when a story drops out of the feed. */
export function tenureFatigue(m: Scorable, nowMs: number): number {
  if (!m.firstLedAt) return 1; // never led (or first run this pass) → fresh
  if ((m.newsFootprint ?? 0) >= FATIGUE_EXEMPT_FOOTPRINT) return 1;
  if (Math.abs(m.movement24h ?? 0) >= FATIGUE_EXEMPT_MOVE) return 1;
  const t = Date.parse(m.firstLedAt);
  if (!Number.isFinite(t)) return 1;
  const days = (nowMs - t) / DAY_MS;
  if (days <= FATIGUE_GRACE_DAYS) return 1;
  return Math.max(FATIGUE_FLOOR, Math.pow(0.5, (days - FATIGUE_GRACE_DAYS) / FATIGUE_HALFLIFE_DAYS));
}

// Post-event freshness decay. Once a market's resolution window has CLOSED (its end
// date has passed) the story's news value is spent even before the platform officially
// settles it — a decided-but-unsettled market shouldn't keep sitting in Top. We sink it
// gradually (not a cliff), so it slides down over a couple of days while it waits to
// settle, then leaves the live feed when it resolves. Standard "age past peak" decay.
const STALE_FULL_HOURS = 48; // fully decayed this long after the window closed
const STALE_FLOOR = 0.4; // never zeroed — still findable, just demoted

export function stalenessDecay(endDate: string | null, nowMs: number): number {
  if (!endDate) return 1;
  const hoursPast = (nowMs - Date.parse(endDate)) / 3_600_000;
  if (!Number.isFinite(hoursPast) || hoursPast <= 0) return 1; // window still open
  return Math.max(STALE_FLOOR, 1 - (1 - STALE_FLOOR) * Math.min(hoursPast / STALE_FULL_HOURS, 1));
}

/**
 * Symmetric, bounded category-relative leveling factor per category. Betting volume
 * has wildly different baselines by category — sports and crypto pools dwarf
 * geopolitics or policy — so ranking Top on raw dollars lets a few high-liquidity
 * categories monopolize it while genuinely major lower-volume stories get buried.
 * This rewards a market for being big FOR ITS CATEGORY: a category whose typical 24h
 * volume sits ABOVE the median category is gently trimmed; one BELOW is gently lifted.
 * Bounded to ±LEVEL_CAP and applied to the final score. Nothing is hardcoded per
 * category — every category is leveled the same way against the field.
 */
export function categoryFactors(eligible: Scorable[]): Map<string, number> {
  const byCat = new Map<string, number[]>();
  for (const m of eligible) {
    const lv = Math.log10(Math.max(m.volume24h, 0) + 1);
    (byCat.get(m.category) ?? byCat.set(m.category, []).get(m.category)!).push(lv);
  }
  const catMedian = new Map<string, number>();
  for (const [c, xs] of byCat) catMedian.set(c, median(xs));
  const globalMedian = median([...catMedian.values()]);
  const factors = new Map<string, number>();
  for (const [c, m] of catMedian) {
    const raw = 1 + LEVEL_STRENGTH * (globalMedian - m);
    factors.set(c, Math.max(1 - LEVEL_CAP, Math.min(1 + LEVEL_CAP, raw)));
  }
  return factors;
}

/**
 * Filter → score → diversify-select via Maximal Marginal Relevance.
 *
 * Each pick maximizes (normalized score − a penalty for repeating a category −
 * a small dip for a story that led recently) with a small bonus for the
 * under-scaled source (Kalshi). A HARD cap (SPORTS_SLOT_CAP) bounds how many
 * sports/esports markets are selected — exempt only for an imminent major (a
 * final about to settle). This fills toward `feedSize`, keeps any one topic from
 * flooding the feed, rotates which stories lead day to day, and lets both
 * platforms earn slots by merit. Stamps `m.score` so the client can order by it.
 * Final order is by score with a stable id tiebreak.
 */
export function rankAndSelect(
  candidates: ShapedMarket[],
  config: Config,
  nowMs: number,
): ShapedMarket[] {
  const eligible = candidates.filter((m) => isNewsworthy(m, config, nowMs));
  // Stamp the leveled newsworthiness score: the news-led base (footprint primary,
  // movement backstop, volume damp-only) × its category-relative volume factor ×
  // post-window staleness decay, so the client, SSR, and CatchUp all order by the
  // same news-front-page signal. Sports are NO LONGER score-demoted here — the hard
  // slot cap below handles them. (Trending/Movers/Breaking order on their own axes.)
  const factors = categoryFactors(eligible);
  for (const m of eligible)
    m.score =
      newsScore(m, nowMs) *
      (factors.get(m.category) ?? 1) *
      stalenessDecay(m.endDate, nowMs) *
      tenureFatigue(m, nowMs);
  const maxScore = Math.max(1, ...eligible.map((m) => m.score));

  const remaining = [...eligible].sort((a, b) => b.score - a.score || cmpId(a, b));
  const selected: ShapedMarket[] = [];
  const perCategory = new Map<string, number>();
  const perSource = new Map<string, number>();
  let sportsSelected = 0; // routine sports, hard-capped at SPORTS_SLOT_CAP
  let sportsExemptSelected = 0; // imminent majors, separately capped at SPORTS_EXEMPT_CAP

  while (selected.length < config.feedSize && remaining.length > 0) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const m = remaining[i]!;
      // HARD sports cap in TWO bounded lanes: routine sports fill up to SPORTS_SLOT_CAP;
      // imminent majors (a final about to settle) get up to SPORTS_EXEMPT_CAP further slots
      // and still compete on merit. Skip a sports candidate once ITS lane is full — so a
      // fixture-dense day can't flood the feed, and the exempt slots go to the top majors.
      if (isSportsCategory(m.category)) {
        const exempt = sportsExempt(m, nowMs);
        if (exempt ? sportsExemptSelected >= SPORTS_EXEMPT_CAP : sportsSelected >= SPORTS_SLOT_CAP) {
          continue;
        }
      }
      const rel = m.score / maxScore;
      const catPenalty = (perCategory.get(m.category) ?? 0) * config.diversity;
      // Penalize repeating a source so one platform can't flood the feed.
      const srcPenalty = (perSource.get(m.source) ?? 0) * config.sourceDiversity;
      const bonus = m.source === 'kalshi' ? config.kalshiBoost : 0;
      // Subtle churn: dip a story that led recently so the feed rotates day to day.
      const val = rel - catPenalty - srcPenalty + bonus - ledDip(m, nowMs);
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break; // only capped-out sports remain → stop filling
    const [picked] = remaining.splice(bestIdx, 1);
    selected.push(picked!);
    perCategory.set(picked!.category, (perCategory.get(picked!.category) ?? 0) + 1);
    perSource.set(picked!.source, (perSource.get(picked!.source) ?? 0) + 1);
    if (isSportsCategory(picked!.category)) {
      if (sportsExempt(picked!, nowMs)) sportsExemptSelected++;
      else sportsSelected++;
    }
  }

  return selected.sort((a, b) => b.score - a.score || cmpId(a, b));
}
