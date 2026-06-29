import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SECTIONS, type Section } from '../lib/feed';
import { MOBILE_MQ } from '../lib/responsive';
import { nextShownCount } from '../lib/twoRowCollapse';
import styles from './Controls.module.css';

interface Props {
  section: Section;
  onSection: (s: Section) => void;
  query: string;
  onQuery: (q: string) => void;
  categories: string[];
  category: string | null;
  onCategory: (c: string | null) => void;
  /** Whether the reader has followed topics — relabels "Top" → "For You". */
  hasInterests: boolean;
  /** Whether the topic picker is currently open (reflected on the button). */
  interestsOpen?: boolean;
  /** Re-open the topic picker. */
  onEditInterests: () => void;
}

interface ChipItem {
  key: string;
  label: string;
  cat: string | null;
}

export function Controls({
  section,
  onSection,
  query,
  onQuery,
  categories,
  category,
  onCategory,
  hasInterests,
  interestsOpen = false,
  onEditInterests,
}: Props) {
  const [chipsOpen, setChipsOpen] = useState(false);
  const active = SECTIONS.find((s) => s.key === section);
  const labelFor = (key: Section, label: string) =>
    key === 'top' && hasInterests ? 'For You' : label;
  const activeHint =
    active?.key === 'top' && hasInterests ? 'Tuned to the topics you follow' : (active?.hint ?? '');

  const chipItems: ChipItem[] = [
    { key: '__all__', label: 'All', cat: null },
    ...categories.map((c) => ({ key: c, label: c, cat: c })),
  ];

  // Collapsed rail state: how many leading chips to show so they + the inline
  // toggle occupy exactly two rows. null = measuring / show all; -1 = measured,
  // everything already fits in two rows (no toggle); >=1 = collapsed slice count.
  // We measure real positions (chip labels vary in width) and settle the count
  // so the "Show all" toggle lands at the END of row two, never on its own row.
  const railRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lastWidth = useRef(0);
  const [shown, setShown] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
  );
  // Desktop wraps the rail and collapses it to TWO rows behind a "show all" toggle
  // whenever the chips don't fit in two — measured per width, so even a narrow desktop
  // window never spills to a third row. Mobile stays a single swipeable row regardless.
  const collapsible = !isMobile;
  const sig = categories.join('|');

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // A new category set → re-measure from scratch.
  useLayoutEffect(() => {
    setShown(null);
    lastWidth.current = 0;
  }, [sig]);

  // Measure + settle the collapsed count. Re-runs as `shown` changes until the
  // inline toggle no longer spills onto a third row.
  useLayoutEffect(() => {
    if (!collapsible || chipsOpen || isMobile) {
      setShown((s) => (s === null ? s : null));
      return;
    }
    const rail = railRef.current;
    if (!rail) return;
    const chips = Array.from(rail.querySelectorAll<HTMLElement>('[data-chip]'));
    const toggle = rail.querySelector<HTMLElement>('[data-toggle]');
    if (chips.length === 0 || !toggle) return;

    const next = nextShownCount(
      chips.map((c) => c.offsetTop),
      toggle.offsetTop,
      shown,
    );
    if (next !== shown) setShown(next);
  }, [collapsible, chipsOpen, isMobile, sig, shown]);

  // Re-measure only when the rail's WIDTH changes (ignore the height changes our
  // own slicing causes, so this can't feedback-loop).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]!.contentRect.width;
      if (Math.abs(w - lastWidth.current) < 1) return;
      lastWidth.current = w;
      setShown(null);
    });
    ro.observe(rail);
    return () => ro.disconnect();
  }, []);

  // Keep the active section tab in view when it's selected. On a phone the tabs
  // scroll horizontally, so a tab near the end (e.g. Latest/Past) would otherwise
  // sit clipped at the edge. Scroll the RAIL (not the page) so the active tab is
  // fully visible with a small peek of its neighbour — the standard scrollable
  // tab-strip behaviour (Material/iOS). No-op when it's already comfortably in view.
  useEffect(() => {
    const rail = tabsRef.current;
    // No-op without a laid-out, scrollable rail (e.g. jsdom has no Element.scrollBy).
    if (!rail || typeof rail.scrollBy !== 'function') return;
    const active = rail.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active) return;
    const c = rail.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (c.width === 0) return; // not measured yet / no layout
    const peek = 28; // reveal a sliver of the adjacent tab to hint "there's more"
    const behavior: ScrollBehavior =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth';
    if (a.left < c.left + peek) rail.scrollBy({ left: a.left - c.left - peek, behavior });
    else if (a.right > c.right - peek) rail.scrollBy({ left: a.right - c.right + peek, behavior });
  }, [section]);

  const showAllChips = chipsOpen || shown === null || shown === -1;
  const visibleChips = showAllChips ? chipItems : chipItems.slice(0, Math.max(1, shown ?? 1));
  // Render the toggle while measuring (shown === null) and when collapsed with
  // overflow; hide it only once we've measured that everything fits (shown === -1).
  const showToggle = collapsible && shown !== -1;

  // The standfirst (hint + Personalize) and the category chip rail. On DESKTOP this sits
  // inside the sticky #controls (above the chips); on MOBILE it's rendered as a sibling
  // AFTER #controls so it scrolls away with the feed — only the slim section-tab bar
  // stays pinned, which keeps the mobile sticky chrome short (the chips are reachable at
  // the top). A sticky child of #controls would be bounded by it, hence the sibling.
  const filterArea = (
    <div className={styles.filterArea}>
      {active && (
        <div className={styles.standfirst}>
          <p className={styles.hint}>{activeHint}</p>
          <button
            type="button"
            className={styles.interests}
            onClick={onEditInterests}
            aria-pressed={interestsOpen}
            aria-label={hasInterests ? 'Edit interests' : 'Personalize'}
          >
            <svg
              className={styles.interestsIcon}
              viewBox="0 0 20 20"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <path
                d="M3 6h14M3 10h14M3 14h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="8" cy="6" r="2.4" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />
              <circle cx="13" cy="10" r="2.4" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />
              <circle cx="7" cy="14" r="2.4" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className={styles.interestsLabel}>
              {hasInterests ? 'Edit interests' : 'Personalize'}
            </span>
          </button>
        </div>
      )}

      {categories.length > 0 && (
        <div ref={railRef} className={styles.chips}>
          {visibleChips.map((it) => (
            <button
              key={it.key}
              data-chip
              className={`${styles.chip} ${category === it.cat ? styles.chipActive : ''}`}
              onClick={() => onCategory(it.cat !== null && category === it.cat ? null : it.cat)}
            >
              {it.label}
            </button>
          ))}
          {showToggle && (
            <button
              type="button"
              data-toggle
              className={styles.moreChips}
              onClick={() => setChipsOpen((o) => !o)}
              aria-expanded={chipsOpen}
            >
              {chipsOpen ? 'Show fewer' : `Show all ${categories.length} topics`}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div id="controls" className={styles.controls}>
        <div className={styles.row}>
          <div ref={tabsRef} className={styles.tabs} role="group" aria-label="Sections">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                aria-pressed={section === s.key}
                title={s.hint}
                className={`${styles.tab} ${section === s.key ? styles.tabActive : ''}`}
                onClick={() => onSection(s.key)}
              >
                {labelFor(s.key, s.label)}
              </button>
            ))}
          </div>

          <div className={styles.search}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 20 20"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M14 14 L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search stories…"
              aria-label="Search stories"
            />
          </div>
        </div>

        {/* Desktop: the filter row lives inside the sticky bar (above the chips). */}
        {!isMobile && filterArea}
      </div>

      {/* Mobile: the filter row scrolls away below the pinned tab bar. */}
      {isMobile && filterArea}
    </>
  );
}
