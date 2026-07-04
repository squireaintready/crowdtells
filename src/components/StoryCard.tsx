import {
  type CSSProperties,
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Market } from '../lib/types';
import { signalsFor } from '../lib/signals';
import { categoryHue, formatDeadline, formatPct, formatRelative } from '../lib/format';
import { hydrateBriefing } from '../lib/hydrate';
import { pickCardImage } from '../lib/cardImage';
import { imageKind } from '../lib/imageKind';
import { safeHref } from '../lib/url';
import { track } from '../lib/posthog';
import { outletDisplay } from '../lib/sources';
import { beliefSeries } from '../lib/trend';
import { useIntensity } from '../hooks/useIntensity';
import { InterestSignal } from './InterestSignal';
import { ProbBar } from './ProbBar';
import { SaveButton } from './SaveButton';
import { ShareButton } from './ShareButton';
import { AggressiveLead } from './pretext/AggressiveLead';
import styles from './StoryCard.module.css';

// The most-traded facets of a board line read as a tight row of chips beneath it —
// kept short so a digest stays a glance, not a table.
const DIGEST_FACET_MAX = 4;

interface Props {
  market: Market;
  /** Open the full article view for this story. */
  onOpen: (id: string) => void;
  lead?: boolean;
}

const SOURCE_NAME: Record<Market['source'], string> = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
};

// Resting reveal once the card scrolls into view (0 = hidden, 1 = fully shown).
// StoryCard.module.css keys its hero-band "pull" off this value (0.42 and the
// derived 1 - 0.42 = 0.58 divisor) — keep them in sync if you change it.
const REVEAL_BASE = 0.42;
// Touch-and-hold (mobile) or hover (desktop) clears the image to this peek.
const PEEK = 0.66;
// Dragging left this fraction of the card's width fully reveals the image and
// opens the story — ~60% of the screen, so most of the picture shows first.
const OPEN_FRACTION = 0.6;
// A press must rest this long before it peeks, so a flick-scroll never does.
const HOLD_MS = 120;
// The image band occupies the right of the card (≤58% wide, anchored right) and
// starts at roughly this fraction. A tap/hold past it that lands on the article
// itself (not a text/interactive child) is on the picture → reveal, not nav.
const BAND_FROM = 0.42;
// Scroll-in entrance: the picture arrives fully open, then eases back to its
// resting curtain over this long — slower than the snappy gesture tweens (420ms)
// so the settle reads as deliberate, not a flick.
const ENTRANCE_MS = 620;

// easeOutCubic drives the snappy gesture tweens (peek / spring-back); the
// entrance recede uses easeInOutCubic so it dwells at full a beat, then glides
// gently into the resting position.
const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOutCubic = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

// ——— Aggressive headline: scale the size with the money at stake ———
// The bold design target scales the lead headline with volume. We bound it hard
// for legibility: the size is computed in JS (SSR-safe — no engine), passed as the
// --head-px var, and the CSS applies it via max(calm-clamp, --head-px) so it is
// NEVER smaller than the shipped calm headline at any viewport or theme.
//
// Rather than re-normalise across the (memoised, per-card) feed window — which would
// force the whole visible set through every card — we map log10(volume) over a fixed
// reference band that spans the realistic Polymarket/Kalshi range. Deterministic,
// prop-free, and the floor/ceiling stay legible regardless of the day's feed.
const VOL_MIN = 50_000; // ~floor of a story worth ranking
const VOL_MAX = 50_000_000; // a genuine blockbuster market
const LOG_MIN = Math.log10(VOL_MIN);
const LOG_SPAN = Math.log10(VOL_MAX) - LOG_MIN;
/** 0..1 position of `volume` on the log money scale. */
function moneyWeight(volume: number): number {
  if (!(volume > 0)) return 0;
  return Math.max(0, Math.min(1, (Math.log10(volume) - LOG_MIN) / LOG_SPAN));
}
/** Bounded headline size (px) for the aggressive treatment. Lead cards get a wider,
 *  more dramatic range; non-lead cards a gentle lift — both capped so they stay
 *  readable in the ≤70% text column even on a 390px phone. */
