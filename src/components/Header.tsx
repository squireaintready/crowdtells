import { useEffect, useMemo, useRef, useState } from 'react';
import { MOBILE_MQ } from '../lib/responsive';
import { formatRelative } from '../lib/format';
import { useIntensity } from '../hooks/useIntensity';
import { ThemeToggle } from './ThemeToggle';
import { AccountControl } from './account/AccountControl';
import styles from './Header.module.css';

const NAME = [...'Crowdtells'];

// Mobile collapse hysteresis. Collapsing shrinks the masthead ~56px (105→49) and pulls
// content up, which nudges scrollY — with a single threshold that nudge bounces scrollY
// back across it and the sticky header flaps/jitters forever. So collapse only once
// scrolled past COLLAPSE_AT and restore only back near the top (RESTORE_AT); the dead
// zone between them is wider than that ~56px nudge, so it can't self-trigger.
const COLLAPSE_AT = 80;
const RESTORE_AT = 6;

interface Props {
  generatedAt: string | null;
  total: number;
  /** Article view pins the masthead (the feed doesn't — its Controls bar is already
   * sticky). Driven by an explicit class (not a `:has(+ main)` selector) with NO
   * backdrop-filter, so it pins reliably on every browser including iOS Safari. */
  pinned?: boolean;
  /** Article view passes a back-to-feed handler. The masthead is otherwise IDENTICAL
   * to the homepage; on a phone the only change is the date slot becomes the back
   * control (CSS swap). On desktop the date stays and the back lives in ArticleView's
   * own row, so the desktop masthead is unchanged. */
  onBack?: () => void;
  /** Back-link label reflecting the section the reader came from, e.g. "Top stories"
   * or "Latest stories" (see sectionBackLabel). Falls back to "All stories". */
  backLabel?: string;
  /** Feed search, surfaced on mobile as an icon in the top row that expands an inline
   * field (the desktop search lives in the Controls bar). Omitted in article view. */
  query?: string;
  onQuery?: (q: string) => void;
  /** Account sheet open state, owned by App's URL/history model (?o=account) so Back
   * closes it; passed straight through to AccountControl. */
  accountOpen: boolean;
  onAccountOpenChange: (open: boolean) => void;
}

