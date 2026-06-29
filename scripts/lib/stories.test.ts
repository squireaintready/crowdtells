import { describe, expect, it } from 'vitest';
import {
  propShape,
  collapseProps,
  clusterMarkets,
  pickLead,
  composeSubSignals,
  assignFormat,
  storyIdFor,
  distinctive,
} from './stories';
import type { ShapedMarket } from './shaped';

/** Minimal ShapedMarket for tests — only the fields the story layer reads matter. */
function sm(over: Partial<ShapedMarket> & { id: string; title: string }): ShapedMarket {
  return {
    source: 'polymarket',
    marketUrl: `https://polymarket.com/event/${over.id}`,
    image: '',
    category: 'Politics',
    description: '',
    tags: [],
    kind: 'standing',
    favored: 'Yes',
    oddsPct: 50,
    alt: null,
    divergence: null,
    movement24h: null,
    movement7d: null,
    volume: 1000,
    volume24h: 0,
    liquidity: 0,
    openInterest: 0,
    comments: 0,
    score: 0,
    startDate: null,
    endDate: null,
    ...over,
  };
}

const NOW = Date.parse('2026-06-24T00:00:00Z');

// The ten live "Elon Musk # tweets <range>, 2026?" titles (real feed) → one series.
const ELON_TITLES = [
  'Elon Musk # tweets June 22 - June 24, 2026?',
  'Elon Musk # tweets June 19 - June 26, 2026?',
  'Elon Musk # tweets June 23 - June 30, 2026?',
  'Elon Musk # tweets June 26 - July 3, 2026?',
  'Elon Musk # tweets June 16 - June 23, 2026?',
];

describe('propShape — sub-event', () => {
  it('detects a Polymarket child contract and keys it to the parent match', () => {
    const r = propShape('Switzerland vs. Canada - Total Corners', []);
    expect(r).toEqual({ shape: 'sub-event', key: 'switzerland vs. canada' });
  });
  it('handles other known suffixes and over/under rungs', () => {
    expect(propShape('France vs. Iraq - More Markets', [])?.key).toBe('france vs. iraq');
    expect(propShape('Austria vs. Jordan - Exact Score', [])?.shape).toBe('sub-event');
    expect(propShape('Spurs vs. Arsenal - Over 2.5', [])).toEqual({
      shape: 'sub-event',
      key: 'spurs vs. arsenal',
    });
  });
  it('does NOT treat a normal hyphenated title as a sub-event', () => {
    expect(propShape('US-Iran Final Nuclear Deal by…?', [])).toBeNull();
    expect(propShape('Trump - the comeback', [])).toBeNull(); // unknown suffix
  });
});

describe('propShape — recurring-series', () => {
  it('collapses the date-stamped Elon-tweet series to ONE stem', () => {
    const shapes = ELON_TITLES.map((t) => propShape(t, ELON_TITLES));
    expect(shapes.every((s) => s?.shape === 'recurring-series')).toBe(true);
    const keys = new Set(shapes.map((s) => s!.key));
    expect(keys.size).toBe(1); // all five share one masked stem
    expect([...keys][0]).toContain('elon musk');
    expect([...keys][0]).toContain('<daterange>');
  });
  it('requires a repeating stem — a lone date-stamped title is a normal market', () => {
    const lone = 'Elon Musk # tweets June 22 - June 24, 2026?';
    expect(propShape(lone, [lone, 'Unrelated market about tariffs'])).toBeNull();
  });
});

describe('propShape — daily-price', () => {
  it('detects the daily Oil Price series', () => {
    const r = propShape('Oil Price (WTI) on Jun 23, 2026?', []);
    expect(r?.shape).toBe('daily-price');
    expect(r?.key.startsWith('price:')).toBe(true);
  });
  it('detects an end-of-period hit-$X level prop', () => {
    expect(propShape('Will Crude Oil (CL) hit $70 by end of June?', [])?.shape).toBe('daily-price');
  });
  it('folds the daily highest-temperature props (on <date>)', () => {
    expect(propShape('Highest temperature in LA on Jun 23, 2026?', [])?.shape).toBe('daily-price');
  });
  it('is conservative — a standing threshold market is not a daily price', () => {
    // No "on <date>" and no period word → not folded as a daily rung.
    expect(propShape('Will Bitcoin reach a new all-time high this cycle?', [])).toBeNull();
  });
  it('masks the date/level out of the key so same-subject rungs share it', () => {
    const a = propShape('Oil Price (WTI) on Jun 23, 2026?', [])!.key;
    const b = propShape('Oil Price (WTI) on Jun 24, 2026?', [])!.key;
    expect(a).toBe(b);
  });
});

