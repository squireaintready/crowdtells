import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DEFAULT_PREFS, saveMySubscription, subscribe } from '../lib/newsletter';
import { useAuthBreadcrumb } from '../lib/authBreadcrumb';
import { track } from '../lib/posthog';
import styles from './NewsletterPrompt.module.css';

// Mirrors the DB email-shape guard (supabase/schema.sql) so we reject obvious typos
// before a round-trip.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// How long the prompt sits before auto-retracting if the reader never engages — long
// enough to read and decide, short enough not to camp on screen. Cancelled the moment
// they focus the field (an engaged reader is never cut off mid-typing).
const AUTO_DISMISS_MS = 18_000;

/**
 * Non-blocking bottom slide-in that invites an engaged reader to the brief. The caller
 * frequency-caps it: it auto-retracts if ignored (onIgnore) and returns on a later visit,
 * rests longer on an explicit close (onClose), and stops for good once they subscribe
 * (onSubscribed). `visible` slides it on/off-screen — off-screen it also goes
 * visibility:hidden, leaving the tab order — so it never collides with the feed's
 * bottom-right Developing widget. Low-friction: just an email (cadence/topics are tunable
 * later from the footer signup or account).
 */
export function NewsletterPrompt({
  visible,
  onClose,
  onIgnore,
  onSubscribed,
}: {
  visible: boolean;
  onClose: () => void;
  /** Auto-retract after sitting ignored — snoozed, not dismissed-forever. */
  onIgnore: () => void;
  onSubscribed: () => void;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [outcome, setOutcome] = useState<'pending' | 'already' | 'subscribed'>('pending');
  // 'invalid' = client-side email reject; 'server' = the round-trip failed.
  const [errKind, setErrKind] = useState<'invalid' | 'server'>('invalid');
  // Latches once the reader focuses the field — cancels the ignore auto-retract so an
  // engaged reader is never cut off.
  const [touched, setTouched] = useState(false);
  const me = useAuthBreadcrumb();

  // Impression: fire once the slide-in first reaches the screen (it can toggle
  // visible on/off as the reader moves between feed and article).
  const shownRef = useRef(false);
  useEffect(() => {
    if (visible && !shownRef.current) {
      shownRef.current = true;
      track('newsletter_prompt_shown', { placement: 'article_slide_in' });
    }
  }, [visible]);

  // Auto-dismiss shortly after a successful signup so the confirmation isn't sticky.
  useEffect(() => {
    if (state !== 'done') return;
    const t = window.setTimeout(onSubscribed, 3500);
    return () => window.clearTimeout(t);
  }, [state, onSubscribed]);

  // Auto-retract if shown-and-ignored: while visible, idle, and untouched, slide it away
  // after AUTO_DISMISS_MS so it doesn't camp on screen. Navigating away (visible→false)
  // clears the timer WITHOUT firing onIgnore — that's a contextual hide, not an ignore.
  useEffect(() => {
    if (!visible || state !== 'idle' || touched) return;
    const t = window.setTimeout(onIgnore, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [visible, state, touched, onIgnore]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value) || value.length > 254) {
      setErrKind('invalid');
      setState('error');
      return;
    }
    setState('submitting');

    // Signed-in reader subscribing their own auth-verified email → auto-confirm
    // via the account (no confirm round-trip), mirroring the footer signup.
    const authEmail = me?.email?.trim().toLowerCase() || null;
    if (authEmail && authEmail === value) {
      const ok = await saveMySubscription(DEFAULT_PREFS);
      if (ok === 'ok') {
        track('newsletter_signup', { result: 'subscribed', placement: 'article_slide_in' });
        setOutcome('subscribed');
        setState('done');
        return;
      }
      // Stale session — fall through to the public double opt-in.
    }

    const res = await subscribe(value, DEFAULT_PREFS);
    if (res === 'pending' || res === 'already') {
      track('newsletter_signup', { result: res, placement: 'article_slide_in' });
      setOutcome(res);
      setState('done');
    } else {
      setErrKind('server');
      setState('error');
    }
  }

  return (
    <div
      className={`${styles.prompt} ${visible ? styles.show : ''}`}
      role="region"
      aria-label="Subscribe to the Crowdtells brief"
      aria-hidden={!visible}
    >
      <button type="button" className={styles.close} onClick={onClose} aria-label="Dismiss">
        ×
      </button>
      {state === 'done' ? (
        <p className={styles.thanks}>
          {outcome === 'subscribed'
            ? "You're subscribed — the weekly brief lands in your inbox."
            : outcome === 'already'
              ? "You're already subscribed."
              : 'Almost there — check your inbox to confirm.'}
        </p>
      ) : (
        <>
          <p className={styles.head}>The crowd tells it first.</p>
          <p className={styles.sub}>
            Get the Crowdtells brief — the stories the crowd sees coming, no spam, unsubscribe
            anytime.
          </p>
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <label className={styles.srOnly} htmlFor="nl-prompt-email">
              Email address
            </label>
            <input
              id="nl-prompt-email"
              className={styles.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onFocus={() => setTouched(true)}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === 'error') setState('idle');
              }}
              aria-invalid={state === 'error'}
              aria-describedby={state === 'error' ? 'nl-prompt-error' : undefined}
              disabled={state === 'submitting'}
              required
            />
            <button className={styles.button} type="submit" disabled={state === 'submitting'}>
              {state === 'submitting' ? 'Subscribing…' : 'Subscribe'}
            </button>
          </form>
          {/* Always mounted (empty until a failure) so the swap-in is reliably announced. */}
          <p id="nl-prompt-error" className={styles.error} aria-live="polite">
            {state === 'error' &&
              (errKind === 'server'
                ? 'Couldn’t subscribe right now — please try again.'
                : 'Please enter a valid email.')}
          </p>
        </>
      )}
    </div>
  );
}
