import type { Market } from './types';
import { formatDateShort, formatRelative, formatUsd } from './format';
import { beliefSeries, trendPoints } from './trend';

/**
 * Translates a market's raw Polymarket figures into editorial "interest signals".
 * Volume = social interest, a 24h spike = sudden/breaking interest, odds = the
 * crowd's read, movement = shifting sentiment.
 */
export interface Signals {
  /** Sudden burst of activity → "Breaking". */
  surging: boolean;
  /** Share of lifetime volume traded in the last 24h (ranks the Breaking feed). */
  surgeScore: number;
  /** e.g. "$2.4M in play". */
  interest: string;
  /** Overall interest level from total volume. */
  tier: 'high' | 'notable' | 'modest';
  trend: 'up' | 'down' | 'flat';
  /** e.g. "rising" / "cooling" / "steady". */
  trendLabel: string;
  /** The outcome is EFFECTIVELY DECIDED — the crowd is at near-certainty, it's stable,
   * and the market is at/near its close — even though it hasn't officially settled. */
  decided: boolean;
}

const SURGE_RATIO = 0.15; // ≥15% of lifetime volume in 24h = sudden interest
const SURGE_MIN_24H = 100_000;
const TIER_HIGH = 5_000_000;
const TIER_NOTABLE = 500_000;

// "Effectively decided" — the real-world outcome is settled in all but name while the
// bet is still open (the day's high is in but the market closes at midnight; the game
// is over but settlement lags). Gated conservatively so a mere heavy favorite far from
// resolution isn't mislabeled: near-certain AND steady (not still racing toward it) AND
// at/near its close. Purely derived from live odds, so a genuine reversal clears it
// automatically — no call to retract.
const DECIDED_PCT = 98;
const DECIDED_STABLE_MOVE = 1.5; // points of 24h movement; above this it's still moving
const DECIDED_WINDOW_DAYS = 3; // only within ~3 days of close (or already past it)
const DAY_MS = 86_400_000;

export function surgeScore(m: Market): number {
  return m.volume > 0 ? m.volume24h / m.volume : 0;
}

/** Is this market's outcome effectively decided though still open? See DECIDED_* above.
 * Takes only the three live fields it reads (a structural subset of Market) so the
 * pre-briefing ShapedMarket — which the story layer classifies before a Market skeleton
 * exists — can share this one predicate. Every existing Market caller still satisfies it. */
export function isDecided(
  m: Pick<Market, 'oddsPct' | 'movement24h' | 'endDate'>,
  nowMs: number = Date.now(),
): boolean {
  if (m.oddsPct < DECIDED_PCT) return false;
  if (Math.abs(m.movement24h ?? 0) >= DECIDED_STABLE_MOVE) return false;
  if (!m.endDate) return false;
  const days = (Date.parse(m.endDate) - nowMs) / DAY_MS;
  return Number.isFinite(days) && days <= DECIDED_WINDOW_DAYS;
}

export function signalsFor(m: Market): Signals {
  const score = surgeScore(m);
  const surging = score >= SURGE_RATIO && m.volume24h >= SURGE_MIN_24H;

  const tier: Signals['tier'] =
    m.volume >= TIER_HIGH ? 'high' : m.volume >= TIER_NOTABLE ? 'notable' : 'modest';

  const mv = m.movement24h ?? 0;
  const trend: Signals['trend'] = mv > 0.1 ? 'up' : mv < -0.1 ? 'down' : 'flat';
  const trendLabel = trend === 'up' ? 'rising' : trend === 'down' ? 'cooling' : 'steady';

  return {
    surging,
    surgeScore: score,
    interest: `${formatUsd(m.volume)} in play`,
    tier,
    trend,
    trendLabel,
    decided: isDecided(m),
  };
}

/**
 * The story's real-world timing, stated in NEWS terms so a reader always knows
 * *when* — not just "Resolves in 3d" but the actual date, and crucially an honest
 * label when the betting window has closed but the official result isn't in yet
 * (the old "Resolved" badge lied here, leaving a present-tense preview under a
 * "Resolved" tag). One source of truth for the article + card timing line.
 *
 * - `resolved` : we know the outcome — "Resolved Jun 18".
 * - `awaiting` : end date passed but no captured outcome — "Awaiting result".
 * - `upcoming` : still open — "Resolves Jun 24" (with a relative hint).
 * - `open`     : no end date at all — "" (nothing to claim).
 */
