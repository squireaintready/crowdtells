/**
 * Cloud sync for a signed-in reader: mirrors the local saved-stories and topic-
 * interests stores to Supabase so they follow the user across devices. Imported
 * only by the lazy auth layer (src/hooks/useAuth.ts), so the supabase-js it pulls
 * in never reaches the main bundle.
 *
 * Model:
 *  - Saved: union-merge on sign-in (local ∪ remote saves, minus union of
 *    tombstones), then push the reconciled state. Unsaves are tombstones
 *    (deleted=true rows), so they don't resurrect across devices.
 *  - Interests: last-write-wins by timestamp.
 *
 * Fail-soft: if the tables aren't there yet (owner hasn't run the migration) or
 * any call errors, sync quietly disables itself and the app stays local-only —
 * never throwing into the auth flow. Theme is intentionally not synced.
 */
import { supabase } from './supabase';
import {
  clearLocalSaved,
  getSavedSnapshot,
  mergeRemoteSaved,
  subscribeSaved,
} from './saved';
import {
  clearLocalInterests,
  getInterests,
  mergeRemoteInterests,
  subscribeInterests,
} from './interests';

// Which user the local saved/interests stores currently belong to. Persisted so
// that if a DIFFERENT person signs in on a shared device, we DON'T union the
// previous user's local data up into the new account (a cross-user data leak).
// The anonymous→first-sign-in merge (no prior user recorded) is still intended.
const SYNC_USER_KEY = 'crowdtell-sync-user';
function readSyncUser(): string | null {
  try {
    return localStorage.getItem(SYNC_USER_KEY);
  } catch {
    return null;
  }
}
function writeSyncUser(id: string): void {
  try {
    localStorage.setItem(SYNC_USER_KEY, id);
  } catch {
    /* ignore */
  }
}

let uid: string | null = null;
let unsubSaved: (() => void) | null = null;
let unsubInterests: (() => void) | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;
let interestsTimer: ReturnType<typeof setTimeout> | null = null;
let savedAvailable = true;
let interestsAvailable = true;
// Last state we wrote to the server (marketId → deleted), so we push only diffs.
let pushedSaved = new Map<string, boolean>();
let pushedInterestsTs = -1;

const DEBOUNCE_MS = 800;

interface SavedRow {
  market_id: string;
  deleted: boolean;
}
interface InterestsRow {
  topics: string[] | null;
  onboarded: boolean | null;
  updated_at: string | null;
}

/** Begin syncing for this user: pull, merge, push, then watch for local changes. */
export async function attachSync(userId: string): Promise<void> {
  if (!supabase) return;
  if (uid === userId) return; // already attached for this user
  detachSync();

  // If the local stores belong to a DIFFERENT signed-in user (shared device,
  // A→B switch), wipe them so A's saves/interests can't merge up into B's
  // account. A null prior user means anonymous data, which SHOULD merge in.
  const prior = readSyncUser();
  if (prior && prior !== userId) {
    clearLocalSaved();
    clearLocalInterests();
  }
  writeSyncUser(userId);

  uid = userId;
  savedAvailable = true;
  interestsAvailable = true;
  pushedSaved = new Map();
  pushedInterestsTs = -1;

  await Promise.all([pullSaved(userId), pullInterests(userId)]);
  if (uid !== userId) return; // a sign-out/switch raced us; bail

  // Push whatever the merge left local-only, then keep the server in step.
  reconcileSaved();
  reconcileInterests();
  unsubSaved = subscribeSaved(() => scheduleSaved());
  unsubInterests = subscribeInterests(() => scheduleInterests());
}

/** Stop syncing (sign-out or user switch). */
export function detachSync(): void {
  uid = null;
  unsubSaved?.();
  unsubInterests?.();
  unsubSaved = null;
  unsubInterests = null;
  if (savedTimer) clearTimeout(savedTimer);
  if (interestsTimer) clearTimeout(interestsTimer);
  savedTimer = null;
  interestsTimer = null;
}

async function pullSaved(userId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('saved_stories')
    .select('market_id, deleted')
    .eq('user_id', userId);
  if (uid !== userId) return; // a sign-out/switch raced this pull; don't touch shared state
  if (error) {
    savedAvailable = false;
    return;
  }
  const rows = (data ?? []) as SavedRow[];
  const remoteSaved = rows.filter((r) => !r.deleted).map((r) => r.market_id);
  const remoteTombs = rows.filter((r) => r.deleted).map((r) => r.market_id);
  // Seed "pushed" with the server's view so the first reconcile only sends diffs.
  pushedSaved = new Map(rows.map((r) => [r.market_id, r.deleted]));
  mergeRemoteSaved(remoteSaved, remoteTombs);
}

async function pullInterests(userId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('user_interests')
    .select('topics, onboarded, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (uid !== userId) return; // a sign-out/switch raced this pull; don't touch shared state
  if (error) {
    interestsAvailable = false;
    return;
  }
  const row = data as InterestsRow | null;
  if (!row) return;
  const ts = row.updated_at ? Date.parse(row.updated_at) : 0;
  if (Number.isFinite(ts)) {
    pushedInterestsTs = ts;
    mergeRemoteInterests(row.topics ?? [], row.onboarded ?? false, ts);
  }
}

function scheduleSaved(): void {
  if (!savedAvailable || !uid) return;
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => void reconcileSaved(), DEBOUNCE_MS);
}

function scheduleInterests(): void {
  if (!interestsAvailable || !uid) return;
  if (interestsTimer) clearTimeout(interestsTimer);
  interestsTimer = setTimeout(() => void reconcileInterests(), DEBOUNCE_MS);
}

/** Upsert only the saved rows whose desired state differs from what we last wrote. */
async function reconcileSaved(): Promise<void> {
  if (!supabase || !savedAvailable || !uid) return;
  const userId = uid;
  const { ids, tombs } = getSavedSnapshot();
  const desired = new Map<string, boolean>();
  for (const id of ids) desired.set(id, false);
  for (const t of tombs) if (!desired.has(t)) desired.set(t, true);

  const nowIso = new Date().toISOString();
  const changed: { user_id: string; market_id: string; deleted: boolean; updated_at: string }[] =
    [];
  for (const [marketId, deleted] of desired) {
    if (pushedSaved.get(marketId) !== deleted) {
      changed.push({ user_id: userId, market_id: marketId, deleted, updated_at: nowIso });
    }
  }
  if (changed.length === 0) return;
  const { error } = await supabase
    .from('saved_stories')
    .upsert(changed, { onConflict: 'user_id,market_id' });
  if (error) {
    savedAvailable = false;
    return;
  }
  for (const r of changed) pushedSaved.set(r.market_id, r.deleted);
}

/** Push the local interests row when it is newer than what the server holds. */
async function reconcileInterests(): Promise<void> {
  if (!supabase || !interestsAvailable || !uid) return;
  const userId = uid;
  const { topics, onboarded, updatedAt } = getInterests();
  // Push whenever local state DIFFERS from what we last pulled/pushed — not just
  // when its wall-clock stamp is greater. Gating on `>` would silently wedge all
  // future local edits if a clock-skewed remote row carried a future timestamp.
  if (updatedAt <= 0 || updatedAt === pushedInterestsTs) return; // already in sync
  const iso = new Date(updatedAt).toISOString();
  const { error } = await supabase
    .from('user_interests')
    .upsert(
      { user_id: userId, topics, onboarded, updated_at: iso },
      { onConflict: 'user_id' },
    );
  if (error) {
    interestsAvailable = false;
    return;
  }
  pushedInterestsTs = updatedAt;
}
