import { describe, expect, it } from 'vitest';
import type { Feed, Market } from '../src/lib/types';
import { buildPostText, detectResolutions } from './send-social';
import { buildResolutionCard } from './lib/resolutionCard';
import { postToBluesky, postToMastodon } from './lib/socialPost';

const NOW = Date.parse('2026-06-18T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function market(over: Partial<Market>): Market {
  return {
    id: 'm', source: 'polymarket', title: 'T', marketUrl: 'https://polymarket.com/event/s',
    image: '', category: 'Politics', description: '', favored: 'Yes', oddsPct: 99, alt: null,
    divergence: null, movement24h: 2, movement7d: 5, oddsHistory: [], volume: 1e7, volume24h: 1e5,
    liquidity: 1e4, openInterest: 1e4, comments: 0, score: 1, startDate: null,
    endDate: '2026-06-18T00:00:00Z', status: 'resolved', hook: 'Senate passes the bill', analysis: 'a',
    take: '', marketRead: '', crowdVsCoverage: '', synthesis: null, sources: [], grounded: true,
    generatedAt: hoursAgo(48), updatedAt: hoursAgo(1), resolvedOutcome: 'Yes', calledCorrectly: true,
    resolvedAt: hoursAgo(1), ...over,
  };
}

const feed = (markets: Market[]): Feed => ({ generatedAt: 'x', version: 1, markets });

describe('detectResolutions — what is card-worthy', () => {
  it('detects a briefed, high-volume, categorical, recent resolution', () => {
    const out = detectResolutions(feed([market({})]), NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ marketId: 'm', eventKey: 'social:m' });
  });

  it('ignores an active (not yet resolved) market', () => {
    expect(detectResolutions(feed([market({ status: 'active', resolvedOutcome: null, resolvedAt: null })]), NOW)).toHaveLength(0);
  });

  it('ignores a resolution older than the lookback window', () => {
    expect(detectResolutions(feed([market({ resolvedAt: hoursAgo(60) })]), NOW)).toHaveLength(0);
  });

  it('ignores a market we never briefed', () => {
    expect(detectResolutions(feed([market({ generatedAt: null, hook: '' })]), NOW)).toHaveLength(0);
  });

  it('ignores a below-floor-volume (novelty/prop) resolution', () => {
    expect(detectResolutions(feed([market({ volume: 2_000_000 })]), NOW)).toHaveLength(0);
  });

  it('ignores a quantity-novelty outcome (bare number/range)', () => {
    expect(detectResolutions(feed([market({ hook: 'Elon tweets', resolvedOutcome: '200-219' })]), NOW)).toHaveLength(0);
  });

  it('excludes routine sports — by category and by a sports hook on a mislabeled category', () => {
    const byCat = market({ id: 'a', category: 'Soccer', volume: 30_000_000 });
    const byHook = market({ id: 'b', category: 'Games', hook: 'England beats Croatia in World Cup thriller' });
    expect(detectResolutions(feed([byCat, byHook]), NOW)).toHaveLength(0);
  });

  it('ranks a correct call above an incorrect one and respects the limit', () => {
    const out = detectResolutions(
      feed([
        market({ id: 'wrong', calledCorrectly: false }),
        market({ id: 'right', calledCorrectly: true }),
      ]),
      NOW,
    );
    expect(out.map((r) => r.marketId)).toEqual(['right', 'wrong']);
    expect(detectResolutions(feed([market({ id: 'a' }), market({ id: 'b' })]), NOW, 1)).toHaveLength(1);
  });
});

describe('buildPostText', () => {
  it('leads with the headline + verdict and a quiet read-more nudge', () => {
    const card = buildResolutionCard(market({}));
    const text = buildPostText(card);
    expect(text).toContain('Senate passes the bill');
    expect(text).toContain(card.verdict);
    expect(text).toContain('How the crowd read it →');
  });
});

// INERT-GATING: with no creds, both clients are pure no-ops — NO network is touched
// (these tests would throw on a real fetch, proving the early return fires first).
describe('socialPost — inert when unconfigured (no network)', () => {
  it('postToBluesky no-ops with skipped:true when creds are null/empty', async () => {
    expect(await postToBluesky('t', 'https://x/y', null)).toEqual({ ok: false, skipped: true });
    expect(await postToBluesky('t', 'https://x/y', { handle: '', appPassword: '' })).toEqual({ ok: false, skipped: true });
    expect(await postToBluesky('t', 'https://x/y', { handle: 'a.bsky.social', appPassword: '' })).toEqual({ ok: false, skipped: true });
  });

  it('postToMastodon no-ops with skipped:true when creds are null/empty', async () => {
    expect(await postToMastodon('t', 'https://x/y', null)).toEqual({ ok: false, skipped: true });
    expect(await postToMastodon('t', 'https://x/y', { instance: '', token: '' })).toEqual({ ok: false, skipped: true });
    expect(await postToMastodon('t', 'https://x/y', { instance: 'https://m.social', token: '' })).toEqual({ ok: false, skipped: true });
  });
});
