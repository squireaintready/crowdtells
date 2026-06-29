import type { Market } from './types';
import { formatPct, formatUsd, formatMovement } from './format';

/**
 * The briefing model never writes market figures as digits — it writes
 * placeholder {tokens} (it is only ever shown qualitative bands, so it cannot
 * fabricate a number). We substitute the LIVE Market value here, at render time,
 * so the prose can never disagree with the card and stays fresh as the odds
 * move. Pure (no window/env) so the client and the Node generator both use it.
 */

const movePts = (n: number): string => `${formatMovement(n).replace(/\.0$/, '')} pts`;

function tokenValues(m: Market): Record<string, string | null> {
  return {
    odds: formatPct(m.oddsPct),
    altOdds: m.alt ? formatPct(m.alt.oddsPct) : null,
    move7d: m.movement7d != null ? movePts(m.movement7d) : null,
    move24h: m.movement24h != null ? movePts(m.movement24h) : null,
    volume: m.volume > 0 ? formatUsd(m.volume) : null,
    volume24h: m.volume24h > 0 ? formatUsd(m.volume24h) : null,
    gap: m.divergence != null ? `${Math.round(m.divergence)}-point` : null,
  };
}

/** Replace {token} placeholders with live values; drop null/unknown tokens and
 * tidy the whitespace/punctuation they leave behind. */
export function hydrateBriefing(text: string, m: Market): string {
  if (!text || !text.includes('{')) return text;
  const vals = tokenValues(m);
  return text
    .replace(/\{(\w+)\}/g, (_, key: string) => vals[key] ?? '')
    .replace(/\(\s*\)/g, '') // empty parens left by a dropped token
    // A dropped owner token leaves a stranded possessive (" 's"); legitimate
    // English never has whitespace before "'s", so it's safe to drop it.
    .replace(/\s+['’]s\b/g, '')
    .replace(/\s+([.,;:!?])/g, '$1') // space stranded before punctuation
    .replace(/\s{2,}/g, ' ')
    .trim();
}