export interface MarketTiming {
  state: 'resolved' | 'awaiting' | 'upcoming' | 'open';
  /** Primary label, e.g. "Resolves Jun 24" / "Awaiting result" / "Resolved Jun 18". */
  label: string;
  /** Secondary muted hint, e.g. "in 3d" / "voting closed Jun 18". '' when none. */
  hint: string;
  /** ISO for a <time dateTime>, when a concrete date anchors the label. */
  dateTime?: string;
}

export function marketTiming(m: Market, nowMs: number = Date.now()): MarketTiming {
  // A known outcome means settled, whatever the lifecycle status — an archived market
  // that already resolved must read "Resolved", not fall through to "Awaiting result".
  if (m.resolvedOutcome) {
    const when = m.resolvedAt ?? m.endDate ?? null;
    return {
      state: 'resolved',
      label: when ? `Resolved ${formatDateShort(when)}` : 'Resolved',
      hint: '',
      ...(when ? { dateTime: when } : {}),
    };
  }
  const endMs = m.endDate ? Date.parse(m.endDate) : NaN;
  if (Number.isFinite(endMs)) {
    if (endMs <= nowMs) {
      // The window closed with no captured outcome. Frame it as "Awaiting result" ONLY
      // for a still-active market (we're genuinely waiting on it) — an archived/cooled
      // market is old news, not pending, so claim nothing rather than a perpetual
      // "Awaiting result" that never updates.
      if (m.status !== 'active') return { state: 'open', label: '', hint: '' };
      return {
        state: 'awaiting',
        label: 'Awaiting result',
        hint: `voting closed ${formatDateShort(m.endDate)}`,
        dateTime: m.endDate!,
      };
    }
    return {
      state: 'upcoming',
      label: `Resolves ${formatDateShort(m.endDate)}`,
      hint: formatRelative(m.endDate, nowMs),
      dateTime: m.endDate!,
    };
  }
  return { state: 'open', label: '', hint: '' };
}

/** Short editorial read of the crowd's current probability. */
export function crowdRead(m: Market): string {
  const isYesNo = m.favored.toLowerCase() === 'yes' || m.favored.toLowerCase() === 'no';
  const pct = `${Math.round(m.oddsPct)}%`;
  return isYesNo
    ? `Crowd estimate: ${pct} ${m.favored.toLowerCase()}`
    : `Crowd estimate: ${m.favored} ${pct}`;
}

// ── Crowd-belief shift over time ─────────────────────────────────────────────
// A living record means the crowd's read MOVES — and when it moves a lot, that
// shift is itself news. This computes a quiet, deterministic "the read changed"
// note for the article, gated so it fires ONLY on a large, well-funded, non-fresh
// move — never on a brand-new or thin market's noise. The MODEL never sees these
// numbers (the prompts stay news-first); this is derived at render from the SAME
// belief arc the chart draws, so the figure always matches the curve. Pure + testable.
const SHIFT_MIN_PTS = 12; // ≥12pt move — between the 8pt revision floor and the 20pt breaking bar
const SHIFT_MIN_VOLUME = 2_000_000; // well-funded: the "actively traded" tier, not the long tail
const SHIFT_MIN_AGE_DAYS = 7; // skip brand-new markets (no real arc yet)
const SHIFT_MIN_POINTS = 8; // a genuine series, not a backfilled flat line
const SHIFT_MIN_SPAN_DAYS = 7; // the move developed over at least a week
const SHIFT_LOOKBACK_DAYS = 7; // compare now vs ~a week ago

export interface CrowdShift {
  /** 'climbed' — favored strengthened; 'slipped' — favored weakened (still ahead);
   * 'swung' — the lead changed hands (was behind 50%, now at/above it). */
  dir: 'climbed' | 'slipped' | 'swung';
  /** Favored probability ~a week ago and now, whole percent. */
  fromPct: number;
  toPct: number;
  /** Days between the two readings. */
  days: number;
}

