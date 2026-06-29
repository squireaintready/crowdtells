import { getJson, sleep } from './http';
import type { Config } from './config';
import type { ShapedMarket } from './shaped';
import { normalizeCategory } from './category';
import { canonicalCategory } from '../../src/lib/categories';
import { classifyKind } from './classify';
import { clampText } from './news';

interface RawKalshiMarket {
  ticker?: string;
  status?: string;
  result?: string;
  yes_sub_title?: string;
  last_price_dollars?: string | number;
  previous_price_dollars?: string | number;
  yes_bid_dollars?: string | number;
  yes_ask_dollars?: string | number;
  volume_fp?: string | number;
  volume_24h_fp?: string | number;
  open_interest_fp?: string | number;
  liquidity_dollars?: string | number;
  rules_primary?: string;
  open_time?: string;
  close_time?: string;
}

interface RawKalshiEvent {
  event_ticker?: string;
  series_ticker?: string;
  title?: string;
  sub_title?: string;
  category?: string;
  markets?: RawKalshiMarket[];
}

const API = 'https://api.elections.kalshi.com/trade-api/v2';

function num(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Yes-probability of a Kalshi market (last trade, else bid/ask midpoint). */
function yesPrice(m: RawKalshiMarket): number {
  const last = num(m.last_price_dollars);
  if (last > 0) return last;
  const bid = num(m.yes_bid_dollars);
  const ask = num(m.yes_ask_dollars);
  return bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
}

/** A multi-strike PRICE LADDER (rungs like "$51,000 or above") rather than a
 * candidate field ("OpenAI"). Ladders are most newsworthy at their contested
 * rung; candidate events lead with the favorite. */
function isPriceLadder(markets: RawKalshiMarket[]): boolean {
  if (markets.length < 3) return false;
  const numeric = markets.filter((m) => /[\d,]{3,}/.test(m.yes_sub_title ?? '')).length;
  return numeric >= markets.length * 0.6;
}

export function shapeKalshiEvent(event: RawKalshiEvent): ShapedMarket | null {
  if (!event.event_ticker || !event.title) return null;
  const markets = (event.markets ?? []).filter((m) => m.status === 'active' && yesPrice(m) > 0);
  if (markets.length === 0) return null;

  // Aggregate volume/open-interest across ALL the event's contracts. Each *_fp is
  // a contract count (≈$1 notional); multiply by the contract's yes price to
  // approximate USD comparable to Polymarket. Reading these off a single deep-ITM
  // strike (the old bug) shaped multi-strike crypto/econ events to ~$0 and dropped them.
  let volume = 0;
  let volume24h = 0;
  let openInterest = 0;
  for (const m of markets) {
    const y = yesPrice(m);
    volume += num(m.volume_fp) * y;
    volume24h += num(m.volume_24h_fp) * y;
    openInterest += num(m.open_interest_fp) * y;
  }

  // Headline contract: a price ladder leads with its CONTESTED rung (nearest 50%),
  // not the foregone deep-ITM strike; a candidate event leads with the favorite.
  const ladder = isPriceLadder(markets);
  let headline = markets[0]!;
  if (ladder) {
    let bestDist = Infinity;
    for (const m of markets) {
      const d = Math.abs(yesPrice(m) - 0.5);
      if (d < bestDist) {
        bestDist = d;
        headline = m;
      }
    }
  } else {
    let bestYes = -1;
    for (const m of markets) {
      const y = yesPrice(m);
      if (y > bestYes) {
        bestYes = y;
        headline = m;
      }
    }
  }

  const hy = yesPrice(headline);
  const lastPrice = num(headline.last_price_dollars);
  const prevPrice = num(headline.previous_price_dollars);
  const prevChange = lastPrice - prevPrice;
  const hasMove = lastPrice > 0 && prevPrice > 0; // need a real trade to claim a delta
  let favored: string;
  let oddsPct: number;
  let move: number | null;

  if (markets.length > 1) {
    // Candidate ("Anthropic") or ladder rung ("$51,000 or above").
    favored = headline.yes_sub_title?.trim() || 'Yes';
    oddsPct = round1(hy * 100);
    move = hasMove ? round1(prevChange * 100) : null;
  } else {
    // Single binary market.
    const yesFavored = hy >= 0.5;
    favored = yesFavored ? 'Yes' : 'No';
    oddsPct = round1((yesFavored ? hy : 1 - hy) * 100);
    move = hasMove ? round1((yesFavored ? prevChange : -prevChange) * 100) : null;
  }

  const title = event.title.trim();
  const startDate = headline.open_time ?? null;
  const endDate = headline.close_time ?? null;
  // For price-history backfill: a single binary market favored "No" needs its yes
  // candle inverted; a candidate/ladder headline maps its yes price directly.
  const invert = markets.length === 1 && favored === 'No';

  return {
    id: `kalshi:${event.event_ticker}`,
    source: 'kalshi',
    title,
    marketUrl: `https://kalshi.com/markets/${event.series_ticker ?? event.event_ticker}`,
    image: '',
    category: canonicalCategory(normalizeCategory(event.category)),
    tags: [], // Kalshi exposes no tag array; classification is title/lifespan-based
    kind: classifyKind({ title, startDate, endDate }),
    // The full resolution rule (rules_primary is the legal settlement text) — capped on a
    // word boundary at ~700, not 320, so the briefing never reads a rule cut mid-criterion.
    description: clampText(headline.rules_primary ?? event.sub_title ?? '', 700),
    favored,
    oddsPct,
    alt: null,
    divergence: null,
    movement24h: move,
    movement7d: null, // Kalshi exposes no weekly delta; backfilled from history over time
    volume: Math.round(volume),
    volume24h: Math.round(volume24h),
    liquidity: num(headline.liquidity_dollars),
    openInterest: Math.round(openInterest),
    comments: 0,
    score: 0,
    startDate,
    endDate,
    seed:
      event.series_ticker && headline.ticker
        ? { kind: 'kalshi', series: event.series_ticker, ticker: headline.ticker, invert }
        : undefined,
  };
}

/**
 * The winning outcome's name across an event's settled markets, mirroring
 * `shapeKalshiEvent`'s favored convention: a single binary market resolves to
 * "Yes"/"No"; a candidate event resolves to the `yes_sub_title` of the contract
 * that settled "yes". null while unsettled / indeterminate.
 */
export function winnerOf(markets: RawKalshiMarket[]): string | null {
  const isFinal = (m: RawKalshiMarket) => m.status === 'finalized' || m.status === 'settled';
  const settled = markets.filter((m) => isFinal(m) && (m.result === 'yes' || m.result === 'no'));
  if (settled.length === 0) return null;
  if (settled.length === 1) return settled[0]!.result === 'yes' ? 'Yes' : 'No';
  const yes = settled.find((m) => m.result === 'yes');
  return yes ? yes.yes_sub_title?.trim() || 'Yes' : null;
}

/** Re-fetch an event's markets by ticker and return the winning outcome's name,
 * or null if it isn't settled yet / the lookup fails. */
export async function fetchResolution(eventTicker: string, config: Config): Promise<string | null> {
  const url = `${API}/markets?event_ticker=${encodeURIComponent(eventTicker)}&limit=200`;
  try {
    const data = await getJson<{ markets?: RawKalshiMarket[] }>(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
    });
    return winnerOf(data.markets ?? []);
  } catch (err) {
    console.warn(`  ! Kalshi resolution lookup failed (${eventTicker}): ${(err as Error).message}`);
    return null;
  }
}

