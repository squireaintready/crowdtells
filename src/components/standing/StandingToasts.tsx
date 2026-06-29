import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { onStandingPing } from '../../lib/standingSignal';
import { refreshStanding, type StandingEarn, subscribeStanding } from '../../lib/standingStore';
import { track } from '../../lib/posthog';
import { Medallion } from './Medallion';
import { badgeTone } from './medallionTone';
import styles from './StandingToasts.module.css';

interface Toast extends StandingEarn {
  id: number;
}
let seq = 0;

/** Tap the toast straight to the full Standing hub (?standing) — the dedicated record page, with a
 * back link home. A real navigation (the hub is a standalone destination, like the public profile). */
function openStanding(): void {
  window.location.assign(`${window.location.pathname}?standing`);
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    timer.current = setTimeout(onDismiss, 6500);
    return () => clearTimeout(timer.current);
  }, [onDismiss]);

  const isLevel = toast.kind === 'level';
  const tone = isLevel ? 'gold' : badgeTone(toast.badgeId ?? '');
  const mark = isLevel ? String(toast.level ?? '') : toast.mark;
  const lead = isLevel ? 'Leveled up' : 'New badge';

  return (
    <div className={`${styles.toast} ${isLevel ? styles.levelToast : ''}`}>
      <button
        type="button"
        className={styles.body}
        onClick={() => {
          track('standing_toast_opened', { kind: toast.kind });
          openStanding();
          onDismiss();
        }}
      >
        <span className={styles.medalWrap}>
          {isLevel && (
            <>
              <span className={`${styles.ring} ${styles.r1}`} aria-hidden="true" />
              <span className={`${styles.ring} ${styles.r2}`} aria-hidden="true" />
            </>
          )}
          <Medallion mark={mark} tone={tone} size="md" animate />
        </span>
        <span className={styles.text}>
          <span className={styles.lead}>{lead}</span>
          <span className={styles.title}>{toast.label}</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.close}
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
      <span className={styles.timer} aria-hidden="true" />
    </div>
  );
}

/**
 * The global standing celebration. A single overlay (mounted once, on its own root) that watches
 * the reader's standing and pops a tasteful animated toast the moment a badge or level is earned —
 * so recognition shows up wherever they are, not buried in settings. Re-checks on sign-in, after
 * an engagement action (debounced ping), and when the tab refocuses (catching badges the pipeline
 * awarded while away).
 */
export function StandingToasts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!userId) return;
    void refreshStanding(userId);
    // An action just happened (call/vote/comment) — force past the throttle to surface the earn.
    const offPing = onStandingPing(() => void refreshStanding(userId, true));
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshStanding(userId);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      offPing();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [userId]);

  useEffect(() => {
    return subscribeStanding((_snap, earns) => {
      if (earns.length === 0) return;
      // Cap the burst so a first-pipeline-run windfall doesn't bury the screen.
      setToasts((cur) => [...cur, ...earns.slice(0, 4).map((e) => ({ ...e, id: ++seq }))]);
    });
  }, []);

  const dismiss = (id: number) => setToasts((cur) => cur.filter((t) => t.id !== id));
  if (toasts.length === 0) return null;

  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
