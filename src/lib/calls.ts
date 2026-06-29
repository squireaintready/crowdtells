import { supabase } from './supabase';
import type { Pick, Tier } from './gamify';
import { notifyStandingMaybeChanged } from './standingSignal';

/**
 * Client wrappers for The Calibration Desk. All fail SOFT: before the schema
 * migration is applied (or with no project configured) every call returns a benign
 * default instead of throwing, so the article UI never breaks. Lives in the lazy
 * discussion/account chunk, so supabase-js never reaches the main bundle. Reads are
 * RLS-scoped to the caller (private) or come from aggregate rpcs (public).
 */

export interface MyCall {
  targetOutcome: string;
  pick: Pick;
  confidence: number;
  /** A private view toggle — a hidden call is cleared from the reader's own screen
   * but STILL counts toward scoring + the distribution. */
  hidden: boolean;
}

export interface CallDistribution {
  n: number;
  /** Readers calling the favored target to happen. */
  yesTarget: number;
  noTarget: number;
}

/** The caller's graded result on a resolved market (own row). */
export interface MyScore {
  prob: number;
  won: boolean;
  brier: number;
  peer: number;
}

export interface CalibrationBucket {
  conf: number;
  n: number;
  hitRate: number;
}

export interface Calibration {
  nResolved: number;
  correct: number;
  meanBrier: number | null;
  avgPeer: number | null;
  buckets: CalibrationBucket[];
  platformOurBrier: number | null;
}

export interface MyTrust {
  tier: Tier;
  briefingsRead: number;
  callsMade: number;
  resolvedCalls: number;
  commentsPosted: number;
  currentStreak: number;
  longestStreak: number;
  /** Standing: a merit score + the 1..7 level it maps to (see src/lib/gamify.ts). */
  merit: number;
  level: number;
  /** Verification activity behind the new badges + the panel's "your reads" line. */
  helpfulNotes: number;
  claimsVoted: number;
  alignedVotes: number;
}

/** The opt-in public view of a reader's standing (null unless they made it public). */
export interface PublicProfile {
  displayName: string | null;
  avatarUrl: string | null;
  memberSince: string | null;
  tier: Tier;
  level: number;
  currentStreak: number;
  longestStreak: number;
  badges: string[];
  /** Present only if they ALSO share their Calls (calls_public); else null. */
  calibration: { nResolved: number; correct: number; meanBrier: number | null } | null;
}

export interface FacepileEntry {
  displayName: string | null;
  avatarUrl: string | null;
}

/** The caller's PRIVATE standing among callers — the anti-leaderboard. Aggregate only; never
 * another reader's identity or score. `ranked` is false (with a `reason`) until both the caller
 * and the cohort have enough of a track record to rank meaningfully. */
export interface MyPercentile {
  ranked: boolean;
  /** Present when ranked: "sharper than <percentile>% of callers" (1..99). */
  percentile?: number;
  /** Size of the ranked cohort (callers with a track record). */
  cohort?: number;
  /** The caller's own resolved-call count. */
  nResolved: number;
  /** Why it isn't ranked yet, when ranked is false. */
  reason?: 'need_calls' | 'cohort_small';
  /** Resolved calls needed to enter the cohort (with reason 'need_calls'). */
  need?: number;
}

/** The caller's rank band within a single category ("Top 5% on Economics"). Aggregate only. */
export interface CategoryRank {
  category: string;
  /** The caller's resolved calls in this category. */
  n: number;
  /** Callers ranked in this category. */
  cohort: number;
  /** 1..99 — sharper than this share of the category's callers. */
  percentile: number;
}

