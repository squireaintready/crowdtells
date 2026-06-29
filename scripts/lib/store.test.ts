import { describe, expect, it } from 'vitest';
import type { Market } from '../../src/lib/types';
import { config } from './config';
import type { ShapedMarket } from './shaped';
import { mergeMarkets, pruneCollisionDecisions, sortForFeed } from './store';

const NOW = '2026-06-15T12:00:00Z';

function priorMarket(over: Partial<Market>): Market {
  return {
    id: 'm',
    source: 'polymarket',
    title: 'T',
    marketUrl: 'https://polymarket.com/event/s',
    image: '',
    category: 'Politics',
    description: '',
    favored: 'Yes',
    oddsPct: 50,
    alt: null,
    divergence: null,
    movement24h: 0,
    movement7d: null,
    oddsHistory: [{ t: '2026-06-15T00:00:00Z', p: 50 }],
    volume: 100,
    volume24h: 10,
    liquidity: 10,
    openInterest: 0,
    comments: 0,
    score: 0,
    startDate: null,
    endDate: '2026-12-01T00:00:00Z',
    status: 'active',
    hook: 'hook',
    analysis: 'analysis',
    take: '',
    marketRead: '',
    crowdVsCoverage: '',
    synthesis: { consensus: [], disputed: [], perspectives: [] },
    sources: [],
    grounded: true,
    generatedAt: '2026-06-14T00:00:00Z',
    updatedAt: '2026-06-15T00:00:00Z',
    resolvedOutcome: null,
    calledCorrectly: null,
    resolvedAt: null,
    ...over,
  };
}

function shaped(over: Partial<ShapedMarket>): ShapedMarket {
  return {
    id: 'm',
    source: 'polymarket',
    title: 'T',
    marketUrl: 'https://polymarket.com/event/s',
    image: '',
    category: 'Politics',
    tags: [],
    kind: 'standing',
    description: '',
    favored: 'Yes',
    oddsPct: 50,
    alt: null,
    divergence: null,
    movement24h: 0,
    movement7d: null,
    volume: 100,
    volume24h: 10,
    liquidity: 10,
    openInterest: 0,
    comments: 0,
    score: 0,
    startDate: null,
    endDate: '2026-12-01T00:00:00Z',
    ...over,
  };
}

