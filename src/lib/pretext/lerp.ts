/**
 * Pure piecewise-linear interpolation over a keyed series — no DOM, no canvas, no
 * engine. Kept SEPARATE from `engine.ts` so callers (e.g. the article's belief
 * profile) can use it WITHOUT pulling the browser-only Pretext engine into the
 * eager bundle. `engine.ts` re-exports it for toolkit parity.
 */

/** Build a piecewise-linear interpolator over `points`, keyed by a 0..1 fraction.
 *  `key` must name a numeric field on the point type. */
export function lerpSeries<K extends string, T extends Record<K, number>>(
  points: T[],
  key: K,
): (f: number) => number {
  const ys = points.map((d) => d[key]);
  const n = ys.length;
  return (f: number) => {
    if (n === 0) return 0;
    if (n === 1) return ys[0]!;
    const x = Math.max(0, Math.min(1, f)) * (n - 1);
    const k = Math.min(n - 1, Math.floor(x));
    const k1 = Math.min(n - 1, k + 1);
    return ys[k]! + (ys[k1]! - ys[k]!) * (x - k);
  };
}
