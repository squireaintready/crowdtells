import { getJson } from './http';
import type { Config } from './config';
import type { ShapedMarket } from './shaped';
import { normalizeCategory } from './category';
import { canonicalCategory } from '../../src/lib/categories';
import { classifyKind } from './classify';
import { clampText } from './news';

interface RawMarket {
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  /** JSON-string array of the CLOB token ids, parallel to `outcomes`. */
  clobTokenIds?: string;
  groupItemTitle?: string;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  closed?: boolean;
}

interface RawEvent {
  id?: string;
  title?: string;
  slug?: string;
  image?: string;
  description?: string;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  openInterest?: number;
  commentCount?: number;
  startDate?: string;
  endDate?: string;
  closed?: boolean;
  tags?: { label?: string }[];
  markets?: RawMarket[];
}

const GAMMA = 'https://gamma-api.polymarket.com';

function parseArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function num(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface Priced {
  market: RawMarket;
  outcomes: string[];
  prices: number[];
  /** CLOB token ids parallel to `outcomes` (for price-history backfill). */
  tokens: string[];
}

function priced(markets: RawMarket[]): Priced[] {
  const out: Priced[] = [];
  for (const market of markets) {
    if (market.closed) continue;
    const outcomes = parseArray(market.outcomes);
    const prices = parseArray(market.outcomePrices).map(num);
    if (outcomes.length === 0 || prices.length !== outcomes.length) continue;
    if (prices.every((p) => p === 0)) continue;
    out.push({ market, outcomes, prices, tokens: parseArray(market.clobTokenIds) });
  }
  return out;
}

function argmax(nums: number[]): number {
  let best = 0;
  for (let i = 1; i < nums.length; i++) {
    if ((nums[i] ?? -Infinity) > (nums[best] ?? -Infinity)) best = i;
  }
  return best;
}

function yesIndex(outcomes: string[]): number {
  const i = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
  return i === -1 ? 0 : i;
}

/** True only for an actual Yes/No market (the candidate-event building block). */
function isYesNo(outcomes: string[]): boolean {
  if (outcomes.length !== 2) return false;
  const lower = outcomes.map((o) => o.toLowerCase());
  return lower.includes('yes') && lower.includes('no');
}

interface Favored {
  favored: string;
  oddsPct: number;
  movement24h: number | null;
  movement7d: number | null;
  /** The favored outcome's CLOB token id, for price-history backfill (or null). */
  token: string | null;
}

/** Signed change for the favored outcome given the raw "Yes"-indexed deltas. */
function signedChange(change: number | undefined, yesAtZero: boolean): number | null {
  if (typeof change !== 'number') return null;
  return round1((yesAtZero ? change : -change) * 100);
}

function resolveFavored(items: Priced[]): Favored | null {
  if (items.length === 0) return null;

  // Candidate event: every sub-market is a Yes/No bet labeled by a candidate.
  const grouped = items.every((it) => it.market.groupItemTitle && isYesNo(it.outcomes));
  if (grouped) {
    let best: Priced | null = null;
    let bestYes = -1;
    for (const it of items) {
      const yes = it.prices[yesIndex(it.outcomes)] ?? 0;
      if (yes > bestYes) {
        bestYes = yes;
        best = it;
      }
    }
    if (!best) return null;
    const yi = yesIndex(best.outcomes);
    return {
      favored: best.market.groupItemTitle ?? 'Yes',
      oddsPct: round1(bestYes * 100),
      movement24h: signedChange(best.market.oneDayPriceChange, yi === 0),
      movement7d: signedChange(best.market.oneWeekPriceChange, yi === 0),
      token: best.tokens[yi] ?? null, // the favored candidate's YES token
    };
  }

  const it = items[0];
  if (!it) return null;
  const idx = argmax(it.prices);
  const binary = it.outcomes.length === 2;
  const yesAtZero = idx === 0;
  return {
    favored: it.outcomes[idx] ?? 'Yes',
    oddsPct: round1((it.prices[idx] ?? 0) * 100),
    movement24h: binary ? signedChange(it.market.oneDayPriceChange, yesAtZero) : null,
    movement7d: binary ? signedChange(it.market.oneWeekPriceChange, yesAtZero) : null,
    token: it.tokens[idx] ?? null, // the favored outcome's token
  };
}

/**
 * Polymarket scalar/ladder events title the GROUP with an unfilled blank
 * ("Will Silver (SI) hit__ by end of June?", "Bitcoin above ___ on June 18?"),
 * leaving the actual strike only on each per-outcome groupItemTitle. Fill that
 * blank with the favored level so the headline reads as a real question — and,
 * just as importantly, so the news query built from it ("…hit__…" matches
 * nothing on Google News, which silently starves the briefing) searches on a
 * real subject. Directional arrows (↑/↓) on the outcome label are dropped; the
 * level itself is what belongs in the sentence. No blank → unchanged.
 */
export function fillTemplateBlank(title: string, favored: string): string {
  if (!/_{2,}/.test(title)) return title;
  // Drop Polymarket's directional arrows (↑/↓) from the level — the bare strike is
  // what reads in a sentence ("hit $60", not "hit ↓ $60").
  const level = favored.replace(/[↑↓]/g, '').trim();
  if (!level) return title;
  // Replace the first blank (and any space before it) via a function replacement,
  // so a level containing "$" is inserted literally rather than read as a
  // replacement pattern ($&, $1, …); then collapse any doubled space.
  return title
    .replace(/\s*_{2,}/, () => ` ${level}`)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function shapeEvent(event: RawEvent): ShapedMarket | null {
  if (!event.id || !event.title || !event.markets?.length) return null;
  const fav = resolveFavored(priced(event.markets));
  if (!fav) return null;

  const tags = (event.tags ?? []).map((t) => t.label ?? '').filter(Boolean);
  const title = fillTemplateBlank(event.title.trim(), fav.favored);
  const startDate = event.startDate ?? null;
  const endDate = event.endDate ?? null;

  return {
    id: String(event.id),
    source: 'polymarket',
    title,
    marketUrl: `https://polymarket.com/event/${event.slug ?? ''}`,
    image: event.image ?? '',
    category: canonicalCategory(normalizeCategory(tags[0])),
    tags,
    kind: classifyKind({ title, tags, startDate, endDate }),
    description: clampText(event.description ?? '', 700),
    favored: fav.favored,
    oddsPct: fav.oddsPct,
    alt: null,
    divergence: null,
    movement24h: fav.movement24h,
    movement7d: fav.movement7d,
    volume: num(event.volume),
    volume24h: num(event.volume24hr),
    liquidity: num(event.liquidity),
    openInterest: num(event.openInterest),
    comments: num(event.commentCount),
    score: 0,
    startDate,
    endDate,
    seed: fav.token ? { kind: 'polymarket', token: fav.token } : undefined,
  };
}

/**
 * The winning outcome's name for a *resolved* event, or null if it isn't
 * resolved yet. Mirrors `resolveFavored`'s structure (a candidate event resolves
 * to the sub-market whose "Yes" settles to 1; a single market resolves to the
 * outcome priced at 1) — but reads settled/closed sub-markets, which `priced()`
 * deliberately skips. The price-of-exactly-1 is the canonical resolution signal,
 * so an ambiguous/refunded market yields null rather than a bogus winner.
 */
export function winnerOf(event: RawEvent): string | null {
  const items = (event.markets ?? [])
    .map((market) => ({
      market,
      outcomes: parseArray(market.outcomes),
      prices: parseArray(market.outcomePrices).map(num),
    }))
    .filter((it) => it.outcomes.length > 0 && it.prices.length === it.outcomes.length);
  if (items.length === 0) return null;

  const grouped = items.every((it) => it.market.groupItemTitle && isYesNo(it.outcomes));
  if (grouped) {
    for (const it of items) {
      if (it.prices[yesIndex(it.outcomes)] === 1) return it.market.groupItemTitle?.trim() || null;
    }
    return null;
  }

  const it = items[0];
  if (!it) return null;
  const i = it.prices.findIndex((p) => p === 1);
  return i >= 0 ? it.outcomes[i]?.trim() || null : null;
}

/** Re-fetch a (now resolved) event by id and return the winning outcome's name,
 * or null if it isn't resolved yet / the lookup fails. */
export async function fetchResolution(eventId: string, config: Config): Promise<string | null> {
  const url = `${GAMMA}/events?id=${encodeURIComponent(eventId)}`;
  try {
    const data = await getJson<RawEvent[]>(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
    });
    const event = Array.isArray(data) ? data[0] : undefined;
    if (!event || !event.closed) return null; // still open → nothing to record
    return winnerOf(event);
  } catch (err) {
    console.warn(`  ! Polymarket resolution lookup failed (${eventId}): ${(err as Error).message}`);
    return null;
  }
}

/** Fetch one page of active events by 24h volume at a given offset; []-on-failure. */
async function fetchVolumePage(config: Config, limit: number, offset = 0): Promise<RawEvent[]> {
  const url =
    `${GAMMA}/events?limit=${limit}&offset=${offset}&active=true&closed=false&archived=false` +
    `&order=volume24hr&ascending=false`;
  try {
    const data = await getJson<RawEvent[]>(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
    });
    if (!Array.isArray(data)) throw new Error('unexpected response');
    return data;
  } catch (err) {
    // Degrade gracefully (like Kalshi) so one upstream outage doesn't freeze the site.
    console.warn(`  ! Polymarket fetch failed (offset=${offset}): ${(err as Error).message}`);
    return [];
  }
}

