import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BreakingItem, EventItem } from '../lib/types';
import { formatRelative } from '../lib/format';
import { liveWireCount } from '../lib/liveWire';
import { safeHref } from '../lib/url';
import { MOBILE_MQ } from '../lib/responsive';
import { nextShownCount } from '../lib/twoRowCollapse';
import styles from './Breaking.module.css';

/** Corroboration count, capped so a wire-syndicated cluster reads "20+ outlets"
 * instead of an absurd precise number. The clean RSS-only ceiling is 12 distinct
 * newsrooms; larger counts come from GDELT syndication, where exact precision adds
 * nothing. Applies to both the widget and the per-article pin. */
const OUTLET_CAP = 20;
const outletLabel = (n: number) =>
  n > OUTLET_CAP ? `${OUTLET_CAP}+ outlets` : `${n} outlet${n === 1 ? '' : 's'}`;
/** Age from the freshest corroborating article (falls back to firstSeen on feeds
 * written before lastSeen existed). */
const itemAge = (it: BreakingItem) => formatRelative(it.lastSeen ?? it.firstSeen);

/** Time label for an event: LIVE while it's happening, otherwise a relative clock
 * ("in 3h" upcoming, "2h ago" just finished). */
const eventTime = (ev: EventItem) => (ev.status === 'live' ? 'Live' : formatRelative(ev.startTime));

// ── Per-article pins (inside ArticleView) ────────────────────────────────────

/** Per-article pin: the corroborated developing cluster(s) related to THIS story,
 * with a "Developing" flag. Renders nothing when there's no fresh coverage. */
