import { supabase } from './supabase';

/** Recent on-Crowdtells engagement for one story — distinct-user counts only (the
 * bulk RPC never returns who), so it can rank without de-anonymizing anyone. */
export interface EngagementStat {
  /** Story upvotes (story_likes) since the window opened. */
  likes: number;
  /** Comments posted since the window opened. */
  comments: number;
  /** DISTINCT users who liked or commented in the window — the anti-brigade signal
   * (one person doing five things counts once). */
  users: number;
}

/**
 * Bulk recent-engagement aggregate for the visible feed, in ONE round trip. Fail-soft
 * by design: returns an empty map when Supabase isn't configured, the bulk RPC hasn't
 * been migrated yet, or anything errors — so ranking simply falls back to the baked
 * newsworthiness score and nothing on the page breaks. Counts only; no user ids ever
 * leave the database.
 */
export async function fetchEngagement(
  marketIds: string[],
  sinceMs: number,
): Promise<Map<string, EngagementStat>> {
  const out = new Map<string, EngagementStat>();
  if (!supabase || marketIds.length === 0) return out;
  try {
    const { data, error } = await supabase.rpc('story_engagement', {
      p_market_ids: marketIds,
      p_since: new Date(sinceMs).toISOString(),
    });
    if (error || !data) return out; // RPC not migrated / transient error → no boost
    for (const r of data as {
      market_id: string;
      likes: number | string;
      comments: number | string;
      engaged_users: number | string;
    }[]) {
      out.set(r.market_id, {
        likes: Number(r.likes) || 0,
        comments: Number(r.comments) || 0,
        users: Number(r.engaged_users) || 0,
      });
    }
  } catch {
    return out; // never let an engagement hiccup affect the feed
  }
  return out;
}
