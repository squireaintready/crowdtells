import { Fragment, type ReactNode } from 'react';
import type { Market } from '../lib/types';
import { crowdRead, signalsFor } from '../lib/signals';
import styles from './InterestSignal.module.css';

interface Props {
  market: Market;
  /** When expanded, the crowd read lives in the dedicated panel — drop it here. */
  expanded?: boolean;
}

const SOURCE_LABEL: Record<Market['source'], string> = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
};

/** The editorial "why this matters" line: market figures as interest signals. */
export function InterestSignal({ market: m, expanded }: Props) {
  const s = signalsFor(m);

  const items: ReactNode[] = [
    <span key="interest" className={styles.strong}>
      {s.interest}
    </span>,
  ];
  if (!expanded)
    items.push(
      <span key="crowd" className={styles.read}>
        {crowdRead(m)}
      </span>,
    );
  if (s.trend !== 'flat') {
    items.push(
      <span key="trend" className={s.trend === 'up' ? styles.up : styles.down}>
        <span aria-hidden="true">{s.trend === 'up' ? '▲' : '▼'}</span> {s.trendLabel}
      </span>,
    );
  }
  // Two markets pricing the same question differently is itself the story.
  if (!expanded && m.alt && m.divergence != null && m.divergence >= 1) {
    items.push(
      <span
        key="gap"
        className={styles.gap}
        title={`${SOURCE_LABEL[m.source === 'kalshi' ? 'kalshi' : 'polymarket']} and ${SOURCE_LABEL[m.alt.source]} disagree by ${m.divergence} points`}
      >
        <span aria-hidden="true">⚖</span> {m.divergence}pt gap vs {SOURCE_LABEL[m.alt.source]}
      </span>,
    );
  }

  // Normal inline flow: the items wrap to as many lines as they need (no clamp, so
  // nothing is ever cut off), breaking cleanly between items. Short signals stay atomic;
  // the verbose crowd read may wrap a long favored name rather than overflow (see CSS).
  return (
    <div className={`${styles.row} tnum`}>
      {items.map((node, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
          )}
          {node}
        </Fragment>
      ))}
    </div>
  );
}
