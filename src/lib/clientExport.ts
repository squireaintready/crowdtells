import { supabase } from './supabase';
import { getSavedSnapshot } from './saved';
import { getInterests } from './interests';

/**
 * Self-serve data export for a signed-in reader: gathers the rows RLS lets them
 * read about themselves (profile, comments, likes, votes, cloud-saved, interests)
 * plus their local saved/interests, as one JSON document they can download.
 * Lives in the lazy chunk (uses supabase). The operator CLI (scripts/export-user)
 * is the fuller, service-role version that can also see subscriber rows.
 */
export async function gatherMyData(userId: string): Promise<Record<string, unknown>> {
  const local = {
    saved: getSavedSnapshot().ids,
    interests: getInterests().topics,
  };
  if (!supabase) return { account: { id: userId }, local };
  const sb = supabase;

  // Fail-soft per table: a table absent (pre-migration) or blocked returns []
  // rather than aborting the whole export.
  const own = async (table: string): Promise<unknown[]> => {
    try {
      const { data } = await sb.from(table).select('*').eq('user_id', userId);
      return data ?? [];
    } catch {
      return [];
    }
  };
  const profileRow = async (): Promise<unknown> => {
    try {
      const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
      return data ?? null;
    } catch {
      return null;
    }
  };
  // user_follows keys on follower_id (not user_id), so it needs its own query.
  const myFollows = async (): Promise<unknown[]> => {
    try {
      const { data } = await sb.from('user_follows').select('*').eq('follower_id', userId);
      return data ?? [];
    } catch {
      return [];
    }
  };

  const [profile, comments, commentLikes, storyLikes, claimVotes, saved, interests, follows] =
    await Promise.all([
      profileRow(),
      own('comments'),
      own('comment_likes'),
      own('story_likes'),
      own('claim_votes'),
      own('saved_stories'),
      own('user_interests'),
      myFollows(),
    ]);

  return {
    account: { id: userId },
    profile,
    comments,
    comment_likes: commentLikes,
    story_likes: storyLikes,
    claim_votes: claimVotes,
    saved_stories: saved,
    user_interests: interests,
    user_follows: follows,
    local,
    exportedAt: new Date().toISOString(),
  };
}

/** Trigger a browser download of a JSON object. */
export function downloadJson(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