/**
 * Fetch Polymarket candidates by 24h volume — the top page PLUS a second page
 * (ranks ~100-200). A single top-100 fetch silently drops the long tail of real
 * standing markets (elections, World Cup matches, majors) that sit just below the
 * giants; pulling the second page hands those to the ranker as candidates so newer
 * stories can earn a feed slot. (Newest-by-startDate was tried and rejected:
 * Polymarket's freshest events are almost all ephemeral intraday price ladders.)
 */
export async function fetchTopMarkets(config: Config): Promise<ShapedMarket[]> {
  const volLimit = Math.min(Math.max(config.polymarketLimit * 2, 20), 100);
  const [page1, page2] = await Promise.all([
    fetchVolumePage(config, volLimit, 0),
    config.polymarketDiscoveryLimit > 0
      ? fetchVolumePage(config, 100, volLimit)
      : Promise.resolve<RawEvent[]>([]),
  ]);

  const shaped: ShapedMarket[] = [];
  const seen = new Set<string>();
  const take = (event: RawEvent): boolean => {
    const m = shapeEvent(event);
    // Skip ephemeral recurring/intraday price ladders — they're not news.
    if (!m || m.kind !== 'standing' || seen.has(m.id)) return false;
    seen.add(m.id);
    shaped.push(m);
    return true;
  };

  // Top page first (priority), capped at polymarketLimit.
  for (const event of page1) {
    take(event);
    if (shaped.length >= config.polymarketLimit) break;
  }
  // Then up to discoveryLimit standing markets from the second page.
  let added = 0;
  for (const event of page2) {
    if (added >= config.polymarketDiscoveryLimit) break;
    if (take(event)) added++;
  }
  return shaped;
}
