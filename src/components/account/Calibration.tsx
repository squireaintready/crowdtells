import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCountUp } from '../../hooks/useCountUp';
import {
  type Calibration as Cal,
  fetchMyBadges,
  fetchMyCalibration,
  fetchMyTrust,
  type MyTrust,
} from '../../lib/calls';
import {
  BADGES,
  calibrationRating,
  calibrationVerdict,
  LEVELS,
  levelProgress,
  MIN_CALLS_FOR_VERDICT,
  nextTierHint,
} from '../../lib/gamify';
import { track } from '../../lib/posthog';
import { Medallion } from '../standing/Medallion';
import { badgeTone } from '../standing/medallionTone';
import styles from './Calibration.module.css';

// The earnable goals to surface as still-to-earn medallions when not yet held — the achievable
// recognition badges (the tier badges are already conveyed by the level ladder above).
const GOAL_BADGES = [
  'first_call',
  'on_a_roll',
  'called_it',
  'fact_checker',
  'calibrated',
  'sharp',
  'corrected_the_record',
  'bridge_builder',
] as const;

/**
 * The reader's STANDING inside the account dialog: their level on the ladder (with an animated
 * progress bar to the next rung and what it unlocks), their calibration record (rigorous Brier
 * underneath, a count-up rating on top), claim-verification activity, and badges earned + still to
 * earn as struck medallions. Personal-best framed — never a leaderboard. The earn CELEBRATION is
 * global now (the standing toast), so this panel just shows the current record. Fails soft.
 */
