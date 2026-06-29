/**
 * Pure aggregation for the social-voting surfaces — kept out of the components and
 * the supabase layer so the math is unit-tested on its own. No I/O, no Date.now().
 */
import type { OddsPoint } from './types';

/** One call by a reader the viewer follows (and who opted into sharing). */
export interface FollowedCall {
  displayName: string | null;
  avatarUrl: string | null;
  pick: 'yes' | 'no';
  confidence: number;
  /** The outcome they called (frozen at their call time). */
  targetOutcome: string;
}

export interface FollowedSummary {
  /** Total shared calls from people you follow. */
  n: number;
  /** How many called the target to happen (pick === 'yes'). */
  yes: number;
  /** How many called against it (pick === 'no'). */
  no: number;
  /** Mean confidence across those calls (0 when none). */
  avgConfidence: number;
}

/** Summarize the calls of people you follow on a market (counts + mean confidence). */
export function summarizeFollowedCalls(calls: FollowedCall[]): FollowedSummary {
  const n = calls.length;
  if (n === 0) return { n: 0, yes: 0, no: 0, avgConfidence: 0 };
  let yes = 0;
  let confSum = 0;
  for (const c of calls) {
    if (c.pick === 'yes') yes++;
    confSum += c.confidence;
  }
  return { n, yes, no: n - yes, avgConfidence: Math.round(confSum / n) };
}

/** A daily bucket of how readers called a market (counts only). */
export interface CallSeriesDay {
  /** UTC date (YYYY-MM-DD). */
  day: string;
  yesTarget: number;
  noTarget: number;
}

/**
 * Turn per-day call counts into a cumulative "share calling the target to happen"
 * line (0–100), so it can be drawn by the same TrendChart as crowd belief. Each
 * point is the running yes-share through that day. Days are anchored at UTC noon so
 * the date label is unambiguous across time zones. Empty/blank input → [].
 *
 * Limitation (shared with call_distribution): `pick` is relative to each caller's
 * frozen `target_outcome`, so on the rare market whose favored side FLIPPED mid-life
 * the line conflates "yes on target-A" with "yes on target-B". Fine for binary yes/no
 * markets (the vast majority); the series reads as "share who called the lead to win".
 */
export function voteShareSeries(series: CallSeriesDay[]): OddsPoint[] {
  let cumYes = 0;
  let cumTotal = 0;
  const out: OddsPoint[] = [];
  for (const d of series) {
    cumYes += d.yesTarget;
    cumTotal += d.yesTarget + d.noTarget;
    if (cumTotal === 0) continue;
    out.push({ t: `${d.day}T12:00:00.000Z`, p: Math.round((cumYes / cumTotal) * 100) });
  }
  return out;
}

/** Total calls represented by a day-series — gates whether the trend is worth drawing. */
export function seriesTotal(series: CallSeriesDay[]): number {
  return series.reduce((n, d) => n + d.yesTarget + d.noTarget, 0);
}
