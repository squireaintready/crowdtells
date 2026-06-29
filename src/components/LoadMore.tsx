import { useEffect, useRef } from 'react';
import styles from './LoadMore.module.css';

interface Props {
  /** How many more stories are available beyond what's currently shown. */
  remaining: number;
  /** How many the button reveals per activation — drives the label. */
  step: number;
  /** Reveal the next page of stories. */
  onMore: () => void;
}

/** True only when the element holds *keyboard* focus (a Tab landing, not a mouse
 * press). Guards auto-load so tabbing onto the off-screen sentinel — which the
 * browser scrolls into view — doesn't yank in new content under the reader; a
 * keyboard user activates it deliberately with Enter/Space instead. Some engines
 * (jsdom) can't match :focus-visible → treat as not-keyboard-focused. */
function keyboardFocused(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

/**
 * Progressive feed pager: an explicit "Load more" button that ALSO auto-loads
 * when it scrolls near the viewport (windowed infinite scroll). The button itself
 * is the observed sentinel, so the pattern degrades gracefully — keyboard and
 * screen-reader users get a real control (auto-load is suppressed while it holds
 * keyboard focus; App announces each batch via an aria-live region), browsers
 * without IntersectionObserver (and jsdom) fall back to a plain click, the footer
 * stays reachable because loading stops at the end, and sighted scrollers get a
 * seamless auto-fill.
 *
 * Rendered by App only while stories remain (remaining > 0), so reaching zero
 * unmounts it and tears down the observer.
 */
export function LoadMore({ remaining, step, onMore }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  // Keep the latest onMore reachable from a stable observer without re-arming it
  // each render (a new observer per render would re-fire on recreation).
  const moreRef = useRef(onMore);
  moreRef.current = onMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // A single long-lived observer: it fires on every crossing, so each time the
    // sentinel scrolls back into view it loads the next page — no recreation, no
    // runaway loop (a full page of tall cards pushes it well clear before it can
    // re-trigger). Pre-load a screenful early so the feed fills before the reader
    // actually hits the bottom.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !keyboardFocused(el)) moreRef.current();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const next = Math.min(step, remaining);
  return (
    <div className={styles.wrap}>
      <button ref={ref} type="button" className={styles.more} onClick={() => moreRef.current()}>
        Load {next} more {next === 1 ? 'story' : 'stories'}
        <span className={styles.count}>{remaining} remaining</span>
      </button>
    </div>
  );
}
