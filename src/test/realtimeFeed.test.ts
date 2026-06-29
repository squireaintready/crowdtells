import { describe, expect, it } from 'vitest';
import { makeMarket } from './factory';
import type { Feed, Market } from '../lib/types';
import { applyChange, snapshotToFeed } from '../lib/realtimeFeed';

const feed = (markets = [makeMarket({ id: 'a' }), makeMarket({ id: 'b' })]): Feed => ({
  generatedAt: 't0',
  version: 1,
  markets,
  breaking: [],
});

describe('applyChange', () => {
  it('upserts a changed market in place', () => {
    const out = applyChange(feed(), {
      table: 'feed_markets',
      kind: 'upsert',
      market: makeMarket({ id: 'a', oddsPct: 73 }),
    });
    expect(out.markets.find((m) => m.id === 'a')?.oddsPct).toBe(73);
    expect(out.markets).toHaveLength(2);
  });

  it('appends a brand-new market', () => {
    const out = applyChange(feed(), {
      table: 'feed_markets',
      kind: 'upsert',
      market: makeMarket({ id: 'c' }),
    });
    expect(out.markets.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('removes a deleted market', () => {
    const out = applyChange(feed(), { table: 'feed_markets', kind: 'delete', id: 'a' });
    expect(out.markets.map((m) => m.id)).toEqual(['b']);
  });

  it('updates breaking + generatedAt from feed_meta, keeping prev generatedAt when null', () => {
    const out = applyChange(feed(), { table: 'feed_meta', generatedAt: 't1', breaking: [], events: [] });
    expect(out.generatedAt).toBe('t1');
    expect(out.breaking).toEqual([]);
    const out2 = applyChange(feed(), { table: 'feed_meta', generatedAt: null, breaking: [], events: [] });
    expect(out2.generatedAt).toBe('t0');
  });
});

describe('snapshotToFeed', () => {
  it('replaces markets from the snapshot, falling back to prev when meta is null', () => {
    const out = snapshotToFeed([{ data: makeMarket({ id: 'z' }) }], null, feed());
    expect(out.markets.map((m) => m.id)).toEqual(['z']);
    expect(out.generatedAt).toBe('t0');
  });

  it('uses snapshot meta when present', () => {
    const out = snapshotToFeed([], { generated_at: 't9', breaking: [] }, feed());
    expect(out.generatedAt).toBe('t9');
    expect(out.markets).toEqual([]);
  });

  it('builds a complete feed from the snapshot even with NO prior (race-proof)', () => {
    const out = snapshotToFeed([{ data: makeMarket({ id: 'z' }) }], { generated_at: 't9', breaking: [] }, null);
    expect(out.markets.map((m) => m.id)).toEqual(['z']);
    expect(out.generatedAt).toBe('t9');
    expect(out.breaking).toEqual([]);
  });

  it('repairs legacy flag URLs in the snapshot (parity with loadFeed)', () => {
    const hero = { url: 'https://flagcdn.com/w320/us.png' } as unknown as Market['hero'];
    const out = snapshotToFeed([{ data: makeMarket({ id: 'f', hero }) }], null, null);
    expect(out.markets[0]?.hero?.url).toBe('/flags/us.svg');
  });
});