/**
 * A significant, well-funded, non-fresh crowd-belief shift worth a one-line note in
 * the article — or null (the common case) when it shouldn't fire. See the SHIFT_*
 * gates. Anchored on the durable belief arc (beliefSeries), so it reflects the real
 * weeks-long move, not the trimmed ~24h window.
 */
export function crowdShift(m: Market, nowMs: number = Date.now()): CrowdShift | null {
  if (m.status !== 'active' || isDecided(m, nowMs)) return null; // a settled story tells itself
  if (m.volume < SHIFT_MIN_VOLUME) return null; // thin markets: a swing is noise, not news
  const opened = m.startDate ? Date.parse(m.startDate) : NaN;
  if (!Number.isFinite(opened) || nowMs - opened < SHIFT_MIN_AGE_DAYS * DAY_MS) return null;
  const pts = trendPoints(beliefSeries(m.oddsDaily, m.oddsHistory));
  if (pts.length < SHIFT_MIN_POINTS) return null;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (last.tMs - first.tMs < SHIFT_MIN_SPAN_DAYS * DAY_MS) return null;
  // Anchor on the latest reading at least a week old (fall back to the series start).
  const cutoff = nowMs - SHIFT_LOOKBACK_DAYS * DAY_MS;
  let anchor = first;
  for (const p of pts) {
    if (p.tMs <= cutoff) anchor = p;
    else break;
  }
  // The belief series stores only the LEADER's probability at each point, with no
  // per-point outcome identity. If the favored OUTCOME changed anywhere across the
  // measured series, anchor.p may belong to the OLD leader, so attributing it to the
  // current favored would print a false sentence — suppress when a saved revision shows
  // a flip. Bound from the SERIES START (not the anchor): a flip's revision is stamped
  // at the prior, sparser briefing, which can predate the anchor.
  if (favoredChangedSince(m, first.tMs, nowMs)) return null;
  const fromPct = Math.round(anchor.p);
  const toPct = Math.round(last.p);
  if (Math.abs(toPct - fromPct) < SHIFT_MIN_PTS) return null;
  const days = Math.max(1, Math.round((last.tMs - anchor.tMs) / DAY_MS));
  // 'swung' means the lead actually changed hands. Crossing 50% only IS a lead change
  // for a binary (Yes/No) market; a 3+-outcome plurality leader can sit below 50% while
  // already ahead, so for those a 50%-crossing reads as 'climbed', not a swing.
  const isBinary = m.favored.toLowerCase() === 'yes' || m.favored.toLowerCase() === 'no';
  const dir: CrowdShift['dir'] =
    isBinary && anchor.p < 50 && last.p >= 50 ? 'swung' : toPct >= fromPct ? 'climbed' : 'slipped';
  return { dir, fromPct, toPct, days };
}

/** Did the favored OUTCOME change between `fromMs` and `nowMs`, per the saved briefing
 * revisions? A flip means the belief series mixes two outcomes' probabilities, so a
 * from→to attribution to the current favored would be wrong. Normalized compare so a
 * cosmetic casing difference for the same outcome isn't read as a flip. */
function favoredChangedSince(m: Market, fromMs: number, nowMs: number): boolean {
  const now = m.favored.trim().toLowerCase();
  return (m.revisions ?? []).some((r) => {
    const t = Date.parse(r.generatedAt);
    return Number.isFinite(t) && t >= fromMs && t <= nowMs && r.favored.trim().toLowerCase() !== now;
  });
}

/** The shift as one editorial sentence (a labeled metric line, not body prose). */
export function describeShift(s: CrowdShift, favored: string): string {
  const yn = favored.toLowerCase() === 'yes' || favored.toLowerCase() === 'no';
  const subj = yn ? `a “${favored.toLowerCase()}”` : favored;
  const span = `${s.days} ${s.days === 1 ? 'day' : 'days'}`;
  const range = `from ~${s.fromPct}% to ~${s.toPct}% over the past ${span}`;
  if (s.dir === 'swung') return `The crowd has swung behind ${subj}, ${range}.`;
  return `Confidence in ${subj} has ${s.dir} ${range}.`;
}