/** The caller's current live call on a market (RLS returns only their own row). */
export async function fetchMyCall(marketId: string, userId: string | null): Promise<MyCall | null> {
  if (!supabase || !userId) return null;
  const { data } = await supabase
    .from('calls')
    .select('target_outcome, pick, confidence, hidden')
    .eq('market_id', marketId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const row = data as { target_outcome: string; pick: Pick; confidence: number; hidden: boolean };
  return {
    targetOutcome: row.target_outcome,
    pick: row.pick,
    confidence: row.confidence,
    hidden: !!row.hidden,
  };
}

/**
 * Lock in a call — a plain INSERT, never an upsert: a call is FINAL, so a second
 * attempt hits the (user_id, market_id) primary key and is rejected. target_outcome
 * is frozen here at call time. The UI only offers this when no call exists yet.
 */
export async function castCall(
  marketId: string,
  userId: string,
  targetOutcome: string,
  pick: Pick,
  confidence: number,
  /** The market's category, stamped now so per-category percentiles can rank this call later. */
  category?: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('calls').insert({
    market_id: marketId,
    user_id: userId,
    target_outcome: targetOutcome,
    pick,
    confidence,
    category: category ?? null,
  });
  if (error) throw new Error(error.message);
  notifyStandingMaybeChanged(); // your first call earns a badge — surface it right away
}

/** Toggle a call's private `hidden` flag. The call is NOT retracted — it still
 * counts toward scoring + the distribution; this only clears it from your view.
 * The DB guard rejects any attempt to change the prediction itself. */
export async function hideCall(marketId: string, userId: string, hidden: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('calls')
    .update({ hidden })
    .eq('market_id', marketId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/** Anonymized "how readers are calling this" (counts only, never identities). */
export async function fetchCallDistribution(marketId: string): Promise<CallDistribution> {
  const empty = { n: 0, yesTarget: 0, noTarget: 0 };
  if (!supabase) return empty;
  const { data } = await supabase.rpc('call_distribution', { p_market_id: marketId });
  const row = (data ?? [])[0] as { n: number; yes_target: number; no_target: number } | undefined;
  if (!row) return empty;
  return { n: Number(row.n), yesTarget: Number(row.yes_target), noTarget: Number(row.no_target) };
}

/** The caller's graded result on a resolved market, or null if not scored. */
export async function fetchMyScore(marketId: string, userId: string | null): Promise<MyScore | null> {
  if (!supabase || !userId) return null;
  const { data } = await supabase
    .from('call_scores')
    .select('prob, won, brier, peer')
    .eq('market_id', marketId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as MyScore;
  return { prob: Number(r.prob), won: r.won, brier: Number(r.brier), peer: Number(r.peer) };
}

/** The caller's full calibration record (rolling Brier, peer, curve buckets). */
export async function fetchMyCalibration(): Promise<Calibration | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc('my_calibration');
  if (!data) return null;
  const d = data as {
    n_resolved: number;
    correct: number;
    mean_brier: number | null;
    avg_peer: number | null;
    buckets: { conf: number; n: number; hit_rate: number }[];
    platform_our_brier: number | null;
  };
  return {
    nResolved: Number(d.n_resolved ?? 0),
    correct: Number(d.correct ?? 0),
    meanBrier: d.mean_brier == null ? null : Number(d.mean_brier),
    avgPeer: d.avg_peer == null ? null : Number(d.avg_peer),
    buckets: (d.buckets ?? []).map((b) => ({
      conf: Number(b.conf),
      n: Number(b.n),
      hitRate: Number(b.hit_rate),
    })),
    platformOurBrier: d.platform_our_brier == null ? null : Number(d.platform_our_brier),
  };
}

/** The caller's tier + counts + streak (the rpc freshens it on read). */
export async function fetchMyTrust(): Promise<MyTrust | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc('my_trust');
  if (!data) return null;
  const d = data as {
    tier: Tier;
    briefings_read: number;
    calls_made: number;
    resolved_calls: number;
    comments_posted: number;
    current_streak: number;
    longest_streak: number;
    // Standing fields — absent until the schema migration ships; default fail-soft.
    merit?: number;
    level?: number;
    helpful_notes?: number;
    claims_voted?: number;
    aligned_votes?: number;
  };
  return {
    tier: d.tier,
    briefingsRead: Number(d.briefings_read ?? 0),
    callsMade: Number(d.calls_made ?? 0),
    resolvedCalls: Number(d.resolved_calls ?? 0),
    commentsPosted: Number(d.comments_posted ?? 0),
    currentStreak: Number(d.current_streak ?? 0),
    longestStreak: Number(d.longest_streak ?? 0),
    merit: Number(d.merit ?? 0),
    level: Number(d.level ?? 1),
    helpfulNotes: Number(d.helpful_notes ?? 0),
    claimsVoted: Number(d.claims_voted ?? 0),
    alignedVotes: Number(d.aligned_votes ?? 0),
  };
}

/** The caller's private percentile among callers (the anti-leaderboard). Fail-soft: null when
 * supabase is absent or the rpc isn't live yet (so the hub just hides the card). */
export async function fetchMyPercentile(): Promise<MyPercentile | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc('my_percentile');
  if (!data) return null;
  const d = data as {
    ranked?: boolean;
    percentile?: number;
    cohort?: number;
    n_resolved?: number;
    reason?: string;
    need?: number;
  };
  return {
    ranked: !!d.ranked,
    percentile: d.percentile == null ? undefined : Number(d.percentile),
    cohort: d.cohort == null ? undefined : Number(d.cohort),
    nResolved: Number(d.n_resolved ?? 0),
    reason: d.reason === 'need_calls' || d.reason === 'cohort_small' ? d.reason : undefined,
    need: d.need == null ? undefined : Number(d.need),
  };
}

/** The caller's per-category rank bands ("Top 5% on Economics"). Fail-soft to [] when supabase is
 * absent, the rpc isn't live, or no category clears the cohort floors yet. */
export async function fetchMyCategoryPercentile(): Promise<CategoryRank[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc('my_category_percentile');
  if (!Array.isArray(data)) return [];
  return (data as { category: string; n: number; cohort: number; percentile: number }[]).map(
    (d) => ({
      category: String(d.category),
      n: Number(d.n),
      cohort: Number(d.cohort),
      percentile: Number(d.percentile),
    }),
  );
}

/** The opt-in public profile for a reader, or null if they haven't made it public (or the
 * rpc isn't live yet). Aggregates only — never a raw vote or a rater id. */
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  if (!supabase || !userId) return null;
  const { data } = await supabase.rpc('public_profile', { p_user_id: userId });
  if (!data) return null;
  const d = data as {
    display_name: string | null;
    avatar_url: string | null;
    member_since: string | null;
    tier: Tier;
    level: number;
    current_streak: number;
    longest_streak: number;
    badges: string[] | null;
    calibration: { n_resolved: number; correct: number; mean_brier: number | null } | null;
  };
  return {
    displayName: d.display_name,
    avatarUrl: d.avatar_url,
    memberSince: d.member_since,
    tier: d.tier,
    level: Number(d.level ?? 1),
    currentStreak: Number(d.current_streak ?? 0),
    longestStreak: Number(d.longest_streak ?? 0),
    badges: d.badges ?? [],
    calibration: d.calibration
      ? {
          nResolved: Number(d.calibration.n_resolved ?? 0),
          correct: Number(d.calibration.correct ?? 0),
          meanBrier: d.calibration.mean_brier == null ? null : Number(d.calibration.mean_brier),
        }
      : null,
  };
}

