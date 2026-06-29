import { describe, expect, it, vi } from 'vitest';
import { makeMarket } from '../../src/test/factory';
import type { Feed, Market } from '../../src/lib/types';
import {
  type FeedMarketRow,
  type FeedMetaRow,
  canonical,
  departedIds,
  feedToRows,
  inFilter,
  pickChanged,
  signalOf,
  upsertMeta,
} from './feedSync';
import { restUpsert } from './admin';

// Only upsertMeta touches the REST layer here; the rest of the file tests pure
// helpers, so a blanket admin mock is safe.
vi.mock('./admin', () => ({
  restUpsert: vi.fn(),
}));

const feed = (over: Partial<Feed> = {}): Feed => ({
  generatedAt: '2026-06-17T12:00:00Z',
  version: 1,
  markets: [],
  ...over,
});

describe('feedToRows', () => {
  it('maps each market to a row with the full Market object in `data`', () => {
    const m = makeMarket({ id: 'kalshi:ABC', status: 'resolved', score: 3.5, category: 'Crypto' });
    const { markets } = feedToRows(feed({ markets: [m] }));
    expect(markets).toHaveLength(1);
    expect(markets[0]).toEqual({
      id: 'kalshi:ABC',
      status: 'resolved',
      score: 3.5,
      category: 'Crypto',
      updated_at: m.updatedAt,
      data: m,
    });
    // The JSONB payload IS the full client Market (lossless mirror).
    expect(markets[0]?.data).toBe(m);
  });

  it('builds a singleton meta row carrying generatedAt + the breaking + events strips', () => {
    const breaking = [{ topic: 'Politics', outlets: ['bbc.com'] }] as unknown as Feed['breaking'];
    const events = [{ id: 'espn:1', title: 'A @ B' }] as unknown as Feed['events'];
    const { meta } = feedToRows(feed({ breaking, events }));
    expect(meta).toEqual({
      id: 'singleton',
      generated_at: '2026-06-17T12:00:00Z',
      breaking,
      events,
    });
  });

  it('defaults breaking + events to [] when the feed omits them', () => {
    expect(feedToRows(feed()).meta.breaking).toEqual([]);
    expect(feedToRows(feed()).meta.events).toEqual([]);
  });
});

describe('upsertMeta (events-column resilience)', () => {
  const meta: FeedMetaRow = {
    id: 'singleton',
    generated_at: '2026-06-17T12:00:00Z',
    breaking: [{ x: 1 }],
    events: [{ y: 2 }],
  };
  const ctx = {} as Parameters<typeof upsertMeta>[0];
  const mockUpsert = vi.mocked(restUpsert);

  it('upserts the full row when the events column exists', async () => {
    mockUpsert.mockReset().mockResolvedValue(undefined);
    await upsertMeta(ctx, meta);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(ctx, 'feed_meta', [meta]);
  });

  it('retries WITHOUT events when the column is missing (pre-migration)', async () => {
    mockUpsert
      .mockReset()
      .mockRejectedValueOnce(new Error('column "events" does not exist'))
      .mockResolvedValueOnce(undefined);
    await upsertMeta(ctx, meta);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    const second = mockUpsert.mock.calls[1]![2] as Record<string, unknown>[];
    expect(second[0]).not.toHaveProperty('events');
    expect(second[0]).toHaveProperty('breaking');
  });

  it('surfaces the original error when even the slimmed upsert fails', async () => {
    const original = new Error('genuine outage');
    mockUpsert.mockReset().mockRejectedValue(original);
    await expect(upsertMeta(ctx, meta)).rejects.toBe(original);
  });

  it('emits identical SERIALIZED keys across rows even when a market lacks a category (PGRST102 guard)', () => {
    const withCat = makeMarket({ id: 'a', category: 'Politics' });
    const noCat = makeMarket({ id: 'b', category: undefined as unknown as string });
    const { markets } = feedToRows(feed({ markets: [withCat, noCat] }));
    // PostgREST bulk upsert requires every row object to serialize to the same keys.
    const keys = (o: object) => Object.keys(JSON.parse(JSON.stringify(o))).sort();
    expect(keys(markets[0]!)).toEqual(keys(markets[1]!));
    expect(markets[1]!.category).toBeNull();
  });
});

describe('inFilter / departedIds', () => {
  it('inFilter returns null for an empty set (nothing to prune)', () => {
    expect(inFilter([])).toBeNull();
  });

  it('inFilter builds an encoded in.() filter that survives ids with colons', () => {
    expect(inFilter(['513', 'kalshi:ABC'])).toBe('id=in.(%22513%22,%22kalshi%3AABC%22)');
  });

  it('departedIds returns prior ids no longer in the live feed', () => {
    const current = [{ id: 'b' }, { id: 'c' }] as FeedMarketRow[];
    expect(departedIds(['a', 'b'], current)).toEqual(['a']);
  });
});

describe('signalOf', () => {
  it('drops noisy timestamp/history fields', () => {
    expect(signalOf({ a: 1, updatedAt: 't', checkedAt: 'u', oddsHistory: [1, 2] })).toEqual({ a: 1 });
  });
});

describe('canonical', () => {
  it('is independent of key order', () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });

  it('drops undefined-valued keys to match JSONB', () => {
    expect(canonical({ a: 1, b: undefined })).toBe(canonical({ a: 1 }));
  });

  it('handles nested objects/arrays stably', () => {
    expect(canonical({ x: [{ p: 1, q: 2 }] })).toBe(canonical({ x: [{ q: 2, p: 1 }] }));
  });
});

describe('pickChanged', () => {
  const row = (id: string, data: object): FeedMarketRow => ({
    id,
    status: 'active',
    score: 1,
    category: 'X',
    updated_at: 't',
    data: data as Market,
  });

  it('keeps new + changed markets, skips unchanged (ignoring key order)', () => {
    const rows = [row('a', { x: 1, y: 2 }), row('b', { x: 2 }), row('c', { x: 3 })];
    const existing = new Map<string, unknown>([
      ['a', { y: 2, x: 1 }], // unchanged (reordered keys)
      ['b', { x: 99 }], // changed
      // 'c' is new
    ]);
    expect(pickChanged(rows, existing).map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('returns nothing when all rows already match', () => {
    expect(pickChanged([row('a', { x: 1 })], new Map([['a', { x: 1 }]]))).toEqual([]);
  });

  it('skips a market whose only change is noisy (updatedAt/oddsHistory) — flat odds', () => {
    const rows = [row('a', { oddsPct: 50, updatedAt: 't2', oddsHistory: [1, 2, 3] })];
    const existing = new Map<string, unknown>([
      ['a', { oddsPct: 50, updatedAt: 't1', oddsHistory: [1, 2] }],
    ]);
    expect(pickChanged(rows, existing)).toEqual([]);
  });

  it('detects a real reader-visible change (oddsPct moved)', () => {
    const rows = [row('a', { oddsPct: 60, updatedAt: 't2' })];
    const existing = new Map<string, unknown>([['a', { oddsPct: 50, updatedAt: 't1' }]]);
    expect(pickChanged(rows, existing).map((r) => r.id)).toEqual(['a']);
  });
});
