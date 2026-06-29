/**
 * Newsletter subscription + email preferences (client side).
 *
 * Thin wrappers over the Supabase RPCs in supabase/schema.sql. The subscriber
 * list is never directly readable; everything goes through SECURITY DEFINER
 * functions: anon `subscribe`/`confirm_subscription`, and the signed-in
 * `my_subscription`/`save_my_subscription`/`unsubscribe_me` (keyed by auth email).
 *
 * supabase-js is dynamically imported inside each call so this module — which is
 * statically reachable from the eager footer signup — doesn't pull the client
 * into the main bundle. It stays in the lazy auth chunk (see src/lib/sync.ts).
 */
async function client() {
  const { supabase } = await import('./supabase');
  return supabase;
}

export type Frequency = 'daily' | 'weekly';

export interface EmailPrefs {
  frequency: Frequency;
  /** Categories to include; [] = all categories. */
  topics: string[];
  /** Opt-in to breaking-news alerts. */
  breaking: boolean;
}

/** A signed-in reader's current subscription, or null if they've never subscribed. */
export interface MySubscription extends EmailPrefs {
  email: string;
  /** Double opt-in confirmed (always true for account-created subscriptions). */
  confirmed: boolean;
  /** False once they've unsubscribed. */
  subscribed: boolean;
}

export const DEFAULT_PREFS: EmailPrefs = { frequency: 'weekly', topics: [], breaking: false };

/**
 * Outcome of a public signup, so the footer can show honest copy:
 *   'pending'  — a confirm email is on its way (double opt-in).
 *   'already'  — the address was already confirmed and subscribed; no email sent.
 *   'unconfigured' / 'error' — couldn't reach the RPC.
 */
export type SubscribeStatus = 'pending' | 'already' | 'unconfigured' | 'error';

/** Public signup with preferences. New web signups are unconfirmed until they
 * click the confirm link (double opt-in). The RPC returns whether a confirm
 * email is actually pending vs. the address is already subscribed. */
export async function subscribe(email: string, prefs: EmailPrefs): Promise<SubscribeStatus> {
  const supabase = await client();
  if (!supabase) return 'unconfigured';
  const { data, error } = await supabase.rpc('subscribe', {
    p_email: email,
    p_frequency: prefs.frequency,
    p_topics: prefs.topics,
    p_breaking: prefs.breaking,
  });
  if (error) return 'error';
  // Back-compat: the pre-migration RPC returned void (data === null). Treat any
  // non-'already' value as 'pending' so a client shipped before schema.sql is
  // re-run keeps today's "check your inbox" behavior.
  return data === 'already' ? 'already' : 'pending';
}

/** Confirm a double-opt-in signup from its token; true if a row was confirmed. */
export async function confirmSubscription(token: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('confirm_subscription', { p_token: token });
  return !error && data === true;
}

/**
 * One-click unsubscribe from a digest email link (?unsubscribe=<token>). Keyed by
 * the per-subscriber token, so it works without the reader being signed in.
 * Idempotent — true whenever the token matches, even if already unsubscribed.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('unsubscribe_by_token', { p_token: token });
  return !error && data === true;
}

/**
 * One-click opt-out of comment reply-notification emails (?reply_unsubscribe=<token>).
 * Keyed by the per-profile token, so it works without the reader being signed in.
 * Distinct from the newsletter unsubscribe — flips only the reply_notify preference.
 * Idempotent — true whenever the token matches, even if already off.
 */
export async function unsubscribeRepliesByToken(token: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('unsubscribe_replies_by_token', { p_token: token });
  return !error && data === true;
}

/** The signed-in reader's subscription, or null if they haven't subscribed. */
export async function getMySubscription(): Promise<MySubscription | null> {
  const supabase = await client();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_subscription');
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return {
    email: row.email,
    frequency: row.frequency === 'daily' ? 'daily' : 'weekly',
    topics: Array.isArray(row.topics) ? row.topics : [],
    breaking: !!row.breaking,
    confirmed: !!row.confirmed,
    subscribed: !!row.subscribed,
  };
}

/** Save the signed-in reader's preferences (also (re)subscribes them). */
export async function saveMySubscription(prefs: EmailPrefs): Promise<'ok' | 'unconfigured' | 'error'> {
  const supabase = await client();
  if (!supabase) return 'unconfigured';
  const { error } = await supabase.rpc('save_my_subscription', {
    p_frequency: prefs.frequency,
    p_topics: prefs.topics,
    p_breaking: prefs.breaking,
  });
  return error ? 'error' : 'ok';
}

/** In-app unsubscribe for the signed-in reader. */
export async function unsubscribeMe(): Promise<'ok' | 'unconfigured' | 'error'> {
  const supabase = await client();
  if (!supabase) return 'unconfigured';
  const { error } = await supabase.rpc('unsubscribe_me');
  return error ? 'error' : 'ok';
}
