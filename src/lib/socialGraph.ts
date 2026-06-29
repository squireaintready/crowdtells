import { supabase } from './supabase';
import type { CallSeriesDay, FollowedCall } from './socialVotes';

/**
 * Supabase wrappers for the opt-in social graph (follow + shared calls + vote series).
 * Same contract as lib/calls.ts: every call FAILS SOFT — before the migration is
 * applied (or with no project configured) reads return benign empties and writes
 * no-op, so the discussion/account UI never breaks. Lives in the lazy chunk, so
 * supabase-js stays out of the main bundle. Privacy is enforced server-side (RLS +
 * the followed_calls_on_market definer rpc); these are thin transports.
 */

/** Follow another reader. Idempotent server-side (PK on the edge). */
export async function followUser(followerId: string, followingId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_follows')
    .insert({ follower_id: followerId, following_id: followingId });
  // A duplicate (already following) is not an error worth surfacing.
  if (error && !/duplicate|conflict/i.test(error.message)) throw new Error(error.message);
}

/** Unfollow a reader. */
export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw new Error(error.message);
}

/** The set of user ids the caller currently follows (their own outgoing edges). */
export async function fetchMyFollowing(userId: string | null): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!supabase || !userId) return ids;
  const { data } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId);
  for (const r of (data ?? []) as { following_id: string }[]) ids.add(r.following_id);
  return ids;
}

/** How the people you follow (who opted in) called a market. [] for anon/none. */
export async function fetchFollowedCalls(marketId: string): Promise<FollowedCall[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc('followed_calls_on_market', { p_market_id: marketId });
  return ((data ?? []) as {
    display_name: string | null;
    avatar_url: string | null;
    pick: 'yes' | 'no';
    confidence: number;
    target_outcome: string;
  }[]).map((r) => ({
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    pick: r.pick,
    confidence: Number(r.confidence),
    targetOutcome: r.target_outcome,
  }));
}

/** Per-day call counts for a market's vote-over-time line (counts only). */
export async function fetchCallSeries(marketId: string): Promise<CallSeriesDay[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc('call_distribution_series', { p_market_id: marketId });
  return ((data ?? []) as { day: string; yes_target: number; no_target: number }[]).map((r) => ({
    day: r.day,
    yesTarget: Number(r.yes_target),
    noTarget: Number(r.no_target),
  }));
}

/** Read whether the caller currently shares their calls with followers. */
export async function fetchCallsPublic(userId: string | null): Promise<boolean> {
  if (!supabase || !userId) return false;
  const { data } = await supabase
    .from('profiles')
    .select('calls_public')
    .eq('id', userId)
    .maybeSingle();
  return !!(data as { calls_public?: boolean } | null)?.calls_public;
}

/** Flip the "show my calls to followers" opt-in (RLS scopes it to the caller's row). */
export async function setCallsPublic(userId: string, value: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .update({ calls_public: value })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

/** Read whether the caller has made their standing a shareable public profile page. */
export async function fetchProfilePublic(userId: string | null): Promise<boolean> {
  if (!supabase || !userId) return false;
  const { data } = await supabase
    .from('profiles')
    .select('profile_public')
    .eq('id', userId)
    .maybeSingle();
  return !!(data as { profile_public?: boolean } | null)?.profile_public;
}

/** Flip the "public profile page" opt-in (RLS scopes it to the caller's row). */
export async function setProfilePublic(userId: string, value: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .update({ profile_public: value })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
