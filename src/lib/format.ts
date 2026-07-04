/** Pure formatting helpers shared across the UI. */

/** Compact USD, e.g. 2415457275 → "$2.4B", 84969 → "$85K". */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [scale, suffix] of units) {
    if (abs >= scale) {
      const n = value / scale;
      // 1 decimal under 100, none above, trim trailing ".0"
      const str = n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, '');
      return `$${str}${suffix}`;
    }
  }
  return `$${Math.round(value)}`;
}

/** Probability as a whole-percent string, e.g. 14.65 → "15%". */
export function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  return `${Math.round(pct)}%`;
}

/** Signed percentage-point movement, e.g. 4.2 → "+4.2", -1 → "-1.0". */
export function formatMovement(points: number): string {
  const sign = points > 0 ? '+' : '';
  return `${sign}${points.toFixed(1)}`;
}

/**
 * Human countdown/elapsed relative to now.
 * Future → "in 3d" / "in 5h" / "in 12m"; past → "2d ago"; same minute → "now".
 */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = t - now;
  const future = diff >= 0;
  const mins = Math.floor(Math.abs(diff) / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  let body: string;
  if (mins < 1) return 'now';
  if (days > 0) body = `${days}d`;
  else if (hours > 0) body = `${hours}h`;
  else body = `${mins}m`;
  return future ? `in ${body}` : `${body} ago`;
}

/**
 * Deterministic ±1–2 minute offset (in minutes) for a seed string. A briefing is written
 * on the pipeline's ~15-min cadence, so its raw minute clusters on :00/:15/:30/:45; this
 * nudges the *displayed* clock off those marks so the cadence isn't obvious. Never 0 (so
 * it always shifts off the quarter) and stable per seed (so the time doesn't flicker).
 */
export function clockJitterMin(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return [-2, -1, 1, 2][Math.abs(h) % 4]!;
}

/**
 * Wall-clock time for a byline, in the reader's local time (12-hour), e.g. "1:09 PM".
 * Applies clockJitterMin(seed) so the minute doesn't reveal the refresh cadence. '' when
 * unset/invalid.
 */
export function formatClock(iso: string | null | undefined, seed: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t + clockJitterMin(seed) * 60_000);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Absolute dateline for a byline, e.g. "June 17, 2026". '' when unset/invalid. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Compact absolute date for inline timing, e.g. "Jun 17, 2026". '' when unset/invalid.
 * Used by the article's "when" line so a reader sees the actual event/resolution date,
 * not only a relative "in 3d". */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "Resolves in 3d" / "Resolved" for a market end date. */
export function formatDeadline(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  if (t <= now) return 'Resolved';
  return `Resolves ${formatRelative(iso, now)}`;
}

/** First initial for an avatar fallback: the uppercased first letter of the name's
 * first word, or `fallback` when there's no name — so the avatar letter is derived
 * one way everywhere instead of three slightly different inline expressions. */
export function avatarInitial(name: string | null | undefined, fallback = '?'): string {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  return (first.charAt(0) || fallback).toUpperCase();
}

/** Deterministic per-category hue (0–359) → the subtle tinted card/article glow. */
export function categoryHue(category: string): number {
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return h % 360;
}
