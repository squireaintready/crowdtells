import { useEffect, useState } from 'react';
import { fetchFacepile, type FacepileEntry } from '../../lib/calls';
import { avatarInitial } from '../../lib/format';
import styles from './Facepile.module.css';

const firstName = (n: string | null): string => (n ? n.split(' ')[0]! : 'Member');

/**
 * The "who liked this" avatar stack on a story — the industry-standard social
 * proof. Only readers who left STORY likes public (the default, one-tap opt-out)
 * appear; the server rpc never returns an opted-out liker or a raw user id, so the
 * secret ballot holds. Comment likes stay counts-only (handled elsewhere).
 */
export default function Facepile({ marketId, count }: { marketId: string; count: number }) {
  const [people, setPeople] = useState<FacepileEntry[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchFacepile(marketId, 5).then((p) => {
      if (alive) setPeople(p);
    });
    return () => {
      alive = false;
    };
    // Refetch when the like count changes (someone just liked/unliked).
  }, [marketId, count]);

  if (people.length === 0) return null;

  const named = people.slice(0, 2).map((p) => firstName(p.displayName));
  const others = Math.max(0, count - named.length);

  return (
    <div
      className={styles.wrap}
      role="group"
      aria-label={`${count} reader${count === 1 ? '' : 's'} liked this`}
    >
      <div className={styles.stack} aria-hidden="true">
        {people.map((p, i) =>
          p.avatarUrl ? (
            <img key={i} className={styles.av} src={p.avatarUrl} alt="" width={24} height={24} />
          ) : (
            <span key={i} className={`${styles.av} ${styles.fallback}`}>
              {avatarInitial(p.displayName, 'M')}
            </span>
          ),
        )}
      </div>
      <span className={styles.label}>
        {named.join(', ')}
        {others > 0 && ` +${others}`}
      </span>
    </div>
  );
}
