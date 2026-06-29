import { useState } from 'react';
import { followUser, unfollowUser } from '../../lib/socialGraph';
import { track } from '../../lib/posthog';
import styles from './Discussion.module.css';

/**
 * A compact follow/unfollow toggle shown beside another reader in the discussion.
 * Optimistic + fails soft (rolls back on error). Follow state is owned by the parent
 * (so every mention of the same author stays in sync); this only renders + writes.
 */
export function FollowButton({
  myId,
  targetId,
  following,
  onChange,
}: {
  myId: string;
  targetId: string;
  following: boolean;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !following;
    setBusy(true);
    onChange(next); // optimistic
    track('reader_followed', { followed: next });
    try {
      if (next) await followUser(myId, targetId);
      else await unfollowUser(myId, targetId);
    } catch {
      onChange(!next); // roll back to truth
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`${styles.follow} ${following ? styles.followingOn : ''}`}
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={following}
      title={following ? 'Unfollow this reader' : 'Follow to see how they call markets'}
    >
      {following ? 'Following' : '+ Follow'}
    </button>
  );
}