export function Header({
  generatedAt,
  total,
  pinned = false,
  onBack,
  backLabel,
  query,
  onQuery,
  accountOpen,
  onAccountOpenChange,
}: Props) {
  // Memoized: Header re-renders on scroll-collapse + search toggle, and the date
  // doesn't change across a session — recomputing the localized string each render is waste.
  const today = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [],
  );
  const inArticle = !!onBack;
  const hasSearch = onQuery !== undefined;
  const mastRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // Reading style — the aggressive masthead scales the wordmark to fill its column
  // (the comp's fitFontSize wordmark). Calm keeps the shipped clamp size.
  const { intensity } = useIntensity();
  const aggressive = intensity === 'aggressive';

  // Publish the masthead's live height to --mast-h so the (sticky) Controls tabs bar
  // can pin right beneath it — and re-pin lower when the masthead grows (search field
  // opens) or shrinks (collapse on scroll). Mobile is where it's read; harmless else.
  useEffect(() => {
    const el = mastRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Only write when the rounded height actually changes, so the collapse animation
    // doesn't spam :root style invalidations on every sub-pixel resize tick.
    let last = -1;
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.offsetHeight);
      if (h === last) return;
      last = h;
      document.documentElement.style.setProperty('--mast-h', `${h}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mobile only: collapse the masthead into a compact sticky bar once the page
  // scrolls — the big wordmark shrinks up into the top row, so the sticky header is one
  // tight row + the Controls tabs below. The scroll read is rAF-throttled (one check
  // per frame, not per scroll event) and `collapsed` only flips at the threshold, so
  // React re-renders at most twice across a scroll, not on every pixel.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(MOBILE_MQ);
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (!mq.matches) {
        setCollapsed(false);
        return;
      }
      const y = window.scrollY;
      // Hysteresis (see COLLAPSE_AT/RESTORE_AT): once collapsed, stay collapsed until
      // scrolled back near the top — so the collapse's own layout nudge can't flap it.
      setCollapsed((prev) => (prev ? y > RESTORE_AT : y > COLLAPSE_AT));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    mq.addEventListener('change', compute);
    return () => {
      window.removeEventListener('scroll', onScroll);
      mq.removeEventListener('change', compute);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // The inline search field that the top-row icon expands (mobile). Focus on open;
  // Escape closes it.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!searchOpen) return;
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // Aggressive masthead (DESKTOP only): measure the wordmark and scale it to fill its
  // column to the pixel (the comp's §01 fitFontSize wordmark). Mobile keeps the shipped
  // compact reading-bar (its deliberate small wordmark + collapse), so we never enlarge
  // it there. Calm never loads the engine. The target leaves ~10% for the wordmark's
  // letter-spacing (which the raw measure doesn't see) so it fills without overflowing;
  // a debounced ResizeObserver re-fits on resize and re-checks the breakpoint.
  const [wordPx, setWordPx] = useState<number | null>(null);
  useEffect(() => {
    const phone = () => typeof matchMedia !== 'undefined' && matchMedia(MOBILE_MQ).matches;
    // Homepage only — the article masthead is pinned/sticky, where a column-filling
    // wordmark would eat the reading viewport (and the comp keeps the article frame's
    // wordmark small). Mobile keeps its compact bar; calm never enters here.
    if (!aggressive || pinned || collapsed || phone()) {
      setWordPx(null);
      return;
    }
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const fit = async () => {
      const row = rowRef.current;
      const name = nameRef.current;
      if (!row || !name || cancelled || row.clientWidth < 200) return;
      if (phone()) {
        setWordPx(null);
        return;
      }
      try {
        const engine = await import('../lib/pretext/engine');
        if (cancelled) return;
        await engine.readyFonts();
        if (cancelled || !rowRef.current || !nameRef.current) return;
        const w = rowRef.current.clientWidth;
        if (w < 200) return;
        const fam = getComputedStyle(nameRef.current).fontFamily;
        // Rendered uppercase (text-transform), so measure the uppercase glyphs.
        const size = engine.fitFontSize('CROWDTELLS', {
          family: fam,
          weight: 600,
          target: w * 0.9,
          max: 132,
          min: 30,
        });
        if (!cancelled) setWordPx(size);
      } catch {
        if (!cancelled) setWordPx(null);
      }
    };
    void fit();
    if (typeof ResizeObserver !== 'undefined' && rowRef.current) {
      observer = new ResizeObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void fit(), 130);
      });
      observer.observe(rowRef.current);
    }
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      observer?.disconnect();
    };
  }, [aggressive, pinned, collapsed]);

  // The "Live · updated" indicator. On desktop it sits in the utilities row; on a
  // phone the compact masthead hides it there and shows it beside the wordmark
  // (.freshness) instead, so the bar drops a row. Same markup rendered in both
  // slots — CSS reveals whichever one fits the breakpoint (only one is ever shown).
  const live = (
    <>
      <span className={styles.dot} aria-hidden="true" /> Live
      {generatedAt && <> · updated {formatRelative(generatedAt)}</>}
    </>
  );

  return (
    <header
      ref={mastRef}
      className={`${styles.masthead} ${pinned ? styles.pinned : ''} ${collapsed ? styles.collapsed : ''}`}
    >
      <div className={styles.topline}>
        {/* The masthead is the same on the feed and the article. The only difference:
            on a PHONE article, the date is swapped for "← All stories" (CSS hides the
            dateline and shows .back at the phone breakpoint). On desktop the date
            shows and the back control is ArticleView's standalone row. */}
        <span className={styles.dateline}>{today}</span>
        {inArticle && (
          <button type="button" className={styles.back} onClick={onBack}>
            ← {backLabel ?? 'All stories'}
          </button>
        )}
        <div className={styles.utilities}>
          <span className={styles.live}>{live}</span>
          {hasSearch && (
            <button
              type="button"
              className={styles.searchBtn}
              onClick={() => setSearchOpen((o) => !o)}
              aria-label="Search"
              aria-expanded={searchOpen}
            >
              <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
                <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M14 14 L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
          <ThemeToggle />
          <AccountControl open={accountOpen} onOpenChange={onAccountOpenChange} />
        </div>
      </div>

      {hasSearch && searchOpen && (
        <div className={styles.searchRow}>
          <svg
            className={styles.searchRowIcon}
            viewBox="0 0 20 20"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M14 14 L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery?.(e.target.value)}
            placeholder="Search stories…"
            aria-label="Search stories"
          />
          <button
            type="button"
            className={styles.searchClose}
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
          >
            ✕
          </button>
        </div>
      )}

      <div className={`${styles.nameplateRow} ${aggressive ? styles.nameplateRowBold : ''}`} ref={rowRef}>
        <h1
          className={styles.nameplate}
          ref={nameRef}
          style={wordPx ? { fontSize: `${wordPx}px` } : undefined}
        >
          <a className={styles.home} href={import.meta.env.BASE_URL} aria-label="Crowdtells — home">
            <span className={styles.word} aria-hidden="true">
              {NAME.map((ch, i) => (
                <span key={i} className={styles.letter} style={{ animationDelay: `${i * 0.05}s` }}>
                  {ch}
                </span>
              ))}
            </span>
            <span className={styles.rule} aria-hidden="true">
              <span className={styles.tell} />
            </span>
          </a>
        </h1>
        <p className={styles.tagline}>
          The crowd tells it first · <span className="tnum">{total}</span> stories tracked
        </p>
        {/* Phone-only: the Live indicator beside the wordmark (hidden on desktop,
            where it shows in the utilities row); fills the slot the tagline vacates. */}
        <span className={styles.freshness}>{live}</span>
      </div>
    </header>
  );
}
