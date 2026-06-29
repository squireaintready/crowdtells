import { useSyncExternalStore } from 'react';
import type { User } from '@supabase/supabase-js';
import { redirectTo, supabase } from '../lib/supabase';
import { setAuthBreadcrumb, type AuthCrumb } from '../lib/authBreadcrumb';
import { attachSync, detachSync } from '../lib/sync';
import { identifyUser, resetUser } from '../lib/posthog';
import { sha256hex } from '../lib/google';

// The owner's own login emails, SHA-256-hashed so the raw addresses never ship in the
// client bundle (which is publicly downloadable). A matching sign-in is flagged
// is_internal so PostHog can filter the owner's own sessions out of every stat. No email
// is ever sent to PostHog — only the boolean flag, and only for these known logins.
const INTERNAL_EMAIL_HASHES = new Set([
  'fab07cfcb030440ee4ea12b26f78c99c3680feaadd449e2ac845ea4c201b7639',
  '4ee36545f9182b4a56020055de179e7d07eeadd50678172c8163b327df791645',
  'e254797f3287ddfec2e1aeba47b9cf5156cfebfd3e9dec1daba66ade5a5b9895',
  '6bfb09a33610cba99cba757f9a0db934ad04cf20ca32dfada4f4c3475c15b210',
]);

/** Flag the owner's own accounts (matched by hashed email) as internal so PostHog can
 * exclude them — fire-and-forget; the identify already linked the session. */
function tagInternalIfOwner(email: string | null | undefined, id: string): void {
  if (!email) return;
  void sha256hex(email.trim().toLowerCase()).then((h) => {
    if (INTERNAL_EMAIL_HASHES.has(h)) identifyUser(id, { is_internal: true });
  });
}

export interface Auth {
  user: User | null;
  ready: boolean;
  signInWithGoogle: () => void;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => void;
}

/**
 * A single, module-level auth store shared by every useAuth() caller. Previously
 * each of the ~4 call sites (Discussion, its SignIn/Composer, ClaimPolls, the
 * account menu) opened its OWN getSession + onAuthStateChange subscription; this
 * collapses them to one underlying Supabase listener, exposed reactively via
 * useSyncExternalStore. It also drives the two cross-cutting effects of an auth
 * change in one place: mirroring identity into the eager-bundle breadcrumb, and
 * attaching/detaching cloud sync of saved stories + interests.
 *
 * This module is only ever imported by the lazy discussion/account chunk, so the
 * supabase-js it pulls in never reaches the main bundle.
 */
let user: User | null = null;
let ready = !supabase; // no project configured → immediately "ready" (signed out)
let started = false;
let lastUserId: string | null = null;
let authSub: { unsubscribe: () => void } | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function crumbOf(u: User | null): AuthCrumb | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  return {
    id: u.id,
    email: u.email ?? null,
    name: str(meta.full_name) ?? str(meta.name) ?? (u.email ? u.email.split('@')[0]! : null),
    avatar: str(meta.avatar_url) ?? str(meta.picture),
  };
}

/** Apply a new session: update state, mirror the breadcrumb, (de)attach sync. */
function apply(next: User | null): void {
  user = next;
  setAuthBreadcrumb(crumbOf(next));
  const nextId = next?.id ?? null;
  if (nextId !== lastUserId) {
    if (nextId) {
      void attachSync(nextId);
      identifyUser(nextId); // link PostHog behaviour to the signed-in reader
      tagInternalIfOwner(next?.email, nextId); // exclude the owner's own sessions from stats
    } else {
      detachSync();
      if (lastUserId) resetUser(); // real sign-out only — don't churn the anon id on first load
    }
    lastUserId = nextId;
  }
  emit();
}

/** Start the single Supabase subscription, once, on first subscriber. */
function start(): void {
  if (started || !supabase) return;
  started = true;
  void supabase.auth.getSession().then(({ data }) => {
    apply(data.session?.user ?? null);
    ready = true;
    emit();
  });
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    apply(session?.user ?? null);
    if (!ready) {
      ready = true;
    }
  });
  authSub = data.subscription;
}

// Dev only: on hot module replacement, tear the single listener + sync down so a
// re-eval doesn't stack a second Supabase subscription on the orphaned old one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    authSub?.unsubscribe();
    detachSync();
    started = false;
  });
}

function subscribe(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// A stable snapshot object so useSyncExternalStore doesn't loop: rebuilt only
// when user/ready actually change.
let snapshot: { user: User | null; ready: boolean } = { user, ready };
function getSnapshot(): { user: User | null; ready: boolean } {
  if (snapshot.user !== user || snapshot.ready !== ready) snapshot = { user, ready };
  return snapshot;
}
const SERVER_SNAPSHOT = { user: null, ready: false };

const actions = {
  signInWithGoogle: () =>
    void supabase?.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo() },
    }),
  signInWithEmail: async (email: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    // Supabase surfaces hook / rate-limit failures here. Some (e.g. an opaque
    // Send-Email-hook rejection) arrive with an empty message, which would render
    // as a blank / "{}" error — always show something legible instead.
    if (error)
      throw new Error(
        error.message?.trim() ||
          'Could not send the sign-in link right now — please try again in a few minutes.',
      );
  },
  signOut: () => void supabase?.auth.signOut(),
};

/** Tracks the shared Supabase auth session and exposes sign-in/out actions. */
export function useAuth(): Auth {
  const { user: u, ready: r } = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  return { user: u, ready: r, ...actions };
}
