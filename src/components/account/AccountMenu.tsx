import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { downloadJson, gatherMyData } from '../../lib/clientExport';
import { clearLocalSaved } from '../../lib/saved';
import { clearLocalInterests } from '../../lib/interests';
import { lockBodyScroll } from '../../lib/bodyScroll';
import { commentsEnabled, newsletterEnabled } from '../../lib/social';
import { track } from '../../lib/posthog';
import { SignIn } from '../discussion/SignIn';
import { NewsletterPrefs } from './NewsletterPrefs';
import { Calibration } from './Calibration';
import { CallSharing } from './CallSharing';
import { ProfileSharing } from './ProfileSharing';
import styles from './AccountMenu.module.css';

/**
 * Account dialog (lazy): sign-in when signed out; identity + data rights (export,
 * sign out, delete) when signed in. Self-serve deletion calls the
 * delete_my_account() SECURITY DEFINER rpc, which removes the auth user and
 * cascades all their content — honoring the promise in public/privacy.html
 * without a server runtime. Rendered as a focus-trapped modal so it works from
 * anywhere it's mounted.
 */
export default function AccountMenu({ onClose }: { onClose: () => void }) {
  const { user, ready, signOut } = useAuth();
  const [busy, setBusy] = useState<null | 'export' | 'delete'>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  // Focus-trapped modal (mirrors Onboarding): move focus in on open, lock body
  // scroll, Escape to close, and keep Tab cycling within the dialog so keyboard
  // users can't land on the page behind an aria-modal sheet.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const releaseScroll = lockBodyScroll();
    dialog.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog.current) return;
      const f = dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea',
      );
      if (f.length === 0) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      releaseScroll();
      prevFocus?.focus?.();
    };
  }, [onClose]);

  // Surface the admin-console link only to admins. The check is server-authoritative
  // (is_admin() rpc); lib/admin is dynamically imported so it never bloats this chunk
  // for non-admins, and the link is convenience only — the console re-checks on entry.
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    void import('../../lib/admin')
      .then((m) => m.amIAdmin())
      .then((ok) => {
        if (!cancelled) setIsAdmin(ok);
      })
      .catch(() => {
        /* not an admin / offline — leave the link hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Enter the admin takeover via the same ?admin route App listens on (SPA nav, no reload).
  const openAdmin = () => {
    window.history.pushState(null, '', `${window.location.pathname}?admin`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    onClose();
  };

  const onExport = async () => {
    if (!user) return;
    setBusy('export');
    setErr(null);
    try {
      const data = await gatherMyData(user.id);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`crowdtells-data-${stamp}.json`, data);
      track('account_exported');
    } catch {
      setErr('Could not build your export. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (!supabase || !user) return;
    setBusy('delete');
    setErr(null);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setErr('Could not delete your account right now. Email hello@crowdtells.com and we’ll remove it.');
      setBusy(null);
      return;
    }
    track('account_deleted');
    signOut(); // clears the session + breadcrumb, detaches sync
    clearLocalSaved();
    clearLocalInterests();
    onClose();
  };

  // State-aware accessible name: the sheet shows sign-in when signed out, so a
  // static "Your account" would mislabel that state for screen readers.
  const dialogLabel = !ready ? 'Account' : user ? 'Your account' : 'Sign in to Crowdtells';

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        ref={dialog}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>

        {!ready ? (
          <p className={styles.note}>Loading…</p>
        ) : !user ? (
          <div className={styles.signedOut}>
            <h2 className={styles.title}>Sign in to Crowdtells</h2>
            <p className={styles.lead}>
              Save stories across devices, join the discussion, and weigh in on the claims.
            </p>
            <SignIn lead="Continue with" />
          </div>
        ) : (
          <div className={styles.account}>
            <h2 className={styles.title}>Your account</h2>
            <p className={styles.identity}>{user.email ?? 'Signed in'}</p>

            {/* Editable preferences first (email, then the calls privacy toggle),
                then the read-only record, then account-lifecycle actions. */}
            {newsletterEnabled && <NewsletterPrefs />}
            {commentsEnabled && <CallSharing />}
            {commentsEnabled && <ProfileSharing />}
            {commentsEnabled && <Calibration />}

            <div className={styles.actions}>
              {isAdmin && (
                <button className={styles.action} onClick={openAdmin} disabled={busy !== null}>
                  Admin console
                </button>
              )}
              <button className={styles.action} onClick={onExport} disabled={busy !== null}>
                {busy === 'export' ? 'Preparing…' : 'Export my data'}
              </button>
              <button
                className={styles.action}
                onClick={() => {
                  track('signout');
                  signOut();
                }}
                disabled={busy !== null}
              >
                Sign out
              </button>
            </div>

            <div className={styles.danger}>
              {!confirming ? (
                <button
                  className={styles.deleteLink}
                  onClick={() => setConfirming(true)}
                  disabled={busy !== null}
                >
                  Delete account
                </button>
              ) : (
                <div className={styles.confirm}>
                  <p className={styles.confirmText}>
                    This permanently deletes your account, comments, likes, votes, and saved
                    stories. This can’t be undone.
                  </p>
                  <div className={styles.confirmRow}>
                    <button
                      className={styles.deleteConfirm}
                      onClick={onDelete}
                      disabled={busy !== null}
                    >
                      {busy === 'delete' ? 'Deleting…' : 'Yes, delete everything'}
                    </button>
                    <button
                      className={styles.action}
                      onClick={() => setConfirming(false)}
                      disabled={busy !== null}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {err && <p className={styles.error} aria-live="polite">{err}</p>}
      </div>
    </div>
  );
}
