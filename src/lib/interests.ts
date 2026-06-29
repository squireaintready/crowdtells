import { useSyncExternalStore } from 'react';

/**
 * Reading interests (followed topics) — a module-level store backing useInterests.
 * Lives in the main bundle (no supabase): personalization stays fully static and
 * free. For a signed-in reader, src/lib/sync.ts mirrors this to the server so a
 * topic selection follows them across devices (last-write-wins by timestamp).
 *
 * Theme is deliberately NOT synced — it's device-local by nature.
 */
const TOPICS_KEY = 'crowdtell-topics';
const ONBOARDED_KEY = 'crowdtell-onboarded';
const TS_KEY = 'crowdtell-topics-ts';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readState(): { topics: string[]; onboarded: boolean; updatedAt: number } {
  const topics = readJson<string[]>(TOPICS_KEY, []);
  return {
    topics: Array.isArray(topics) ? topics.filter((t): t is string => typeof t === 'string') : [],
    onboarded: readJson<boolean>(ONBOARDED_KEY, false),
    updatedAt: readJson<number>(TS_KEY, 0),
  };
}

let state = readState();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  try {
    localStorage.setItem(TOPICS_KEY, JSON.stringify(state.topics));
    localStorage.setItem(ONBOARDED_KEY, JSON.stringify(state.onboarded));
    localStorage.setItem(TS_KEY, JSON.stringify(state.updatedAt));
  } catch {
    /* private mode: keep in-memory for the session */
  }
}

export interface InterestsState {
  topics: string[];
  onboarded: boolean;
  updatedAt: number;
}

export function getInterests(): InterestsState {
  return state;
}

/** Persist a topic selection (also marks onboarding complete) + stamp the time. */
export function saveInterests(topics: string[]): void {
  state = { topics, onboarded: true, updatedAt: Date.now() };
  persist();
  emit();
}

/** Re-open the picker without persisting — used by the in-app "Edit" affordance. */
export function reopenOnboarding(): void {
  if (!state.onboarded) return;
  state = { ...state, onboarded: false };
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive interests state. */
export function useInterestsState(): InterestsState {
  return useSyncExternalStore(subscribe, getInterests, getInterests);
}

// ── sync surface (used only by the lazy cloud-sync engine) ───────────────────

export function subscribeInterests(cb: () => void): () => void {
  return subscribe(cb);
}

/** Wipe all local interests state (used when a user deletes their account). */
export function clearLocalInterests(): void {
  state = { topics: [], onboarded: false, updatedAt: 0 };
  try {
    localStorage.removeItem(TOPICS_KEY);
    localStorage.removeItem(ONBOARDED_KEY);
    localStorage.removeItem(TS_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/**
 * Adopt a remote interests row when it is newer than the local one (last-write-
 * wins by timestamp). Returns true if local state changed.
 */
export function mergeRemoteInterests(
  topics: string[],
  onboarded: boolean,
  remoteUpdatedAt: number,
): boolean {
  if (remoteUpdatedAt <= state.updatedAt) return false;
  state = { topics, onboarded, updatedAt: remoteUpdatedAt };
  persist();
  emit();
  return true;
}

// Cross-tab: a topic change in another tab updates this one.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === TOPICS_KEY || e.key === ONBOARDED_KEY || e.key === TS_KEY || e.key === null) {
      state = readState();
      emit();
    }
  });
}