/** The caller's earned badge ids (own rows). */
export async function fetchMyBadges(userId: string | null): Promise<string[]> {
  if (!supabase || !userId) return [];
  const { data } = await supabase
    .from('user_badges')
    .select('badge_id, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: true });
  return ((data ?? []) as { badge_id: string }[]).map((r) => r.badge_id);
}

/** Record a read + advance the streak; returns the current streak (0 if unavailable). */
export async function touchRead(marketId: string): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.rpc('touch_read', { p_market_id: marketId });
  return Number(data ?? 0);
}

/** Avatar facepile for a story's likes (opted-in likers only). */
export async function fetchFacepile(marketId: string, limit = 5): Promise<FacepileEntry[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc('story_like_facepile', {
    p_market_id: marketId,
    p_limit: limit,
  });
  return ((data ?? []) as { display_name: string | null; avatar_url: string | null }[]).map((r) => ({
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
  }));
}

/** Public tier marks for the authors in a discussion, keyed by user id. */
export async function fetchAuthorTiers(marketId: string): Promise<Map<string, Tier>> {
  const tiers = new Map<string, Tier>();
  if (!supabase) return tiers;
  const { data } = await supabase.rpc('author_tiers', { p_market_id: marketId });
  for (const r of (data ?? []) as { user_id: string; tier: Tier }[]) tiers.set(r.user_id, r.tier);
  return tiers;
}

/** Flag a comment with a category (drives the scoped Steward auto-hide server-side). */
export async function flagComment(commentId: string, category: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('flag_comment', { p_comment_id: commentId, p_category: category });
}
