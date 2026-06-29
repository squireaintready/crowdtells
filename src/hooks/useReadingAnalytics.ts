import { useEffect, useRef } from 'react';
import type { Market } from '../lib/types';
import { track } from '../lib/posthog';

const MILESTONES = [25, 50, 75, 100] as const;

/**
 * Reading-funnel instrumentation for one opened article — the answer to "are readers
 * actually reading?". Fires `article_opened` on mount, depth milestones (25/50/75% →
 * `article_read_progress`, 100% → `article_completed`) as the page scrolls, and an
 * `article_closed` summary (dwell + furthest depth) on unmount. The article view *is*
 * the page, so depth is measured off the document scroll. All no-ops in an
 * analytics-disabled build — track() gates itself — so this is safe in tests too.
 */
export function useReadingAnalytics(m: Market): void {
  const startRef = useRef(0);
  const maxDepthRef = useRef(0);
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    startRef.current = Date.now();
    maxDepthRef.current = 0;
    const fired = firedRef.current;
    fired.clear();

    track('article_opened', {
      market_id: m.id,
      category: m.category,
      resolved: m.status === 'resolved',
      has_briefing: !!m.generatedAt,
    });

    let raf = 0;
    const measure = () => {
      raf = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return; // unmeasured (jsdom) or a screenful-or-less article
      const depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
      if (depth > maxDepthRef.current) maxDepthRef.current = depth;
      for (const mlt of MILESTONES) {
        if (depth >= mlt && !fired.has(mlt)) {
          fired.add(mlt);
          if (mlt === 100) track('article_completed', { market_id: m.id });
          else track('article_read_progress', { market_id: m.id, depth: mlt });
        }
      }
      // Every milestone seen → there's nothing left to measure; stop listening.
      if (fired.has(100)) window.removeEventListener('scroll', onScroll);
    };
    // Coalesce a burst of scroll events into one measurement per frame — no per-event
    // layout reads, and the only DOM read (scrollHeight) happens off the scroll handler.
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    measure(); // a short article may already be fully on screen at open

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      track('article_closed', {
        market_id: m.id,
        dwell_seconds: Math.round((Date.now() - startRef.current) / 1000),
        max_depth: maxDepthRef.current,
        completed: fired.has(100),
      });
    };
    // Keyed on the story id ALONE: a realtime update to this market (status/generatedAt)
    // must not re-fire article_opened/closed mid-read. category/status/generatedAt are an
    // open-time snapshot, read intentionally from the first-run closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);
}
