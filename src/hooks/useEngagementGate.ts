import { useEffect, useState } from 'react';

/**
 * Latches `true` once the visitor shows engagement — a scroll past most of the
 * fold OR a quiet reading dwell (default ~10s with no scroll/tap/key), whichever
 * comes first — while `active`. Used to hold a first-run prompt until the reader
 * is warm instead of interrupting the first impression. Once true it stays true;
 * while `active` is false it arms nothing and stays at its current value.
 *
 * Industry practice for a personalization/interstitial prompt: don't fire on
 * load — wait for intent (scroll depth) or attention (dwell), and only show once.
 */
export function useEngagementGate(active: boolean, dwellMs = 10_000): boolean {
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    if (!active || engaged) return;
    let idle = 0;
    const show = () => setEngaged(true);
    const armIdle = () => {
      clearTimeout(idle);
      idle = window.setTimeout(show, dwellMs);
    };
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.8) show(); // scrolled past the fold
      else armIdle(); // a small scroll just resets the dwell
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointerdown', armIdle, { passive: true });
    window.addEventListener('keydown', armIdle);
    armIdle();
    return () => {
      clearTimeout(idle);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointerdown', armIdle);
      window.removeEventListener('keydown', armIdle);
    };
  }, [active, engaged, dwellMs]);
  return engaged;
}
