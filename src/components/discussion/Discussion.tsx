import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import {
  deleteComment,
  editComment,
  fetchComments,
  fetchStoryLikes,
  postComment,
  setCommentLike,
  setStoryLike,
  validateComment,
  type UiComment,
} from '../../lib/comments';
import { fetchAuthorTiers, flagComment } from '../../lib/calls';
import { fetchMyFollowing } from '../../lib/socialGraph';
import { track } from '../../lib/posthog';
import type { Tier } from '../../lib/gamify';
import { avatarInitial, formatRelative } from '../../lib/format';
import { SignIn } from './SignIn';
import Facepile from './Facepile';
import { FollowButton } from './FollowButton';
import { TrustBadge } from './TrustBadge';
import { Burst } from '../Burst';
import burst from '../Burst.module.css';
import styles from './Discussion.module.css';

const REPORT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'spam', label: 'Spam' },
  { key: 'abuse', label: 'Abusive' },
  { key: 'rules', label: 'Breaks rules' },
  { key: 'other', label: 'Other' },
];

type Sort = 'top' | 'newest' | 'oldest';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
];

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) return <img className={styles.avatar} src={url} alt="" width={32} height={32} />;
  return (
    <span className={styles.avatarFallback} aria-hidden="true">
      {avatarInitial(name, 'M')}
    </span>
  );
}