function headlinePx(volume: number, lead: boolean): number {
  const f = moneyWeight(volume);
  return lead ? 24 + f * 6 : 19 + f * 5; // lead 24→30, others 19→24
}

// ——— Aggressive lead: the prose that pours around the confidence curve ———
// The comp flows the briefing BODY around the curve, not the short standfirst (deks
// average ~30–110 chars — far too little to carve a curve into). We do the same, but
// trim the prose to a card-sized teaser at a sentence/word boundary so the flowed
// block stays a scannable height on the one lead card. Pure + SSR-safe.
const CARD_TEASER_MAX = 300;
function cardTeaser(text: string): string {
  const t = text.trim();
  if (t.length <= CARD_TEASER_MAX) return t;
  const slice = t.slice(0, CARD_TEASER_MAX);
  // Prefer ending on a whole sentence if one lands in the back half of the window —
  // a clean teaser, no ellipsis needed.
  const sentence = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sentence >= CARD_TEASER_MAX * 0.6) return slice.slice(0, sentence + 1);
  // Otherwise cut at the last word boundary and mark the elision.
  const word = slice.lastIndexOf(' ');
  return `${slice.slice(0, word > 0 ? word : CARD_TEASER_MAX).trimEnd()}…`;
}

/**
 * A `digest`-format market — a sports line or a recurring/price prop that is NEVER
 * briefed — reads as a quiet "on the board" row beneath the news, not a story card.
 * It carries the crowd's number inline and (if present) its other lines as small
 * facet chips, and the whole row links OUT to the platform (a digest has no in-app
 * article). Deliberately lighter and shorter than a StoryCard: no hero, no gesture,
 * no "briefing incoming". Its own component so the dispatcher below stays hook-free.
 */
