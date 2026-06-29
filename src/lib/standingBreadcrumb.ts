import { useSyncExternalStore } from 'react';
import type { Tier } from './gamify';

/**
 * A tiny, supabase-free mirror of the reader's STANDING (level + tier), kept in localStorage so
 * the EAGER bundle (the header account control) can show a level chip WITHOUT importing
 * supabase-js — which must stay in the lazy discussion/account chunk. The lazy standing layer
 * (src/standing/standingStore) writes this on every refresh; this is display-only and grants
 * nothing. Mirrors src/lib/authBreadcrumb.ts.
 */
const KEY = 'ct:standingCrumb';

export interface StandingCrumb {
  level: number;
  tier: Tier;
}

function isTier(t: unknown): t is Tier {
  return t === 'reader' || t === 'contributor' || t === 'steward';
}

function read(): StandingCrumb | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StandingCrumb> | null;
    if (!v || typeof v.level !== 'number' || !isTier(v.tier)) return null;
    return { level: v.level, tier: v.tier };
  } catch {
    return null;
  }
}

let crumb: StandingCrumb | null = read();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function same(a: StandingCrumb | null, b: StandingCrumb | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.level === b.level && a.tier === b.tier;
}

/** Update the standing crumb (called by the lazy standing layer on every refresh). */
export function setStandingBreadcrumb(next: StandingCrumb | null): void {
  if (same(crumb, next)) return; // skip no-op writes so we don't churn other tabs
  crumb = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: keep the in-memory value for this session */
  }
  emit();
}

export function getStandingBreadcrumb(): StandingCrumb | null {
  return crumb;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
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

/** Reactive standing (level + tier) for the eager UI; null when unknown / signed out. */
export function useStandingBreadcrumb(): StandingCrumb | null {
  return useSyncExternalStore(subscribe, getStandingBreadcrumb, () => null);
}
