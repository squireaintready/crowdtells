import styles from './ProbBar.module.css';

interface Props {
  pct: number;
  favored: string;
}

/** Horizontal probability bar for the favored outcome. */
export function ProbBar({ pct, favored }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={styles.bar}
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${favored} probability ${Math.round(clamped)}%`}
    >
      <div className={styles.fill} style={{ width: `${clamped}%` }} />
    </div>
  );
}
