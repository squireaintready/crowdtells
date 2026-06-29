import { useEffect, useId, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchCallsPublic, setCallsPublic } from '../../lib/socialGraph';
import styles from './AccountMenu.module.css';

/**
 * The opt-in that turns the private secret ballot into a shared one: "show my Calls
 * to the people who follow me." Default off. Fails soft — if the social-graph
 * migration isn't applied (or no project), the read returns false and the toggle
 * simply no-ops, so the account sheet never breaks.
 */
export function CallSharing() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const labelId = useId();
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchCallsPublic(userId).then((v) => {
      if (!cancelled) {
        setOn(v);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = async () => {
    if (!userId || busy) return;
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      await setCallsPublic(userId, next);
    } catch {
      setOn(!next); // roll back
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <label className={styles.toggleRow}>
      <span className={styles.toggleText}>
        <span id={labelId} className={styles.toggleTitle}>
          Show my calls to followers
        </span>
        <span className={styles.toggleHint}>
          When on, people who follow you can see how you called each market. Your calls stay
          private to everyone else. Off by default.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        className={`${styles.switch} ${on ? styles.switchOn : ''}`}
        onClick={() => void toggle()}
        disabled={busy}
      >
        <span className={styles.switchKnob} aria-hidden="true" />
      </button>
    </label>
  );
}
