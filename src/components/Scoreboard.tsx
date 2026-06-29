import type { Market } from '../lib/types';
import { scoreboard } from '../lib/feed';
import { FitText } from './pretext/FitText';
import styles from './Scoreboard.module.css';

/**
 * The crowd's track record across markets we covered that have since resolved:
 * how often the favored side actually won. Hidden until there's a meaningful
 * sample so we never tout "100% (1 of 1)".
 */
const MIN_SAMPLE = 3;

export function Scoreboard({ markets }: { markets: Market[] }) {
  const { correct, total, pct } = scoreboard(markets);
  if (total < MIN_SAMPLE) return null;

  return (
    <section className={styles.wrap} aria-label="Prediction accuracy">
      <div className={styles.figure}>
        {/* The accuracy headline is exact-fit in aggressive — measured to fill the
            figure column to the pixel (the comp's §04 Calibration Desk). Calm keeps
            the shipped CSS size. */}
        <FitText
          text={`${pct}%`}
          className={`${styles.pct} tnum`}
          weight={600}
          fillFrac={0.84}
          maxWidthPx={260}
          maxFontPx={150}
          minFontPx={34}
        />
        <span className={styles.unit}>called right</span>
      </div>
      <div className={styles.detail}>
        <p className={styles.lead}>The crowd&apos;s track record</p>
        <p className={styles.sub}>
          The market&apos;s favored side won{' '}
          <b className="tnum">
            {correct} of {total}
          </b>{' '}
          resolved questions we covered.
        </p>
      </div>
      <div
        className={styles.bar}
        role="img"
        aria-label={`${correct} of ${total} resolved questions called correctly`}
      >
        <span className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