function DigestRow({ market: m }: { market: Market }) {
  const source = m.source === 'kalshi' ? 'kalshi' : 'polymarket';
  const href = safeHref(m.marketUrl);
  // The other lines on this game/series — the most-traded few, as compact chips.
  const facets = (m.subSignals ?? []).slice(0, DIGEST_FACET_MAX);
  const catHue = categoryHue(m.category);

  const body = (
    <>
      <div className={`${styles.eyebrow} ${styles.boardEyebrow}`}>
        <span className={styles.boardLabel}>On the board</span>
        <span className={styles.category}>{m.category}</span>
        <span className={styles.sep} aria-hidden="true">
          /
        </span>
        <span className={`${styles.source} ${styles[source]}`}>{SOURCE_NAME[source]}</span>
        {m.endDate && <span className={styles.deadline}>{formatDeadline(m.endDate)}</span>}
      </div>

      {/* Same level as a story headline — a digest first-in-feed must not skip h2→h3. */}
      <h2 className={styles.boardTitle}>{m.title}</h2>

      <div className={`${styles.boardRead} tnum`}>
        <span className={styles.boardFavored}>{m.favored}</span>
        <span className={styles.boardOdds}>{formatPct(m.oddsPct)}</span>
        <ProbBar pct={m.oddsPct} favored={m.favored} />
      </div>

      {facets.length > 0 && (
        <div className={styles.boardFacets}>
          {facets.map((f, i) => (
            <span key={`${f.title}-${i}`} className={styles.boardChip} title={f.title}>
              <span className={styles.boardChipName}>{f.favored}</span>
              <span className={`${styles.boardChipOdds} tnum`}>{formatPct(f.oddsPct)}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );

  // The whole row is the link out to the platform (digests have no in-app article).
  // Falls back to a plain row if the URL is somehow unsafe, so it never dead-links.
  return href ? (
    <a
      id={`s-${m.id}`}
      className={`${styles.board} ${styles.boardLink}`}
      style={{ '--cat-h': catHue } as CSSProperties}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('digest_opened', { market_id: m.id, category: m.category })}
    >
      {body}
    </a>
  ) : (
    <div
      id={`s-${m.id}`}
      className={styles.board}
      style={{ '--cat-h': catHue } as CSSProperties}
    >
      {body}
    </div>
  );
}

/** Dispatch: a digest reads as a quiet board row; every other format is the full
 *  story card below. The memo boundary lives here, so the card's hooks never run
 *  for a digest (and the digest path adds no hooks before a conditional). */
export const StoryCard = memo(function StoryCard(props: Props) {
  if (props.market.format === 'digest') return <DigestRow market={props.market} />;
  return <FullCard {...props} />;
});

function FullCard({ market: m, onOpen, lead }: Props) {
  const pending = !m.generatedAt;
  const signals = signalsFor(m);
  const outlets = m.sources.slice(0, 3);
  // Tolerate pre-migration records that predate the `source` field.
  const source = m.source === 'kalshi' ? 'kalshi' : 'polymarket';

  // Reading style. 'aggressive' is the default (set on <html> before paint, so this
  // is first-render-correct — no flash). The aggressive treatment is otherwise a
  // progressive enhancement: the headline size below is SSR-safe, and the lead's
  // curve-flowed teaser falls back to the real calm paragraph until the engine loads.
  const { intensity } = useIntensity();
  const aggressive = intensity === 'aggressive';

  // {odds}/{gap}/{volume} tokens → live values, so the teaser matches the card.
  const dek = m.dek ? hydrateBriefing(m.dek, m) : '';
  const analysis = hydrateBriefing(m.analysis, m);
  // Calm card teaser: the short standfirst when we have one, else the briefing prose.
  const teaser = dek || analysis;
  // The durable belief arc behind the lead card's confidence curve. A usable curve
  // needs ≥3 points; the calm teaser shows otherwise. Cheap — only built for the lead.
  const beliefArc = lead ? beliefSeries(m.oddsDaily, m.oddsHistory) : [];
  // The aggressive lead becomes a compact horizontal belief chart (time left→right)
  // with the briefing prose set against it — the SAME unified primitive as the article
  // lead. We feed it the briefing prose (trimmed to a card-sized teaser), not the short
  // standfirst. Only built for an aggressive lead with a curve worth charting (≥3 pts);
  // the calm card keeps its standfirst untouched. The swap is a client enhancement.
  const flowText = aggressive && lead ? cardTeaser(analysis) : '';
  // The belief strip sits below the teaser, so it no longer needs a long teaser to
  // wrap around — a real curve (≥3 points) and any teaser is enough.
  const flowLead = !!lead && aggressive && !pending && beliefArc.length >= 3 && flowText.length > 0;
  // Every briefed story carries a picture of whatever it's about — the chosen
  // person portrait, else the most-prominent subject (flag, logo, landmark…),
  // else the platform thumbnail. Photos fill the band; flags/logos sit contained.
  const cardImage = pickCardImage(m);
  // Flags/logos/coins, and the platform's own thumbnail (a square/landscape mark,
  // not a portrait scene), read better contained than cover-cropped into the band.
  const contain =
    !!cardImage && (imageKind(cardImage) !== 'photo' || cardImage.source === 'polymarket');
  // Contained marks (flag/logo/coin) read as a right-anchored emblem; photos fill
  // the band (faces sit high, scenes centered).
  const heroPos = contain ? 'right center' : cardImage?.type === 'person' ? 'top center' : 'center';
  // Read once per mount (not every render) — StoryCard renders in a 12-card window.
  const reduceMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const canOpen = !pending;
  // Reduced motion disables the reveal gesture, so the image must NOT also swallow
  // taps — gate both the swipe wiring and the image-tap suppression on this.
  const swipeable = !!cardImage && canOpen && !reduceMotion;

  // Deterministic per-category hue → the subtle tinted card background.
  const catHue = categoryHue(m.category);

  const ref = useRef<HTMLElement>(null);
  // The hero "curtain" is driven by a single --reveal float (0..1). We animate it
  // ourselves (rAF) so it's buttery in every browser — no dependency on @property —
  // and follows the finger 1:1 while dragging. opacity/transform stay composited;
  // the band width + mask repaint only while the curtain is actively moving (a
  // pull/swipe or the one-shot scroll-in recede) — never at rest.
  const cur = useRef(0);
  const raf = useRef(0);
  // Gesture state: the in-flight drag, the just-finished-swipe guard (so the
  // click after a drag doesn't re-open), the held/peeked flag, and the
  // touch-and-hold timer.
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const justSwiped = useRef(false);
  const held = useRef(false);
  const holdTimer = useRef(0);
  const setReveal = (v: number) => {
    cur.current = v;
    ref.current?.style.setProperty('--reveal', v.toFixed(3));
  };
  const animateReveal = (to: number, dur = 420, ease = easeOutCubic) => {
    const from = cur.current;
    if (Math.abs(to - from) < 0.001) return setReveal(to);
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setReveal(from + (to - from) * ease(k));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  // Entrance: the picture arrives FULLY OPEN — the full-swipe state — then eases
  // back to its resting curtain, collapsing to the right, as the card scrolls into
  // view. Pre-set to full on mount (before the observer fires), so a card scrolled
  // in from below is already expanded and recedes — never a fade-up from nothing.
  // The recede runs once per card (observer disconnects). Reduced-motion → straight
  // to rest, no animation.
  useEffect(() => {
    if (!cardImage) return;
    const el = ref.current;
    if (!el || reduceMotion || typeof IntersectionObserver === 'undefined') {
      setReveal(REVEAL_BASE);
      return;
    }
    setReveal(1);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          animateReveal(REVEAL_BASE, ENTRANCE_MS, easeInOutCubic);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardImage?.url]);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(holdTimer.current);
    },
    [],
  );

  // Hero pictures load lazily: a CSS background-image can't use loading="lazy",
  // so the URL is only attached once the card nears the viewport (one screen of
  // look-ahead). First-window cards intersect immediately; cards deep in the
  // feed never fetch their picture unless the reader scrolls toward them.
  const [heroSrc, setHeroSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!cardImage) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHeroSrc(cardImage.url);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHeroSrc(cardImage.url);
          io.disconnect();
        }
      },
      { rootMargin: '100% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardImage?.url]);

  // The image band is a reveal surface, not a nav target. Touch-and-hold clears it;
  // a horizontal drag (mouse or touch) pulls it across and a full swipe opens the
  // story. touch-action:pan-y (CSS) keeps vertical scroll native, so this never
  // fights the feed. A tap on the band does nothing — the headline, body and
  // "Read article" are the ways in.
  const clearHold = () => {
    clearTimeout(holdTimer.current);
    holdTimer.current = 0;
  };
  // True when the pointer is on the picture itself: it hit the article box (not a
  // text node or control — the hero has pointer-events:none, so taps over the bare
  // band land on the article) AND sits within the right-hand band. So text taps
  // anywhere (even over the revealed image) still open; only the bare picture
  // drives the gesture. Unmeasured layouts (jsdom) report no width → treat as text.
  const onImageBand = (e: { target: EventTarget | null; clientX: number }) => {
    const el = ref.current;
    if (!el || e.target !== el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return false;
    return e.clientX - r.left >= r.width * BAND_FROM;
  };
  const peek = () => {
    held.current = true;
    animateReveal(PEEK);
  };
  const restToBase = () => {
    held.current = false;
    animateReveal(REVEAL_BASE);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!swipeable) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // We do NOT cancel an in-flight tween here: a mere tap must never abort the
    // scroll-in recede (or a peek / spring-back) and strand the curtain wider than
    // its resting state. Only a CONFIRMED drag stops the tween (see onPointerMove).
    clearHold();
    justSwiped.current = false;
    drag.current = { x: e.clientX, y: e.clientY, active: false };
    // A deliberate hold on the picture (touch only) peeks it clear; a scroll or drag
    // cancels the pending peek before it fires. A mouse has no hold-peek — it reveals
    // by dragging, or opens by clicking the text.
    if (e.pointerType !== 'mouse' && onImageBand(e)) {
      holdTimer.current = window.setTimeout(peek, HOLD_MS);
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const d = drag.current;
    // No hover-peek on desktop: animating the curtain (band width + mask) on every
    // mouse-over repainted the hero continuously and made the feed feel laggy. Hover
    // now does a cheap compositor-only brighten in CSS; the full reveal is the drag/
    // swipe below (mouse OR touch) and the touch hold-peek — so mobile is unchanged.
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        drag.current = null; // vertical intent → let the page scroll, no reveal
        clearHold();
        return;
      }
      d.active = true;
      clearHold();
      // A confirmed drag drives --reveal directly from here — stop any in-flight
      // tween (scroll-in recede, peek, spring-back) so it doesn't fight the finger.
      cancelAnimationFrame(raf.current);
      el.style.cursor = 'grabbing';
      el.setPointerCapture?.(e.pointerId);
    }
    const width = el.offsetWidth || 1;
    const progress = Math.min(1, Math.max(0, -dx / (width * OPEN_FRACTION)));
    // Map the finger from the current resting floor (peek if held, else base) up
    // to fully open, so the curtain follows from the first pixel — no dead travel.
    const floor = held.current ? PEEK : REVEAL_BASE;
    setReveal(floor + (1 - floor) * progress);
  };
  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    clearHold();
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!el) return;
    if (!d || !d.active) {
      // No drag happened: a touch-hold peek springs back on release. (Only touch ever
      // sets `held` — desktop has no hover-peek — so this is touch-only by construction.)
      if (held.current) restToBase();
      return;
    }
    el.style.cursor = '';
    justSwiped.current = true; // suppress the click that follows a drag
    const dx = e.clientX - d.x;
    const width = el.offsetWidth || 1;
    const progress = Math.min(1, Math.max(0, -dx / (width * OPEN_FRACTION)));
    // Release the swipe's pointer capture BEFORE navigating, so the article's
    // history entry isn't pushed mid-gesture — that let the browser record the
    // wrong (top) scroll for the feed entry and jump to the top on Back.
    el.releasePointerCapture?.(e.pointerId);
    if (progress >= 1) open('swipe');
    else restToBase();
  };
  const onPointerCancel = () => {
    clearHold();
    drag.current = null;
    restToBase();
  };

  // Open the article, tagging how the reader got there (feed-engagement analytics).
  const open = (method: 'tap' | 'swipe' | 'button') => {
    track('card_opened', { market_id: m.id, category: m.category, method });
    onOpen(m.id);
  };

  // The card opens the story — but not from the image band (reserved for the
  // reveal gesture), and not over real controls, links, or a text selection.
  const onCardClick = (e: ReactMouseEvent<HTMLElement>) => {
    if (justSwiped.current) {
      justSwiped.current = false;
      return;
    }
    const el = e.target as HTMLElement;
    if (el.closest('a, button, input, textarea, select, label')) return;
    if (window.getSelection()?.toString()) return;
    if (swipeable && onImageBand(e)) return;
    open('tap');
  };

  return (
    <article
      ref={ref}
      id={`s-${m.id}`}
      className={`${styles.story} ${lead ? styles.lead : ''} ${aggressive ? styles.aggressive : ''} ${
        canOpen ? styles.clickable : ''
      } ${cardImage ? styles.hasHero : !pending ? styles.hasSpine : ''}`}
      style={
        {
          '--cat-h': catHue,
          // Money-scaled headline (bounded; CSS keeps it ≥ the calm size). Only the
          // aggressive style reads this var — calm leaves the headline untouched.
          ...(aggressive && !pending ? { '--head-px': `${headlinePx(m.volume, !!lead)}px` } : null),
        } as CSSProperties
      }
      onClick={canOpen ? onCardClick : undefined}
      onPointerDown={swipeable ? onPointerDown : undefined}
      onPointerMove={swipeable ? onPointerMove : undefined}
      onPointerUp={swipeable ? endDrag : undefined}
      onPointerCancel={swipeable ? onPointerCancel : undefined}
    >
      {cardImage ? (
        <div
          className={`${styles.hero} ${contain ? styles.heroContain : ''}`}
          style={{
            ...(heroSrc ? { backgroundImage: `url("${heroSrc}")` } : null),
            backgroundPosition: heroPos,
          }}
          aria-hidden="true"
        />
      ) : (
        !pending && (
          // No resolvable picture — a slim category-tinted spine keeps the card
          // illustrated without eating the text column (decorative, no gesture).
          <div className={styles.spine} aria-hidden="true">
            <span>{m.category}</span>
          </div>
        )
      )}

      <div className={styles.eyebrow}>
        {signals.decided ? (
          <span
            className={styles.decided}
            title="The outcome is effectively decided — near-certain and stable, though the market hasn't officially settled."
          >
            Decided
          </span>
        ) : (
          signals.surging && <span className={styles.breaking}>Breaking</span>
        )}
        <span className={styles.category}>{m.category}</span>
        <span className={styles.sep} aria-hidden="true">
          /
        </span>
        <span className={`${styles.source} ${styles[source]}`}>{SOURCE_NAME[source]}</span>
        {m.generatedAt && <span className={styles.dateline}>{formatRelative(m.generatedAt)}</span>}
        {m.endDate && <span className={styles.deadline}>{formatDeadline(m.endDate)}</span>}
        {(m.crowdVsCoverage === 'ahead' || m.crowdVsCoverage === 'contested') && (
          <span
            className={`${styles.pressFlag} ${
              m.crowdVsCoverage === 'contested' ? styles.pressContested : styles.pressAhead
            }`}
            title="How the market's money lines up with the cited coverage"
          >
            {m.crowdVsCoverage === 'contested' ? 'Coverage disputes this' : 'Crowd ahead of press'}
          </span>
        )}
      </div>

      <h2 className={styles.headline}>{m.hook || m.title}</h2>

      {m.status === 'resolved' && m.resolvedOutcome && (
        <div
          className={`${styles.recap} ${m.calledCorrectly ? styles.recapHit : styles.recapMiss}`}
        >
          <span className={styles.recapMark} aria-hidden="true">
            {m.calledCorrectly ? '✓' : '✗'}
          </span>
          <span>
            {m.calledCorrectly ? 'The market called it' : 'The market missed this'} — resolved{' '}
            <b>{m.resolvedOutcome}</b>
          </span>
        </div>
      )}

      {pending ? (
        <p className={styles.pending}>Briefing incoming — gathering sources…</p>
      ) : (
        <>
          {/* The teaser. In the AGGRESSIVE style the lead card flows the SAME text
              around its confidence curve (client-only, once the engine loads); calm
              mode — and the first render / tests / no-JS / crawlers — show the real
              clamped `.preview` paragraph, untouched. */}
          {flowLead ? (
            <AggressiveLead
              text={flowText}
              series={beliefArc}
              proseClassName={`${styles.analysis} ${styles.preview}`}
              className={styles.leadFlow}
              compact
            />
          ) : (
            <p className={`${styles.analysis} ${styles.preview}`}>{teaser}</p>
          )}

          {/* The money + crowd read + trend + cross-market gap, one editorial line. */}
          <InterestSignal market={m} expanded={false} />

          {outlets.length > 0 && (
            <div className={styles.outlets}>
              <span className={styles.outletsMark} aria-hidden="true">
                ◢
              </span>
              <span className={styles.outletsList}>
                {outlets.map((s, i) => {
                  const href = safeHref(s.articleUrl ?? s.url); // the article, not the homepage
                  return (
                    <span key={s.url}>
                      {i > 0 && ' · '}
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={s.title ?? s.domain}
                        >
                          {outletDisplay(s.domain)}
                        </a>
                      ) : (
                        outletDisplay(s.domain)
                      )}
                    </span>
                  );
                })}
              </span>
              {m.sources.length > 3 && (
                <span className={styles.outletsMore}>+{m.sources.length - 3}</span>
              )}
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.disclosure} onClick={() => open('button')}>
              Read article
              {m.sources.length > 0 && (
                <span className={styles.count}>{m.sources.length} sources</span>
              )}
            </button>
            <SaveButton marketId={m.id} />
            <ShareButton marketId={m.id} title={m.hook || m.title} />
          </div>
        </>
      )}
    </article>
  );
}
