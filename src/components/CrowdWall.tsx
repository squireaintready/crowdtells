import { type CSSProperties, memo, useMemo } from 'react';
import type { Market } from '../lib/types';
import { formatPct, formatUsd } from '../lib/format';
import { useIntensity } from '../hooks/useIntensity';
import styles from './CrowdWall.module.css';

interface Props {
  stories: Market[];
  /** Open the full article view for a row. */
  onOpen: (id: string) => void;
}

/** The crowd-vs-coverage tone for a row's left rule: the money is ahead of the
 * press (accent), the coverage disputes the favorite (down), or they agree /
 * it's unclear (a quiet strong border). Mirrors the StoryCard press flag. */
function toneClass(cvc: Market['crowdVsCoverage']) {
  if (cvc === 'ahead') return styles.ruleAhead;
  if (cvc === 'contested') return styles.ruleContested;
  return styles.ruleAligned;
}

/** A single league-table row. Uniform height, straight columns — readability over
 * money-scaled type. A real <button> so it's keyboard-operable and gets the global
 * focus-visible ring; the whole row is one tap target. */
const WallRow = memo(function WallRow({
  market: m,
  onOpen,
}: {
  market: Market;
  onOpen: (id: string) => void;
}) {
  const pct = Math.max(0, Math.min(100, m.oddsPct));
  return (
    <button type="button" className={styles.row} onClick={() => onOpen(m.id)}>
      <span className={`${styles.rule} ${toneClass(m.crowdVsCoverage)}`} aria-hidden="true" />
      <span className={`${styles.odds} tnum`}>{formatPct(m.oddsPct)}</span>
      <span className={styles.bar} aria-hidden="true">
        <span className={styles.barFill} style={{ width: `${Math.max(3, pct)}%` }} />
      </span>
      <span className={styles.headline}>{m.hook || m.title}</span>
      {m.favored && <span className={styles.favored}>{m.favored}</span>}
      <span className={`${styles.money} tnum`}>{formatUsd(m.volume)}</span>
    </button>
  );
});

/**
 * A "front-page index" row (aggressive intensity): the headline's size and weight
 * scale with the money at stake — the biggest markets read as lead headlines, the
 * smallest hold a legible floor. The scaling lives in CSS (per-breakpoint, bounded,
 * never below the legibility floor); this only feeds it the precomputed log-volume
 * fraction `f` (0–1) as a custom property, so it's SSR-safe pure layout. Tone left
 * rule kept; odds + money collapse into one tabular meta cell on the right.
 */
const WallRowBold = memo(function WallRowBold({
  market: m,
  f,
  onOpen,
}: {
  market: Market;
  /** This row's position in the visible set's log-volume range, 0 (smallest) → 1 (largest). */
  f: number;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={styles.rowBold}
      onClick={() => onOpen(m.id)}
      style={{ '--wall-f': f } as CSSProperties}
    >
      <span className={`${styles.rule} ${toneClass(m.crowdVsCoverage)}`} aria-hidden="true" />
      <span className={styles.headlineBold}>{m.hook || m.title}</span>
      <span className={styles.meta}>
        <span className={`${styles.metaOdds} tnum`}>{formatPct(m.oddsPct)}</span>
        <span className={`${styles.metaMoney} tnum`}>{formatUsd(m.volume)}</span>
      </span>
    </button>
  );
});

/**
 * "The Wall" — a scannable index of the markets the crowd is pricing right now,
 * ranked by money (the order is set upstream in selectStories).
 *
 * CALM intensity: a clean league table — uniform rows and straight columns, the eye
 * reads down the odds and the money in fixed-width columns, the headline stays on
 * one readable line, type never shrinks with the money. Desktop-only odds bar and
 * favored outcome drop on mobile so rows stay clean.
 *
 * AGGRESSIVE intensity (default): a "front-page index" — each row's headline size
 * scales with the money at stake (bounded log mapping across the visible set), the
 * biggest markets reading as lead headlines, smaller ones holding a legible floor,
 * over a single shared left edge. Pure bounded layout: SSR-safe, legibility-first.
 *
 * Rendered with the SAME windowed list as the feed, so App's LoadMore pager and
 * search/category filters apply unchanged.
 */
export const CrowdWall = memo(function CrowdWall({ stories, onOpen }: Props) {
  const { intensity } = useIntensity();
  const bold = intensity === 'aggressive';

  // Front-page index only: map each visible market onto the set's log-volume range,
  // so the headline size (computed in CSS from this 0–1 fraction) reads relative to
  // the money actually on screen. log10 compresses the long tail; when every market
  // is the same size (or there's one), everything sits mid-scale (0.5).
  const fractions = useMemo(() => {
    if (!bold) return null;
    const logs = stories.map((m) => Math.log10(Math.max(0, m.volume) + 1));
    const lo = Math.min(...logs);
    const hi = Math.max(...logs);
    const span = hi - lo;
    return logs.map((v) => (span > 0 ? (v - lo) / span : 0.5));
  }, [bold, stories]);

  return (
    <section
      className={styles.wall}
      aria-label="The Wall — every live market, ranked by money"
      // Three fixed metric columns (odds · bar · money) so the eye reads straight
      // down each; the headline takes the flexible middle. One place to retune.
      // (The front-page index ignores these — it has no fixed metric columns.)
      style={
        {
          '--wall-odds': '3.25rem',
          '--wall-bar': '3rem',
          '--wall-money': '4rem',
        } as CSSProperties
      }
    >
      <header className={styles.head}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>The Wall</span>
          <span className={`${styles.count} tnum`}>
            ranked by money · {stories.length} {stories.length === 1 ? 'market' : 'markets'}
          </span>
        </div>
        <div className={styles.legend} aria-hidden="true">
          <span className={`${styles.legendItem} ${styles.legendAhead}`}>
            <span className={styles.legendSwatch} />
            crowd ahead
          </span>
          <span className={`${styles.legendItem} ${styles.legendContested}`}>
            <span className={styles.legendSwatch} />
            press disputes
          </span>
          <span className={`${styles.legendItem} ${styles.legendAligned}`}>
            <span className={styles.legendSwatch} />
            aligned
          </span>
          <span className={styles.legendHint}>{bold ? 'type ∝ money' : 'odds · market · money'}</span>
        </div>
      </header>

      <div className={`${styles.list} ${bold ? styles.listBold : ''}`}>
        {bold
          ? stories.map((m, i) => (
              <WallRowBold key={m.id} market={m} f={fractions?.[i] ?? 0.5} onOpen={onOpen} />
            ))
          : stories.map((m) => <WallRow key={m.id} market={m} onOpen={onOpen} />)}
      </div>
    </section>
  );
});
