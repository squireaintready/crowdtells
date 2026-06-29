import { describe, expect, it } from 'vitest';
import { hydrateBriefing } from '../lib/hydrate';
import { makeMarket } from './factory';

const m = makeMarket({
  oddsPct: 68,
  movement7d: 9,
  movement24h: -3,
  volume: 2_400_000,
  divergence: 7,
  alt: { source: 'kalshi', favored: 'Yes', oddsPct: 61, volume: 540_000, marketUrl: '' },
});

describe('hydrateBriefing', () => {
  it('substitutes live market values for tokens', () => {
    expect(hydrateBriefing('traders price it at {odds}', m)).toBe('traders price it at 68%');
    expect(hydrateBriefing('the bet moved {move7d} this week', m)).toBe(
      'the bet moved +9 pts this week',
    );
    expect(hydrateBriefing('{volume} traded', m)).toBe('$2.4M traded');
    expect(hydrateBriefing('a {gap} gap; Kalshi at {altOdds}', m)).toBe(
      'a 7-point gap; Kalshi at 61%',
    );
  });

  it('reads the LIVE odds, so prose can never disagree with the card', () => {
    // The model wrote {odds}; whatever oddsPct is at render is what shows.
    expect(hydrateBriefing('now {odds}', makeMarket({ oddsPct: 77 }))).toBe('now 77%');
  });

  it('drops unknown and null-backed tokens and tidies the whitespace', () => {
    const thin = makeMarket({ oddsPct: 50, alt: null, divergence: null, movement7d: null });
    expect(hydrateBriefing('a coin-flip {bogus} at {odds}', thin)).toBe('a coin-flip at 50%');
    expect(hydrateBriefing('moved {move7d} lately', thin)).toBe('moved lately');
  });

  it('passes plain prose (no tokens) through unchanged', () => {
    expect(hydrateBriefing('No tokens here, just reporting.', m)).toBe(
      'No tokens here, just reporting.',
    );
  });

  it('cleans up a possessive whose owner token was dropped (no dangling " ’s")', () => {
    const thin = makeMarket({ oddsPct: 50 });
    // An unsupported {outlet} token leaves " ’s" behind once dropped.
    expect(hydrateBriefing('aligns with {outlet}’s focus but at {odds}', thin)).toBe(
      'aligns with focus but at 50%',
    );
    expect(hydrateBriefing("the {outlet}'s read", thin)).toBe('the read');
    // A real possessive (no leading space) is untouched.
    expect(hydrateBriefing("Kalshi's price held at {odds}", thin)).toBe(
      "Kalshi's price held at 50%",
    );
  });
});
