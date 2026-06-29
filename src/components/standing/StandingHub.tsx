import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCountUp } from '../../hooks/useCountUp';
import {
  type Calibration as Cal,
  type CategoryRank,
  fetchMyBadges,
  fetchMyCalibration,
  fetchMyCategoryPercentile,
  fetchMyPercentile,
  fetchMyTrust,
  type MyPercentile,
  type MyTrust,
} from '../../lib/calls';
import {
  BADGES,
  badgeProgress,
  calibrationRating,
  calibrationVerdict,
  LEVELS,
  levelProgress,
  MIN_CALLS_FOR_VERDICT,
  nextTierHint,
  TIERS,
} from '../../lib/gamify';
import { track } from '../../lib/posthog';
import { Medallion } from './Medallion';
import { badgeTone, type MedallionTone } from './medallionTone';
import styles from './StandingHub.module.css';

// The badge catalog laid out as earnable TRACKS — a legible map of what's possible, not just what
// you already hold. Order within a track escalates. Mirrors the BADGES catalog in gamify.ts.
const TRACKS: { title: string; ids: string[] }[] = [
  { title: 'Accuracy', ids: ['called_it', 'calibrated', 'sharp', 'sharp_ii', 'sharp_iii'] },
  { title: 'Reading the room', ids: ['fact_checker', 'bridge_builder', 'corrected_the_record'] },
  {
    title: 'Showing up',
    ids: ['first_call', 'on_a_roll', 'devoted', 'stalwart', 'founding_reader'],
  },
  { title: 'Standing', ids: ['contributor', 'steward'] },
];

// Units for the still-to-earn progress readout (only the count-based badges in badgeProgress).
const PROG_UNIT: Record<string, string> = {
  calibrated: 'calls resolved',
  on_a_roll: 'day streak',
  devoted: 'day streak',
  stalwart: 'day streak',
  fact_checker: 'consensus reads',
  corrected_the_record: 'helpful note',
};

function tierTone(tier: MyTrust['tier']): MedallionTone {
  if (tier === 'steward') return 'gold';
  if (tier === 'contributor') return 'ink';
  return 'bronze';
}

