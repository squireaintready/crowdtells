import type { Source } from '../lib/types';
import { coverageDistribution } from '../lib/sources';
import styles from './SourceBias.module.css';

/** Left/center/right coverage distribution + a Blindspot flag. Hidden unless we
 * recognize the lean of at least 3 of the cited outlets (so it stays meaningful
 * and doesn't clutter non-political stories). */
export function SourceBias({ sources }: { sources: Source[] }) {
  const dist = coverageDistribution(sources.map((s) => s.domain));
  if (dist.known < 3) return null;

  const pct = (n: number) => Math.round((n / dist.known) * 100);
  const label = `Coverage lean: ${pct(dist.left)}% left, ${pct(dist.center)}% center, ${pct(dist.right)}% right`;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span
          className={styles.kicker}
          title="A coarse editorial estimate across the outlets we recognize"
        >
          Coverage lean
        </span>
        {dist.blindspot && (
          <span className={styles.blindspot}>
            ◐ Blindspot: little {dist.blindspot === 'left' ? 'left-leaning' : 'right-leaning'}{' '}
            coverage
          </span>
        )}
      </div>
      <div className={styles.bar} role="img" aria-label={label}>
        {dist.left > 0 && (
          <span className={`${styles.seg} ${styles.left}`} style={{ flexGrow: dist.left }} />
        )}
        {dist.center > 0 && (
          <span className={`${styles.seg} ${styles.center}`} style={{ flexGrow: dist.center }} />
        )}
        {dist.right > 0 && (
          <span className={`${styles.seg} ${styles.right}`} style={{ flexGrow: dist.right }} />
        )}
      </div>
      <div className={styles.legend}>
        <span>
          <i className={`${styles.dot} ${styles.left}`} /> {pct(dist.left)}% left
        </span>
        <span>
          <i className={`${styles.dot} ${styles.center}`} /> {pct(dist.center)}% center
        </span>
        <span>
          <i className={`${styles.dot} ${styles.right}`} /> {pct(dist.right)}% right
        </span>
      </div>
    </div>
  );
}
