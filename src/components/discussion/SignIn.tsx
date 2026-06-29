import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { track } from '../../lib/posthog';
import { GoogleSignIn } from './GoogleSignIn';
import styles from './Discussion.module.css';

/**
 * Sign-in panel: Google (in-domain GIS, redirect fallback) + magic-link email.
 * Shared by the discussion composer and the account menu, so there is one
 * sign-in surface. Lives in the lazy chunk (uses supabase via useAuth).
 */
export function SignIn({ lead = 'Sign in to join the discussion' }: { lead?: string }) {
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (sent) return <p className={styles.note}>Check your email for a sign-in link.</p>;

  const googleFallback = (
    <button className={styles.google} onClick={signInWithGoogle}>
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"
        />
        <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
        <path
          fill="#EA4335"
          d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"
        />
      </svg>
      Continue with Google
    </button>
  );

  return (
    <div className={styles.signin}>
      <p className={styles.signinLead}>{lead}</p>
      <GoogleSignIn fallback={googleFallback} />
      <form
        className={styles.emailRow}
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setSending(true);
          track('signin_started', { method: 'email' });
          try {
            await signInWithEmail(email);
            track('signin_email_sent');
            setSent(true);
          } catch (e2) {
            setErr((e2 as Error).message);
          } finally {
            setSending(false);
          }
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email address"
        />
        <button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Email link'}
        </button>
      </form>
      {err && <p className={styles.error} aria-live="polite">{err}</p>}
    </div>
  );
}