/** One figure in the "by the numbers" grid. */
function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statVal} tnum`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </div>
  );
}

/** The private "how do I stack up?" card — the anti-leaderboard. Shows a rank band among callers
 * once there's enough of a track record on both sides; otherwise a graceful, honest unlock state. */
function PercentileCard({ pct }: { pct: MyPercentile }) {
  if (pct.ranked && pct.percentile != null) {
    const top = Math.max(1, 100 - pct.percentile);
    return (
      <section className={styles.pct} aria-label="Your standing among callers">
        <span className={styles.pctBig}>
          Top <b className="tnum">{top}%</b>
        </span>
        <div className={styles.pctMeta}>
          <span className={styles.pctLead}>among callers</span>
          <span className={styles.pctSub}>
            Sharper than <b className="tnum">{pct.percentile}%</b> of {pct.cohort} readers with a
            track record — by calibration over your <b className="tnum">{pct.nResolved}</b> resolved
            calls.
          </span>
        </div>
      </section>
    );
  }
  const toGo = Math.max(1, (pct.need ?? 8) - pct.nResolved);
  return (
    <section className={`${styles.pct} ${styles.pctLocked}`} aria-label="Your standing among callers">
      <span className={styles.pctBig} aria-hidden="true">
        —
      </span>
      <div className={styles.pctMeta}>
        <span className={styles.pctLead}>among callers</span>
        <span className={styles.pctSub}>
          {pct.reason === 'need_calls' ? (
            <>
              Resolve <b className="tnum">{toGo}</b> more {toGo === 1 ? 'call' : 'calls'} to see where
              you stand — privately, never on a public board.
            </>
          ) : (
            <>Your standing unlocks as more readers build a track record.</>
          )}
        </span>
      </div>
    </section>
  );
}

/**
 * The Standing hub — a reader's whole record on one page: level + progress, a PRIVATE percentile
 * among callers (the deliberate anti-leaderboard), the numbers behind it, the calibration curve,
 * every badge (earned + still-to-earn with how-to), the full level ladder, and a plain-language
 * "how this works". A standalone destination (mounted from main.tsx on `?standing`, like the
 * public profile + the static /s/ pages) so it stays off the feed's critical path and never
 * entangles with its router. Signed-in only; fails soft when the gamification rpcs aren't live.
 */
export function StandingHub() {
  const { user, ready } = useAuth();
  const [cal, setCal] = useState<Cal | null>(null);
  const [trust, setTrust] = useState<MyTrust | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [pct, setPct] = useState<MyPercentile | null>(null);
  const [cats, setCats] = useState<CategoryRank[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Personal + low-value to index — keep it out of search.
  useEffect(() => {
    document.title = 'Your Standing — Crowdtells';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoaded(true);
      return;
    }
    let alive = true;
    void Promise.all([
      fetchMyCalibration(),
      fetchMyTrust(),
      fetchMyBadges(user.id),
      fetchMyPercentile(),
      fetchMyCategoryPercentile(),
    ]).then(([c, t, b, p, cat]) => {
      if (!alive) return;
      setCal(c);
      setTrust(t);
      setBadges(b);
      setPct(p);
      setCats(cat);
      setLoaded(true);
      // Measure the surface for the standing funnel (own data only — no PII).
      track('standing_hub_viewed', {
        level: t?.level ?? 1,
        tier: t?.tier ?? 'reader',
        ranked: p?.ranked ?? false,
        badges: b.length,
        categories_ranked: cat.length,
      });
    });
    return () => {
      alive = false;
    };
  }, [ready, user]);

  // Computed before the early returns so the count-up hook is called unconditionally.
  const rating = cal?.meanBrier != null ? calibrationRating(cal.meanBrier) : null;
  const animatedRating = useCountUp(rating);

  const header = (
    <header className={styles.top}>
      <a href="/" className={styles.wordmark}>
        CROWDTELLS
      </a>
      <a href="/" className={styles.back}>
        ← All stories
      </a>
    </header>
  );

  if (!ready || !loaded) {
    return (
      <div className={styles.page}>
        {header}
        <main className={styles.main}>
          <p className={styles.note}>Loading…</p>
        </main>
      </div>
    );
  }

  // Signed out, or the gamification layer isn't live / has no record yet — a friendly prompt
  // rather than a blank or a crash.
  if (!user || !trust) {
    return (
      <div className={styles.page}>
        {header}
        <main className={styles.main}>
          <div className={styles.empty}>
            <h1 className={styles.emptyTitle}>Your Standing</h1>
            <p className={styles.note}>
              {user
                ? 'Read briefings and make a call on any open market to start your record — your level, calibration, and badges build from there.'
                : 'Sign in from the feed to see your level, calibration, badges, and where you stand among callers.'}
            </p>
            <a href="/" className={styles.cta}>
              Go to Crowdtells →
            </a>
          </div>
        </main>
      </div>
    );
  }

  const prog = levelProgress(trust.tier, trust.merit);
  const earned = new Set(badges);
  const n = cal?.nResolved ?? 0;
  const correct = cal?.correct ?? 0;
  const graded = n >= MIN_CALLS_FOR_VERDICT && cal?.meanBrier != null;
  const verdict = graded && cal?.meanBrier != null ? calibrationVerdict(cal.meanBrier, n) : null;
  const calledRightPct = n > 0 ? Math.round((correct / n) * 100) : null;
  const totalBadges = Object.keys(BADGES).length;

  return (
    <div className={styles.page}>
      {header}
      <main className={styles.main}>
        <section className={styles.hero}>
          <Medallion mark={String(prog.current.level)} tone={tierTone(trust.tier)} size="lg" />
          <div className={styles.heroMeta}>
            <span className={styles.kicker}>Your Standing</span>
            <h1 className={styles.levelTitle}>{prog.current.title}</h1>
            <p className={styles.levelSub}>
              Level <b className="tnum">{prog.current.level}</b> of {LEVELS.length} ·{' '}
              {TIERS[trust.tier].label}
              {trust.currentStreak > 0 && (
                <>
                  {' '}
                  · <span aria-hidden="true">▲</span> {trust.currentStreak}-day streak
                </>
              )}
            </p>

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
                      <b className="tnum">{prog.meritToGo}</b> merit to <b>{prog.next.title}</b>
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
        </section>

        {pct && <PercentileCard pct={pct} />}

        {cats.length > 0 && (
          <div className={styles.cats} aria-label="Where you rank by category">
            {cats.slice(0, 3).map((c) => (
              <span key={c.category} className={styles.catChip}>
                <b className="tnum">Top {Math.max(1, 100 - c.percentile)}%</b>
                <span className={styles.catName}>{c.category}</span>
              </span>
            ))}
          </div>
        )}

        <section className={styles.section}>
          <h2 className={styles.h2}>By the numbers</h2>
          <div className={styles.stats}>
            <Stat label="Calls made" value={trust.callsMade} />
            <Stat label="Resolved" value={trust.resolvedCalls} />
            {calledRightPct != null && <Stat label="Called right" value={`${calledRightPct}%`} />}
            {graded && rating != null && (
              <Stat label="Calibration" value={animatedRating} hint={verdict ?? undefined} />
            )}
            <Stat label="Best streak" value={`${trust.longestStreak}d`} />
            <Stat label="Briefings read" value={trust.briefingsRead} />
            <Stat label="Comments" value={trust.commentsPosted} />
            {trust.claimsVoted > 0 && <Stat label="Claims voted" value={trust.claimsVoted} />}
            {trust.helpfulNotes > 0 && <Stat label="Helpful notes" value={trust.helpfulNotes} />}
          </div>
        </section>

        {graded && cal && cal.buckets.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.h2}>Your calibration</h2>
            <p className={styles.curveLabel}>When you said… it happened</p>
            <div className={styles.curve} aria-label="Your hit rate at each confidence level">
              {cal.buckets.map((b) => (
                <div key={b.conf} className={styles.crow}>
                  <span className={`${styles.conf} tnum`}>{b.conf}%</span>
                  <div className={styles.cbar}>
                    <span
                      className={styles.cfill}
                      style={{ width: `${Math.round(b.hitRate * 100)}%` }}
                    />
                    <span
                      className={styles.ctick}
                      style={{ left: `${b.conf}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <span className={`${styles.hit} tnum`}>
                    {Math.round(b.hitRate * 100)}% <span className={styles.rowN}>({b.n})</span>
                  </span>
                </div>
              ))}
            </div>
            <p className={styles.curveFoot}>The mark is perfect calibration.</p>
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.h2}>
            Badges{' '}
            <span className={styles.count}>
              <b className="tnum">{badges.length}</b>/{totalBadges}
            </span>
          </h2>
          {TRACKS.map((track) => (
            <div key={track.title} className={styles.track}>
              <h3 className={styles.trackTitle}>{track.title}</h3>
              <div className={styles.gallery}>
                {track.ids.map((id) => {
                  const b = BADGES[id];
                  if (!b) return null;
                  const has = earned.has(id);
                  const prog = has ? null : badgeProgress(id, trust);
                  const have = prog ? Math.min(prog.have, prog.need) : 0;
                  return (
                    <span
                      key={id}
                      className={`${styles.badgeCell} ${has ? '' : styles.lockedCell}`}
                    >
                      <Medallion mark={b.mark} tone={badgeTone(id)} size="md" earned={has} />
                      <span className={styles.badgeText}>
                        <span className={styles.badgeCap}>{b.label}</span>
                        {has ? (
                          <span className={styles.badgeHow}>Earned</span>
                        ) : prog ? (
                          <>
                            <span
                              className={styles.badgeBar}
                              role="img"
                              aria-label={`${have} of ${prog.need} ${PROG_UNIT[id] ?? ''}`}
                            >
                              <span
                                className={styles.badgeBarFill}
                                style={{ width: `${Math.round((have / prog.need) * 100)}%` }}
                              />
                            </span>
                            <span className={styles.badgeHow}>
                              <b className="tnum">{have}</b> / <b className="tnum">{prog.need}</b>{' '}
                              {PROG_UNIT[id]}
                            </span>
                          </>
                        ) : (
                          <span className={styles.badgeHow}>{b.blurb}</span>
                        )}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>The ladder</h2>
          <ol className={styles.ladder}>
            {LEVELS.map((L) => {
              const here = L.level === prog.current.level;
              const reached = L.level <= prog.current.level;
              return (
                <li
                  key={L.level}
                  className={`${styles.rung} ${here ? styles.rungHere : ''} ${
                    reached ? styles.rungReached : ''
                  }`}
                >
                  <span className={`${styles.rungN} tnum`}>{L.level}</span>
                  <div className={styles.rungMeta}>
                    <span className={styles.rungTitle}>
                      {L.title}
                      {here && <span className={styles.youAre}>you’re here</span>}
                    </span>
                    {L.unlock && <span className={styles.rungUnlock}>{L.unlock}</span>}
                  </div>
                  <span className={`${styles.rungMerit} tnum`}>
                    {L.meritFloor === 0 ? '—' : L.meritFloor}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>How Standing works</h2>
          <p className={styles.prose}>
            Standing rewards being <b>right over time</b> and <b>helpful across viewpoints</b> — not
            volume. Reading and commenting count, but they’re capped, so you can’t climb by sheer
            activity. Your <b>tier</b> sets which band of the ladder you’re in; <b>merit</b> —
            accuracy, the edge of your calls over the crowd, and notes that bridge viewpoints — moves
            you within it. Levels are un-farmable past your tier.
          </p>
          <p className={styles.prose}>
            There’s <b>no public leaderboard</b>, by design. Your percentile is private — enough to
            see how you stack up, without turning a newsroom into a casino.
          </p>
        </section>

        <p className={styles.foot}>
          A living record of what the crowd believes — and how well you read it.
        </p>
      </main>
    </div>
  );
}
