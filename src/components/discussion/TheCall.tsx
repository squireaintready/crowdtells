import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { Market } from '../../lib/types';
import { useAuth } from '../../hooks/useAuth';
import { avatarInitial, formatPct } from '../../lib/format';
import {
  castCall,
  type CallDistribution,
  fetchCallDistribution,
  fetchMyCall,
  fetchMyScore,
  hideCall,
  type MyCall,
  type MyScore,
} from '../../lib/calls';
import { CONFIDENCE_STEPS, type Pick } from '../../lib/gamify';
import { postComment } from '../../lib/comments';
import { track } from '../../lib/posthog';
import { fetchCallSeries, fetchFollowedCalls } from '../../lib/socialGraph';
import {
  type CallSeriesDay,
  type FollowedCall,
  seriesTotal,
  summarizeFollowedCalls,
  voteShareSeries,
} from '../../lib/socialVotes';
import { TrendChart } from '../TrendChart';
import { beliefSeries } from '../../lib/trend';
import { Burst } from '../Burst';
import burst from '../Burst.module.css';
import styles from './TheCall.module.css';

// Only draw the "calls over time" trend once enough reads have accrued to be
// meaningful (and at least two distinct days to make a line).
const VOTE_TREND_MIN = 8;

const CONF_WORD: Record<number, string> = {
  55: 'Lean',
  65: 'Likely',
  75: 'Confident',
  85: 'Strong',
  95: 'Near-certain',
};

/**
 * The Call — a reader's own private prediction on a market, scored properly (Brier)
 * when it resolves. Anti-casino by design: framed as "what's your read?", never a
 * bet; the crowd's split is revealed only AFTER you commit (no herding); confidence
 * is the honest 55–95 ladder. Lives in the lazy discussion chunk. Fails soft — if
 * the gamification schema isn't applied yet, the rpcs return empty and it renders
 * the prompt without crashing.
 */
