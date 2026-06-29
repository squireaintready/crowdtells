import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  castVote,
  type Choice,
  claimId,
  emptyTally,
  fetchClaimVotes,
  type PollKind,
  retractVote,
  type Tally,
} from '../../lib/claims';
import { type ClaimNote, fetchClaimNotes } from '../../lib/notes';
import type { Tier } from '../../lib/gamify';
import { track } from '../../lib/posthog';
import { ClaimNotes } from './ClaimNotes';
import burst from '../Burst.module.css';
import styles from './ClaimPolls.module.css';

/** One thing a reader can weigh in on — a claim's text (which keys the vote) and an
 * optional lead shown before it (the outlet, for perspectives). */
export interface PollItem {
  text: string;
  lead?: ReactNode;
}

interface KindConfig {
  /** Ordered choices (the middle one is the hedge). */
  choices: { key: Choice; label: string }[];
  /** The question — the group's accessible label and the blind-state prompt. */
  question: string;
  /** Whether this surface carries community notes (disputed claims only). */
  notes: boolean;
}

/**
 * One secret-ballot primitive, three surfaces. Consensus reuses the accuracy choices (does
 * the agreed reporting hold up?); perspectives ask fact-vs-opinion; disputes keep the
 * original accurate/inaccurate plus community notes. The DB binds each kind to its allowed
 * choices, so a mismatched pair can't be written.
 */
const KINDS: Record<PollKind, KindConfig> = {
  dispute: {
    choices: [
      { key: 'accurate', label: 'Accurate' },
      { key: 'unsure', label: 'Unsure' },
      { key: 'inaccurate', label: 'Inaccurate' },
    ],
    question: 'How accurate does this claim seem to you?',
    notes: true,
  },
  consensus: {
    choices: [
      { key: 'accurate', label: 'True' },
      { key: 'unsure', label: 'Not sure' },
      { key: 'inaccurate', label: 'False' },
    ],
    question: 'Is this claim true?',
    notes: false,
  },
  perspective: {
    choices: [
      { key: 'fact', label: 'Fact' },
      { key: 'unsure', label: 'Mix' },
      { key: 'opinion', label: 'Opinion' },
    ],
    question: 'Is this reporting fact or opinion?',
    notes: false,
  },
};

/**
 * Reader poll on a set of claims. The distribution is a SECRET BALLOT: it stays hidden until
 * the reader casts their own vote, then reveals — so one loud early vote can't herd the next,
 * and weighing in is its own small reward. Lives in the lazy discussion chunk so supabase
 * stays out of the main bundle.
 */