export function Calibration() {
  const { user } = useAuth();
  const [cal, setCal] = useState<Cal | null>(null);
  const [trust, setTrust] = useState<MyTrust | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([fetchMyCalibration(), fetchMyTrust(), fetchMyBadges(user?.id ?? null)]).then(
      ([c, t, b]) => {
        if (!alive) return;
        setCal(c);
        setTrust(t);
        setBadges(b);
        setLoaded(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Computed before the early returns so the count-up hook is called unconditionally.
  const meanBrier = cal?.meanBrier ?? null;
  const rating = meanBrier != null ? calibrationRating(meanBrier) : null;
  const animatedRating = useCountUp(rating);

  // Stay invisible until loaded (matches the other account sections — no lone loader flash),
  // and when gamification isn't live yet (rpcs return null).
  if (!loaded) return null;
  if (!cal && !trust) return null;

  const n = cal?.nResolved ?? 0;
  const correct = cal?.correct ?? 0;
  const graded = n >= MIN_CALLS_FOR_VERDICT && meanBrier != null;
  const verdict = calibrationVerdict(meanBrier ?? 0.25, n);
  const ourRating = cal?.platformOurBrier != null ? calibrationRating(cal.platformOurBrier) : null;

  const prog = trust ? levelProgress(trust.tier, trust.merit) : null;
  const earned = new Set(badges);
  const lockedGoals = GOAL_BADGES.filter((b) => !earned.has(b)).slice(0, 4);

  return (
    <section className={styles.wrap} aria-label="Your standing">
      <h3 className={styles.title}>
        <span className={styles.kicker}>Your Standing</span>
        <a
          href="?standing"
          className={styles.fullLink}
          onClick={() => track('standing_hub_opened', { from: 'settings' })}
        >
          See full record →
        </a>
      </h3>

      {prog && trust && (
        <div className={styles.standing}>
          <div className={styles.levelHead}>
            <span className={styles.levelMark}>
              <span className={`${styles.levelN} tnum`}>{prog.current.level}</span>
              <span className={styles.levelOf}>/ {LEVELS.length}</span>
            </span>
            <div className={styles.levelMeta}>
              <span className={styles.levelTitle}>{prog.current.title}</span>
              {trust.currentStreak > 0 && (
                <span className={styles.streak}>
                  <span aria-hidden="true">▲</span> {trust.currentStreak}-day reading streak
                  {trust.longestStreak > trust.currentStreak && (
                    <span className={styles.best}> · best {trust.longestStreak}</span>
                  )}
                </span>
              )}
            </div>
          </div>

          {prog.next ? (
            <>
              <div
                className={styles.progress}
                role="img"
                aria-label={`${Math.round(prog.progress * 100)}% toward ${prog.next.title}`}
              >
                <span
                  className={styles.progressFill}
                  style={{ width: `${Math.max(4, Math.round(prog.progress * 100))}%` }}
                />
              </div>
              <span className={styles.toNext}>
                {prog.gatedByTier ? (
                  (nextTierHint(trust.tier) ?? `Reach ${prog.next.title}`)
                ) : (
                  <>
                    <b className="tnum">{prog.meritToGo}</b> to <b>{prog.next.title}</b>
                  </>
                )}
              </span>
            </>
          ) : (
            <span className={styles.toNext}>You’ve reached the top of the ladder.</span>
          )}

          {prog.current.unlock && (
            <p className={styles.unlock}>
              <span className={styles.unlockKey}>Unlocked</span> {prog.current.unlock}
            </p>
          )}
        </div>
      )}

      {graded ? (
        <div className={styles.desk}>
          <div className={styles.figure}>
            <span className={`${styles.rating} tnum`}>{animatedRating}</span>
            <div className={styles.figureMeta}>
              <span className={styles.verdict}>{verdict}</span>
              <span className={styles.sub}>
                <b className="tnum">{n}</b> calls resolved · <b className="tnum">{correct}</b>{' '}
                called right
                {ourRating != null && (
                  <>
                    {' '}
                    · our reads <b className="tnum">{ourRating}</b>
                  </>
                )}
              </span>
            </div>
          </div>

          {cal && cal.buckets.length > 0 && (
            <div className={styles.curve} aria-label="Calibration curve">
              <span className={styles.curveLabel}>When you said… it happened</span>
              {cal.buckets.map((b) => (
                <div key={b.conf} className={styles.row}>
                  <span className={`${styles.conf} tnum`}>{b.conf}%</span>
                  <div className={styles.bar}>
                    <span
                      className={styles.fill}
                      style={{ width: `${Math.round(b.hitRate * 100)}%` }}
                    />
                    <span
                      className={styles.tick}
                      style={{ left: `${b.conf}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <span className={`${styles.hit} tnum`}>
                    {Math.round(b.hitRate * 100)}% <span className={styles.rowN}>({b.n})</span>
                  </span>
                </div>
              ))}
              <span className={styles.curveFoot}>The mark is perfect calibration.</span>
            </div>
          )}
        </div>
      ) : (
        <p className={styles.building}>
          Building your record — <b className="tnum">{n}</b>/{MIN_CALLS_FOR_VERDICT} calls resolved.
          Make a call on any open market; it scores when the market settles.
        </p>
      )}

      {trust && trust.claimsVoted > 0 && (
        <p className={styles.verify}>
          Weighed in on <b className="tnum">{trust.claimsVoted}</b>{' '}
          {trust.claimsVoted === 1 ? 'claim' : 'claims'}
          {trust.alignedVotes > 0 && (
            <>
              {' '}
              · <b className="tnum">{trust.alignedVotes}</b> landed with the consensus
            </>
          )}
        </p>
      )}

      {(badges.length > 0 || lockedGoals.length > 0) && (
        <div className={styles.record}>
          {badges.length > 0 && (
            <div className={styles.medalGrid} aria-label="Badges earned">
              {badges.map((id) => {
                const b = BADGES[id];
                if (!b) return null;
                return (
                  <span key={id} className={styles.medalCell} title={b.blurb}>
                    <Medallion mark={b.mark} tone={badgeTone(id)} size="md" />
                    <span className={styles.medalCap}>{b.label}</span>
                  </span>
                );
              })}
            </div>
          )}
          {lockedGoals.length > 0 && (
            <div className={styles.medalGrid} aria-label="Badges to earn">
              {lockedGoals.map((id) => {
                const b = BADGES[id];
                if (!b) return null;
                return (
                  <span
                    key={id}
                    className={`${styles.medalCell} ${styles.lockedCell}`}
                    title={`To earn: ${b.blurb}`}
                  >
                    <Medallion mark={b.mark} tone={badgeTone(id)} size="md" earned={false} />
                    <span className={styles.medalCap}>{b.label}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
