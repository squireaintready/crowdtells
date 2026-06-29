/**
 * Pure geometry for the article TrendChart — the "crowd belief vs coverage over
 * time" graphic. Kept out of the component so the domain/scale math is unit-tested
 * independently of any DOM. All inputs are plain data; all outputs are numbers in
 * value space (ms timestamps + 0–100 probability), which the component projects
 * into its viewBox. No Date.now() here (callers pass `now`) so it stays testable.
 */
import type { OddsPoint } from './types';

/** A coverage event — when a cited article was published — for the baseline ticks. */
export interface CoverageMark {
  /** ISO publish time. */
  t: string;
  /** Outlet/domain, e.g. "reuters.com". */
  outlet: string;
  /** Headline, when known. */
  title?: string;
}

/** A point on the crowd-belief line, in value space + its parsed time. */
export interface TrendPoint {
  /** Epoch ms. */
  tMs: number;
  /** Probability of the favored outcome, 0–100. */
  p: number;
}

/** A read-changed marker (a briefing revision) anchored to the belief line. */
export interface RevisionMark {
  tMs: number;
  p: number;
  /** Headline as it read then. */
  hook: string;
}

export interface TrendDomain {
  /** Time domain (epoch ms). */
  t0: number;
  t1: number;
  /** Probability domain (0–100), padded to a readable band. */
  lo: number;
  hi: number;
}

const HOUR = 3_600_000;

/** Round a probability band out to tens, clamped to [0,100], with a readable min span. */
function niceBand(min: number, max: number, minSpan = 24): [number, number] {
  const pad = 4;
  let lo = Math.max(0, Math.floor((min - pad) / 10) * 10);
  let hi = Math.min(100, Math.ceil((max + pad) / 10) * 10);
  if (hi - lo < minSpan) {
    // Grow symmetrically toward the center of the data, then clamp.
    const mid = (min + max) / 2;
    lo = Math.max(0, Math.min(lo, Math.round(mid - minSpan / 2)));
    hi = Math.min(100, Math.max(hi, lo + minSpan));
    lo = Math.max(0, Math.min(lo, hi - minSpan));
  }
  return [lo, hi];
}

/**
 * Compute the chart's value-space domain from the belief series plus any extra
 * times (coverage/revision marks) that should be visible, so markers never fall
 * outside the drawn area. A degenerate (single-time) series is padded to ±1h.
 */
export function trendDomain(
  history: OddsPoint[],
  extraTimes: number[] = [],
): TrendDomain {
  const times = history
    .map((d) => Date.parse(d.t))
    .filter((n) => Number.isFinite(n))
    .concat(extraTimes.filter((n) => Number.isFinite(n)));
  let t0 = times.length ? Math.min(...times) : 0;
  let t1 = times.length ? Math.max(...times) : 0;
  if (t1 <= t0) {
    t0 -= HOUR;
    t1 += HOUR;
  }
  const ps = history.map((d) => d.p).filter((n) => Number.isFinite(n));
  const [lo, hi] = ps.length ? niceBand(Math.min(...ps), Math.max(...ps)) : [0, 100];
  return { t0, t1, lo, hi };
}

/** Normalize a value-space series to parsed, finite, time-sorted points. */
export function trendPoints(history: OddsPoint[]): TrendPoint[] {
  return history
    .map((d) => ({ tMs: Date.parse(d.t), p: d.p }))
    .filter((d) => Number.isFinite(d.tMs) && Number.isFinite(d.p))
    .sort((a, b) => a.tMs - b.tMs);
}

/** Project a timestamp to an x fraction [0,1] within the domain. */
export function projectX(tMs: number, dom: TrendDomain): number {
  if (dom.t1 === dom.t0) return 0.5;
  return clamp01((tMs - dom.t0) / (dom.t1 - dom.t0));
}

/** Project a probability to a y fraction [0,1] within the domain (0 = top, 1 = bottom). */
export function projectY(p: number, dom: TrendDomain): number {
  if (dom.hi === dom.lo) return 0.5;
  return clamp01(1 - (p - dom.lo) / (dom.hi - dom.lo));
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** The favored-outcome probability at (or just before) a given time — for anchoring
 * a revision/coverage mark onto the belief line. Falls back to the nearest point. */
export function beliefAt(points: TrendPoint[], tMs: number): number {
  if (points.length === 0) return 50;
  let best = points[0]!;
  for (const pt of points) {
    if (pt.tMs <= tMs) best = pt;
    else break;
  }
  return best.p;
}

/** Build the read-changed markers from briefing revisions, anchored to the belief line. */
export function revisionMarks(
  revisions: { generatedAt: string; oddsPct: number; hook: string }[] | undefined,
  points: TrendPoint[],
): RevisionMark[] {
  if (!revisions?.length) return [];
  return revisions
    .map((r) => ({ tMs: Date.parse(r.generatedAt), hook: r.hook, oddsPct: r.oddsPct }))
    .filter((r) => Number.isFinite(r.tMs))
    .map((r) => ({ tMs: r.tMs, hook: r.hook, p: beliefAt(points, r.tMs) }))
    .sort((a, b) => a.tMs - b.tMs);
}

/**
 * The durable belief arc for the opinion timeline: the long-range daily series
 * (oddsDaily — one point per day, weeks/months) for everything BEFORE the high-res
 * recent window, then the recent high-res points (oddsHistory) spliced on so the
 * tail stays detailed and ends at the current odds. Falls back to whichever series
 * exists (oddsDaily is absent on records that predate it). Pure.
 */
export function beliefSeries(daily: OddsPoint[] | undefined, recent: OddsPoint[]): OddsPoint[] {
  if (!daily?.length) return recent;
  if (!recent.length) return daily;
  const firstRecent = Date.parse(recent[0]!.t);
  if (!Number.isFinite(firstRecent)) return recent;
  const longPart = daily.filter((d) => Date.parse(d.t) < firstRecent);
  return [...longPart, ...recent];
}

/** Normalize + sort coverage marks; drop entries with an unparseable time and collapse
 * exact-timestamp duplicates (syndicated wires re-publishing the same minute) so they
 * don't stack into one visually heavier tick with unreachable duplicate tooltips. */
export function coverageMarks(coverage: CoverageMark[] | undefined): (CoverageMark & { tMs: number })[] {
  if (!coverage?.length) return [];
  const seen = new Set<number>();
  const out: (CoverageMark & { tMs: number })[] = [];
  for (const c of coverage
    .map((m) => ({ ...m, tMs: Date.parse(m.t) }))
    .filter((m) => Number.isFinite(m.tMs))
    .sort((a, b) => a.tMs - b.tMs)) {
    if (seen.has(c.tMs)) continue;
    seen.add(c.tMs);
    out.push(c);
  }
  return out;
}