export default function ClaimPolls({
  marketId,
  items,
  kind = 'dispute',
}: {
  marketId: string;
  items: PollItem[];
  kind?: PollKind;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const cfg = KINDS[kind];

  // Stable id per claim, derived from market + text, so a poll re-attaches to the same
  // claim across feed regenerations.
  const texts = useMemo(() => items.map((it) => it.text), [items]);
  const ids = useMemo(() => texts.map((c) => claimId(marketId, c)), [marketId, texts]);

  const [tallies, setTallies] = useState<Map<string, Tally>>(new Map());
  const [mine, setMine] = useState<Map<string, Choice>>(new Map());
  const [notes, setNotes] = useState<Map<string, ClaimNote[]>>(new Map());
  const [myTier, setMyTier] = useState<Tier>('reader');
  // Which chip should spring, and a monotonic seq so re-picking the same chip replays it.
  const [spring, setSpring] = useState({ id: '', seq: 0 });

  const load = useCallback(async () => {
    const res = await fetchClaimVotes(ids, userId);
    setTallies(res.tallies);
    setMine(res.mine);
  }, [ids, userId]);

  // Community-note context loads independently of the vote tallies (disputes only).
  const loadNotes = useCallback(async () => {
    if (!cfg.notes) return;
    const res = await fetchClaimNotes(ids, userId);
    setNotes(res.byClaim);
    setMyTier(res.myTier);
  }, [ids, userId, cfg.notes]);

  useEffect(() => {
    void load();
    void loadNotes();
  }, [load, loadNotes]);

  const canAuthor = myTier === 'contributor' || myTier === 'steward';

  const vote = async (id: string, choice: Choice) => {
    if (!userId) return;
    const prev = mine.get(id) ?? null;
    const retracting = prev === choice;

    // Optimistic: apply the delta locally, roll back to the snapshot on failure.
    const snapTallies = tallies;
    const snapMine = mine;
    const t = { ...(tallies.get(id) ?? emptyTally()) };
    if (prev) {
      t[prev] -= 1;
      t.total -= 1;
    }
    if (!retracting) {
      t[choice] += 1;
      t.total += 1;
    }
    const nextTallies = new Map(tallies);
    nextTallies.set(id, t);
    const nextMine = new Map(mine);
    if (retracting) nextMine.delete(id);
    else nextMine.set(id, choice);
    setTallies(nextTallies);
    setMine(nextMine);
    // Spring the chip on a fresh pick (not a retract) — a small reward for weighing in.
    if (!retracting) setSpring((s) => ({ id: `${id}:${choice}`, seq: s.seq + 1 }));

    try {
      if (retracting) await retractVote(id, userId);
      else await castVote(id, userId, choice, kind);
      track(retracting ? 'claim_vote_retracted' : 'claim_vote_submitted', {
        market_id: marketId,
        choice,
        kind,
      });
    } catch {
      setTallies(snapTallies);
      setMine(snapMine);
    }
  };

  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const id = claimId(marketId, item.text);
        const t = tallies.get(id) ?? emptyTally();
        const my = mine.get(id) ?? null;
        // Secret ballot: the distribution is revealed only once the reader has voted.
        const revealed = my !== null;
        const pct = (n: number) => (t.total > 0 ? Math.round((n / t.total) * 100) : 0);
        const barLabel = cfg.choices
          .filter(({ key }) => t[key] > 0)
          .map(({ key, label }) => `${pct(t[key])}% ${label.toLowerCase()}`)
          .join(', ');
        return (
          <li key={id} className={styles.item}>
            <p className={styles.claim}>
              {item.lead && <span className={styles.lead}>{item.lead}</span>}
              {item.text}
            </p>
            <div className={styles.choices} role="group" aria-label={cfg.question}>
              {cfg.choices.map(({ key, label }) => {
                const springThis = spring.id === `${id}:${key}` ? spring.seq : 0;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.choice} ${styles[key]} ${my === key ? styles.picked : ''}`}
                    onClick={() => void vote(id, key)}
                    disabled={!userId}
                    aria-pressed={my === key}
                    title={userId ? undefined : 'Sign in below to vote'}
                  >
                    <span
                      key={springThis}
                      className={`${styles.chipInner} ${springThis ? burst.pop : ''}`}
                    >
                      {label}
                      {revealed && t[key] > 0 && <span className={styles.n}>{pct(t[key])}%</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {revealed ? (
              <>
                <div className={styles.bar} role="img" aria-label={barLabel}>
                  {cfg.choices.map(
                    ({ key }) =>
                      t[key] > 0 && (
                        <span
                          key={key}
                          className={`${styles.seg} ${styles[key]}`}
                          style={{ flexGrow: t[key] }}
                        />
                      ),
                  )}
                </div>
                <span className={styles.total}>
                  How {t.total} {t.total === 1 ? 'reader reads' : 'readers read'} this
                </span>
              </>
            ) : (
              <p className={styles.empty}>
                {!userId
                  ? 'Sign in below to weigh in.'
                  : t.total > 0
                    ? `Cast your read to see how ${t.total} ${
                        t.total === 1 ? 'reader' : 'readers'
                      } landed.`
                    : 'Be the first to weigh in.'}
              </p>
            )}
            {cfg.notes && (
              <ClaimNotes
                claimId={id}
                notes={notes.get(id) ?? []}
                canAuthor={canAuthor}
                signedIn={!!userId}
                userId={userId}
                onChange={loadNotes}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
