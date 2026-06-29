import { fetchMyBadges, fetchMyTrust } from './calls';
import { BADGES, levelProgress, type Tier } from './gamify';
import { setStandingBreadcrumb } from './standingBreadcrumb';

/**
 * The single source of the reader's live STANDING for the whole UI. One module-level store that
 * fetches my_trust + my_badges, mirrors a supabase-free crumb for the eager header, and emits any
 * NEWLY-earned levels/badges (diffed against a per-user localStorage baseline) so the global toast
 * layer can celebrate them. Calling fetchMyTrust() also triggers the server-side recompute that
 * awards client-driven badges, so a re-check right after an action surfaces the new badge.
 */
export interface StandingSnapshot {
  level: number;
  title: string;
  tier: Tier;
  merit: number;
  /** 0..1 toward the next level (for the progress ring). */
  progress: number;
  badges: string[];
}

export interface StandingEarn {
  kind: 'level' | 'badge';
  /** Display label — the level title or the badge label. */
  label: string;
  /** A single-glyph mark for the medallion. */
  mark: string;
  /** The badge id (badge earns) — drives the medallion's tone. */
  badgeId?: string;
  /** The level reached (level earns) — shown as the medallion's number. */
  level?: number;
}

let current: StandingSnapshot | null = null;
let inflight = false;
let lastRefreshAt = 0;
/** Catch-all refreshes (mount, tab-refocus) coalesce within this window so rapid focus toggling
 * can't spam the recompute; an action ping bypasses it (you just earned something). */
const REFRESH_THROTTLE_MS = 15_000;
const subs = new Set<(snap: StandingSnapshot, earns: StandingEarn[]) => void>();

export function getStanding(): StandingSnapshot | null {
  return current;
}

/** Subscribe to standing updates. Immediately replays the current snapshot (no earns) so a late
 * subscriber paints right away. */
export function subscribeStanding(
  cb: (snap: StandingSnapshot, earns: StandingEarn[]) => void,
): () => void {
  subs.add(cb);
  if (current) cb(current, []);
  return () => subs.delete(cb);
}

/** Diff a snapshot against the reader's last-seen baseline (per-user localStorage) and return the
 * newly-earned levels/badges, then record the new baseline. First sight sets the baseline only (so
 * pre-existing badges aren't celebrated); a level DROP is never surfaced. Exported for tests. */
export function diffEarns(uid: string, snap: StandingSnapshot): StandingEarn[] {
  const key = `ct:standing:${uid}`;
  try {
    const raw = localStorage.getItem(key);
    const prev = raw ? (JSON.parse(raw) as { level: number; badges: string[] }) : null;
    localStorage.setItem(key, JSON.stringify({ level: snap.level, badges: snap.badges }));
    if (!prev) return []; // first sight: set the baseline, never celebrate pre-existing state
    const earns: StandingEarn[] = [];
    if (snap.level > prev.level) {
      earns.push({ kind: 'level', label: snap.title, mark: '▲', level: snap.level });
    }
    for (const id of snap.badges) {
      const b = BADGES[id];
      if (b && !prev.badges.includes(id)) {
        earns.push({ kind: 'badge', label: b.label, mark: b.mark, badgeId: id });
      }
    }
    return earns;
  } catch {
    return [];
  }
}

/** Fetch the reader's standing, update the eager crumb, and emit any newly-earned levels/badges.
 * No-ops while a fetch is in flight; catch-all callers are throttled, but `force` (an action ping)
 * always runs since the reader just did something that may have earned a badge. */
export async function refreshStanding(userId: string | null, force = false): Promise<void> {
  if (!userId || inflight) return;
  if (!force && lastRefreshAt && Date.now() - lastRefreshAt < REFRESH_THROTTLE_MS) return;
  inflight = true;
  try {
    const [trust, badges] = await Promise.all([fetchMyTrust(), fetchMyBadges(userId)]);
    if (!trust) return;
    lastRefreshAt = Date.now();
    const prog = levelProgress(trust.tier, trust.merit);
    const snap: StandingSnapshot = {
      level: prog.current.level,
      title: prog.current.title,
      tier: trust.tier,
      merit: trust.merit,
      progress: prog.progress,
      badges,
    };
    const earns = diffEarns(userId, snap);
    current = snap;
    setStandingBreadcrumb({ level: snap.level, tier: snap.tier });
    for (const cb of subs) cb(snap, earns);
  } finally {
    inflight = false;
  }
}
