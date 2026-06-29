import { lazy, Suspense } from 'react';
import { useAuthBreadcrumb } from '../../lib/authBreadcrumb';
import { commentsEnabled } from '../../lib/social';
import { StandingChip } from './StandingChip';
import styles from './AccountControl.module.css';

// Lazy so the eager bundle never pulls in supabase-js: the menu (and the auth
// layer it imports) loads only when the reader opens it.
const AccountMenu = lazy(() => import('./AccountMenu'));

interface Props {
  /** Open state is owned by App's centralized URL/history model (?o=account), so the
   * browser Back gesture closes the sheet — it isn't local component state here. */
  open: boolean;
  /** App maps this to the overlay URL state: true pushes the ?o=account entry, false
   * pops/clears it (back-symmetric close — see App.closeOverlay). */
  onOpenChange: (open: boolean) => void;
}

/**
 * The always-present account affordance. Reads the lightweight auth breadcrumb
 * (no supabase) to show "Sign in" or the signed-in identity, and opens the lazy
 * AccountMenu on demand. Hidden entirely when no Supabase project is configured.
 */
export function AccountControl({ open, onOpenChange }: Props) {
  const crumb = useAuthBreadcrumb();
  if (!commentsEnabled) return null;

  const label = crumb ? (crumb.name ?? crumb.email ?? 'Account') : 'Sign in';

  return (
    <>
      <button
        type="button"
        className={crumb ? `${styles.trigger} ${styles.signedIn}` : styles.trigger}
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-label={label}
      >
        {crumb &&
          (crumb.avatar ? (
            <img className={styles.avatar} src={crumb.avatar} alt="" width={20} height={20} />
          ) : (
            <span className={styles.dot} aria-hidden="true">
              {(label || 'A').charAt(0).toUpperCase()}
            </span>
          ))}
        <span className={styles.label}>{label}</span>
        {crumb && <StandingChip />}
      </button>
      {open && (
        <Suspense fallback={null}>
          <AccountMenu onClose={() => onOpenChange(false)} />
        </Suspense>
      )}
    </>
  );
}
