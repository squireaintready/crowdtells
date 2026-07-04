import type { AltMarket, MarketSource, OddsPoint, StoryFormat, SubSignal } from '../../src/lib/types';
import type { MarketKind } from './classify';

/** How to backfill a market's real price history at first discovery — the
 * favored outcome's series on its source platform (see scripts/lib/history.ts).
 * Polymarket: the favored outcome's CLOB token (its price IS the favored prob).
 * Kalshi: the headline contract's candlesticks, inverted when the favorite is the
 * "No" side of a single binary market. */
export type SeedSource =
  | { kind: 'polymarket'; token: string }
  | { kind: 'kalshi'; series: string; ticker: string; invert: boolean };

/** Live market fields produced by a source client, before the AI briefing. */
export interface ShapedMarket {
  id: string;
  source: MarketSource;
  title: string;
  marketUrl: string;
  image: string;
  category: string;
  description: string;
  /** Source-platform tags (Polymarket); [] for Kalshi. Feeds classification. */
  tags: string[];
  /** Standing question (briefable) vs ephemeral recurring/intraday price tick. */
  kind: MarketKind;
  favored: string;
  oddsPct: number;
  /** Cross-market match + gap, filled in during source merge. */
  alt: AltMarket | null;
  divergence: number | null;
  /** Sibling markets corroborating the SAME event (same/other platform), gathered
   * during the source merge — data points for the briefing + a corroboration count.
   * The single best cross-platform twin is ALSO on `alt` (with the gap). */
  peers?: AltMarket[];
  movement24h: number | null;
  movement7d: number | null;
  volume: number;
  volume24h: number;
  liquidity: number;
  openInterest: number;
  comments: number;
  /** Newsworthiness score, assigned during ranking (0 until ranked). */
  score: number;
  startDate: string | null;
  endDate: string | null;
  /** How to fetch this market's real price history (set by the shaper). */
  seed?: SeedSource;
  /** Backfilled price history (oldest→newest, favored prob 0–100), populated for
   * newly-discovered markets so the first chart shows a true trend. */
  seedHistory?: OddsPoint[];
  // ── Story layer (stamped pre-ranking by generate.ts; flow through to Market) ──
  /** Distinct corroborating outlets covering this story right now — the PRIMARY
   * ranking axis (a news-led front page). Stamped from the RSS coverage clusters. */
  newsFootprint?: number;
  /** ISO timestamp this market last LED a story's slot (persisted across runs), so
   * ranking can dip a recently-led story and the feed rotates day to day. */
  lastLedAt?: string;
  /** ISO timestamp this market's current continuous feed run began (persisted across
   * runs while it stays active), so ranking can fatigue a calm, uncovered tenured story. */
  firstLedAt?: string;
  /** The story this facet belongs to (stable, derived from shared tokens). Set on the
   * lead AND on every absorbed sub-market (which all share the lead's storyId). */
  storyId?: string;
  /** True only on the facet elected to LEAD the story — the one briefed and ranked.
   * Absorbed sub-markets have this falsy and are suppressed from the ranked feed. */
  isStoryLead?: boolean;
  /** The crowd's read across the story's other facets (the absorbed sub-markets),
   * carried on the lead for the article render. */
  subSignals?: SubSignal[];
  /** The editorial desk assigned to the story (drives the briefing prompt + render;
   * a 'digest' lead is never briefed). */
  format?: StoryFormat;
}
