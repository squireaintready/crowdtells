/**
 * Backfill a market's REAL recent price history at first discovery, so a brand-
 * new market's first chart shows a true trend instead of a flat baseline. Pulls
 * the FAVORED outcome's series from the source platform (Polymarket CLOB /
 * Kalshi candlesticks), maps it to 0–100, and downsamples to the sparkline
 * window. Strictly best-effort: any failure returns [] and the caller falls back
 * to the single-point flat baseline (no regression).
 */
import { getJson } from './http';
import type { Config } from './config';
import type { OddsPoint } from '../../src/lib/types';
import type { SeedSource, ShapedMarket } from './shaped';

const CLOB = 'https://clob.polymarket.com';
const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Evenly downsample to at most `max` points, always keeping the first and last
 * (so the trend's endpoints stay exact). Pure. */
export function downsample(points: OddsPoint[], max: number): OddsPoint[] {
  if (max <= 1 || points.length <= max) return points;
  const out: OddsPoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]!);
  return out;
}

/** Polymarket CLOB price-history → favored-prob OddsPoints. The token IS the
 * favored outcome, so its price (0–1) maps straight to the favored probability. */
export function mapPolymarket(raw: { history?: { t: number; p: number }[] }): OddsPoint[] {
  const out: OddsPoint[] = [];
  for (const pt of raw.history ?? []) {
    if (!Number.isFinite(pt.t) || !Number.isFinite(pt.p)) continue;
    out.push({ t: new Date(pt.t * 1000).toISOString(), p: round1(pt.p * 100) });
  }
  return out;
}

interface KalshiCandle {
  end_period_ts?: number;
  price?: { close_dollars?: string | number };
  yes_bid?: { close_dollars?: string | number };
  yes_ask?: { close_dollars?: string | number };
}

const dollars = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/** Kalshi candlesticks → favored-prob OddsPoints. Per candle the yes price is the
 * last-trade close, else the bid/ask midpoint; inverted when the favorite is the
 * "No" side of a single binary market. Candles with no price are skipped. */
export function mapKalshi(raw: { candlesticks?: KalshiCandle[] }, invert: boolean): OddsPoint[] {
  const out: OddsPoint[] = [];
  for (const c of raw.candlesticks ?? []) {
    if (!Number.isFinite(c.end_period_ts)) continue;
    const close = dollars(c.price?.close_dollars);
    const bid = dollars(c.yes_bid?.close_dollars);
    const ask = dollars(c.yes_ask?.close_dollars);
    const yes = close > 0 ? close : bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
    if (yes <= 0 || yes > 1) continue;
    const prob = invert ? 1 - yes : yes;
    out.push({ t: new Date((c.end_period_ts as number) * 1000).toISOString(), p: round1(prob * 100) });
  }
  return out;
}

/** Fetch a market's real recent favored-outcome history, mapped to 0–100 and
 * downsampled to `historyMax`. Returns [] on any failure (degrade to flat). */
export async function fetchSeedHistory(seed: SeedSource, config: Config): Promise<OddsPoint[]> {
  const headers = { 'User-Agent': config.userAgent, Accept: 'application/json' };
  try {
    if (seed.kind === 'polymarket') {
      const raw = await getJson<{ history?: { t: number; p: number }[] }>(
        `${CLOB}/prices-history?market=${encodeURIComponent(seed.token)}&interval=1w&fidelity=60`,
        { headers, retries: 2 },
      );
      return downsample(mapPolymarket(raw), config.historyMax);
    }
    const now = Math.floor(Date.now() / 1000);
    const url =
      `${KALSHI}/series/${encodeURIComponent(seed.series)}/markets/${encodeURIComponent(seed.ticker)}` +
      `/candlesticks?start_ts=${now - 7 * 86_400}&end_ts=${now}&period_interval=60`;
    const raw = await getJson<{ candlesticks?: KalshiCandle[] }>(url, { headers, retries: 2 });
    return downsample(mapKalshi(raw, seed.invert), config.historyMax);
  } catch {
    return []; // best-effort — the caller seeds a flat baseline instead
  }
}

/** Backfill real history onto newly-discovered markets (not already in the
 * store), bounded by `seedLimit` so the first-run spike drains across runs.
 * Mutates each market's `seedHistory`; returns how many were filled. */
export async function backfillSeeds(
  shaped: ShapedMarket[],
  priorIds: Set<string>,
  config: Config,
): Promise<number> {
  const fresh = shaped.filter((m) => m.seed && !priorIds.has(m.id)).slice(0, config.seedLimit);
  // Each seed's history is an independent CLOB/Kalshi candlestick fetch — run the
  // (capped at seedLimit) lookups concurrently instead of serially. Per-item
  // failures already degrade to [] inside fetchSeedHistory, so no flood/throw risk.
  let filled = 0;
  await Promise.all(
    fresh.map(async (m) => {
      const hist = await fetchSeedHistory(m.seed!, config);
      if (hist.length >= 2) {
        m.seedHistory = hist;
        filled++;
      }
    }),
  );
  return filled;
}