export function BreakingPin({ items }: { items?: BreakingItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <aside className={styles.pin} aria-label="Developing coverage">
      <span className={styles.flag}>Developing</span>
      <ul className={styles.list}>
        {items.map((it) => {
          const href = safeHref(it.url);
          return (
            <li key={it.url ?? it.title}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={styles.link}>
                  {it.title}
                </a>
              ) : (
                <span className={styles.link}>{it.title}</span>
              )}
              <span className={styles.meta}>
                {outletLabel(it.outlets.length)} · {itemAge(it)}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** Per-article pin: the scheduled/live/just-finished event(s) mapped to THIS story
 * — the game, the Fed decision, the resolution clock. Renders nothing when none. */
export function EventsPin({ items }: { items?: EventItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <aside className={styles.pin} aria-label="Related events">
      <span className={`${styles.flag} ${styles.flagEvent}`}>Events</span>
      <ul className={styles.list}>
        {items.map((ev) => {
          const href = ev.url ? safeHref(ev.url) : null;
          const label = (
            <>
              {ev.title}
              <span className={styles.meta}>
                <EventStatus ev={ev} /> {ev.detail ? `· ${ev.detail}` : ''}
              </span>
            </>
          );
          return (
            <li key={ev.id}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={styles.link}>
                  {label}
                </a>
              ) : (
                <span className={styles.link}>{label}</span>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** A small status chip: a pulsing "Live" for in-progress, else the relative clock. */
function EventStatus({ ev }: { ev: EventItem }) {
  if (ev.status === 'live') return <b className={styles.livePill}>Live</b>;
  return <span>{eventTime(ev)}</span>;
}

// ── The global live widget (bottom-right, minimizable, tabbed) ───────────────

const TAB_KEY = 'crowdtell-livewire-tab';
const HIDDEN_KEY = 'crowdtell-livewire-hidden'; // categories the reader filtered out
const isPhone = (): boolean => typeof matchMedia !== 'undefined' && matchMedia(MOBILE_MQ).matches;
// A short beat before the wire glides in, so it reveals deliberately rather than
// popping over the reader's first paint.
const REVEAL_DELAY_MS = 900;
// How long a live-update preview lingers before it auto-dismisses.
const TOAST_MS = 6500;
// Desktop only: auto-tuck an open panel after this long with no interaction, so a wire
// the reader has drifted away from doesn't sit over the feed. Pointer/keyboard activity
// over the panel resets it; phones are exempt (they close on tap-outside and give no
// hover signal, so a timer could close mid-read).
const IDLE_CLOSE_MS = 15_000;

type Tab = 'all' | 'news' | 'events';

const readTab = (): Tab => {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t === 'all' || t === 'news' || t === 'events') return t;
  } catch {
    /* storage off */
  }
  return 'all';
};

const readHidden = (): Set<string> => {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* storage off / bad JSON */
  }
  return new Set();
};

/**
 * The global live wire — a persistent, minimizable bottom-right widget carrying two
 * parallel live channels: "News" (corroborated developing coverage that links out to
 * the original reporting, or INTO our briefing when the cluster maps to a tracked
 * story) and "Events" (scheduled/live/just-finished happenings off our markets' own
 * clocks + ESPN + macro + severe weather). An "All" tab interleaves them. Always starts
 * minimized to its pulsing tab (it never covers the feed unprompted); the reader opens
 * it on demand and on desktop it auto-tucks after a stretch of inactivity. Fades out
 * while the reader scrolls down and back in once the scroll settles, so it stays out of
 * the way mid-scroll. Renders nothing when nothing's live.
 */
export const DevelopingWidget = memo(function DevelopingWidget({
  news,
  events,
  onOpenStory,
}: {
  news?: BreakingItem[];
  events?: EventItem[];
  onOpenStory?: (marketId: string) => void;
}) {
  // Always starts minimized — the pulsing tab keeps it discoverable without the panel
  // covering the feed on load, and by design it never auto-opens, so there is no
  // open/closed state to persist.
  const [minimized, setMinimized] = useState(true);
  const [tab, setTab] = useState<Tab>(readTab);
  // Tuck the wire out of the way while the reader is actively scrolling DOWN, then
  // fade it back in once the scroll settles (or they scroll up). Stays mounted so the
  // hide/show is a buttery fade, and it's always there at rest — no scroll-up needed.
  const [scrollHidden, setScrollHidden] = useState(false);
  // Reveal the wire with a smooth fade+slide a beat after first paint (one-time).
  const [revealed, setRevealed] = useState(false);
  // A small preview that surfaces above the minimized tab when a NEW item arrives on
  // the live feed, so the reader sees what changed without re-opening the wire.
  const [toast, setToast] = useState<Row | null>(null);
  const [toastExtra, setToastExtra] = useState(0);
  // Categories the reader has filtered out (persisted), and whether the filter
  // chips are open. The wire spans many topics now, so this lets a reader narrow it.
  const [hidden, setHidden] = useState<Set<string>>(readHidden);
  const [showFilter, setShowFilter] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  // How many leading chips to show so they + the inline "Show all" toggle fill exactly
  // two rows. null = measuring; -1 = everything fits in <=2 rows (no toggle); >=1 = the
  // collapsed slice count. Mirrors the Controls rail so the toggle lands at the END of
  // row two, never on its own row.
  const [shown, setShown] = useState<number | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const seenKeys = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const tabRef = useRef<HTMLButtonElement>(null);
  const minBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const didMount = useRef(false);
  // Set for a "quiet" minimize — an idle auto-close or a click-outside dismiss — so the
  // focus-restore effect does NOT pull focus to the tab (the reader's attention is
  // elsewhere). A deliberate "–"/Escape minimize leaves it false and restores focus.
  const quietClose = useRef(false);

  const rawNews = useMemo(() => news ?? [], [news]);
  const rawEvents = useMemo(() => events ?? [], [events]);

  // Every topic present across both channels (for the filter chips), most-common first.
  const allTopics = useMemo(() => {
    const count = new Map<string, number>();
    for (const it of [...rawNews, ...rawEvents]) count.set(it.topic, (count.get(it.topic) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [rawNews, rawEvents]);

  // Apply the category filter everywhere downstream (rows, counts, preview).
  const newsItems = useMemo(() => rawNews.filter((n) => !hidden.has(n.topic)), [rawNews, hidden]);
  const eventItems = useMemo(() => rawEvents.filter((e) => !hidden.has(e.topic)), [rawEvents, hidden]);
  const total = newsItems.length + eventItems.length;
  // The minimized badge shows only genuinely-live signal (fresh news + live/imminent
  // events), not the full strip — so "Live (N)" never overcounts with scheduled-days-out
  // games or just-finished finals. The panel's "All" tab still shows everything (total).
  const liveCount = useMemo(
    () => liveWireCount(newsItems.length, eventItems, Date.now()),
    [newsItems, eventItems],
  );
  // Fall back to the full count off-hours, so the badge is never a misleading "Live 0"
  // when the wire still carries context (finals, daily world summaries) but nothing live.
  const badge = liveCount || total;

  // "All": live events first (most urgent), then developing news (freshest), then
  // upcoming/finished events — a forward-leaning interleave of both channels.
  const allRows = useMemo<Row[]>(() => {
    const liveEv = eventItems.filter((e) => e.status === 'live').map(toEventRow);
    const restEv = eventItems.filter((e) => e.status !== 'live').map(toEventRow);
    const newsRows = newsItems.map(toNewsRow);
    return [...liveEv, ...newsRows, ...restEv];
  }, [newsItems, eventItems]);

  const rows = useMemo<Row[]>(() => {
    if (tab === 'news') return newsItems.map(toNewsRow);
    if (tab === 'events') return eventItems.map(toEventRow);
    return allRows;
  }, [tab, allRows, newsItems, eventItems]);

  const toggleTopic = useCallback((topic: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        /* storage off */
      }
      return next;
    });
  }, []);

  const setMin = useCallback((v: boolean) => setMinimized(v), []);

  const pickTab = useCallback((t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* storage off */
    }
  }, []);

  // Open the wire to the channel the previewed item lives on, and clear the preview.
  const openFromToast = useCallback(
    (r: Row) => {
      pickTab(r.kind === 'news' ? 'news' : 'events');
      setToast(null);
      setMin(false);
    },
    [pickTab, setMin],
  );

  // Fade out while scrolling DOWN (gets out of the reader's way), back in on scroll-up
  // or once the scroll comes to rest (~420ms idle) — at any position, including the
  // page bottom. A small dead-zone ignores sub-pixel jitter / momentum wobble.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastY = window.scrollY;
    let idle: ReturnType<typeof setTimeout>;
    let raf = 0;
    const read = () => {
      raf = 0;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (dy > 6) setScrollHidden(true);
      else if (dy < -6) setScrollHidden(false);
      clearTimeout(idle);
      idle = setTimeout(() => setScrollHidden(false), 420);
    };
    // Coalesce to one read per frame (mirrors Header's scroll handler). This widget is
    // always mounted on the feed, so a raw per-event handler ran the body dozens of
    // times/sec on every flick; rAF caps it at once per frame.
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(idle);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Keep keyboard focus on the control that replaces the one the reader just
  // activated across the minimize/expand swap (skip the initial mount).
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    // An idle auto-close must not yank focus to the tab (the reader may be reading the
    // feed); only a user-driven expand/minimize moves focus across the control swap.
    if (quietClose.current) {
      quietClose.current = false;
      return;
    }
    (minimized ? tabRef : minBtnRef).current?.focus();
  }, [minimized]);

  // Escape minimizes the expanded panel (lightweight popover convention).
  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMin(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [minimized, setMin]);

  // Desktop: auto-minimize after IDLE_CLOSE_MS with no interaction with the panel, so an
  // opened wire the reader has moved on from tucks itself back into the tab. Any
  // pointer/keyboard activity over the panel restarts the clock. Phones are exempt —
  // tap-outside already closes them, and a touch device gives no hover signal, so a
  // timer would risk closing mid-read.
  useEffect(() => {
    if (minimized || isPhone()) return;
    const panel = panelRef.current;
    if (!panel) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        quietClose.current = true; // close without stealing focus to the tab
        setMin(true);
      }, IDLE_CLOSE_MS);
    };
    const activity: (keyof HTMLElementEventMap)[] = [
      'pointermove',
      'pointerdown',
      'keydown',
      'wheel',
      'focusin',
    ];
    arm();
    for (const e of activity) panel.addEventListener(e, arm, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of activity) panel.removeEventListener(e, arm);
    };
  }, [minimized, setMin]);

  // Reveal a short beat after there's something to show — one-time; the CSS
  // fades + slides the widget in once `data-revealed` flips.
  const hasItems = total > 0;
  useEffect(() => {
    if (!hasItems || revealed) return;
    const t = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [hasItems, revealed]);

  // If the active tab empties (e.g. news clears) but the other still has items,
  // fall back to a populated tab so the panel never shows an empty body.
  useEffect(() => {
    if (rows.length > 0) return;
    if (tab === 'news' && eventItems.length) setTab('events');
    else if (tab === 'events' && newsItems.length) setTab('news');
  }, [rows.length, tab, eventItems.length, newsItems.length]);

  // Detect genuinely-new items arriving on the live feed and, while the wire is
  // minimized, surface the most-urgent one as a preview toast. The FIRST populated
  // batch is baselined silently (so a normal page load never toasts); only items
  // that appear afterwards (a realtime update) count as new. Ordered live-event →
  // news → other-event so the preview leads with the most pressing arrival.
  useEffect(() => {
    // Baseline + detect against the RAW feed (not the filtered view) so toggling a
    // category filter never makes already-seen items look "new".
    const current: Row[] = [
      ...rawEvents.filter((e) => e.status === 'live').map(toEventRow),
      ...rawNews.map(toNewsRow),
      ...rawEvents.filter((e) => e.status !== 'live').map(toEventRow),
    ];
    if (!seeded.current) {
      if (current.length === 0) return; // wait for the first real batch to baseline
      for (const r of current) seenKeys.current.add(r.key);
      seeded.current = true;
      return;
    }
    const fresh = current.filter((r) => !seenKeys.current.has(r.key));
    if (fresh.length === 0) return;
    for (const r of fresh) seenKeys.current.add(r.key);
    // Only preview categories the reader hasn't filtered out.
    const shown = fresh.filter((r) => !hidden.has(r.item.topic));
    if (minimized && shown.length) {
      setToast(shown[0]!);
      setToastExtra(shown.length - 1);
    }
  }, [rawNews, rawEvents, minimized, hidden]);

  // Settle how many chips to show so they + the inline toggle occupy exactly two rows,
  // with the toggle at the END of row two. Re-measures from scratch on open / topic
  // change / resize, then narrows until the toggle no longer spills to a third row.
  // Uses offsetTop (shared offsetParent across the chips) — 0 under jsdom, where it
  // resolves to "everything fits" (shown=-1), so the toggle simply never appears.
  const topicsSig = allTopics.join('|');
  useLayoutEffect(() => {
    setShown(null);
    if (!showFilter) setFilterExpanded(false);
  }, [topicsSig, showFilter]);
  useLayoutEffect(() => {
    if (!showFilter || filterExpanded) return;
    const el = filterRef.current;
    if (!el) return;
    const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-fchip]'));
    const toggle = el.querySelector<HTMLElement>('[data-ftoggle]');
    if (chips.length === 0 || !toggle) return;
    const next = nextShownCount(
      chips.map((c) => c.offsetTop),
      toggle.offsetTop,
      shown,
    );
    if (next !== shown) setShown(next);
  }, [showFilter, filterExpanded, topicsSig, shown]);

  // Re-measure on resize (width changes which chips fit per row).
  useEffect(() => {
    if (!showFilter) return;
    const onResize = () => setShown(null);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [showFilter]);

  // The preview auto-dismisses after a beat, and never lingers once the reader opens
  // the wire (the item is then visible in the list).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!minimized) setToast(null);
  }, [minimized]);

  // Light-dismiss: a pointer-down anywhere outside the open panel minimizes it — the
  // standard non-modal-popover convention, desktop and phone alike (alongside the
  // explicit "–" button and Escape). Deferred attach so the click that OPENED the panel
  // doesn't instantly close it; like the idle close it doesn't pull focus to the tab,
  // since the reader's attention is wherever they just clicked.
  useEffect(() => {
    if (minimized) return;
    const onDown = (e: Event) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        quietClose.current = true;
        setMin(true);
      }
    };
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [minimized, setMin]);

  const rawTotal = rawNews.length + rawEvents.length;
  if (rawTotal === 0) return null;

  if (minimized) {
    return (
      <div
        className={`${styles.widget} ${styles.widgetMin}`}
        data-revealed={revealed ? 'true' : undefined}
        data-hidden={scrollHidden ? 'true' : undefined}
      >
        {toast && <LivePreview row={toast} extra={toastExtra} onOpen={openFromToast} onClose={() => setToast(null)} />}
        <button
          ref={tabRef}
          type="button"
          className={styles.tab}
          onClick={() => setMin(false)}
          aria-label={`Open live wire (${badge} live)`}
        >
          <span className={styles.flag}>Live</span>
          <b className={styles.count}>{badge}</b>
          <span className={styles.caret} aria-hidden="true">
            ▴
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={styles.widget}
      data-revealed={revealed ? 'true' : undefined}
      data-hidden={scrollHidden ? 'true' : undefined}
    >
      <section ref={panelRef} className={styles.panel} aria-label="Live wire">
        <div className={styles.head}>
          <div className={styles.tabs} role="group" aria-label="Live wire channels">
            <TabBtn label="All" active={tab === 'all'} count={total} onClick={() => pickTab('all')} />
            <TabBtn label="News" active={tab === 'news'} count={newsItems.length} onClick={() => pickTab('news')} />
            <TabBtn label="Events" active={tab === 'events'} count={eventItems.length} onClick={() => pickTab('events')} />
          </div>
          <div className={styles.headBtns}>
            <button
              type="button"
              className={styles.gear}
              data-on={hidden.size > 0 ? 'true' : undefined}
              onClick={() => setShowFilter((v) => !v)}
              aria-label="Filter categories"
              aria-expanded={showFilter}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <line x1="2" y1="4.5" x2="14" y2="4.5" />
                <line x1="2" y1="8" x2="14" y2="8" />
                <line x1="2" y1="11.5" x2="14" y2="11.5" />
                <circle cx="5.5" cy="4.5" r="1.7" fill="var(--surface)" />
                <circle cx="10.5" cy="8" r="1.7" fill="var(--surface)" />
                <circle cx="6.5" cy="11.5" r="1.7" fill="var(--surface)" />
              </svg>
            </button>
            <button
              ref={minBtnRef}
              type="button"
              className={styles.minBtn}
              onClick={() => setMin(true)}
              aria-label="Minimize live wire"
            >
              –
            </button>
          </div>
        </div>
        {showFilter && (
          <div ref={filterRef} className={styles.filterBar} role="group" aria-label="Filter by category">
            {(filterExpanded || shown === null || shown === -1
              ? allTopics
              : allTopics.slice(0, Math.max(1, shown))
            ).map((t) => (
              <button
                key={t}
                type="button"
                data-fchip=""
                className={styles.filterChip}
                data-on={!hidden.has(t) ? 'true' : undefined}
                aria-pressed={!hidden.has(t)}
                onClick={() => toggleTopic(t)}
              >
                {t}
              </button>
            ))}
            {shown !== -1 && (
              <button
                type="button"
                data-ftoggle=""
                className={styles.filterToggleChip}
                onClick={() => setFilterExpanded((v) => !v)}
                aria-expanded={filterExpanded}
              >
                {filterExpanded ? 'Show less' : `Show all ${allTopics.length}`}
              </button>
            )}
          </div>
        )}
        {rows.length === 0 ? (
          <p className={styles.empty}>
            No matching updates{hidden.size > 0 ? ' — adjust the category filters above.' : '.'}
          </p>
        ) : (
          <ul className={styles.items}>
            {rows.map((r) => (
              <li key={r.key}>
                <Item row={r} onOpenStory={onOpenStory} />
              </li>
            ))}
          </ul>
        )}
        <p className={styles.colophon}>
          {tab === 'events'
            ? 'Wikipedia · USGS · GDACS · ESPN · NWS · Finnhub · PandaScore'
            : tab === 'news'
              ? 'Corroborated across newsrooms'
              : 'Live news + events'}
        </p>
      </section>
    </div>
  );
});

