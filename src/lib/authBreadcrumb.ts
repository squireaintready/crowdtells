import { useSyncExternalStore } from 'react';

/**
 * A tiny, dependency-free mirror of "who is signed in", kept in localStorage so
 * the EAGER bundle (e.g. the footer account control) can show signed-in state
 * WITHOUT importing supabase-js — which must stay in the lazy discussion chunk
 * (see src/lib/supabase.ts). The authoritative session still lives in supabase;
 * the lazy auth layer writes this breadcrumb on every auth state change, and
 * anything that needs the real session loads the lazy chunk, which reconciles it.
 *
 * This is identity-for-display only. It is NOT a credential and grants nothing —
 * every privileged action is still gated by the real session + RLS server-side.
 */
const KEY = 'crowdtell-auth';

export interface AuthCrumb {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

function read(): AuthCrumb | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AuthCrumb> | null;
    if (!v || typeof v.id !== 'string') return null;
    return {
      id: v.id,
      email: typeof v.email === 'string' ? v.email : null,
      name: typeof v.name === 'string' ? v.name : null,
      avatar: typeof v.avatar === 'string' ? v.avatar : null,
    };
  } catch {
    return null;
  }
}

let crumb: AuthCrumb | null = read();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Update the breadcrumb (called by the lazy auth layer on every auth change). */
export function setAuthBreadcrumb(next: AuthCrumb | null): void {
  // Skip a no-op write so we don't churn the store / other tabs needlessly.
  if (sameCrumb(crumb, next)) return;
  crumb = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: keep the in-memory value for this session */
  }
  emit();
}

function sameCrumb(a: AuthCrumb | null, b: AuthCrumb | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.email === b.email && a.name === b.name && a.avatar === b.avatar;
}

export function getAuthBreadcrumb(): AuthCrumb | null {
  return crumb;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Cross-tab: pick up a sign-in/out that happened in another tab. One handler
  // per subscriber (same reference add/remove) so cleanup is always symmetric.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      crumb = read();
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Reactive signed-in identity for the eager UI (null when signed out). */
export function useAuthBreadcrumb(): AuthCrumb | null {
  return useSyncExternalStore(subscribe, getAuthBreadcrumb, () => null);
}
