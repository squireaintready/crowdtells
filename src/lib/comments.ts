import { supabase } from './supabase';
import { notifyStandingMaybeChanged } from './standingSignal';

export interface CommentAuthor {
  display_name: string | null;
  avatar_url: string | null;
}

interface CommentRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  call_pick: string | null;
  call_confidence: number | null;
  profiles: CommentAuthor | null;
}

export interface UiComment {
  id: string;
  userId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  /** When the body was last edited (server-stamped), or null if never. */
  editedAt: string | null;
  /** Set when this comment was posted as a public note on the author's own
   * Call: 'yes' | 'no' on the market target, or null for a plain comment. */
  callPick: 'yes' | 'no' | null;
  /** The author's confidence (55–95 ladder) when callPick is set, else null. */
  callConfidence: number | null;
  author: CommentAuthor;
  likeCount: number;
  likedByMe: boolean;
}

export const MAX_COMMENT = 2000;

/** Trim + validate a comment body; throws a user-facing error when invalid. */
export function validateComment(body: string): string {
  const text = body.trim();
  if (text.length === 0) throw new Error('Write something first.');
  if (text.length > MAX_COMMENT) throw new Error(`Keep it under ${MAX_COMMENT} characters.`);
  return text;
}

// Disambiguate the author embed to the comments.user_id FK explicitly: once
// comment_likes.user_id was repointed to profiles (the "consistent author FKs"
// migration), PostgREST sees TWO comments→profiles paths (direct, and via
// comment_likes) and refuses a bare `profiles(...)` embed with PGRST201. The
// returned object is still keyed `profiles`, so callers are unchanged.
const AUTHOR = 'profiles!comments_user_id_fkey(display_name,avatar_url)';
const SELECT = `id,user_id,parent_id,body,created_at,edited_at,call_pick,call_confidence,${AUTHOR}`;
// Fallback for before the call-annotation migration is applied: same select
// minus the call_pick/call_confidence columns, which won't exist yet.
const SELECT_NO_CALL = `id,user_id,parent_id,body,created_at,edited_at,${AUTHOR}`;

// Session memory: once we've learned the call_* columns aren't in this project's schema
// yet, skip the doomed call-column select on every subsequent read/write — otherwise
// EVERY comment load fires a 400 (logged loudly to the console) before the retry, and
// every call-note post does the same. Reset on reload (so it re-checks after a migration).
let callColumnsMissing = false;

export async function fetchComments(marketId: string, myId: string | null): Promise<UiComment[]> {
  if (!supabase) return [];
  const run = (cols: string) =>
    supabase!
      .from('comments')
      .select(cols)
      .eq('market_id', marketId)
      .eq('deleted', false)
      .order('created_at', { ascending: true });
  // Skip straight to the no-call select once we know the columns are absent.
  let { data, error } = await run(callColumnsMissing ? SELECT_NO_CALL : SELECT);
  // Fail soft: if the call columns aren't there yet (PostgREST PGRST204 / 42703), remember
  // it for the session and retry without them so the discussion still loads pre-migration.
  if (error && isMissingCallColumn(error)) {
    callColumnsMissing = true;
    ({ data, error } = await run(SELECT_NO_CALL));
  }
  if (error) throw error;
  const rows = data as unknown as CommentRow[];

  // Public like counts come from an aggregate rpc (no user_ids exposed); the
  // viewer's own likes come from the table, which RLS now scopes to own rows.
  const [counts, mine] = await Promise.all([
    commentLikeCounts(marketId),
    myId ? ownCommentLikes(rows.map((c) => c.id), myId) : Promise.resolve(new Set<string>()),
  ]);

  return rows.map((c) => ({
    id: c.id,
    userId: c.user_id,
    parentId: c.parent_id,
    body: c.body,
    createdAt: c.created_at,
    editedAt: c.edited_at,
    callPick: c.call_pick === 'yes' || c.call_pick === 'no' ? c.call_pick : null,
    callConfidence: c.call_confidence ?? null,
    author: c.profiles ?? { display_name: 'Member', avatar_url: null },
    likeCount: counts.get(c.id) ?? 0,
    likedByMe: mine.has(c.id),
  }));
}

/** Whether a PostgREST error is "the call_* column doesn't exist yet" — i.e. the
 * call-annotation migration hasn't been re-run. PGRST204 = unknown column on
 * write, 42703 = Postgres undefined_column; message-match catches the rest. */
function isMissingCallColumn(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const m = error.message ?? '';
  return /call_pick|call_confidence/.test(m) && /column|does not exist|schema cache/i.test(m);
}