function TabBtn({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={styles.tabBtn}
      data-active={active ? 'true' : undefined}
      onClick={onClick}
    >
      {label}
      {count > 0 && <span className={styles.tabCount}>{count}</span>}
    </button>
  );
}

// A unified row so "All" can interleave the two channels with one render path.
type Row =
  | { kind: 'news'; key: string; item: BreakingItem }
  | { kind: 'event'; key: string; item: EventItem };

const toNewsRow = (item: BreakingItem): Row => ({ kind: 'news', key: `n:${item.url ?? ''}|${item.title}`, item });
const toEventRow = (item: EventItem): Row => ({ kind: 'event', key: `e:${item.id}`, item });

function Item({ row, onOpenStory }: { row: Row; onOpenStory?: (marketId: string) => void }) {
  const isNews = row.kind === 'news';
  const topic = row.item.topic;
  const title = row.item.title;
  const marketId = row.item.marketId;
  const externalHref = row.item.url ? safeHref(row.item.url) : null;

  const body = (
    <>
      <span className={styles.itemTopic}>
        {!isNews && <span className={styles.kindDot} data-kind={row.item.kind} aria-hidden="true" />}
        {topic}
      </span>
      <span className={styles.itemTitle}>{title}</span>
      <span className={styles.meta}>
        {isNews ? (
          <>
            {outletLabel(row.item.outlets.length)} · {itemAge(row.item)}
          </>
        ) : (
          <>
            <EventStatus ev={row.item} />
            {row.item.detail ? ` · ${row.item.detail}` : ''}
          </>
        )}
      </span>
    </>
  );

  // Prefer keeping the reader in-app: if the row maps to one of our briefings, open
  // it. Otherwise follow the external source (news) or event link when present.
  if (marketId && onOpenStory) {
    return (
      <button type="button" className={`${styles.item} ${styles.itemBtn}`} onClick={() => onOpenStory(marketId)}>
        {body}
        <span className={styles.readUs}>Our briefing →</span>
      </button>
    );
  }
  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noopener noreferrer nofollow" className={styles.item}>
        {body}
      </a>
    );
  }
  return <span className={styles.item}>{body}</span>;
}

