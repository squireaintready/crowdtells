/**
 * Distinguish a SUBSTANTIVE STANDING QUESTION (a Fed decision, an election, a
 * year-end price target — worth a grounded news briefing) from an EPHEMERAL
 * recurring/intraday PRICE TICK (a "what price will Bitcoin hit at 5pm today"
 * ladder rung — noise that should never become a news story).
 *
 * See the source-layer audit: the live site was briefing Polymarket's daily
 * "Bitcoin Price Drops" ladder as if it were breaking news. Only `standing`
 * markets earn a briefing; `ephemeral` ones are dropped from the article feed.
 */
export type MarketKind = 'standing' | 'ephemeral';

// Tags Polymarket attaches to recurring/intraday price ladders. 'Hide From New'
// is deliberately EXCLUDED — Polymarket also puts it on legit futures like
// "World Cup Winner", so it's too broad to mean "ephemeral".
const EPHEMERAL_TAGS = new Set([
  'recurring',
  'daily',
  'hourly',
  'intraday',
  'hit price',
  'mention markets',
]);

// Daily/intraday markets resolve "... at 5pm EDT" / "at 12:30am" — a specific
// clock time, which standing questions essentially never carry. This is what
// catches Kalshi's daily crypto (KXBTCD: "BTC price on Jun 19, 2026 at 5pm EDT?"),
// which has no tags and opens a week early (so lifespan alone misses it).
const INTRADAY_TITLE = /\bat\s+\d{1,2}(:\d{2})?\s*(a|p)\.?m\.?\b/i;

function lifespanHours(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  const s = Date.parse(startDate);
  const e = Date.parse(endDate);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return (e - s) / 3_600_000;
}

/** Classify a market as a standing question or an ephemeral price tick. */
export function classifyKind(opts: {
  title: string;
  tags?: string[];
  startDate: string | null;
  endDate: string | null;
}): MarketKind {
  const tags = (opts.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => EPHEMERAL_TAGS.has(t))) return 'ephemeral';
  if (INTRADAY_TITLE.test(opts.title)) return 'ephemeral';
  const life = lifespanHours(opts.startDate, opts.endDate);
  if (life !== null && life <= 26) return 'ephemeral'; // opens + resolves within ~a day
  return 'standing';
}