export default function TheCall({ market }: { market: Market }) {
  const { user, ready } = useAuth();
  const userId = user?.id ?? null;
  const resolved = market.status === 'resolved' && market.resolvedOutcome != null;
  const open = !resolved && !!market.endDate && Date.parse(market.endDate) > Date.now();

  const [myCall, setMyCall] = useState<MyCall | null>(null);
  const [dist, setDist] = useState<CallDistribution>({ n: 0, yesTarget: 0, noTarget: 0 });
  const [score, setScore] = useState<MyScore | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Social: how readers' calls trended, and how the people you follow called it.
  // Both are revealed only AFTER you commit your own call (no herding), mirroring
  // the crowd-distribution reveal.
  const [series, setSeries] = useState<CallSeriesDay[]>([]);
  const [followed, setFollowed] = useState<FollowedCall[]>([]);

  const [pick, setPick] = useState<Pick | null>(null);
  // Confidence defaults to the middle of the ladder; the slider is always set.
  const [conf, setConf] = useState<number>(75);
  const [busy, setBusy] = useState(false);
  // Bumped once when a call is committed, to fire the one-shot lock-in flourish.
  const [lockKey, setLockKey] = useState(0);
  // Save/post failure message, shown in an ALWAYS-MOUNTED aria-live region at the
  // section level (a failed castCall flips the render branch mid-flight, so a region
  // inside a branch would remount with the text already set and never announce).
  const [error, setError] = useState<string | null>(null);

  // Vote-funnel analytics (PostHog): impression on load, "started" once on first touch
  // of the form, completion on lock-in, and a blocked-on-auth signal for signed-out
  // readers — so we can see who weighs in, who bounces, and why.
  const startedRef = useRef(false);
  const markStarted = (intent: 'pick' | 'confidence') => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('call_started', { market_id: market.id, intent });
  };

  // Optional one-line note the reader can post to the thread about their call.
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteDone, setNoteDone] = useState(false);

  // Primary load — guarded against unmount AND out-of-order resolution: when the market
  // or sign-in state changes, a new fetch supersedes the old one, and the stale response
  // must not clobber state (that's the "wrong call/distribution flashed" class of glitch).
  useEffect(() => {
    let cancelled = false;
    startedRef.current = false; // a new market/sign-in state → a fresh "started" window
    void Promise.all([
      fetchMyCall(market.id, userId),
      fetchCallDistribution(market.id),
      resolved ? fetchMyScore(market.id, userId) : Promise.resolve(null),
    ]).then(([c, d, s]) => {
      if (cancelled) return;
      setMyCall(c);
      setDist(d);
      setScore(s);
      if (c) {
        setPick(c.pick);
        setConf(c.confidence);
      }
      setLoaded(true);
      // Impression with this market's accurate state (c = our own call, if any).
      if (!resolved) {
        track('call_widget_viewed', {
          market_id: market.id,
          state: !userId ? 'signed_out' : c ? 'locked' : 'fresh',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [market.id, userId, resolved]);

  // Signed-out reader on a callable market: they see the prompt but can't weigh in.
  useEffect(() => {
    if (ready && !userId && open) {
      track('call_blocked_auth', { market_id: market.id });
    }
  }, [ready, userId, open, market.id]);

  // The over-time trend + how-the-people-you-follow-called views are revealed only
  // AFTER you commit (no herding). Gate the FETCH on that too — not just the render —
  // so the private data never even reaches the browser before you've called. Also
  // skips the round-trips entirely on resolved/closed markets, where they're unused.
  const hasCall = !!myCall;
  useEffect(() => {
    if (!open || !hasCall) return;
    let cancelled = false;
    void Promise.all([
      fetchCallSeries(market.id),
      userId ? fetchFollowedCalls(market.id) : Promise.resolve([]),
    ]).then(([ser, fol]) => {
      if (cancelled) return;
      setSeries(ser);
      setFollowed(fol);
    });
    return () => {
      cancelled = true;
    };
  }, [open, hasCall, market.id, userId]);

  // Nothing to show on a settled market the reader never called — stay out of the way.
  if (resolved && loaded && !myCall && !score) return null;
  // Not a callable market (active but already past its end date, or unbounded).
  if (!open && !resolved) return null;

  // The target is frozen at first call so a later lead-flip can't move the goalposts.
  const target = myCall?.targetOutcome ?? market.favored;

  const submit = async () => {
    if (!userId || !pick) return;
    setBusy(true);
    setError(null);
    const snapshot = myCall;
    setMyCall({ targetOutcome: target, pick, confidence: conf, hidden: false });
    try {
      await castCall(market.id, userId, target, pick, conf, market.category);
      track('call_submitted', { market_id: market.id, pick, confidence: conf });
      setLockKey((k) => k + 1); // celebrate only a confirmed lock-in
      void fetchCallDistribution(market.id).then(setDist);
    } catch {
      setMyCall(snapshot); // roll back to server truth on failure
      setError('Couldn’t save your call — try again.');
    } finally {
      setBusy(false);
    }
  };

  // Hide/show is a private view toggle — it never retracts the call (which still
  // counts toward scoring + the distribution); the DB guard blocks any real change.
  const toggleHidden = async () => {
    if (!userId || !myCall) return;
    const next = !myCall.hidden;
    const snapshot = myCall;
    setMyCall({ ...myCall, hidden: next });
    try {
      await hideCall(market.id, userId, next);
    } catch {
      setMyCall(snapshot);
    }
  };

  // Post the optional rationale to this market's discussion, tagged with the
  // reader's own (already-committed) call. Fails soft inside postComment if the
  // call_* columns aren't applied yet — it falls back to a plain comment.
  const postNote = async () => {
    if (!userId || !myCall || note.trim().length === 0) return;
    setNoteBusy(true);
    setError(null);
    try {
      await postComment(market.id, userId, note, null, {
        callPick: myCall.pick,
        callConfidence: myCall.confidence,
      });
      setNote('');
      setNoteDone(true);
    } catch {
      // Keep the draft so the reader can retry; no destructive UI on failure.
      setError('Couldn’t post your note — try again.');
    } finally {
      setNoteBusy(false);
    }
  };

  const pctYes = dist.n > 0 ? Math.round((dist.yesTarget / dist.n) * 100) : 0;
  // Social derivations (pure): the cumulative yes-share line + the followed-calls tally.
  const voteSeries = voteShareSeries(series);
  const showVoteTrend = voteSeries.length >= 2 && seriesTotal(series) >= VOTE_TREND_MIN;
  const fsum = summarizeFollowedCalls(followed);
  const confIdx = Math.max(0, CONFIDENCE_STEPS.indexOf(conf as (typeof CONFIDENCE_STEPS)[number]));
  const fillPct = `${(confIdx / (CONFIDENCE_STEPS.length - 1)) * 100}%`;

  // ─── RESOLVED: show how the reader's call scored ───
  if (resolved) {
    const right = score ? score.prob >= 0.5 === score.won : false;
    return (
      <section className={styles.wrap} aria-label="Your call">
        <span className={styles.kicker}>Your call</span>
        {score ? (
          <>
            <p className={`${styles.verdict} ${right ? styles.hit : styles.miss}`}>
              <span className={styles.mark} aria-hidden="true">
                {right ? '✓' : '✗'}
              </span>
              {right ? 'You called it' : 'You read it the other way'}
            </p>
            <p className={styles.result}>
              You put <b className="tnum">{Math.round(score.prob * 100)}%</b> on <b>{target}</b> —
              which {score.won ? 'happened' : 'didn’t'}. Resolved <b>{market.resolvedOutcome}</b>.
            </p>
            {score.peer < 0 && (
              <p className={styles.peer}>Sharper than the median reader on this one.</p>
            )}
          </>
        ) : (
          <p className={styles.result}>
            Resolved <b>{market.resolvedOutcome}</b> — scoring your call on the next pass.
          </p>
        )}
      </section>
    );
  }

  // ─── OPEN: prompt / form / locked-in summary ───
  const showForm = !myCall;
  return (
    <section className={styles.wrap} aria-label="Make your call">
      <span className={styles.kicker}>What’s your read?</span>
      <p className={styles.q}>
        {market.hook?.trim() ? (
          market.hook
        ) : (
          <>
            Will <b>{target}</b> be the outcome?
          </>
        )}
      </p>
      <p className={styles.market}>
        The crowd’s pick: <b>{target}</b> at{' '}
        <span className="tnum">{formatPct(market.oddsPct)}</span> — now you weigh in.
      </p>

      {!ready ? null : !userId ? (
        <p className={styles.signin}>Sign in below to make your call and track how you do.</p>
      ) : showForm ? (
        <>
          <div className={styles.picks} role="group" aria-label="Will it happen?">
            <button
              type="button"
              className={`${styles.pick} ${pick === 'yes' ? styles.picked : ''}`}
              aria-pressed={pick === 'yes'}
              onClick={() => {
                setPick('yes');
                setError(null);
                markStarted('pick');
              }}
            >
              Yes
              <span className={styles.pickSub}>{target} happens</span>
            </button>
            <button
              type="button"
              className={`${styles.pick} ${pick === 'no' ? styles.picked : ''}`}
              aria-pressed={pick === 'no'}
              onClick={() => {
                setPick('no');
                setError(null);
                markStarted('pick');
              }}
            >
              No
              <span className={styles.pickSub}>it won’t</span>
            </button>
          </div>

          <span className={styles.confLabel} id="conf-label">
            How sure?
          </span>
          <div className={styles.slider}>
            <div className={styles.sliderHead}>
              <span className={`${styles.confValue} tnum`}>{conf}%</span>
              <span className={styles.confWordBig}>{CONF_WORD[conf]}</span>
            </div>
            <input
              type="range"
              className={styles.range}
              min={0}
              max={CONFIDENCE_STEPS.length - 1}
              step={1}
              value={confIdx}
              onChange={(e) => {
                setConf(CONFIDENCE_STEPS[Number(e.target.value)]!);
                setError(null);
                markStarted('confidence');
              }}
              style={{ '--fill': fillPct } as CSSProperties}
              aria-labelledby="conf-label"
              aria-valuetext={`${conf}% — ${CONF_WORD[conf]}`}
            />
            <div className={styles.ticks} aria-hidden="true">
              {CONFIDENCE_STEPS.map((c) => (
                <span key={c} className={`${styles.tick} ${conf === c ? styles.tickOn : ''}`}>
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.lock}
              onClick={() => void submit()}
              disabled={busy || !pick}
            >
              {busy ? 'Saving…' : 'Lock in my call'}
            </button>
          </div>
          <p className={styles.fine}>
            Private, and <b>final</b> once you lock it in — you can’t change or retract a call
            (that’s what keeps your track record honest). You can hide it from view later; it still
            counts.
          </p>
        </>
      ) : myCall.hidden ? (
        <p className={styles.lockedHidden}>
          Your read is locked and hidden.{' '}
          <button type="button" className={styles.linkBtn} onClick={() => void toggleHidden()}>
            Show
          </button>
        </p>
      ) : (
        <>
          <p className={styles.locked}>
            <span className={styles.lockedMarkWrap}>
              <span
                key={lockKey}
                className={`${styles.lockedMark} ${lockKey ? burst.pop : ''}`}
                aria-hidden="true"
              >
                ◆
              </span>
              <Burst trigger={lockKey} tone="gold" />
            </span>
            Your read is in: <b>{myCall.pick === 'yes' ? target : `not ${target}`}</b>,{' '}
            <span className="tnum">{myCall.confidence}%</span> — locked.
          </p>
          {dist.n > 0 && (
            <p className={styles.dist}>
              <span className="tnum">{pctYes}%</span> of {dist.n} reader{dist.n === 1 ? '' : 's'} so
              far say <b>{target}</b>.
            </p>
          )}

          {/* How the reader calls have accrued over time (counts only) — drawn with the
              same time chart as crowd belief, once enough calls exist to be meaningful. */}
          {showVoteTrend && (
            <div className={styles.voteTrend}>
              <span className={styles.blockLabel}>The two crowds over time</span>
              <TrendChart
                history={voteSeries}
                favored={target}
                seriesLabel="Readers"
                overlay={beliefSeries(market.oddsDaily, market.oddsHistory)}
                overlayLabel="Market"
              />
            </div>
          )}

          {/* People you follow who opted to share — revealed after you’ve called. */}
          {followed.length > 0 && (
            <div className={styles.friends}>
              <span className={styles.blockLabel}>People you follow</span>
              <p className={styles.friendsSummary}>
                <b>
                  {fsum.yes} of {fsum.n}
                </b>{' '}
                called <b>{target}</b> · avg confidence{' '}
                <span className="tnum">{fsum.avgConfidence}%</span>
              </p>
              <ul className={styles.friendChips}>
                {followed.slice(0, 6).map((c) => (
                  <li
                    key={`${c.displayName ?? 'Reader'}-${c.pick}-${c.confidence}-${c.targetOutcome}`}
                    className={styles.friendChip}
                  >
                    <span className={styles.friendAvatar} aria-hidden="true">
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        avatarInitial(c.displayName, 'R')
                      )}
                    </span>
                    <span className={styles.friendName}>{c.displayName ?? 'Reader'}</span>
                    <span className="tnum">{c.confidence}%</span>
                    <span className={c.pick === 'yes' ? styles.fYes : styles.fNo}>
                      {c.pick === 'yes' ? 'Yes' : 'No'}
                    </span>
                  </li>
                ))}
                {followed.length > 6 && (
                  <li className={styles.friendMore}>+{followed.length - 6}</li>
                )}
              </ul>
            </div>
          )}

          {noteDone ? (
            <p className={styles.noteDone}>Your note is in the discussion below.</p>
          ) : (
            <form
              className={styles.note}
              onSubmit={(e) => {
                e.preventDefault();
                void postNote();
              }}
            >
              <label className={styles.noteLabel} htmlFor="call-note">
                Add a public note on your call? <span className={styles.noteOpt}>(optional)</span>
              </label>
              <div className={styles.noteRow}>
                <input
                  id="call-note"
                  type="text"
                  className={styles.noteInput}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setError(null);
                  }}
                  maxLength={2000}
                  placeholder="What’s driving your read?"
                />
                <button
                  type="submit"
                  className={styles.notePost}
                  disabled={noteBusy || note.trim().length === 0}
                >
                  {noteBusy ? 'Posting…' : 'Post'}
                </button>
              </div>
            </form>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.linkBtn} onClick={() => void toggleHidden()}>
              Hide from my view
            </button>
          </div>
        </>
      )}
      {/* Always mounted (empty until a failure) so the swap-in is reliably announced. */}
      <p className={`${styles.fine} ${styles.miss}`} aria-live="polite">
        {error}
      </p>
    </section>
  );
}
