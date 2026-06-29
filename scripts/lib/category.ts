/**
 * Categories come straight from the source platforms' tags, which are usually
 * cased correctly ("Politics", "FIFA World Cup", "IEM Cologne") but occasionally
 * arrive all-lowercase — e.g. Polymarket's "fomc" tag. Normalize ONLY the
 * all-lowercase ones (Title Case each word, upper-casing known acronyms) and
 * trust anything that already carries a capital, so we never mangle "FIFA".
 */
import { isSportsFamily } from '../../src/lib/categories';

const ACRONYMS = new Set([
  'fomc',
  'fifa',
  'uefa',
  'iem',
  'nba',
  'nfl',
  'nhl',
  'mlb',
  'wnba',
  'ufc',
  'atp',
  'wta',
  'us',
  'uk',
  'eu',
  'un',
  'uae',
  'gdp',
  'cpi',
  'imf',
  'fed',
  'ipo',
  'etf',
  'nato',
  'opec',
  'ai',
  'f1',
  'ev',
  'esg',
  'gop',
]);

export function normalizeCategory(raw: string | undefined | null): string {
  const t = (raw ?? '').trim();
  if (!t) return 'Markets';
  if (/[A-Z]/.test(t)) return t; // already cased by the source — trust it
  return t
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Is this category (or free-text title) part of the competition/sports-betting
 * family? Ranking treats the family as routine-imminence + sports-section (not the
 * news front page), clustering uses it as the hard sports/non-sports guard, and
 * breaking/social exclude it. Delegates to the SINGLE shared predicate in
 * src/lib/categories (isSportsFamily) so there's no second list to drift. */
export function isSportsCategory(category: string): boolean {
  return isSportsFamily(category);
}
