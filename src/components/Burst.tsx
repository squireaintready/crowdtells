import styles from './Burst.module.css';

const SPARKS = [0, 60, 120, 180, 240, 300];

/**
 * A one-shot radial spark burst for action moments (like, lock a Call, save, vote). `trigger` is a
 * counter the caller increments to replay it — the `key` re-mounts the sparks so the CSS animation
 * fires each time. Renders nothing until the first action (trigger 0), is absolutely positioned to
 * fill a `position: relative` parent, and is hidden entirely under prefers-reduced-motion. Pure CSS
 * transform/opacity (compositor-only) so it's cheap on any device.
 */
export function Burst({
  trigger,
  tone = 'accent',
}: {
  trigger: number;
  tone?: 'accent' | 'gold' | 'rose';
}) {
  if (!trigger) return null;
  return (
    <span key={trigger} className={`${styles.burst} ${styles[tone]}`} aria-hidden="true">
      {SPARKS.map((a) => (
        <span key={a} className={styles.spark} style={{ ['--a' as string]: `${a}deg` }} />
      ))}
    </span>
  );
}
