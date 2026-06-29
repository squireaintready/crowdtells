import { useEffect, useRef, useState } from 'react';
import { useStandingBreadcrumb } from '../../lib/standingBreadcrumb';
import styles from './StandingChip.module.css';

/**
 * A compact, always-visible level mark for the header. Reads the supabase-free standing crumb (so
 * it never bloats the eager bundle), tints by tier, and flashes gold once when the level goes up —
 * so standing is glanceable from anywhere, not just settings. Hidden until the lazy standing layer
 * has populated the crumb (and when signed out).
 */
export function StandingChip() {
  const s = useStandingBreadcrumb();
  const level = s?.level ?? null;
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (level == null) return;
    if (prev.current != null && level > prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      prev.current = level;
      return () => clearTimeout(t);
    }
    prev.current = level;
  }, [level]);

  if (!s) return null;
  return (
    <span
      className={`${styles.chip} ${styles[s.tier]} ${flash ? styles.flash : ''}`}
      title={`Level ${s.level} — your standing`}
    >
      <span className={styles.lv}>Lv</span>
      <span className={`${styles.n} tnum`}>{s.level}</span>
    </span>
  );
}