/** Aggregate like counts per comment for a market — counts only, no user_ids. */
async function commentLikeCounts(marketId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!supabase) return counts;
  const { data } = await supabase.rpc('comment_like_counts', { p_market_id: marketId });
  for (const r of (data ?? []) as { comment_id: string; like_count: number }[]) {
    counts.set(r.comment_id, Number(r.like_count));
  }
  return counts;
}

/** Which of these comments the viewer has liked (RLS returns only their rows). */
async function ownCommentLikes(commentIds: string[], myId: string): Promise<Set<string>> {
  const mine = new Set<string>();
  if (!supabase || commentIds.length === 0) return mine;
  const { data } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', myId)
    .in('comment_id', commentIds);
  for (const r of (data ?? []) as { comment_id: string }[]) mine.add(r.comment_id);
  return mine;
}

/** Optional call-annotation context for a comment posted as a public note on
 * the author's own Call. Both fields travel together or not at all. */
export interface CallNote {
  callPick: 'yes' | 'no';
  callConfidence: number;
}

export async function postComment(
  marketId: string,
  userId: string,
  body: string,
  parentId: string | null = null,
  call: CallNote | null = null,
): Promise<void> {
  if (!supabase) throw new Error('Comments are unavailable.');
  const text = validateComment(body);
  const base = { market_id: marketId, user_id: userId, body: text, parent_id: parentId };
  // ALWAYS attempt the call-column insert when a note carries call context — never gate
  // it on the `callColumnsMissing` latch. The latch is only a read-path perf hint, and
  // the columns can appear mid-session (the owner re-runs schema.sql routinely); gating
  // the write would SILENTLY DROP the user's pick+confidence after such a migration. The
  // cost of always trying is one 400 per session in the genuinely-unmigrated case — a fair
  // price for never losing a Call note. A success also clears the latch so reads re-probe.
  if (call) {
    const { error } = await supabase
      .from('comments')
      .insert({ ...base, call_pick: call.callPick, call_confidence: call.callConfidence });
    if (!error) {
      callColumnsMissing = false; // columns exist after all — let reads pick up call-tags
      notifyStandingMaybeChanged();
      return;
    }
    if (!isMissingCallColumn(error)) throw new Error(error.message);
    callColumnsMissing = true; // genuinely absent — fall through to a plain comment
  }
  const { error } = await supabase.from('comments').insert(base);
  if (error) throw new Error(error.message);
  notifyStandingMaybeChanged();
}

export async function deleteComment(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('comments').update({ deleted: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Edit a comment's body. RLS scopes this to the owner; the DB guard stamps
 * edited_at and rejects any change to immutable fields. */
export async function editComment(id: string, body: string): Promise<void> {
  if (!supabase) throw new Error('Comments are unavailable.');
  const text = validateComment(body);
  const { error } = await supabase.from('comments').update({ body: text }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setCommentLike(
  commentId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  if (!supabase) return;
  if (liked) {
    const { error } = await supabase
      .from('comment_likes')
      .insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== '23505') throw new Error(error.message); // ignore duplicate
  } else {
    const { error } = await supabase
      .from('comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}

export async function reportComment(
  commentId: string,
  userId: string,
  reason: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('reports')
    .insert({ comment_id: commentId, user_id: userId, reason });
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function fetchStoryLikes(
  marketId: string,
  myId: string | null,
): Promise<{ count: number; likedByMe: boolean }> {
  if (!supabase) return { count: 0, likedByMe: false };
  // Fail-soft: if the count rpc isn't there yet (e.g. before the schema migration
  // is applied), show 0 rather than throwing — never break the story UI.
  const { data: countData } = await supabase.rpc('story_like_count', { p_market_id: marketId });
  const count = Number(countData ?? 0);
  let likedByMe = false;
  if (myId) {
    // RLS returns only the viewer's own row, so a hit means they liked it.
    const { data: mineData } = await supabase
      .from('story_likes')
      .select('market_id')
      .eq('market_id', marketId)
      .eq('user_id', myId)
      .maybeSingle();
    likedByMe = mineData != null;
  }
  return { count, likedByMe };
}

export async function setStoryLike(
  marketId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  if (!supabase) return;
  if (liked) {
    const { error } = await supabase
      .from('story_likes')
      .insert({ market_id: marketId, user_id: userId });
    if (error && error.code !== '23505') throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('story_likes')
      .delete()
      .eq('market_id', marketId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}
