import { useState, type FormEvent } from 'react';
import { DEFAULT_PREFS, saveMySubscription, subscribe, type EmailPrefs } from '../lib/newsletter';
import { useAuthBreadcrumb } from '../lib/authBreadcrumb';
import { track } from '../lib/posthog';
import { EmailPrefsFields } from './EmailPrefs';
import styles from './NewsletterSignup.module.css';

type State = 'idle' | 'submitting' | 'done' | 'error';
// Which honest success message the card shows:
//   'confirm'    — double opt-in: a confirm email is on its way.
//   'subscribed' — signed-in reader auto-confirmed via their account (no email).
//   'already'    — the address was already confirmed and subscribed.
type Outcome = 'confirm' | 'subscribed' | 'already';

// Mirrors the DB email-shape guard (supabase/schema.sql) so we reject obvious
// typos before a round-trip.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Honest two-part success copy per outcome (lead + dimmed continuation). */
function doneMessage(outcome: Outcome, frequency: EmailPrefs['frequency']): [string, string] {
  if (outcome === 'subscribed') {
    return ["You're subscribed.", `The ${frequency} brief lands in your inbox — no confirmation needed.`];
  }
  if (outcome === 'already') {
    return ["You're already subscribed.", `The ${frequency} brief is on its way — no need to confirm again.`];
  }
  return ['Almost there — check your inbox to confirm.', `Once you do, the ${frequency} brief lands in your inbox.`];
}

/**
 * Footer email-signup for the brief. Low-friction by default (just an email);
 * a "Customize" disclosure reveals frequency and topic preferences.
 * Supabase-js loads only on submit (inside subscribe()), so the form stays
 * dependency-free (the auth breadcrumb is a localStorage mirror, no supabase-js).
 *
 * Two paths: a signed-in reader subscribing their OWN (already auth-verified)
 * address is confirmed instantly via the account RPC — no double-opt-in email,
 * which also fixes the dead-end where the confirm cron never re-mails an address
 * that's already a confirmed row. Everyone else gets the double opt-in: a new
 * signup stays unconfirmed until they click the link we email them.
 */
export function NewsletterSignup({ categories = [] }: { categories?: string[] }) {
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState<EmailPrefs>(DEFAULT_PREFS);
  const [customize, setCustomize] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [outcome, setOutcome] = useState<Outcome>('confirm');
  // 'invalid' = client-side email reject; 'server' = the round-trip failed. Keeps
  // the error copy honest — don't say "enter a valid email" when the email was fine.
  const [errKind, setErrKind] = useState<'invalid' | 'server'>('invalid');
  const me = useAuthBreadcrumb();

  function finish(next: Outcome) {
    // Normalize 'confirm' → 'pending' so footer + slide-in signups share one enum.
    track('newsletter_signup', {
      result: next === 'confirm' ? 'pending' : next,
      placement: 'footer_signup',
    });
    setOutcome(next);
    setState('done');
    setEmail('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value) || value.length > 254) {
      setErrKind('invalid');
      setState('error');
      return;
    }
    setState('submitting');

    // Signed-in reader subscribing their own auth-verified email → skip the
    // confirm round-trip and subscribe their account directly (auto-confirmed).
    const authEmail = me?.email?.trim().toLowerCase() || null;
    if (authEmail && authEmail === value) {
      const res = await saveMySubscription(prefs);
      if (res === 'ok') {
        finish('subscribed');
        return;
      }
      // Stale/expired session (breadcrumb out of sync with supabase): fall
      // through to the public double opt-in so they're still subscribed.
    }

    const res = await subscribe(value, prefs);
    if (res === 'already') finish('already');
    else if (res === 'pending') finish('confirm');
    else {
      setErrKind('server');
      setState('error');
    }
  }

  if (state === 'done') {
    const [lead, dim] = doneMessage(outcome, prefs.frequency);
    return (
      <section className={styles.wrap} aria-live="polite">
        <p className={styles.thanks}>
          {lead} <span className={styles.thanksDim}>{dim}</span>
        </p>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.copy}>
        <h2 className={styles.head}>The Crowdtells brief</h2>
        <p className={styles.sub}>
          The biggest market moves and the stories behind them. Pick your cadence and topics — no
          spam, unsubscribe anytime.
        </p>
      </div>
      <form className={styles.formArea} onSubmit={onSubmit} noValidate>
        <div className={styles.emailRow}>
          <label className={styles.srOnly} htmlFor="newsletter-email">
            Email address
          </label>
          <input
            id="newsletter-email"
            className={styles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (state === 'error') setState('idle');
            }}
            aria-invalid={state === 'error'}
            aria-describedby={state === 'error' ? 'newsletter-error' : undefined}
            disabled={state === 'submitting'}
            required
          />
          <button className={styles.button} type="submit" disabled={state === 'submitting'}>
            {state === 'submitting' ? 'Subscribing…' : 'Subscribe'}
          </button>
        </div>

        <button
          type="button"
          className={styles.customize}
          aria-expanded={customize}
          onClick={() => setCustomize((v) => !v)}
        >
          {customize ? 'Hide options' : 'Customize'}
        </button>

        {customize && <EmailPrefsFields value={prefs} onChange={setPrefs} categories={categories} />}

        {state === 'error' && (
          <p id="newsletter-error" className={styles.error} aria-live="polite">
            {errKind === 'server'
              ? 'Couldn’t subscribe right now — please try again.'
              : 'Please enter a valid email and try again.'}
          </p>
        )}
      </form>
    </section>
  );
}
