import { useEffect, useId, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchProfilePublic, setProfilePublic } from '../../lib/socialGraph';
import { track } from '../../lib/posthog';
import tog from './AccountMenu.module.css';
import styles from './ProfileSharing.module.css';

/**
 * The opt-in that turns your private standing into a shareable public profile page (level,
 * badges, and — only if you also share your Calls — your calibration record). Default off; when
 * on, it surfaces the shareable link. Fails soft — if the profile_public column isn't applied,
 * the read returns false and the toggle no-ops, so the account sheet never breaks.
 */
export function ProfileSharing() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const labelId = useId();
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProfilePublic(userId).then((v) => {
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
      await setProfilePublic(userId, next);
      track('profile_public_toggled', { on: next });
    } catch {
      setOn(!next); // roll back
    } finally {
      setBusy(false);
    }
  };

  const link = userId ? `${window.location.origin}/?u=${userId}` : '';
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link stays visible for manual copy */
    }
  };

  if (!loaded) return null;

  return (
    <div className={styles.group}>
      <label className={tog.toggleRow}>
        <span className={tog.toggleText}>
          <span id={labelId} className={tog.toggleTitle}>
            Public profile page
          </span>
          <span className={tog.toggleHint}>
            When on, anyone with your link can see your level, badges, and record. Your calibration
            shows only if you also share your calls. Off by default.
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          className={`${tog.switch} ${on ? tog.switchOn : ''}`}
          onClick={() => void toggle()}
          disabled={busy}
        >
          <span className={tog.switchKnob} aria-hidden="true" />
        </button>
      </label>
      {on && link && (
        <div className={styles.shareRow}>
          <a className={styles.shareLink} href={link}>
            {link.replace(/^https?:\/\//, '')}
          </a>
          <button type="button" className={styles.shareCopy} onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}