describe('collapseProps', () => {
  it('keeps the highest-volume representative and folds the rest', () => {
    const markets = ELON_TITLES.map((t, i) =>
      sm({ id: `e${i}`, title: t, category: 'Culture', volume: (i + 1) * 1000 }),
    );
    const { survivors, folded } = collapseProps(markets);
    // One survivor for the whole series, four folded under it.
    const elonSurvivors = survivors.filter((m) => m.title.includes('Elon Musk'));
    expect(elonSurvivors).toHaveLength(1);
    const rep = elonSurvivors[0]!;
    expect(rep.volume).toBe(5000); // the max-volume member (e4)
    expect(folded.get(rep.id)).toHaveLength(4);
    expect(folded.has(rep.id)).toBe(true);
  });
  it('passes normal markets through untouched and groups distinct prop families apart', () => {
    const markets = [
      sm({ id: 'n1', title: 'Will the Fed cut rates in September?', volume: 9000 }),
      sm({ id: 'c1', title: 'Switzerland vs. Canada - Total Corners', volume: 100 }),
      sm({ id: 'c2', title: 'Switzerland vs. Canada - More Markets', volume: 300 }),
      sm({ id: 'o1', title: 'Oil Price (WTI) on Jun 23, 2026?', volume: 50 }),
      sm({ id: 'o2', title: 'Oil Price (WTI) on Jun 24, 2026?', volume: 80 }),
    ];
    const { survivors, folded } = collapseProps(markets);
    expect(survivors.some((m) => m.id === 'n1')).toBe(true); // normal market survives
    // Each prop family collapses to its highest-volume rep.
    expect(folded.get('c2')).toEqual([expect.objectContaining({ id: 'c1' })]);
    expect(folded.get('o2')).toEqual([expect.objectContaining({ id: 'o1' })]);
    // Survivors deterministically ordered by volume desc.
    const vols = survivors.map((m) => m.volume);
    expect([...vols]).toEqual([...vols].sort((a, b) => b - a));
  });
});

describe('clusterMarkets — direct link', () => {
  it('unions two markets sharing >=2 distinctive tokens (no adjudicator needed)', async () => {
    const markets = [
      sm({ id: 'h1', title: 'Strait of Hormuz traffic returns to normal by July 31?' }),
      sm({ id: 'h2', title: 'When will traffic at the Strait of Hormuz return to normal?' }),
      sm({ id: 'z1', title: 'Will the Fed cut rates in September?' }),
    ];
    const groups = await clusterMarkets(markets, { nowMs: NOW });
    const hormuz = groups.find((g) => g.members.length === 2)!;
    expect(hormuz.members.map((m) => m.id).sort()).toEqual(['h1', 'h2']);
    expect(hormuz.sharedTokens).toContain('hormuz');
    expect(hormuz.sharedTokens).toContain('strait');
    // The Fed market stands alone.
    expect(groups.filter((g) => g.members.length === 1).some((g) => g.lead.id === 'z1')).toBe(true);
  });
});

describe('clusterMarkets — negatives', () => {
  it('does NOT merge two unrelated markets sharing only a generic token', async () => {
    // Both contain "june" (a calendar token, stripped as GENERIC) and nothing else.
    const markets = [
      sm({ id: 'a', title: 'Who wins the June mayoral election in Boston?' }),
      sm({ id: 'b', title: 'Will it rain in Denver in June?' }),
    ];
    const groups = await clusterMarkets(markets, { nowMs: NOW });
    expect(groups).toHaveLength(2); // each its own story
    expect(groups.every((g) => g.members.length === 1)).toBe(true);
  });
  it('never clusters sports markets, even when titles overlap heavily', async () => {
    const markets = [
      sm({ id: 's1', title: 'France vs. Iraq', category: 'Sports' }),
      sm({ id: 's2', title: 'France vs. Senegal', category: 'Sports' }),
    ];
    const groups = await clusterMarkets(markets, { nowMs: NOW });
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.members.length === 1)).toBe(true);
  });
});

