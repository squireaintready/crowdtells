import { supabase } from './supabase';
import { notifyStandingMaybeChanged } from './standingSignal';

/**
 * Secret-ballot reader polling on a story's claims — ONE primitive serving three surfaces,
 * told apart by `kind`:
 *   • 'dispute'     — a claim where sources disagree:  Accurate / Unsure / Inaccurate
 *   • 'consensus'   — what the coverage agrees on:      Holds up / Unsure / Overstated
 *   • 'perspective' — an outlet's framing:              Fact / Mix / Opinion
 *
 * Claim ids are a deterministic, synchronous hash of (market_id, claim text) so a poll
 * re-attaches to "the same claim" across feed regenerations — no server-side claims table
 * (votes reference the hash directly). Tallies come from an aggregate rpc (never a user_id);
 * the distribution is revealed to a reader only AFTER they cast their own vote — the
 * secret ballot that keeps one loud early vote from herding the next (Muchnik 2013).
 */
export type PollKind = 'dispute' | 'consensus' | 'perspective';
export type Choice = 'accurate' | 'inaccurate' | 'unsure' | 'fact' | 'opinion';

/** Every choice key, so an empty tally is fully populated (each key a number, never undefined). */
export const CHOICE_KEYS: readonly Choice[] = [
  'accurate',
  'inaccurate',
  'unsure',
  'fact',
  'opinion',
];

/** Per-choice counts for one claim, plus the total. Choices a surface doesn't use stay 0. */
export type Tally = Record<Choice, number> & { total: number };

export const emptyTally = (): Tally => ({
  accurate: 0,
  inaccurate: 0,
  unsure: 0,
  fact: 0,
  opinion: 0,
  total: 0,
});

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const normalize = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function claimId(marketId: string, text: string): string {
  return `${marketId}:${djb2(normalize(text))}`;
}

export interface ClaimVotes {
  tallies: Map<string, Tally>;
  mine: Map<string, Choice>;
}

/** Fetch tallies for a set of claims, plus the current user's own choices. */
export async function fetchClaimVotes(
  claimIds: string[],
  userId: string | null,
): Promise<ClaimVotes> {
  const tallies = new Map<string, Tally>();
  const mine = new Map<string, Choice>();
  if (!supabase || claimIds.length === 0) return { tallies, mine };

  // Public tallies via an aggregate rpc (one row per claim+choice, no user_ids); the
  // viewer's own votes via the table, which RLS scopes to own rows — so the ballot stays
  // secret and the caller can fold both into "have I voted, and what's the distribution".
  // Transitional: if the generic rpc isn't deployed yet (schema.sql not re-run), fall back to
  // the legacy fixed-column tally so the original dispute poll keeps working in the gap.
  const primary = await supabase.rpc('claim_poll_tallies', { p_claim_ids: claimIds });
  let rows = (primary.data ?? []) as { claim_id: string; choice: Choice; n: number }[];
  if (primary.error) {
    const legacy = await supabase.rpc('claim_vote_tallies', { p_claim_ids: claimIds });
    rows = ((legacy.data ?? []) as {
      claim_id: string;
      accurate: number;
      inaccurate: number;
      unsure: number;
    }[]).flatMap((r) => [
      { claim_id: r.claim_id, choice: 'accurate' as Choice, n: Number(r.accurate) },
      { claim_id: r.claim_id, choice: 'inaccurate' as Choice, n: Number(r.inaccurate) },
      { claim_id: r.claim_id, choice: 'unsure' as Choice, n: Number(r.unsure) },
    ]);
  }
  for (const r of rows) {
    const t = tallies.get(r.claim_id) ?? emptyTally();
    const n = Number(r.n);
    if (CHOICE_KEYS.includes(r.choice)) {
      t[r.choice] = n;
      t.total += n;
    }
    tallies.set(r.claim_id, t);
  }

  if (userId) {
    const { data: mineData } = await supabase
      .from('claim_votes')
      .select('claim_id, choice')
      .in('claim_id', claimIds)
      .eq('user_id', userId);
    for (const r of (mineData ?? []) as { claim_id: string; choice: Choice }[]) {
      mine.set(r.claim_id, r.choice);
    }
  }
  return { tallies, mine };
}

/** Cast (or change) a vote. `kind` stamps which surface it came from; the DB binds the
 * allowed choices to the kind, so a mismatched pair is rejected server-side. The dispute
 * write OMITS `kind` (it defaults to 'dispute' once the column exists) so the original poll
 * still records on a DB where the column hasn't been added yet; the new surfaces send it and
 * only come alive after the schema is applied. */
export async function castVote(
  id: string,
  userId: string,
  choice: Choice,
  kind: PollKind = 'dispute',
): Promise<void> {
  if (!supabase) return;
  const row: { claim_id: string; user_id: string; choice: Choice; kind?: PollKind } = {
    claim_id: id,
    user_id: userId,
    choice,
  };
  if (kind !== 'dispute') row.kind = kind;
  const { error } = await supabase
    .from('claim_votes')
    .upsert(row, { onConflict: 'claim_id,user_id' });
  if (error) throw new Error(error.message);
  notifyStandingMaybeChanged(); // a vote may have tipped a verification badge
}

export async function retractVote(id: string, userId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('claim_votes').delete().eq('claim_id', id).eq('user_id', userId);
}