describe('mergeMarkets', () => {
  const prior = [
    priorMarket({ id: 'A', oddsPct: 50 }), // stays top → refreshed
    priorMarket({ id: 'B' }), // cooled out, briefed, not ended → archived (page kept)
    priorMarket({ id: 'C', endDate: '2026-06-10T00:00:00Z' }), // ended 5d ago → resolved (Past tab)
    priorMarket({ id: 'D', endDate: '2026-05-01T00:00:00Z' }), // ended 45d ago, briefed → archived
    priorMarket({ id: 'F', generatedAt: null, grounded: false }), // cooled, un-briefed → dropped
    priorMarket({ id: 'G', generatedAt: '2024-01-01T00:00:00Z' }), // briefed but past archive window → dropped
  ];
  const incoming = [shaped({ id: 'A', oddsPct: 55, volume: 999 }), shaped({ id: 'E' })];
  // Pin archiveRetainDays so this exercises the over-age-drop logic independent of the
  // production default (G is briefed >365d before NOW, so it must drop here).
  const result = mergeMarkets(prior, incoming, NOW, { ...config, archiveRetainDays: 365 });
  const byId = Object.fromEntries(result.map((m) => [m.id, m]));

  it('keeps current + resolved + archived (briefed), drops un-briefed and over-age', () => {
    expect(Object.keys(byId).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(byId.F).toBeUndefined();
    expect(byId.G).toBeUndefined();
  });

  it('archives a briefed market that cooled out of the feed (page preserved)', () => {
    expect(byId.B?.status).toBe('archived');
    expect(byId.B?.generatedAt).toBe('2026-06-14T00:00:00Z'); // briefing preserved
  });

  it('archives a briefed market past the resolved-retain window', () => {
    expect(byId.D?.status).toBe('archived');
  });

  it('refreshes live fields and appends history for existing markets', () => {
    expect(byId.A?.oddsPct).toBe(55);
    expect(byId.A?.volume).toBe(999);
    expect(byId.A?.oddsHistory).toHaveLength(2);
    expect(byId.A?.oddsHistory.at(-1)).toMatchObject({ p: 55 });
    expect(byId.A?.generatedAt).toBe('2026-06-14T00:00:00Z'); // briefing preserved
    expect(byId.A?.updatedAt).toBe(NOW);
  });

  it('creates a pending skeleton for new markets', () => {
    expect(byId.E?.generatedAt).toBeNull();
    expect(byId.E?.hook).toBe('');
    expect(byId.E?.oddsHistory).toHaveLength(1);
  });

  it('seeds a new market from backfilled history, appending the live point', () => {
    const seedHistory = [
      { t: '2026-06-13T00:00:00Z', p: 30 },
      { t: '2026-06-14T00:00:00Z', p: 40 },
    ];
    const out = mergeMarkets([], [shaped({ id: 'S', oddsPct: 44, seedHistory })], NOW, config);
    expect(out.find((m) => m.id === 'S')?.oddsHistory).toEqual([
      { t: '2026-06-13T00:00:00Z', p: 30 },
      { t: '2026-06-14T00:00:00Z', p: 40 },
      { t: NOW, p: 44 }, // live point appended so the chart ends at the current odds
    ]);
  });

  it('marks retained markets resolved', () => {
    expect(byId.C?.status).toBe('resolved');
  });
});

describe('mergeMarkets — story-field propagation (shaped → Market)', () => {
  const storyFields = {
    storyId: 'st_abcd1234',
    isStoryLead: true,
    format: 'feature' as const,
    newsFootprint: 4,
    lastLedAt: '2026-06-15T11:00:00Z',
    subSignals: [
      {
        id: 'sub',
        title: 'Strait of Hormuz traffic back to normal?',
        source: 'polymarket' as const,
        favored: 'No',
        oddsPct: 40,
        movement24h: -2,
        volume: 2_000_000,
        marketUrl: 'https://polymarket.com/event/sub',
      },
    ],
  };

  it('sets the six story fields on a NEW market skeleton', () => {
    const out = mergeMarkets([], [shaped({ id: 'NEW', ...storyFields })], NOW, config).find(
      (m) => m.id === 'NEW',
    )!;
    expect(out.storyId).toBe('st_abcd1234');
    expect(out.isStoryLead).toBe(true);
    expect(out.format).toBe('feature');
    expect(out.newsFootprint).toBe(4);
    expect(out.lastLedAt).toBe('2026-06-15T11:00:00Z');
    expect(out.subSignals?.map((s) => s.id)).toEqual(['sub']);
  });

  it('REFRESHES the story fields each run on an existing market', () => {
    // Prior carried an old story state; this run re-clusters it (new lead/format/footprint).
    const prior = priorMarket({
      id: 'E',
      storyId: 'st_old',
      format: 'explainer',
      newsFootprint: 0,
      isStoryLead: false,
    });
    const out = mergeMarkets([prior], [shaped({ id: 'E', ...storyFields })], NOW, config).find(
      (m) => m.id === 'E',
    )!;
    expect(out.storyId).toBe('st_abcd1234'); // re-clustered → new identity wins
    expect(out.format).toBe('feature');
    expect(out.newsFootprint).toBe(4);
    expect(out.isStoryLead).toBe(true);
  });

  it("uses the run's fresh lastLedAt stamp, not the prior's (liveFields wins the spread)", () => {
    // The generator stamps lastLedAt AFTER selection on THIS run's shaped market; the
    // `...prev, ...liveFields(s)` order must let that fresh stamp win, not the stale prior.
    const prior = priorMarket({ id: 'E', lastLedAt: '2026-01-01T00:00:00Z' });
    const out = mergeMarkets(
      [prior],
      [shaped({ id: 'E', lastLedAt: '2026-06-15T11:00:00Z' })],
      NOW,
      config,
    ).find((m) => m.id === 'E')!;
    expect(out.lastLedAt).toBe('2026-06-15T11:00:00Z');
  });
});

describe('oddsDaily — durable daily belief series', () => {
  it('seeds from prior high-res history on first sight, then freezes the current day', () => {
    // prev has no oddsDaily yet (migration path); its oddsHistory carries one point on NOW's day.
    const out = mergeMarkets(
      [priorMarket({ id: 'A', oddsHistory: [{ t: '2026-06-15T00:00:00Z', p: 50 }] })],
      [shaped({ id: 'A', oddsPct: 55 })],
      NOW, // 2026-06-15T12:00 — same UTC day as the seed point
      config,
    );
    // The day is already captured (at p:50); the live 55 does NOT add a second same-day point.
    expect(out.find((m) => m.id === 'A')?.oddsDaily).toEqual([{ t: '2026-06-15T00:00:00Z', p: 50 }]);
  });

  it('appends one point when the UTC day rolls over, and ignores same-day re-runs', () => {
    const day1 = mergeMarkets(
      [priorMarket({ id: 'A', oddsHistory: [{ t: '2026-06-15T00:00:00Z', p: 50 }] })],
      [shaped({ id: 'A', oddsPct: 55 })],
      '2026-06-15T12:00:00Z',
      config,
    ).find((m) => m.id === 'A')!;
    // Same-day re-run with moved odds → daily series unchanged (one point per day).
    const sameDay = mergeMarkets([day1], [shaped({ id: 'A', oddsPct: 80 })], '2026-06-15T20:00:00Z', config).find(
      (m) => m.id === 'A',
    )!;
    expect(sameDay.oddsDaily).toEqual([{ t: '2026-06-15T00:00:00Z', p: 50 }]);
    // Next UTC day → one fresh frozen point (the first reading of that day).
    const day2 = mergeMarkets([sameDay], [shaped({ id: 'A', oddsPct: 70 })], '2026-06-16T09:00:00Z', config).find(
      (m) => m.id === 'A',
    )!;
    expect(day2.oddsDaily).toEqual([
      { t: '2026-06-15T00:00:00Z', p: 50 },
      { t: '2026-06-16T09:00:00Z', p: 70 },
    ]);
  });

  it('seeds a new market’s daily series from backfilled history (≤1 point per day, last wins)', () => {
    const seedHistory = [
      { t: '2026-06-13T00:00:00Z', p: 30 },
      { t: '2026-06-13T18:00:00Z', p: 33 }, // same day as above → collapses to one
      { t: '2026-06-14T00:00:00Z', p: 40 },
    ];
    const out = mergeMarkets([], [shaped({ id: 'S', oddsPct: 44, seedHistory })], NOW, config);
    expect(out.find((m) => m.id === 'S')?.oddsDaily).toEqual([
      { t: '2026-06-13T18:00:00Z', p: 33 }, // last reading of 06-13 wins
      { t: '2026-06-14T00:00:00Z', p: 40 },
      { t: NOW, p: 44 }, // the live point appended in skeleton()
    ]);
  });

  it('caps the daily series at oddsDailyMax (newest days kept)', () => {
    const out = mergeMarkets(
      [
        priorMarket({
          id: 'A',
          oddsHistory: [
            { t: '2026-06-13T00:00:00Z', p: 10 },
            { t: '2026-06-14T00:00:00Z', p: 20 },
            { t: '2026-06-15T00:00:00Z', p: 30 },
          ],
        }),
      ],
      [shaped({ id: 'A', oddsPct: 55 })],
      NOW,
      { ...config, oddsDailyMax: 2 },
    );
    expect(out.find((m) => m.id === 'A')?.oddsDaily).toEqual([
      { t: '2026-06-14T00:00:00Z', p: 20 },
      { t: '2026-06-15T00:00:00Z', p: 30 },
    ]);
  });
});

describe('sortForFeed', () => {
  it('orders active-by-volume before resolved-by-end-date', () => {
    const out = sortForFeed([
      priorMarket({ id: 'low', volume: 1 }),
      priorMarket({ id: 'res', status: 'resolved', endDate: '2026-06-01T00:00:00Z' }),
      priorMarket({ id: 'high', volume: 9 }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['high', 'low', 'res']);
  });
});

describe('pruneCollisionDecisions', () => {
  it('keeps pairs whose both ids are still kept (incl. negatives), drops aged-out ones', () => {
    const live = new Set(['kalshi:A', 'polymarket:B', 'kalshi:C']);
    const pruned = pruneCollisionDecisions(
      {
        'kalshi:A|polymarket:B': true, // both live → keep
        'kalshi:A|kalshi:C': false, // both live, negative → keep (so we never re-ask)
        'kalshi:A|polymarket:GONE': true, // one aged out → drop
        'polymarket:X|polymarket:Y': false, // both aged out → drop
      },
      live,
    );
    expect(pruned).toEqual({ 'kalshi:A|polymarket:B': true, 'kalshi:A|kalshi:C': false });
  });

  it('is a no-op on an empty cache', () => {
    expect(pruneCollisionDecisions({}, new Set(['kalshi:A']))).toEqual({});
  });

  it('prunes story-grouping verdicts (story: prefix) on their EMBEDDED ids — keep live, drop aged-out', () => {
    const live = new Set(['kalshi:A', 'polymarket:X']);
    const pruned = pruneCollisionDecisions(
      {
        // A story verdict whose markets have BOTH aged out — must be DROPPED (the prefix is
        // stripped, so it prunes on its embedded ids like any other pair and stays bounded).
        'story:kalshi:GONE|polymarket:ALSOGONE': true,
        // A live-pair story verdict survives so we never re-ask Groq for a pair still on the board.
        'story:kalshi:A|polymarket:X': false,
        'kalshi:A|polymarket:GONE': true, // a NON-story pair, one aged out → still pruned
      },
      live,
    );
    expect(pruned).toEqual({ 'story:kalshi:A|polymarket:X': false });
  });
});
