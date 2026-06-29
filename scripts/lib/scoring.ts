/**
 * Gamification scoring — runs in the pipeline after captureResolutions(). For each
 * market that JUST settled, grade every reader's Call with a Brier score (the math
 * lives in src/lib/gamify.ts), mirror the resolution into a durable public table
 * (so scores survive the 14-day client-feed pruning), and recompute the affected
 * readers' trust. Writes use the service role (BYPASSRLS).
 *
 * BEST-EFFORT by construction: it no-ops without a service key (local/dry runs) and
 * swallows per-market errors so a scoring hiccup can NEVER abort feed generation or
 * trip the floor guard. The site shipping always wins over a score being late.
 */
import type { Market } from '../../src/lib/types';
import {
  brierScore,
  impliedProb,
  median,
  normalizeOutcome,
  ourBrier,
  peerScore,
  type Pick,
} from '../../src/lib/gamify';
import { adminCtxFromEnv, restRpc, restSelect, restUpsert, type AdminCtx } from './admin';

interface CallRow {
  user_id: string;
  target_outcome: string;
  pick: Pick;
  confidence: number;
}

export interface CallScoreRow {
  user_id: string;
  market_id: string;
  prob: number;
  won: boolean;
  brier: number;
  peer: number;
}

export interface MarketScore {
  marketId: string;
  resolvedOutcome: string;
  nCalls: number;
  medianBrier: number | null;
  ourBrier: number;
  scores: CallScoreRow[];
}

/**
 * Grade all calls on one resolved market. Pure (no I/O) so it's unit-testable. A
 * reader's `prob` is the probability THEY assigned to the favored target happening;
 * `won` is whether the frozen target actually won. Peer = Brier − the market median,
 * which cancels question difficulty.
 */
export function scoreMarket(market: Market, calls: CallRow[]): MarketScore {
  const resolvedOutcome = market.resolvedOutcome ?? '';
  const won = (target: string): boolean =>
    normalizeOutcome(target) === normalizeOutcome(resolvedOutcome);

  const graded = calls.map((c) => {
    const prob = impliedProb(c.pick, c.confidence);
    const w = won(c.target_outcome);
    return { user_id: c.user_id, prob, won: w, brier: brierScore(prob, w) };
  });

  const med = graded.length ? median(graded.map((g) => g.brier)) : null;
  const scores: CallScoreRow[] = graded.map((g) => ({
    user_id: g.user_id,
    market_id: market.id,
    prob: g.prob,
    won: g.won,
    brier: g.brier,
    peer: med == null ? 0 : peerScore(g.brier, med),
  }));

  return {
    marketId: market.id,
    resolvedOutcome,
    nCalls: calls.length,
    medianBrier: med,
    ourBrier: ourBrier(
      market.briefedOddsPct ?? market.oddsPct,
      market.briefedFavored ?? market.favored,
      resolvedOutcome,
    ),
    scores,
  };
}

const enc = (v: string): string => encodeURIComponent(v);

/**
 * Score the markets that just resolved this run. Returns how many were newly
 * scored. No-ops (returns 0) when no service key is configured.
 */
export async function scoreResolvedMarkets(resolved: Market[], nowIso: string): Promise<number> {
  const withOutcome = resolved.filter((m) => m.resolvedOutcome != null);
  if (withOutcome.length === 0) return 0;

  let ctx: AdminCtx;
  try {
    ctx = adminCtxFromEnv();
  } catch {
    return 0; // local / dry run — nothing to score against
  }

  const affected = new Set<string>();
  let scored = 0;

  // One bulk lookup of what's already scored, so we don't query per-market every
  // run. Pre-migration this 404s → [] → we attempt (and fail soft) per market.
  const doneRows = await restSelect<{ market_id: string }>(ctx, 'market_resolutions', 'select=market_id');
  const done = new Set(doneRows.map((r) => r.market_id));

  for (const m of withOutcome) {
    if (done.has(m.id)) continue; // scored on an earlier run — idempotent
    try {
      const calls = await restSelect<CallRow>(
        ctx,
        'calls',
        `market_id=eq.${enc(m.id)}&select=user_id,target_outcome,pick,confidence`,
      );
      const result = scoreMarket(m, calls);

      await restUpsert(ctx, 'market_resolutions', [
        {
          market_id: result.marketId,
          resolved_outcome: result.resolvedOutcome,
          resolved_at: nowIso,
          n_calls: result.nCalls,
          median_brier: result.medianBrier,
          our_brier: result.ourBrier,
        },
      ]);

      if (result.scores.length > 0) {
        await restUpsert(
          ctx,
          'call_scores',
          result.scores.map((s) => ({ ...s, scored_at: nowIso })),
        );
        for (const s of result.scores) affected.add(s.user_id);
      }
      scored++;
    } catch (e) {
      console.warn(`scoring: ${m.id} skipped (non-fatal): ${(e as Error).message}`);
    }
  }

  for (const uid of affected) {
    try {
      await restRpc(ctx, 'recompute_trust', { p_user_id: uid });
    } catch (e) {
      console.warn(`scoring: recompute_trust ${uid} failed (non-fatal): ${(e as Error).message}`);
    }
  }

  return scored;
}
