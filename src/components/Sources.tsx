import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { Source } from '../lib/types';
import { safeHref } from '../lib/url';
import { outletDisplay, outletName } from '../lib/sources';
import { track } from '../lib/posthog';
import styles from './Sources.module.css';

// Gentle, constant marquee speed (px/sec). The animation DURATION is derived from the
// measured content width so the speed stays the same whether a story has 3 sources or 12.
const SPEED_PX_PER_S = 34;

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={styles.dot} aria-hidden="true" />;
  return (
    <img
      className={styles.favicon}
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Citation chips for the outlets backing a briefing, on ONE row. When the row overflows
 * its container they auto-scroll as a SEAMLESS marquee (a duplicated track translated with
 * a CSS transform — works in every browser, GPU-cheap), at a constant speed regardless of
 * source count; it pauses on hover/focus and while touched, so any chip stays tappable.
 * `prefers-reduced-motion` and the non-overflowing case fall back to a static, swipeable
 * row — no motion, no JS animation. Every source stays in the DOM for provenance/SEO.
 */
export function Sources({ sources, marketId }: { sources: Source[]; marketId?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [animate, setAnimate] = useState(false);
  const [duration, setDuration] = useState(0);
  const [shift, setShift] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const sig = sources.map((s) => s.url).join('|');

  // Decide whether the row overflows (→ marquee) and, if so, measure the exact seamless
  // shift and the constant-speed duration. Re-measures on resize and when the duplicate
  // track mounts/unmounts. Honors reduced-motion (→ static, swipeable row).
  useEffect(() => {
    const viewport = viewportRef.current;
    const trackEl = trackRef.current;
    if (!viewport || !trackEl) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const measure = () => {
      // One copy's content width: scrollWidth is one copy when static, two when animating.
      const oneCopy = trackEl.scrollWidth / (animate ? 2 : 1);
      const overflows = oneCopy > viewport.clientWidth + 1;
      if (reduce || !overflows) {
        if (animate) setAnimate(false);
        return;
      }
      if (!animate) {
        setAnimate(true); // mount the clone; this effect re-runs to measure the shift
        return;
      }
      // Clones are live: the first clone's left edge IS the seamless wrap distance
      // (one copy + the gap that follows it) — pixel-exact regardless of gap size.
      const clone = trackEl.children[sources.length] as HTMLElement | undefined;
      const dist = clone ? clone.offsetLeft : oneCopy;
      setShift(dist);
      setDuration(dist / SPEED_PX_PER_S);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [sig, animate, sources.length]);

  if (sources.length === 0) return null;

  const chip = (s: Source, i: number, clone = false) => {
    const href = safeHref(s.articleUrl ?? s.url);
    const fullName = outletName(s.domain);
    const name = outletDisplay(s.domain);
    const body = (
      <>
        <Favicon domain={s.domain} />
        {name}
      </>
    );
    return (
      <li key={`${clone ? 'c-' : ''}${s.url}-${i}`} {...(clone ? { 'aria-hidden': true } : {})}>
        {href ? (
          <a
            className={styles.chip}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={s.title ?? fullName}
            tabIndex={clone ? -1 : undefined}
            onClick={() => track('source_clicked', { market_id: marketId, outlet: s.domain })}
          >
            {body}
          </a>
        ) : (
          <span className={styles.chip} title={s.title ?? fullName}>
            {body}
          </span>
        )}
      </li>
    );
  };

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Sources</span>
      <div
        className={`${styles.viewport} ${animate ? styles.clip : ''}`}
        ref={viewportRef}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => {
          setHovered(false);
          setPressed(false);
        }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
      >
        <ul
          className={`${styles.list} ${animate ? styles.scrolling : ''} ${hovered || pressed ? styles.paused : ''}`}
          ref={trackRef}
          style={
            animate
              ? ({ animationDuration: `${duration}s`, '--shift': `${shift}px` } as CSSProperties)
              : undefined
          }
        >
          {sources.map((s, i) => chip(s, i))}
          {animate && sources.map((s, i) => chip(s, i, true))}
        </ul>
      </div>
    </div>
  );
}
