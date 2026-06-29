import type { MedallionTone } from './medallionTone';
import styles from './Medallion.module.css';

/**
 * A designed badge medallion — a metallic foil disc with an embossed mark, a struck rim, and a
 * specular shine. `animate` plays the "mint" (a spring scale-in with a shine sweep), used the
 * moment a badge is earned; `earned={false}` renders the muted, still-to-earn state. Pure CSS, so
 * it's cheap and respects prefers-reduced-motion.
 */
export function Medallion({
  mark,
  tone = 'ink',
  size = 'md',
  earned = true,
  animate = false,
  className = '',
}: {
  mark: string;
  tone?: MedallionTone;
  size?: 'sm' | 'md' | 'lg';
  earned?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const cls = [
    styles.medal,
    styles[tone],
    styles[size],
    earned ? styles.earned : styles.locked,
    animate ? styles.mint : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} aria-hidden="true">
      <span className={styles.mark}>{mark}</span>
    </span>
  );
}