describe('clusterMarkets — borderline (1 shared token)', () => {
  const borderline = () => [
    sm({ id: 'i1', title: 'US-Iran Final Nuclear Deal by…?' }),
    sm({ id: 'i2', title: 'Next round of US-Iran peace talks by...?' }),
  ];
  it('WITHOUT an adjudicator leaves a 1-token pair split (conservative default)', async () => {
    const groups = await clusterMarkets(borderline(), { nowMs: NOW });
    expect(groups).toHaveLength(2); // share only "iran" → not fused
  });
  it('WITH a stub adjudicator returning true, unions the borderline pair', async () => {
    let calls = 0;
    const groups = await clusterMarkets(borderline(), {
      nowMs: NOW,
      adjudicate: async () => {
        calls++;
        return true;
      },
    });
    expect(calls).toBe(1);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.id).sort()).toEqual(['i1', 'i2']);
  });
  it('respects adjudicateMax (no calls past the cap)', async () => {
    let calls = 0;
    await clusterMarkets(borderline(), {
      nowMs: NOW,
      adjudicateMax: 0,
      adjudicate: async () => {
        calls++;
        return true;
      },
    });
    expect(calls).toBe(0);
  });
});

describe('clusterMarkets — coverage bridge', () => {
  it('makes a 0-token pair a candidate only when both hit the SAME corroborated cluster', async () => {
    const markets = [
      sm({ id: 'd1', title: 'US-Iran Final Nuclear Deal by…?' }), // iran, nuclear, final
      sm({ id: 'd2', title: 'Strait of Hormuz traffic returns to normal by July 31?' }), // hormuz, strait...
    ];
    // A news cluster that strongly matches BOTH (>=2 tokens each), with 2+ outlets.
    const newsClusters = [
      {
        tokens: new Set(['iran', 'nuclear', 'hormuz', 'strait', 'tehran']),
        outlets: ['reuters.com', 'apnews.com'],
      },
    ];
    let bridged = false;
    const groups = await clusterMarkets(markets, {
      nowMs: NOW,
      newsClusters,
      adjudicate: async () => {
        bridged = true;
        return true;
      },
    });
    expect(bridged).toBe(true); // the bridge produced a candidate the adjudicator confirmed
    expect(groups).toHaveLength(1);
  });
  it('ignores an UNcorroborated (single-outlet) cluster as a bridge', async () => {
    const markets = [
      sm({ id: 'd1', title: 'US-Iran Final Nuclear Deal by…?' }),
      sm({ id: 'd2', title: 'Strait of Hormuz traffic returns to normal by July 31?' }),
    ];
    let called = false;
    const groups = await clusterMarkets(markets, {
      nowMs: NOW,
      newsClusters: [{ tokens: new Set(['iran', 'nuclear', 'hormuz', 'strait']), outlets: ['x.com'] }],
      adjudicate: async () => {
        called = true;
        return true;
      },
    });
    expect(called).toBe(false); // single-outlet cluster is not a trusted bridge
    expect(groups).toHaveLength(2);
  });
});

describe('pickLead', () => {
  it('picks the broadest facet (fewest distinctive tokens), tie-break latest endDate', () => {
    const members = [
      sm({
        id: 'broad',
        title: 'US-Iran nuclear deal?',
        endDate: '2026-08-31T00:00:00Z',
      }),
      sm({
        id: 'narrow',
        title: 'Will 20+ ships transit the Strait of Hormuz on any day by June 30?',
        endDate: '2026-06-30T00:00:00Z',
        volume: 9_000_000, // bigger volume must NOT win over breadth
      }),
    ];
    expect(pickLead(members, NOW).id).toBe('broad');
  });
  it('among equally-broad facets, the latest end date (undated = far future) leads', () => {
    const members = [
      sm({ id: 'soon', title: 'Aurora alpha beta?', endDate: '2026-07-01T00:00:00Z' }),
      sm({ id: 'open', title: 'Aurora gamma delta?', endDate: null }), // undated → most durable
    ];
    expect(pickLead(members, NOW).id).toBe('open');
  });
  it('is deterministic on full ties (volume then id)', () => {
    const a = sm({ id: 'aaa', title: 'Zeta eta theta?', volume: 500 });
    const b = sm({ id: 'bbb', title: 'Iota kappa lambda?', volume: 500 });
    expect(pickLead([a, b], NOW).id).toBe('aaa'); // equal breadth+date+volume → id asc
  });
});

