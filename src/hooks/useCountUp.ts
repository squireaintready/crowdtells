import { useEffect, useRef, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animate a number from 0 up to `target` once, on mount / when the target settles. Eases out so it
 * decelerates into the final value — the small "tallying up" flourish behind a rating or score.
 * Jumps straight to the target when the reader prefers reduced motion. Pure rAF, no deps.
 */
export function useCountUp(target: number | null, ms = 900): number {
  const [value, setValue] = useState(target ?? 0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (target == null) return;
    if (reduced() || ms <= 0) {
      setValue(target);
      return;
    }
    const from = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);

  return value;
}
