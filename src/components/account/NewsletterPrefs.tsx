import { useEffect, useState } from 'react';
import {
  DEFAULT_PREFS,
  getMySubscription,
  saveMySubscription,
  unsubscribeMe,
  type EmailPrefs,
} from '../../lib/newsletter';
import { knownCategories } from '../../lib/categories';
import { EmailPrefsFields } from '../EmailPrefs';
import styles from './NewsletterPrefs.module.css';

/**
 * Email-preference center for the signed-in reader, inside the account menu.
 * Loads their current subscription (matched by auth email), lets them set
 * cadence / topics, save, or unsubscribe — all via SECURITY DEFINER
 * RPCs. Account subscriptions are auto-confirmed (the email is auth-verified).
 */
export function NewsletterPrefs() {
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<EmailPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<null | 'saved' | 'unsubscribed' | 'error'>(null);
  const categories = knownCategories();

  useEffect(() => {
    let alive = true;
    getMySubscription().then((s) => {
      if (!alive) return;
      if (s) {
        setSubscribed(s.subscribed);
        setPrefs({ frequency: s.frequency, topics: s.topics, breaking: s.breaking });
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const res = await saveMySubscription(prefs);
    setBusy(false);
    if (res === 'ok') {
      setSubscribed(true);
      setStatus('saved');
    } else {
      setStatus('error');
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setStatus(null);
    const res = await unsubscribeMe();
    setBusy(false);
    if (res === 'ok') {
      setSubscribed(false);
      setStatus('unsubscribed');
    } else {
      setStatus('error');
    }
  };

  if (loading) return null; // stay quiet until we know the current state

  return (
    <section className={styles.wrap}>
      <h3 className={styles.head}>Email brief</h3>
      <p className={styles.sub}>
        {subscribed
          ? 'Delivered to your account email. Tune it anytime.'
          : 'Get the brief at your account email — pick your cadence and topics.'}
      </p>

      <EmailPrefsFields value={prefs} onChange={setPrefs} categories={categories} />

      <div className={styles.row}>
        <button className={styles.save} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : subscribed ? 'Save preferences' : 'Subscribe'}
        </button>
        {subscribed && (
          <button className={styles.unsub} onClick={unsubscribe} disabled={busy}>
            Unsubscribe
          </button>
        )}
      </div>

      {status === 'saved' && <p className={styles.ok}>Preferences saved.</p>}
      {status === 'unsubscribed' && <p className={styles.ok}>You’ve been unsubscribed.</p>}
      {status === 'error' && <p className={styles.err}>Couldn’t save right now — please try again.</p>}
    </section>
  );
}
