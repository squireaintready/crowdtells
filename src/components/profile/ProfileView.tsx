import { useEffect, useState } from 'react';
import { fetchPublicProfile, type PublicProfile } from '../../lib/calls';
import {
  BADGES,
  calibrationRating,
  calibrationVerdict,
  LEVELS,
  MIN_CALLS_FOR_VERDICT,
  TIERS,
} from '../../lib/gamify';
import { Medallion } from '../standing/Medallion';
import { badgeTone } from '../standing/medallionTone';
import styles from './ProfileView.module.css';

/**
 * The opt-in public profile page — a reader's shareable standing. A standalone destination
 * (mounted from main.tsx on `?u=`, like the static /s/ pages), so it never entangles with the
 * feed's router. Shows level + title, tier, streak, badges, and — only if the reader also
 * shares their Calls — their calibration record. There is no leaderboard; everything here is
 * served by the public_profile rpc, which returns nothing unless the owner opted in.
 */
export function ProfileView({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchPublicProfile(userId).then((p) => {
      if (!alive) return;
      setProfile(p);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Opt-in + low-value to index — keep it out of search, and title it once we know who it is.
  useEffect(() => {
    const name = profile?.displayName;
    document.title = name ? `${name} — Crowdtells` : 'Crowdtells reader';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, [profile?.displayName]);

  const cal = profile?.calibration ?? null;
  const graded = !!cal && cal.nResolved >= MIN_CALLS_FOR_VERDICT && cal.meanBrier != null;
  const rating = cal?.meanBrier != null ? calibrationRating(cal.meanBrier) : null;
  const level = profile
    ? LEVELS[Math.min(Math.max(profile.level, 1), LEVELS.length) - 1]
    : null;
  const memberYear = profile?.memberSince ? new Date(profile.memberSince).getFullYear() : null;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <a href="/" className={styles.wordmark}>
          CROWDTELLS
        </a>
        <a href="/" className={styles.back}>
          ← All stories
        </a>
      </header>

      <main className={styles.main}>
        {!loaded ? (
          <p className={styles.note}>Loading…</p>
        ) : !profile ? (
          <div className={styles.empty}>
            <h1 className={styles.emptyTitle}>This profile is private</h1>
            <p className={styles.note}>
              This reader hasn’t made their record public — or the link is out of date.
            </p>
            <a href="/" className={styles.cta}>
              Go to Crowdtells →
            </a>
          </div>
        ) : (
          <article className={styles.card}>
            <div className={styles.head}>
              {profile.avatarUrl ? (
                <img
                  className={styles.avatar}
                  src={profile.avatarUrl}
                  alt=""
                  width={64}
                  height={64}
                />
              ) : (
                <span className={styles.avatarFallback} aria-hidden="true">
                  {(profile.displayName ?? 'C').slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className={styles.headMeta}>
                <h1 className={styles.name}>{profile.displayName ?? 'A Crowdtells reader'}</h1>
                <p className={styles.sub}>
                  {TIERS[profile.tier].label}
                  {memberYear && <> · reading since {memberYear}</>}
                </p>
              </div>
            </div>

            <div className={styles.levelRow}>
              <span className={`${styles.levelN} tnum`}>{profile.level}</span>
              <div className={styles.levelMeta}>
                <span className={styles.levelTitle}>{level?.title ?? `Level ${profile.level}`}</span>
                <span className={styles.levelOf}>
                  Level {profile.level} of {LEVELS.length}
                </span>
              </div>
              {profile.currentStreak > 0 && (
                <span className={styles.streak}>▲ {profile.currentStreak}-day streak</span>
              )}
            </div>

            {cal && (
              <div className={styles.cal}>
                {graded && rating != null ? (
                  <>
                    <span className={`${styles.rating} tnum`}>{rating}</span>
                    <div className={styles.calMeta}>
                      <span className={styles.verdict}>
                        {calibrationVerdict(cal.meanBrier ?? 0.25, cal.nResolved)}
                      </span>
                      <span className={styles.calSub}>
                        <b className="tnum">{cal.nResolved}</b> calls resolved ·{' '}
                        <b className="tnum">{cal.correct}</b> called right
                      </span>
                    </div>
                  </>
                ) : (
                  <span className={styles.calSub}>
                    Building a forecasting record — <b className="tnum">{cal.nResolved}</b> calls
                    resolved.
                  </span>
                )}
              </div>
            )}

            {profile.badges.length > 0 && (
              <div className={styles.badges} aria-label="Badges">
                {profile.badges.map((id) => {
                  const b = BADGES[id];
                  if (!b) return null;
                  return (
                    <span key={id} className={styles.badgeCell} title={b.blurb}>
                      <Medallion mark={b.mark} tone={badgeTone(id)} size="md" />
                      <span className={styles.badgeCap}>{b.label}</span>
                    </span>
                  );
                })}
              </div>
            )}

            <p className={styles.foot}>
              A reader’s record on Crowdtells — a living record of what the crowd believes.
            </p>
          </article>
        )}
      </main>
    </div>
  );
}