/** The live-update preview that surfaces above the minimized tab: a compact, tappable
 * card showing the freshest new item (tap → open the wire to its channel), with an
 * explicit dismiss and a "+N more" hint when several arrived at once. Announced
 * politely to assistive tech. */
function LivePreview({
  row,
  extra,
  onOpen,
  onClose,
}: {
  row: Row;
  extra: number;
  onOpen: (r: Row) => void;
  onClose: () => void;
}) {
  const isNews = row.kind === 'news';
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <button type="button" className={styles.toastBody} onClick={() => onOpen(row)}>
        {isNews ? (
          <span className={styles.flag}>Developing</span>
        ) : (
          <span className={styles.itemTopic}>
            <span className={styles.kindDot} data-kind={row.item.kind} aria-hidden="true" />
            {row.item.topic}
          </span>
        )}
        <span className={styles.itemTitle}>{row.item.title}</span>
        <span className={styles.meta}>
          {isNews ? (
            <>
              {outletLabel(row.item.outlets.length)} · {itemAge(row.item)}
            </>
          ) : (
            <>
              <EventStatus ev={row.item} />
              {row.item.detail ? ` · ${row.item.detail}` : ''}
            </>
          )}
          {extra > 0 && <span className={styles.toastMore}>+{extra} more</span>}
        </span>
      </button>
      <button type="button" className={styles.toastClose} onClick={onClose} aria-label="Dismiss preview">
        ×
      </button>
    </div>
  );
}
