/**
 * Resolution recaps + accuracy scoreboard data. Once a tracked market settles on
 * its platform, re-fetch it to learn the actual winning outcome and record
 * whether the market's favored side was right ("did the crowd call it"). This is
 * what powers the Past tab's per-story recap and the aggregate hit-rate.
 *
 * We re-query markets we actually briefed that have ENDED but whose real outcome
 * we haven't captured yet — whether store.ts still has them as `resolved` (within
 * the Past-tab window) or has since aged them to `archived`. Settlement on the
 * platform routinely lags the end date, sometimes past `resolvedRetainDays`, so
 * scanning only `resolved` markets would permanently miss those late settlers and
 * under-count the scoreboard. We bound the work two ways: a `resolveCaptureDays`
 * horizon past the end date (after which a still-unsettled market is treated as
 * indeterminate and dropped), and a `resolveCaptureMax` per-run cap so a backlog
 * drains across runs instead of spiking one run's API usage.
 */
import type { Market } from '../../src/lib/types';
import type { Config } from './config';
import { fetchResolution as fetchPmResolution } from './polymarket';
import { fetchResolution as fetchKalshiResolution } from './kalshi';

const DAY_MS = 86_400_000;
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Did the market's favored side match the actual winning outcome? */
export function decideCorrect(favored: string, winner: string): boolean {
  return norm(favored) === norm(winner);
}

async function fetchWinner(m: Market, config: Config): Promise<string | null> {
  return m.source === 'kalshi'
    ? fetchKalshiResolution(m.id.replace(/^kalshi:/, ''), config)
    : fetchPmResolution(m.id, config);
}

/**
 * Which briefed markets are worth a resolution lookup this run: ended, briefed,
 * not yet captured, and still within the capture horizon — across BOTH the
 * `resolved` (live Past tab) and `archived` (aged-out but kept) statuses. Sorted
 * oldest-ended first (likeliest to have settled) and capped, exported for tests.
 */
export function pendingResolutions(markets: Market[], nowMs: number, config: Config): Market[] {
  const horizonMs = config.resolveCaptureDays * DAY_MS;
  return markets
    .filter((m) => {
      if (m.status !== 'resolved' && m.status !== 'archived') return false;
      if (!m.generatedAt || m.resolvedOutcome != null) return false;
      const endMs = m.endDate ? Date.parse(m.endDate) : NaN;
      if (!Number.isFinite(endMs) || endMs > nowMs) return false; // not ended yet
      return nowMs - endMs <= horizonMs; // still plausibly settling
    })
    .sort((a, b) => Date.parse(a.endDate as string) - Date.parse(b.endDate as string))
    .slice(0, config.resolveCaptureMax);
}

/**
 * For each briefed, ended-but-uncaptured market, fetch its real outcome and
 * record the recap fields in place. Returns how many were newly captured.
 */
export async function captureResolutions(
  markets: Market[],
  nowIso: string,
  config: Config,
): Promise<number> {
  const pending = pendingResolutions(markets, Date.parse(nowIso), config);
  if (pending.length === 0) return 0;

  let captured = 0;
  const CONCURRENCY = 4;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (m) => {
        const winner = await fetchWinner(m, config);
        if (!winner) return; // not settled yet / indeterminate → retry a later run
        m.resolvedOutcome = winner;
        m.calledCorrectly = decideCorrect(m.favored, winner);
        m.resolvedAt = nowIso;
        captured++;
      }),
    );
  }
  return captured;
}