function Composer({
  marketId,
  userId,
  parentId = null,
  placeholder = 'Add your read…',
  submitLabel = 'Post',
  autoFocus = false,
  onPosted,
  onCancel,
}: {
  marketId: string;
  userId: string;
  parentId?: string | null;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Comment-funnel analytics (PostHog): impression on mount, first-focus intent, submit
  // outcome, and abandonment on unmount with typed-but-unsent text (never the text itself).
  const isReply = parentId != null;
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const focusedRef = useRef(false);
  const abandonReason = useRef<'unmount' | 'cancel'>('unmount');
  useEffect(() => {
    track('comment_box_viewed', { market_id: marketId, is_reply: isReply });
    return () => {
      if (bodyRef.current.trim().length > 0) {
        track('comment_abandoned', {
          market_id: marketId,
          is_reply: isReply,
          reason: abandonReason.current,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      className={parentId ? styles.replyComposer : styles.composer}
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          validateComment(body);
          setBusy(true);
          await postComment(marketId, userId, body, parentId);
          track('comment_submitted', { market_id: marketId, is_reply: isReply, status: 'success' });
          setBody('');
          onPosted();
        } catch (e2) {
          track('comment_submitted', { market_id: marketId, is_reply: isReply, status: 'failed' });
          setErr((e2 as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <textarea
        autoFocus={autoFocus}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => {
          if (focusedRef.current) return;
          focusedRef.current = true;
          track('comment_compose_focused', { market_id: marketId, is_reply: isReply });
        }}
        placeholder={placeholder}
        rows={parentId ? 2 : 3}
        maxLength={2000}
        aria-label={parentId ? 'Write a reply' : 'Write a comment'}
      />
      {/* Always mounted (empty until a failure) so the swap-in is reliably announced. */}
      <p className={styles.error} aria-live="polite">
        {err}
      </p>
      <div className={styles.composerActions}>
        {onCancel ? (
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              abandonReason.current = 'cancel';
              onCancel();
            }}
          >
            Cancel
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className={styles.post} disabled={busy || body.trim().length === 0}>
          {busy ? 'Posting…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  c,
  marketId,
  myId,
  tier,
  isReply = false,
  following,
  onFollowChange,
  onReply,
  onChange,
}: {
  c: UiComment;
  marketId: string;
  myId: string | null;
  tier?: Tier;
  isReply?: boolean;
  /** Whether the viewer follows this comment's author. */
  following?: boolean;
  /** Update the viewer's follow edge to this author. */
  onFollowChange?: (authorId: string, next: boolean) => void;
  onReply?: (id: string) => void;
  onChange: () => void;
}) {
  const [liked, setLiked] = useState(c.likedByMe);
  const [count, setCount] = useState(c.likeCount);
  const [likeKey, setLikeKey] = useState(0); // bumped on each fresh like to replay the flourish
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const mine = myId === c.userId;
  // True while a like write is in flight — so an unrelated reload (someone else
  // posts) can't push a not-yet-committed, stale aggregate count back over the
  // user's own optimistic like and visibly revert it.
  const pendingLike = useRef(false);

  // Re-sync to server truth when a reload brings new like data — unless our own
  // like is still in flight (its server count may not reflect the write yet).
  useEffect(() => {
    if (pendingLike.current) return;
    setLiked(c.likedByMe);
    setCount(c.likeCount);
  }, [c.likedByMe, c.likeCount]);

  const toggleLike = async () => {
    if (!myId) return;
    const next = !liked;
    track('like_toggled', { market_id: marketId, target: 'comment', liked: next });
    setLiked(next);
    setCount((n) => n + (next ? 1 : -1));
    if (next) setLikeKey((k) => k + 1); // flourish only when liking, never on un-like
    pendingLike.current = true;
    try {
      await setCommentLike(c.id, myId, next);
    } catch {
      setLiked(!next);
      setCount((n) => n + (next ? -1 : 1));
    } finally {
      pendingLike.current = false;
    }
  };

  const saveEdit = async () => {
    setErr(null);
    try {
      validateComment(draft);
      setBusy(true);
      await editComment(c.id, draft);
      track('comment_edit', { market_id: marketId, comment_id: c.id, status: 'success' });
      setEditing(false);
      onChange();
    } catch (e) {
      track('comment_edit', { market_id: marketId, comment_id: c.id, status: 'failed' });
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`${styles.comment} ${isReply ? styles.replyComment : ''} ${mine ? styles.mine : ''}`}
    >
      <Avatar name={c.author.display_name ?? 'Member'} url={c.author.avatar_url} />
      <div className={styles.commentBody}>
        <div className={styles.commentHead}>
          <span className={styles.author}>{c.author.display_name ?? 'Member'}</span>
          {tier && <TrustBadge tier={tier} />}
          {myId && !mine && onFollowChange && (
            <FollowButton
              myId={myId}
              targetId={c.userId}
              following={!!following}
              onChange={(next) => onFollowChange(c.userId, next)}
            />
          )}
          {c.callPick && (
            <span className={styles.callTag} title="Posted as a note on their call">
              called {c.callPick === 'yes' ? 'Yes' : 'No'}
              {c.callConfidence != null && (
                <>
                  {' · '}
                  <span className="tnum">{c.callConfidence}%</span>
                </>
              )}
            </span>
          )}
          <span className={styles.time}>
            {formatRelative(c.createdAt)}
            {c.editedAt && <span className={styles.edited}> · edited</span>}
          </span>
        </div>

        {editing ? (
          <div className={styles.editBox}>
            <textarea
              // "Edit" swaps the body for this box — land focus in it (Composer idiom).
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={2000}
              aria-label="Edit comment"
            />
            {err && (
              <p className={styles.error} aria-live="polite">
                {err}
              </p>
            )}
            <div className={styles.editActions}>
              <button
                className={styles.linkBtn}
                onClick={() => {
                  setEditing(false);
                  setDraft(c.body);
                  setErr(null);
                }}
              >
                Cancel
              </button>
              <button
                className={styles.post}
                onClick={saveEdit}
                disabled={busy || draft.trim().length === 0}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.text}>{c.body}</p>
        )}

        {!editing && (
          <div className={styles.commentActions}>
            <button
              className={`${styles.like} ${liked ? styles.liked : ''}`}
              onClick={toggleLike}
              disabled={!myId}
              aria-pressed={liked}
              aria-label={`${liked ? 'Unlike' : 'Like'} — ${count} ${count === 1 ? 'like' : 'likes'}`}
            >
              {/* Same glyph + burst as the story's Like — one metaphor for one verb. */}
              <span className={styles.likeIcon}>
                <span key={likeKey} className={likeKey ? burst.pop : undefined} aria-hidden="true">
                  ♥
                </span>
                <Burst trigger={likeKey} tone="rose" />
              </span>{' '}
              {count > 0 ? count : ''}
            </button>

            {myId && onReply && (
              <button
                className={styles.linkBtn}
                onClick={() => {
                  track('comment_reply', { market_id: marketId, comment_id: c.id });
                  onReply(c.id);
                }}
              >
                Reply
              </button>
            )}

            {mine &&
              (confirmingDelete ? (
                /* Inline two-step confirm (the Report idiom) — no browser chrome,
                   no modal; the warning and the choice live where the tap happened. */
                <span className={styles.flagMenu} role="group" aria-label="Delete this comment?">
                  <span>Delete permanently?</span>
                  <button
                    // "Delete" swaps to this confirm — land focus here so keyboard
                    // users aren't left on an unmounted node.
                    autoFocus
                    className={styles.linkBtn}
                    disabled={busy}
                    onClick={async () => {
                      setErr(null);
                      setBusy(true);
                      try {
                        await deleteComment(c.id);
                        onChange();
                      } catch (e) {
                        setErr((e as Error).message);
                        setConfirmingDelete(false);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button className={styles.linkBtn} onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <>
                  <button className={styles.linkBtn} onClick={() => setEditing(true)}>
                    Edit
                  </button>
                  <button
                    className={styles.linkBtn}
                    disabled={busy}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete
                  </button>
                </>
              ))}

            {!mine &&
              myId &&
              (flagged ? (
                <span className={styles.flagged}>Flagged for review</span>
              ) : flagging ? (
                <span className={styles.flagMenu} role="group" aria-label="Why flag this?">
                  {REPORT_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.key}
                      // "Report" swaps its button for this group — land focus on the
                      // first option so keyboard users aren't left on an unmounted node.
                      autoFocus={i === 0}
                      className={styles.linkBtn}
                      onClick={() => {
                        track('comment_reported', { market_id: marketId, category: cat.key });
                        void flagComment(c.id, cat.key);
                        setFlagging(false);
                        setFlagged(true);
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                  <button className={styles.linkBtn} onClick={() => setFlagging(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button className={styles.linkBtn} onClick={() => setFlagging(true)}>
                  Report
                </button>
              ))}
          </div>
        )}
        {!editing && err && (
          <p className={styles.error} aria-live="polite">
            {err}
          </p>
        )}
      </div>
    </li>
  );
}

interface ThreadData {
  root: UiComment;
  replies: UiComment[];
}

/** Group a flat comment list into root threads + their replies (any nesting
 * depth collapses to one visual level under the thread's root ancestor). */
function buildThreads(comments: UiComment[], sort: Sort): ThreadData[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: UiComment): UiComment => {
    let cur = c;
    const seen = new Set<string>();
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId)!;
    }
    return cur;
  };

  const repliesByRoot = new Map<string, UiComment[]>();
  const roots: UiComment[] = [];
  for (const c of comments) {
    const isRoot = !c.parentId || !byId.has(c.parentId);
    if (isRoot) {
      roots.push(c);
    } else {
      const r = rootOf(c);
      const list = repliesByRoot.get(r.id);
      if (list) list.push(c);
      else repliesByRoot.set(r.id, [c]);
    }
  }

  const t = (s: string) => Date.parse(s);
  const cmp =
    sort === 'oldest'
      ? (a: UiComment, b: UiComment) => t(a.createdAt) - t(b.createdAt)
      : sort === 'top'
        ? (a: UiComment, b: UiComment) =>
            b.likeCount - a.likeCount || t(b.createdAt) - t(a.createdAt)
        : (a: UiComment, b: UiComment) => t(b.createdAt) - t(a.createdAt);

  return [...roots].sort(cmp).map((root) => ({
    root,
    replies: (repliesByRoot.get(root.id) ?? []).sort((a, b) => t(a.createdAt) - t(b.createdAt)),
  }));
}

export default function Discussion({
  marketId,
  favored,
}: {
  marketId: string;
  /** The market's PUBLIC favored outcome (as shown on every card) — used only to
   * make the cold-start empty state specific. NOT the reader Call distribution. */
  favored?: string;
}) {
  const { user, ready } = useAuth();
  const myId = user?.id ?? null;
  const [comments, setComments] = useState<UiComment[]>([]);
  const [likes, setLikes] = useState({ count: 0, likedByMe: false });
  const [storyLikeKey, setStoryLikeKey] = useState(0); // replays the story-like flourish

  const [tiers, setTiers] = useState<Map<string, Tier>>(new Map());
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('top');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  // Monotonic request id: load() is fired from the mount effect, the realtime debounce,
  // and several callbacks, so two can be inflight against different markets at once. Each
  // run stamps an id; only the latest may commit state — otherwise a slow older response
  // (or one for the previous market) clobbers the current thread, or set-state lands after
  // unmount. The mount-effect cleanup bumps the id to invalidate anything inflight.
  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const [cs, sl, ts, fl] = await Promise.all([
        fetchComments(marketId, myId),
        fetchStoryLikes(marketId, myId),
        fetchAuthorTiers(marketId),
        fetchMyFollowing(myId),
      ]);
      if (id !== reqId.current) return; // superseded by a newer load (or unmount)
      setComments(cs);
      setLikes(sl);
      setTiers(ts);
      setFollowing(fl);
      setError(null);
    } catch (e) {
      if (id !== reqId.current) return;
      setError((e as Error).message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [marketId, myId]);

  useEffect(() => {
    void load();
    return () => {
      // Intentionally bump the LIVE ref at cleanup (not a captured snapshot): we want to
      // invalidate whatever load is in flight right now. The exhaustive-deps "ref may have
      // changed" hint is a false positive — there's no DOM node here, just a counter.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      reqId.current++;
    };
  }, [load]);

  // Realtime, debounced: a burst of inserts/edits triggers ONE reload, not one
  // query per event per viewer (which would multiply load on the shared DB).
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const schedule = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void load(), 700);
    };
    const ch = supabase
      .channel(`comments:${marketId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `market_id=eq.${marketId}` },
        schedule,
      )
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      void supabase?.removeChannel(ch);
    };
  }, [marketId, load]);

  // Signed-out reader at the discussion: they get the sign-in panel, not the box.
  useEffect(() => {
    if (ready && !myId) track('comment_blocked_auth', { market_id: marketId });
  }, [ready, myId, marketId]);

  const threads = useMemo(() => buildThreads(comments, sort), [comments, sort]);

  // Keep every mention of the same author in sync when the viewer follows/unfollows.
  const onFollowChange = useCallback((authorId: string, next: boolean) => {
    setFollowing((prev) => {
      const n = new Set(prev);
      if (next) n.add(authorId);
      else n.delete(authorId);
      return n;
    });
  }, []);

  const toggleStoryLike = async () => {
    if (!myId) return;
    const next = !likes.likedByMe;
    track('like_toggled', { market_id: marketId, target: 'story', liked: next });
    setLikes((l) => ({ count: l.count + (next ? 1 : -1), likedByMe: next }));
    if (next) setStoryLikeKey((k) => k + 1); // flourish only when liking, never on un-like
    try {
      await setStoryLike(marketId, myId, next);
    } catch {
      setLikes((l) => ({ count: l.count + (next ? -1 : 1), likedByMe: !next }));
    }
  };

  return (
    <section className={styles.wrap} aria-label="Discussion">
      <div className={styles.bar}>
        <button
          className={`${styles.storyLike} ${likes.likedByMe ? styles.liked : ''}`}
          onClick={toggleStoryLike}
          disabled={!myId}
          aria-pressed={likes.likedByMe}
        >
          <span className={styles.likeIcon}>
            <span
              key={storyLikeKey}
              className={storyLikeKey ? burst.pop : undefined}
              aria-hidden="true"
            >
              ♥
            </span>
            <Burst trigger={storyLikeKey} tone="rose" />
          </span>{' '}
          Like{likes.count > 0 ? ` · ${likes.count}` : ''}
        </button>
        {likes.count > 0 && <Facepile marketId={marketId} count={likes.count} />}
        <span className={styles.count}>
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </span>
        {threads.length > 1 && (
          <div className={styles.sort} role="group" aria-label="Sort comments">
            {SORTS.map((s) => (
              <button
                key={s.key}
                className={`${styles.sortBtn} ${sort === s.key ? styles.sortOn : ''}`}
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {ready &&
        (myId ? <Composer marketId={marketId} userId={myId} onPosted={load} /> : <SignIn />)}

      {error && (
        <p className={styles.error}>
          Couldn’t load the discussion.{' '}
          <button type="button" className={styles.linkBtn} onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}
      {loading ? (
        <p className={styles.note}>Loading…</p>
      ) : threads.length === 0 ? (
        <p className={styles.note}>
          {favored
            ? `No takes yet — what’s your read on whether ${favored} happens, and what would change your mind?`
            : 'No takes yet — share your read and what would change your mind.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {threads.map(({ root, replies }) => {
            const replyOpen = replyTo === root.id || replies.some((r) => r.id === replyTo);
            return (
              <li key={root.id} className={styles.thread}>
                <ul className={styles.threadInner}>
                  <CommentItem
                    c={root}
                    marketId={marketId}
                    myId={myId}
                    tier={tiers.get(root.userId)}
                    following={following.has(root.userId)}
                    onFollowChange={onFollowChange}
                    onReply={setReplyTo}
                    onChange={load}
                  />
                  {replies.map((r) => (
                    <CommentItem
                      key={r.id}
                      c={r}
                      marketId={marketId}
                      myId={myId}
                      tier={tiers.get(r.userId)}
                      isReply
                      following={following.has(r.userId)}
                      onFollowChange={onFollowChange}
                      onReply={setReplyTo}
                      onChange={load}
                    />
                  ))}
                </ul>
                {myId && replyOpen && (
                  <div className={styles.replyWrap}>
                    <Composer
                      key={replyTo}
                      marketId={marketId}
                      userId={myId}
                      parentId={replyTo!}
                      placeholder="Write a reply…"
                      submitLabel="Reply"
                      autoFocus
                      onPosted={() => {
                        setReplyTo(null);
                        void load();
                      }}
                      onCancel={() => setReplyTo(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
