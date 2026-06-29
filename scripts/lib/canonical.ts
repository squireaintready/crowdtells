/**
 * Cross-platform question matching for the source merge. Polymarket and Kalshi
 * ask the same question in different words — "Bitcoin" vs "BTC", "June" vs "Jun",
 * "Fed" vs "FOMC" — and frame price questions as thresholds the other platform
 * encodes differently. Surface-token overlap alone misses these genuine twins
 * (the audit measured Jaccard 0.10-0.33 for real BTC pairs, under the 0.45 gate).
 *
 * This adds (1) token aliasing so phrasing collapses before overlap is measured,
 * and (2) a precise canonical key for threshold questions
 * (entity + threshold + direction + resolution month).
 */

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Alias map → a single canonical token, so cross-platform phrasings collapse. */
const TOKEN_ALIASES: Record<string, string> = {
  // crypto assets
  bitcoin: 'btc',
  btc: 'btc',
  ethereum: 'eth',
  ether: 'eth',
  eth: 'eth',
  solana: 'sol',
  sol: 'sol',
  dogecoin: 'doge',
  doge: 'doge',
  ripple: 'xrp',
  xrp: 'xrp',
  // institutions
  fomc: 'fed',
  fed: 'fed',
  // month abbreviations → full month (titles mix "Jun" / "June")
  jan: 'january',
  feb: 'february',
  mar: 'march',
  apr: 'april',
  jun: 'june',
  jul: 'july',
  aug: 'august',
  sep: 'september',
  sept: 'september',
  oct: 'october',
  nov: 'november',
  dec: 'december',
};

/** Normalize a token to its canonical form (e.g. "bitcoin" → "btc"). */
export function canonicalToken(w: string): string {
  return TOKEN_ALIASES[w] ?? w;
}

// ── Quantitative (threshold) canonical key ─────────────────────────────────

// Recognized threshold ENTITIES — crypto assets, plus indices/commodities ($-level
// questions) and macro prints (percent-level questions). The entity gates the
// threshold parse, so a bare number is only ever read next to a known subject.
const ENTITIES: Record<string, string> = {
  // crypto
  bitcoin: 'BTC',
  btc: 'BTC',
  ethereum: 'ETH',
  ether: 'ETH',
  eth: 'ETH',
  solana: 'SOL',
  sol: 'SOL',
  dogecoin: 'DOGE',
  doge: 'DOGE',
  ripple: 'XRP',
  xrp: 'XRP',
  // indices / commodities (price levels, usually $-denominated)
  nasdaq: 'NDX',
  spx: 'SPX',
  gold: 'GOLD',
  oil: 'OIL',
  crude: 'OIL',
  wti: 'OIL',
  // macro prints (percent thresholds)
  cpi: 'CPI',
  inflation: 'CPI',
  unemployment: 'UNEMP',
  jobless: 'UNEMP',
};

export interface QuantKey {
  entity: string; // 'BTC'
  threshold: number; // 150000
  direction: 'above' | 'below';
  period: string; // 'YYYY-MM'
}

function findEntity(title: string): string | null {
  for (const w of title.toLowerCase().split(/[^a-z]+/)) {
    if (ENTITIES[w]) return ENTITIES[w];
  }
  return null;
}

/** Parse the first threshold level: a money level ($150k / $150,000 / $1.5M) or a
 * percent level (3% / 5.5%, for rate/CPI/unemployment questions). Only ever read
 * once an ENTITY has matched, so a bare year can't be mistaken for a level. */
function parseThreshold(title: string): number | null {
  // The k/m/b suffix must NOT be followed by another letter, so "$150,000 by ..."
  // doesn't read the "b" of "by" as billions.
  const money = title.match(/\$\s*([\d][\d,]*(?:\.\d+)?)\s*([kmb])?(?![a-z])/i);
  if (money) {
    let n = parseFloat(money[1]!.replace(/,/g, ''));
    const suffix = (money[2] ?? '').toLowerCase();
    if (suffix === 'k') n *= 1_000;
    else if (suffix === 'm') n *= 1_000_000;
    else if (suffix === 'b') n *= 1_000_000_000;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // Percent level (rate/CPI/inflation/unemployment), e.g. "above 3%", "5.5%".
  const pct = title.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    const n = parseFloat(pct[1]!);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function direction(title: string): 'above' | 'below' {
  return /\b(below|under|less than|lower|drop|fall|dip)\b/i.test(title) ? 'below' : 'above';
}

function periodBucket(endDate: string | null): string | null {
  if (!endDate) return null;
  const d = Date.parse(endDate);
  if (!Number.isFinite(d)) return null;
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** A canonical key for a price/threshold question, or null when it isn't one. */
export function quantKey(title: string, endDate: string | null): QuantKey | null {
  const entity = findEntity(title);
  if (!entity) return null;
  const threshold = parseThreshold(title);
  if (threshold === null) return null;
  const period = periodBucket(endDate);
  if (!period) return null;
  return { entity, threshold, direction: direction(title), period };
}

/** Do two threshold keys describe the SAME question? (same asset + direction +
 * resolution month, threshold within 1%). Precise on purpose — no false twins. */
export function quantMatch(a: QuantKey, b: QuantKey): boolean {
  return (
    a.entity === b.entity &&
    a.direction === b.direction &&
    a.period === b.period &&
    Math.abs(a.threshold - b.threshold) <= a.threshold * 0.01
  );
}

/**
 * P(threshold met), in points, for a market matched on a quant key — so the
 * cross-market gap compares like-for-like even when one platform frames it
 * "Yes/No" and the other as a price rung ("$150,000 or above").
 */
export function thresholdYesProb(favored: string, oddsPct: number, key: QuantKey): number {
  const f = favored.toLowerCase();
  if (f === 'no') return round1(100 - oddsPct);
  if (f === 'yes') return oddsPct;
  // A price-rung favored string; invert if the rung's direction opposes the key's.
  const rungBelow = /\b(below|under|less|lower)\b/.test(f);
  const rungMatchesKey = key.direction === 'above' ? !rungBelow : rungBelow;
  return rungMatchesKey ? oddsPct : round1(100 - oddsPct);
}