/**
 * Fetch open Kalshi events and shape them. The open-events feed is NOT
 * volume-sorted (it returns ~alphabetically by ticker, so high-volume crypto/econ
 * events are scattered throughout and a single un-paginated page misses them
 * entirely), so we page through it via the cursor and globally sort by real,
 * aggregated volume. Bounded by `kalshiMaxPages`; degrades gracefully on error.
 */
export async function fetchTopMarkets(config: Config): Promise<ShapedMarket[]> {
  if (config.kalshiLimit <= 0) return [];
  const headers = { 'User-Agent': config.userAgent, Accept: 'application/json' };
  const events: RawKalshiEvent[] = [];
  let cursor = '';
  for (let page = 0; page < config.kalshiMaxPages; page++) {
    const url =
      `${API}/events?limit=200&status=open&with_nested_markets=true` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    let data: { events?: RawKalshiEvent[]; cursor?: string };
    try {
      data = await getJson<{ events?: RawKalshiEvent[]; cursor?: string }>(url, { headers });
    } catch (err) {
      console.warn(`  ! Kalshi fetch failed (page ${page}): ${(err as Error).message}`);
      break; // keep whatever pages we already have
    }
    const batch = data.events ?? [];
    events.push(...batch);
    cursor = data.cursor ?? '';
    if (!cursor || batch.length === 0) break;
    await sleep(150); // be polite to the public API
  }

  const seen = new Set<string>();
  const shaped: ShapedMarket[] = [];
  for (const event of events) {
    const m = shapeKalshiEvent(event);
    // Standing questions only (no recurring/intraday ladders), with real activity.
    if (m && m.kind === 'standing' && (m.volume24h > 0 || m.openInterest > 0) && !seen.has(m.id)) {
      seen.add(m.id);
      shaped.push(m);
    }
  }
  // Comprehensive, category-FAIR candidate pool: take the top few from EACH
  // category by floored activity (24h flow floored by lifetime volume + open
  // interest), so a quiet-but-substantive category (Crypto, Science, Climate) is
  // not starved by high-volume Politics/Elections before ranking even sees it.
  // Ranking's diversity pass (MMR) then makes the final, balanced selection.
  const byCategory = new Map<string, ShapedMarket[]>();
  for (const m of shaped) {
    (byCategory.get(m.category) ?? byCategory.set(m.category, []).get(m.category)!).push(m);
  }
  const candidates: ShapedMarket[] = [];
  for (const list of byCategory.values()) {
    list.sort((a, b) => candidacy(b) - candidacy(a));
    candidates.push(...list.slice(0, config.kalshiPerCategory));
  }
  candidates.sort((a, b) => candidacy(b) - candidacy(a));
  return candidates.slice(0, config.kalshiLimit);
}

/** Floored-activity ordering for the Kalshi candidate pre-filter (24h flow,
 * floored by lifetime volume + open interest). */
function candidacy(m: ShapedMarket): number {
  return (
    Math.log10(m.volume24h + 1) +
    0.5 * Math.log10(m.volume + 1) +
    0.4 * Math.log10(m.openInterest + 1)
  );
}
