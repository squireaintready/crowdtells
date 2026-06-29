import { useSyncExternalStore } from 'react';
import { track } from './posthog';

/**
 * Read-later store — saved story ids in localStorage, shared across every Save
 * button and the Saved view via a tiny external store. Fully static/free; for a
 * signed-in user, src/lib/sync.ts layers cloud sync on top (the lazy chunk
 * reconciles this local store with the server; this module never imports
 * supabase, so it stays in the main bundle).
 *
 * Unsaves are remembered as TOMBSTONES, not just absences, so a later cloud
 * merge (or another device) can't resurrect a story you deliberately removed:
 * the merge is union-of-saves minus union-of-tombstones.
 */
const KEY = 'crowdtell-saved';
const TOMB_KEY = 'crowdtell-saved-tomb';
const TOMB_MAX = 1000;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

let ids: string[] = readList(KEY);
let tombs: string[] = readList(TOMB_KEY);
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
    localStorage.setItem(TOMB_KEY, JSON.stringify(tombs));
  } catch {
    /* private mode: keep in-memory for the session */
  }
}

export function getSavedIds(): string[] {
  return ids;
}

export function toggleSaved(id: string): void {
  if (ids.includes(id)) {
    ids = ids.filter((x) => x !== id);
    tombs = [id, ...tombs.filter((x) => x !== id)].slice(0, TOMB_MAX); // remember the unsave
    track('article_unsaved', { market_id: id });
  } else {
    ids = [id, ...ids];
    tombs = tombs.filter((x) => x !== id); // un-tombstone: re-saving clears it
    track('article_saved', { market_id: id });
  }
  persist();
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** All saved ids (newest first), reactive. */
export function useSavedIds(): string[] {
  return useSyncExternalStore(subscribe, getSavedIds, getSavedIds);
}

/** Whether a single story is saved, reactive. */
export function useIsSaved(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ids.includes(id),
    () => false,
  );
}

// ── sync surface (used only by the lazy cloud-sync engine) ───────────────────

export interface SavedSnapshot {
  ids: string[];
  tombs: string[];
}

/** The current local state, for the sync engine to diff/push. */
export function getSavedSnapshot(): SavedSnapshot {
  return { ids, tombs };
}

export function subscribeSaved(cb: () => void): () => void {
  return subscribe(cb);
}

/** Wipe all local saved state (used when a user deletes their account). */
export function clearLocalSaved(): void {
  ids = [];
  tombs = [];
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TOMB_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/**
 * Merge a remote snapshot into the local store: local saves ∪ remote saves,
 * minus (local tombstones ∪ remote tombstones). Tombstone wins on conflict, so a
 * deliberate unsave on any device is never undone by a stale save elsewhere.
 */
export function mergeRemoteSaved(remoteSaved: string[], remoteTombs: string[]): void {
  const nextTombs = dedupe([...tombs, ...remoteTombs]).slice(0, TOMB_MAX);
  const tombSet = new Set(nextTombs);
  const nextIds = dedupe([...ids, ...remoteSaved]).filter((id) => !tombSet.has(id));
  const changed =
    !sameList(nextIds, ids) || !sameList(nextTombs.slice(), tombs.slice());
  ids = nextIds;
  tombs = nextTombs;
  if (changed) {
    persist();
    emit();
  }
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Cross-tab: a save/unsave in another tab updates this one (no clobber). Attached
// once at module load — this store is eager and lives for the page's lifetime.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === KEY || e.key === TOMB_KEY || e.key === null) {
      ids = readList(KEY);
      tombs = readList(TOMB_KEY);
      emit();
    }
  });
}