describe('composeSubSignals', () => {
  it('excludes the lead, sorts by volume desc, and caps at 8', () => {
    const lead = sm({ id: 'lead', title: 'Lead question?' });
    const members = [
      lead,
      ...Array.from({ length: 10 }, (_, i) =>
        sm({ id: `s${i}`, title: `Facet ${i}?`, volume: (i + 1) * 100, oddsPct: 40 + i }),
      ),
    ];
    const sigs = composeSubSignals(lead, members);
    expect(sigs).toHaveLength(8); // capped
    expect(sigs.some((s) => s.id === 'lead')).toBe(false); // lead excluded
    // Volume-descending.
    const vols = sigs.map((s) => s.volume);
    expect([...vols]).toEqual([...vols].sort((a, b) => b - a));
    // Carries the render fields.
    expect(sigs[0]).toMatchObject({ source: 'polymarket', favored: 'Yes' });
  });
});

describe('assignFormat', () => {
  const base = {
    isProp: false,
    isDecided: false,
    hasPriorBriefing: false,
    advancedSinceLast: false,
    newsFootprint: 0,
  };
  it('covers the truth table', () => {
    expect(assignFormat({ ...base, isProp: true })).toBe('digest'); // prop wins over all
    expect(assignFormat({ ...base, isDecided: true })).toBe('result');
    expect(assignFormat({ ...base, newsFootprint: 1 })).toBe('explainer'); // new + thin coverage
    expect(assignFormat({ ...base, newsFootprint: 2 })).toBe('feature'); // new + well covered
    expect(assignFormat({ ...base, hasPriorBriefing: true, advancedSinceLast: true })).toBe('update');
    expect(assignFormat({ ...base, hasPriorBriefing: true })).toBe('feature'); // evergreen
  });
  it('prop beats decided beats lifecycle', () => {
    expect(assignFormat({ ...base, isProp: true, isDecided: true, newsFootprint: 9 })).toBe('digest');
    expect(assignFormat({ ...base, isDecided: true, advancedSinceLast: true })).toBe('result');
  });
});

describe('storyIdFor', () => {
  it('is stable and order-independent', () => {
    expect(storyIdFor(['iran', 'nuclear'])).toBe(storyIdFor(['nuclear', 'iran']));
    expect(storyIdFor(['iran', 'nuclear'])).toMatch(/^st_[0-9a-f]{8}$/);
  });
  it('differs for different token sets and is deterministic across calls', () => {
    expect(storyIdFor(['iran', 'nuclear'])).not.toBe(storyIdFor(['hormuz', 'strait']));
    expect(storyIdFor(['a'])).toBe(storyIdFor(['a']));
    // The empty token set hashes the empty string → the FNV-1a offset basis; the exact
    // value doesn't matter, only that it's a well-formed, STABLE sentinel across runs.
    expect(storyIdFor([])).toMatch(/^st_[0-9a-f]{8}$/);
    expect(storyIdFor([])).toBe(storyIdFor([]));
  });
});

describe('distinctive (clustering token unit)', () => {
  it('drops calendar/scaffolding tokens but keeps entities and short known codes', () => {
    const t = distinctive('Will Bitcoin (BTC) top $150k by June 2026?');
    expect(t.has('btc')).toBe(true); // known short entity (bitcoin→btc alias)
    expect(t.has('june')).toBe(false); // calendar token stripped
    expect(t.has('2026')).toBe(false);
    expect(t.has('will')).toBe(false); // scaffolding
  });
});
