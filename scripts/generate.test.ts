import { describe, expect, it } from 'vitest';
import {
  applyFallback,
  assembleStoryLeads,
  attachRelated,
  borderlinePairs,
  broadenQuery,
  crossMarketGap,
  developingContextLines,
  eventContextLines,
  footprintFor,
  mergeCoverage,
  newsChanged,
  newsQuery,
  normalizeTitle,
  oddsTrajectory,
  pendingResults,
  pickCandidates,
  relevantHeadlines,
  sameEventContainment,
  sameQuestion,
  snapshotRevision,
  stampBriefing,
  swingSince,
} from './generate';
import type { ShapedMarket } from './lib/shaped';
import type { StoryGroup } from './lib/stories';
import type { NormArticle } from './lib/breaking';
import type { Headline } from './lib/news';
import type { BreakingItem, EventItem, Market, Source } from '../src/lib/types';
import { makeMarket } from '../src/test/factory';

const sq = (
  source: 'polymarket' | 'kalshi',
  title: string,
  endDate = '2026-07-01T00:00:00Z',
  extra: Partial<ShapedMarket> = {},
) => ({ source, title, endDate, volume: 1000, ...extra }) as unknown as ShapedMarket;

describe('mergeCoverage — durable coverage union', () => {
  const src = (over: Partial<Source>): Source => ({ domain: 'x.com', url: 'https://x.com', ...over });

  it('dedupes by article and keeps the EARLIEST publishedAt (first-landed wins)', () => {
    const prev = [src({ articleUrl: 'a1', publishedAt: '2026-06-10T00:00:00Z', title: 'Old' })];
    const fresh = [src({ articleUrl: 'a1', publishedAt: '2026-06-12T00:00:00Z', title: 'Re-cited' })];
    const out = mergeCoverage(prev, fresh, 40);
    expect(out).toHaveLength(1);
    expect(out[0]!.publishedAt).toBe('2026-06-10T00:00:00Z');
  });

  it('accumulates distinct articles across regenerations, sorted by publish time', () => {
    const run1 = mergeCoverage([], [src({ articleUrl: 'a1', publishedAt: '2026-06-10T00:00:00Z' })], 40);
    const run2 = mergeCoverage(run1, [src({ articleUrl: 'a2', publishedAt: '2026-06-12T00:00:00Z' })], 40);
    expect(run2.map((s) => s.articleUrl)).toEqual(['a1', 'a2']);
  });

  it('caps to the most recent `max`, dropping the oldest ticks', () => {
    const prev = [
      src({ articleUrl: 'a1', publishedAt: '2026-06-10T00:00:00Z' }),
      src({ articleUrl: 'a2', publishedAt: '2026-06-11T00:00:00Z' }),
    ];
    const fresh = [src({ articleUrl: 'a3', publishedAt: '2026-06-12T00:00:00Z' })];
    expect(mergeCoverage(prev, fresh, 2).map((s) => s.articleUrl)).toEqual(['a2', 'a3']);
  });

  it('dedupes by url when no articleUrl is present', () => {
    const prev = [src({ url: 'https://r.com/story', title: 'A' })];
    const fresh = [src({ url: 'https://r.com/story', title: 'A (updated)' })];
    const out = mergeCoverage(prev, fresh, 40);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe('A (updated)');
  });
});

const NOW = Date.parse('2026-06-15T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const synth = { consensus: [], disputed: [], perspectives: [] };

describe('crossMarketGap', () => {
  it('compares the Yes probability for binary Yes/No markets', () => {
    expect(crossMarketGap('Yes', 68, 'No', 39)).toBe(7); // 68 vs (100-39)=61
  });
  it('compares directly when both name the SAME favored outcome', () => {
    expect(crossMarketGap('Argentina', 71, 'Argentina', 66)).toBe(5);
  });
  it('returns null for different outcomes (never manufacture a phantom gap)', () => {
    expect(crossMarketGap('Argentina', 71, 'Brazil', 60)).toBeNull();
    expect(crossMarketGap('Yes', 70, 'Spain', 20)).toBeNull();
  });
});

describe('normalizeTitle', () => {
  it('collapses Polymarket sub-event variants into one event key', () => {
    const base = normalizeTitle('France vs. Senegal');
    expect(normalizeTitle('France vs. Senegal - More Markets')).toBe(base);
    expect(normalizeTitle('France vs. Senegal - Exact Score')).toBe(base);
  });
  it('keeps genuinely different events distinct', () => {
    expect(normalizeTitle('France vs. Senegal')).not.toBe(normalizeTitle('Iraq vs. Norway'));
  });
});

describe('sameQuestion', () => {
  it('rejects the proven false positive (next PM of Israel vs Romania)', () => {
    expect(
      sameQuestion(
        sq('polymarket', 'Who will be the next Prime Minister of Israel after the next election?'),
        sq('kalshi', 'Who will be the next new Prime Minister of Romania?'),
      ),
    ).toBe(false);
  });
  it('matches a true cross-platform paraphrase in the same window', () => {
    expect(
      sameQuestion(
        sq('polymarket', 'Who will win the 2026 World Cup?'),
        sq('kalshi', 'Winner of the 2026 World Cup'),
      ),
    ).toBe(true);
  });
  it('never matches two markets from the same platform', () => {
    expect(
      sameQuestion(
        sq('polymarket', 'Who will win the 2026 World Cup?'),
        sq('polymarket', 'Winner of the 2026 World Cup'),
      ),
    ).toBe(false);
  });
  it('rejects the same question resolving in very different windows', () => {
    expect(
      sameQuestion(
        sq('polymarket', 'Who will win the 2026 World Cup?', '2026-07-01T00:00:00Z'),
        sq('kalshi', 'Winner of the 2026 World Cup', '2027-07-01T00:00:00Z'),
      ),
    ).toBe(false);
  });
  it('does NOT pair different-party questions that only share a year', () => {
    expect(
      sameQuestion(
        sq('polymarket', 'Republican Presidential Nominee 2028', '2028-11-01T00:00:00Z'),
        sq('kalshi', '2028 Democratic presidential nominee', '2028-11-01T00:00:00Z'),
      ),
    ).toBe(false); // "2028" alone is not a distinctive entity
  });
  it('pairs the same question across platforms via alias normalization', () => {
    // "Jul" ↔ "July" only collapse after token aliasing.
    expect(
      sameQuestion(
        sq('polymarket', 'Fed decision in July 2026?', '2026-07-30T00:00:00Z'),
        sq('kalshi', 'Fed decision in Jul 2026?', '2026-07-30T00:00:00Z'),
      ),
    ).toBe(true);
  });
  it('folds the favored name in: matches when the entity lives in favored on one side', () => {
    // Titles alone (Jaccard 0.4) miss this; the shared "Real Madrid" pushes it over.
    expect(
      sameQuestion(
        sq('kalshi', 'Champions League winner', '2026-06-01T00:00:00Z', {
          favored: 'Real Madrid',
          category: 'Sports',
        }),
        sq('polymarket', 'Who wins the Champions League?', '2026-06-05T00:00:00Z', {
          favored: 'Real Madrid',
          category: 'Sports',
        }),
      ),
    ).toBe(true);
  });
  it('does not let a generic favored (Yes/No) become the shared distinctive token', () => {
    expect(
      sameQuestion(
        sq('kalshi', 'Will it rain in Denver tomorrow?', '2026-06-01T00:00:00Z', {
          favored: 'Yes',
        }),
        sq('polymarket', 'Will the Senate pass the bill?', '2026-06-01T00:00:00Z', {
          favored: 'Yes',
        }),
      ),
    ).toBe(false);
  });
  it('guards categories: a sports market never merges with a non-sports one', () => {
    // Identical titles that would otherwise match — blocked by the category guard.
    expect(
      sameQuestion(
        sq('kalshi', 'Will the Eagles win?', '2026-06-01T00:00:00Z', {
          favored: 'Eagles',
          category: 'Sports',
        }),
        sq('polymarket', 'Will the Eagles win?', '2026-06-01T00:00:00Z', {
          favored: 'Eagles',
          category: 'Politics',
        }),
      ),
    ).toBe(false);
  });
});

describe('sport disambiguation — no same-city / cross-sport false merges', () => {
  it('does NOT fuse two same-city teams from different sports (Miami Heat ≠ Miami Marlins)', () => {
    // The reported bug: a shared "miami" carried these over the 0.45 Jaccard gate.
    expect(
      sameQuestion(
        sq('polymarket', 'Will the Miami Heat win?', '2026-07-01T00:00:00Z', {
          favored: 'Heat',
          category: 'Sports',
        }),
        sq('kalshi', 'Will the Miami Marlins win?', '2026-07-01T00:00:00Z', {
          favored: 'Marlins',
          category: 'Sports',
        }),
      ),
    ).toBe(false);
  });

  it('still merges the SAME team across platforms (no over-blocking)', () => {
    expect(
      sameQuestion(
        sq('kalshi', 'Will the Eagles win?', '2026-07-01T00:00:00Z', {
          favored: 'Eagles',
          category: 'Sports',
        }),
        sq('polymarket', 'Will the Eagles win?', '2026-07-01T00:00:00Z', {
          favored: 'Eagles',
          category: 'Sports',
        }),
      ),
    ).toBe(true);
  });

  it('keeps a place-only cross-team pair away from the LLM tier (Heat vs Marlins)', () => {
    const heat = sq('polymarket', 'Miami Heat', '2026-07-01T00:00:00Z', {
      id: 'h',
      favored: 'Yes',
      category: 'Sports',
    });
    const marlins = sq('kalshi', 'Miami Marlins', '2026-07-01T00:00:00Z', {
      id: 'm',
      favored: 'Yes',
      category: 'Sports',
    });
    expect(borderlinePairs([heat, marlins], 8)).toEqual([]);
  });

  it('keeps a different-SPORT pair away from the LLM tier (Stanley Cup ≠ Super Bowl)', () => {
    // "panthers" is a team token (not a place) so the place guard passes — the sport key
    // (Stanley Cup → hockey vs Super Bowl → gridiron) is what blocks the pair.
    const nhl = sq('polymarket', 'Panthers win the Stanley Cup', '2026-07-01T00:00:00Z', {
      id: 'n',
      favored: 'Panthers',
      category: 'Sports',
    });
    const nfl = sq('kalshi', 'Panthers win the Super Bowl', '2026-07-01T00:00:00Z', {
      id: 'f',
      favored: 'Panthers',
      category: 'Sports',
    });
    expect(borderlinePairs([nhl, nfl], 8)).toEqual([]);
  });
});

describe('attachRelated — link, never merge', () => {
  const live = (id: string, title: string, over: Partial<Market> = {}) =>
    makeMarket({ id, title, status: 'active', category: 'Sports', volume: 1_000_000, ...over });

  it('links two same-city teams as related (the intersection that is NOT a merge)', () => {
    const heat = live('heat', 'Will the Miami Heat win tonight?', { favored: 'Heat' });
    const marlins = live('marlins', 'Will the Miami Marlins win tonight?', { favored: 'Marlins' });
    attachRelated([heat, marlins]);
    expect(heat.related?.map((r) => r.id)).toEqual(['marlins']);
    expect(marlins.related?.map((r) => r.id)).toEqual(['heat']);
    expect(heat.related?.[0]?.via).toBe('Miami'); // the shared ENTITY word, not "tonight"
  });

  it('does NOT relate across different categories', () => {
    const weather = live('w', 'Will Miami flood this summer?', { category: 'Climate and Weather' });
    const sport = live('s', 'Will the Miami Heat win tonight?');
    attachRelated([weather, sport]);
    expect(weather.related).toBeUndefined();
    expect(sport.related).toBeUndefined();
  });

  it('caps to the most-traded siblings and clears stale links on recompute', () => {
    const subj = live('subj', 'Will the Lakers win the title?', { favored: 'Lakers', volume: 100 });
    const sibs = Array.from({ length: 5 }, (_, i) =>
      live(`k${i}`, `Will the Lakers win game ${i}?`, { favored: 'Lakers', volume: (i + 1) * 1000 }),
    );
    attachRelated([subj, ...sibs]);
    expect(subj.related).toHaveLength(3); // RELATED_MAX, highest volume first
    expect(subj.related?.map((r) => r.id)).toEqual(['k4', 'k3', 'k2']);
    attachRelated([subj]); // siblings gone → the stale links are cleared
    expect(subj.related).toBeUndefined();
  });

  it('links same-entity markets even when the canonical token is a short crypto ticker', () => {
    // canonicalToken collapses "bitcoin"→"btc" (len 3, below the distinctiveness gate);
    // the raw-title shared word recovers it, so two Bitcoin markets still link.
    const a = live('a', 'Will Bitcoin top $150k this year?', { category: 'Crypto', favored: 'Yes' });
    const b = live('b', 'Will Bitcoin fall below $80k this year?', { category: 'Crypto', favored: 'No' });
    attachRelated([a, b]);
    expect(a.related?.map((r) => r.id)).toEqual(['b']);
    expect(a.related?.[0]?.via).toBe('Bitcoin');
  });
});

describe('newsQuery — searchable subject extraction', () => {
  it('turns a Kalshi weather title into a "<city> weather forecast" query', () => {
    expect(
      newsQuery(makeMarket({ title: 'Highest temperature in LA on Jun 23, 2026?', favored: '71° to 72°' })),
    ).toBe('Los Angeles weather forecast');
    expect(
      newsQuery(makeMarket({ title: 'Will it rain in Chicago on Jun 23, 2026?', favored: 'Yes' })),
    ).toBe('Chicago weather forecast');
  });
  it('folds a distinctive favored entity into the subject query', () => {
    expect(
      newsQuery(makeMarket({ title: 'Champions League winner', favored: 'Real Madrid', category: 'Sports' })),
    ).toContain('Real Madrid');
  });
  it('drops the threshold/ticker/date but keeps the subject', () => {
    const q = newsQuery(makeMarket({ title: 'Will Silver (SI) hit $60 by end of June?', favored: 'Yes' }));
    expect(q.toLowerCase()).toContain('silver');
    expect(q).not.toMatch(/[$\d?]/); // no strike, date number, or question mark
  });
});

describe('relevantHeadlines — citation relevance gate', () => {
  const hl = (title: string, domain = 'example.com'): Headline => ({
    title,
    outlet: domain,
    source: { domain, url: `https://${domain}`, title },
    publishedAt: null,
  });
  it('drops off-topic headlines that share no distinctive entity with the market', () => {
    const m = makeMarket({
      title: 'Highest temperature in Los Angeles on Jun 23, 2026?',
      favored: '71° to 72°',
      category: 'Climate and Weather',
    });
    const kept = relevantHeadlines(
      [
        hl("Humble House Hotel's La Farfalla debuts summer menu", 'taiwannews.com.tw'),
        hl('France records its hottest day as heatwave grips Europe', 'lemonde.fr'),
        hl('Los Angeles weather: a mild 72 expected at LAX Tuesday', 'latimes.com'),
      ],
      m,
    );
    expect(kept.map((h) => h.source.domain)).toEqual(['latimes.com']);
  });
  it('drops a self-restating source whose title is the market question itself', () => {
    const m = makeMarket({ title: 'Elon Musk # tweets June 22-24, 2026?', favored: 'Yes' });
    expect(relevantHeadlines([hl('Elon Musk # tweets June 22-24, 2026?', 'mlq.ai')], m)).toEqual([]);
  });
  it('returns [] when nothing clears the bar (the fetch caller applies the floor)', () => {
    const m = makeMarket({ title: 'Will the Fed cut rates in July?', favored: 'Yes' });
    expect(relevantHeadlines([hl('Local bakery wins a dessert award', 'x.com')], m)).toEqual([]);
  });
});

describe('sameEventContainment', () => {
  it('collapses a same-platform PURE refinement ("officially") into one question', () => {
    expect(
      sameEventContainment(
        sq('polymarket', 'US and Iran sign diplomatic agreement', '2026-06-30T00:00:00Z'),
        sq(
          'polymarket',
          'US and Iran officially sign diplomatic agreement',
          '2026-06-23T00:00:00Z',
        ),
      ),
    ).toBe(true);
  });
  it('does NOT merge a TEMPORAL narrower — "… on Friday" is a different deadline question', () => {
    // "sign by [date]" vs "sign on Friday" resolve differently; merging would drop a
    // genuinely distinct bet. Weekdays/months are deliberately NOT qualifier tokens.
    expect(
      sameEventContainment(
        sq('polymarket', 'US and Iran sign diplomatic agreement', '2026-06-30T00:00:00Z'),
        sq('polymarket', 'US and Iran sign diplomatic agreement on Friday', '2026-06-23T00:00:00Z'),
      ),
    ).toBe(false);
  });
  it('does NOT merge "Lakers win series" with "Lakers win series Saturday" (a different game)', () => {
    expect(
      sameEventContainment(
        sq('polymarket', 'Lakers win series', '2026-06-30T00:00:00Z', { category: 'Sports' }),
        sq('polymarket', 'Lakers win series Saturday', '2026-06-30T00:00:00Z', {
          category: 'Sports',
        }),
      ),
    ).toBe(false);
  });
  it('does NOT merge "Bitcoin record high" with "Bitcoin record high June" (different period)', () => {
    expect(
      sameEventContainment(
        sq('polymarket', 'Bitcoin record high', '2026-06-25T00:00:00Z'),
        sq('polymarket', 'Bitcoin record high June', '2026-06-30T00:00:00Z'),
      ),
    ).toBe(false);
  });
  it('does NOT collapse when the extra token is a real entity, not a qualifier', () => {
    // "Trump wins 2024" vs "Trump wins Iowa 2024" — Iowa narrows it to a different
    // question; the year alone is not a qualifier word.
    expect(
      sameEventContainment(
        sq('polymarket', 'Trump wins 2024', '2024-11-05T00:00:00Z'),
        sq('polymarket', 'Trump wins Iowa 2024', '2024-11-05T00:00:00Z'),
      ),
    ).toBe(false);
  });
  it('only collapses within ONE platform (cross-platform goes through sameQuestion)', () => {
    expect(
      sameEventContainment(
        sq('polymarket', 'US and Iran sign diplomatic agreement'),
        sq('kalshi', 'US and Iran officially sign diplomatic agreement'),
      ),
    ).toBe(false);
  });
  it('does not treat identical titles as a containment (exact-grouping handles those)', () => {
    expect(
      sameEventContainment(
        sq('polymarket', 'US and Iran sign diplomatic agreement'),
        sq('polymarket', 'US and Iran sign diplomatic agreement'),
      ),
    ).toBe(false);
  });
  it('respects the resolution-window guard', () => {
    expect(
      sameEventContainment(
        sq('polymarket', 'US and Iran sign diplomatic agreement', '2026-06-20T00:00:00Z'),
        sq(
          'polymarket',
          'US and Iran sign diplomatic agreement officially',
          '2026-09-01T00:00:00Z',
        ),
      ),
    ).toBe(false);
  });
});

describe('borderlinePairs', () => {
  const jul = '2026-07-30T00:00:00Z';
  const sep = '2026-09-30T00:00:00Z';
  const econ = (id: string, source: 'polymarket' | 'kalshi', title: string, end = jul) =>
    sq(source, title, end, { id, category: 'Economics' });

  it('returns close-but-unmatched cross-platform pairs (Jaccard 0.25–0.45)', () => {
    const a = econ('a', 'kalshi', 'Fed cuts rates in July 2026');
    const b = econ('b', 'polymarket', 'Will the Fed cut rates this July?');
    const pairs = borderlinePairs([a, b], 8);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('excludes too-dissimilar/cross-category, same-source, and already-matched pairs', () => {
    const a = econ('a', 'kalshi', 'Fed cuts rates in July 2026');
    const sport = sq('polymarket', 'Lakers win the NBA title', jul, {
      id: 'sp',
      category: 'Sports',
    });
    const sameSrc = econ('ss', 'kalshi', 'Will the Fed cut rates this July?');
    const matched = sq('polymarket', 'Will the Fed cut rates this July?', jul, {
      id: 'mm',
      category: 'Economics',
      alt: { source: 'kalshi', favored: 'Yes', oddsPct: 50, volume: 1, marketUrl: '' },
    });
    expect(borderlinePairs([a, sport], 8)).toEqual([]); // cross-category guard
    expect(borderlinePairs([a, sameSrc], 8)).toEqual([]); // same platform
    expect(borderlinePairs([a, matched], 8)).toEqual([]); // 'mm' already has an alt → not open
  });

  it('respects the cap and the +/-14-day window', () => {
    const pool = [
      econ('kj', 'kalshi', 'Fed cuts rates in July 2026', jul),
      econ('pj', 'polymarket', 'Will the Fed cut rates this July?', jul),
      econ('ks', 'kalshi', 'Fed cuts rates in September 2026', sep),
      econ('ps', 'polymarket', 'Will the Fed cut rates this September?', sep),
    ];
    // Only the two same-month cross-platform pairs survive (July↔September is >14d apart).
    expect(borderlinePairs(pool, 4)).toHaveLength(2);
    expect(borderlinePairs(pool, 1)).toHaveLength(1); // capped
  });
});

describe('swingSince', () => {
  it('measures how far odds moved since the briefing was written', () => {
    const m = makeMarket({
      generatedAt: hoursAgo(5),
      oddsHistory: [{ t: hoursAgo(5), p: 50 }],
      oddsPct: 72,
    });
    expect(swingSince(m)).toBe(22);
  });
  it('is 0 when there is no history to anchor against', () => {
    expect(swingSince(makeMarket({ oddsHistory: [] }))).toBe(0);
  });
});

describe('oddsTrajectory', () => {
  const hist = (...ps: number[]) =>
    makeMarket({ oddsHistory: ps.map((p, i) => ({ t: hoursAgo(ps.length - i), p })) });

  it('reads a steady climb / slide from the history', () => {
    expect(oddsTrajectory(hist(50, 55, 62, 70))).toBe('have climbed');
    expect(oddsTrajectory(hist(70, 60, 52, 48))).toBe('have slipped');
  });
  it('reads a flat line as roughly steady', () => {
    expect(oddsTrajectory(hist(50, 51, 49, 50))).toBe('have held roughly steady');
  });
  it('reads a choppy line as swinging', () => {
    expect(oddsTrajectory(hist(50, 62, 48, 53))).toBe('have swung back and forth');
  });
  it('says nothing without enough history', () => {
    expect(oddsTrajectory(hist(50))).toBe('');
    expect(oddsTrajectory(makeMarket({ oddsHistory: [] }))).toBe('');
  });
});

describe('snapshotRevision', () => {
  // A market with a real (grounded, synthesis-bearing) current briefing, with its
  // write-time context already stamped.
  const briefed = (over: Parameters<typeof makeMarket>[0] = {}) => {
    const m = makeMarket({
      synthesis: synth,
      hook: 'old hook',
      dek: 'old dek',
      generatedAt: hoursAgo(48),
      oddsPct: 50,
      favored: 'Yes',
      ...over,
    });
    stampBriefing(m); // briefedOddsPct = 50, briefedFavored = 'Yes'
    return m;
  };

  it('freezes the outgoing version (with its then-values + body) when the odds shift enough', () => {
    const m = briefed();
    const gen = m.generatedAt;
    m.oddsPct = 70; // +20 since it was written
    snapshotRevision(m);
    expect(m.revisions).toEqual([
      {
        generatedAt: gen,
        oddsPct: 50,
        favored: 'Yes',
        hook: 'old hook',
        dek: 'old dek',
        analysis: 'analysis', // the factory's default lead, retained for inline re-reading
      },
    ]);
  });

  it('stores the body hydrated to the THEN odds, not the current ones', () => {
    const m = briefed({
      analysis: 'Traders put the chance at {odds}.',
      take: 'We think {odds} is too high.',
      marketRead: 'The money led the coverage at {odds}.',
    });
    m.oddsPct = 72; // live odds move up after the briefing was written at 50
    snapshotRevision(m);
    const rev = m.revisions![0]!;
    // {odds} resolves to the THEN value (50%), so a past version reads with its
    // own then-numbers — never the current 72%.
    expect(rev.analysis).toBe('Traders put the chance at 50%.');
    expect(rev.take).toBe('We think 50% is too high.');
    expect(rev.marketRead).toBe('The money led the coverage at 50%.');
  });

  it('does NOT snapshot a small move with no flip (signal, not noise)', () => {
    const m = briefed();
    m.oddsPct = 53; // +3 < threshold
    snapshotRevision(m);
    expect(m.revisions).toBeUndefined();
  });

  it('snapshots when the favored side flips, even on a small move', () => {
    const m = briefed();
    m.oddsPct = 49;
    m.favored = 'No'; // flipped from the stamped 'Yes'
    snapshotRevision(m);
    expect(m.revisions?.[0]).toMatchObject({ favored: 'Yes', oddsPct: 50 });
  });

  it('never preserves a stub (no synthesis)', () => {
    const m = briefed({ synthesis: null });
    m.oddsPct = 80;
    snapshotRevision(m);
    expect(m.revisions).toBeUndefined();
  });

  it('force-snapshots the pre-result version even on a sub-threshold move (the result rewrite)', () => {
    const m = briefed();
    m.oddsPct = 51; // +1, below the normal revision threshold
    snapshotRevision(m); // normal: would skip
    expect(m.revisions).toBeUndefined();
    snapshotRevision(m, true); // forced (the one-time result rewrite)
    expect(m.revisions?.[0]).toMatchObject({ hook: 'old hook', oddsPct: 50 });
  });

  it('keeps only the most recent few, newest first', () => {
    const m = briefed();
    m.revisions = [1, 2, 3, 4].map((n) => ({
      generatedAt: hoursAgo(n * 100),
      oddsPct: n,
      favored: 'Yes',
      hook: `older ${n}`,
      dek: '',
    }));
    m.oddsPct = 70;
    snapshotRevision(m);
    expect(m.revisions).toHaveLength(4);
    expect(m.revisions[0]!.hook).toBe('old hook'); // newest prepended
    expect(m.revisions[3]!.hook).toBe('older 3'); // oldest dropped
  });
});

describe('pendingResults', () => {
  const settled = (over: Parameters<typeof makeMarket>[0] = {}) =>
    makeMarket({
      synthesis: synth,
      hook: 'h',
      generatedAt: hoursAgo(48),
      resolvedOutcome: 'Yes',
      calledCorrectly: true,
      resolvedAt: hoursAgo(2),
      ...over,
    });

  it('selects a freshly-settled real briefing with no result article yet', () => {
    const m = settled();
    expect(pendingResults([m], NOW).map((x) => x.id)).toEqual([m.id]);
  });

  it('skips one that already has a result article', () => {
    expect(pendingResults([settled({ resultAt: hoursAgo(1) })], NOW)).toEqual([]);
  });

  it('skips a stub (no synthesis) and an unsettled market', () => {
    expect(pendingResults([settled({ synthesis: null })], NOW)).toEqual([]);
    expect(pendingResults([settled({ resolvedOutcome: null })], NOW)).toEqual([]);
  });

  it('skips a result that has aged past the coverage window', () => {
    expect(pendingResults([settled({ resolvedAt: hoursAgo(24 * 30) })], NOW)).toEqual([]);
  });

  it('orders by oldest settle first (a backlog drains across runs)', () => {
    const a = settled({ id: 'a', resolvedAt: hoursAgo(5) });
    const b = settled({ id: 'b', resolvedAt: hoursAgo(50) });
    expect(pendingResults([a, b], NOW).map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('pickCandidates', () => {
  it('regenerates new + big-swing stories; news-checks the merely-stale; skips calm', () => {
    const fresh = makeMarket({ id: 'fresh', generatedAt: null });
    const swung = makeMarket({
      id: 'swung',
      generatedAt: hoursAgo(5),
      synthesis: synth,
      oddsPct: 72,
      oddsHistory: [{ t: hoursAgo(5), p: 50 }], // +22 swing ≥ SWING_PTS → known change
    });
    const stale = makeMarket({
      id: 'stale',
      generatedAt: hoursAgo(30), // calm but not re-checked recently → news-check, not rewrite
      synthesis: synth,
      oddsPct: 50,
      oddsHistory: [{ t: hoursAgo(30), p: 50 }],
    });
    const calm = makeMarket({
      id: 'calm',
      generatedAt: hoursAgo(3), // recent, no swing, within recheck window → nothing
      synthesis: synth,
      oddsPct: 51,
      oddsHistory: [{ t: hoursAgo(3), p: 50 }],
    });
    const { regen, newsCheck } = pickCandidates([calm, stale, swung, fresh], NOW);
    expect(regen.map((m) => m.id)).toEqual(['fresh', 'swung']);
    expect(newsCheck.map((m) => m.id)).toEqual(['stale']);
  });

  it('forces a backstop rewrite once a story is idle past the safety window', () => {
    const idle = makeMarket({
      id: 'idle',
      generatedAt: hoursAgo(200), // > 168h idle backstop
      synthesis: synth,
      oddsPct: 50,
      oddsHistory: [{ t: hoursAgo(200), p: 50 }],
    });
    const { regen } = pickCandidates([idle], NOW);
    expect(regen.map((m) => m.id)).toEqual(['idle']);
  });

  it('does not re-check a story whose coverage was checked within the recheck window', () => {
    const recent = makeMarket({
      id: 'recent',
      generatedAt: hoursAgo(30),
      checkedAt: hoursAgo(2), // checked 2h ago < NEWS_RECHECK_HOURS
      synthesis: synth,
      oddsPct: 50,
      oddsHistory: [{ t: hoursAgo(30), p: 50 }],
    });
    const { regen, newsCheck } = pickCandidates([recent], NOW);
    expect(regen).toEqual([]);
    expect(newsCheck).toEqual([]);
  });

  it('never briefs a digest lead (folded prop / sports line) — excluded from regen + news-check', () => {
    // A digest with no prior briefing would otherwise land in `fresh` → regen.
    const digestFresh = makeMarket({ id: 'digest-fresh', generatedAt: null, format: 'digest' });
    // A digest with a stale briefing would otherwise land in `newsCheck`.
    const digestStale = makeMarket({
      id: 'digest-stale',
      generatedAt: hoursAgo(30),
      synthesis: synth,
      format: 'digest',
      oddsHistory: [{ t: hoursAgo(30), p: 50 }],
    });
    // A real feature alongside them must still be picked, proving the filter is digest-only.
    const feature = makeMarket({ id: 'feature', generatedAt: null, format: 'feature' });
    const { regen, newsCheck } = pickCandidates([digestFresh, digestStale, feature], NOW);
    expect(regen.map((m) => m.id)).toEqual(['feature']);
    expect(newsCheck).toEqual([]);
  });
});

// ── Story layer wiring ──────────────────────────────────────────────────────────
/** A fully-typed ShapedMarket for the story-layer helpers (mirrors the source-client shape). */
const shapedM = (over: Partial<ShapedMarket>): ShapedMarket => ({
  id: 'm',
  source: 'polymarket',
  title: 'Title',
  marketUrl: 'https://polymarket.com/event/m',
  image: '',
  category: 'Politics',
  description: '',
  tags: [],
  kind: 'standing',
  favored: 'Yes',
  oddsPct: 50,
  alt: null,
  divergence: null,
  peers: [],
  movement24h: 0,
  movement7d: null,
  volume: 1000,
  volume24h: 100,
  liquidity: 100,
  openInterest: 0,
  comments: 0,
  score: 0,
  startDate: null,
  endDate: '2026-12-01T00:00:00Z',
  ...over,
});

describe('footprintFor — distinct corroborating outlets (per article)', () => {
  const art = (domain: string, tokens: string[]): NormArticle => ({
    domain,
    tokens: new Set(tokens),
    title: '',
    url: '',
    seenAt: '2026-06-24T00:00:00Z',
    topic: 'World',
  });
  // A per-ARTICLE pool: each article carries only its own title's tokens (no cluster union).
  const pool: NormArticle[] = [
    art('reuters.com', ['iran', 'nuclear', 'deal']), //   >=2 with the deal title → counts
    art('apnews.com', ['iran', 'nuclear', 'talks']), //   >=2 (iran+nuclear) → counts
    art('bbc.com', ['iran', 'nuclear']), //               >=2 → counts
    art('reuters.com', ['iran', 'deal', 'signed']), //    matches, but reuters already counted
    art('cnn.com', ['iran', 'wildfire']), //              ONE shared token → excluded
    art('espn.com', ['chiefs', 'mahomes']), //            zero shared tokens → excluded
  ];

  it('counts DISTINCT outlets whose article shares >=2 distinctive tokens, deduping a repeat outlet', () => {
    const m = shapedM({ title: 'US-Iran final nuclear deal by August 31?' });
    // reuters + apnews + bbc = 3 distinct domains; reuters' second article doesn't double-count;
    // cnn (1 token) and espn (0) are excluded.
    expect(footprintFor(m, pool)).toBe(3);
  });

  it('does not count an article that shares only ONE distinctive token', () => {
    // This title overlaps the iran articles on 'iran' ALONE (no nuclear/deal/talks), so nothing
    // reaches the >=2 bar and the footprint is zero.
    const m = shapedM({ title: 'Iran government collapses this year?' });
    expect(footprintFor(m, pool)).toBe(0);
  });

  it('returns 0 when no article strongly matches (or the pool is empty)', () => {
    const m = shapedM({ title: 'Chiefs to win the Super Bowl?' });
    expect(footprintFor(m, [])).toBe(0);
    expect(footprintFor(m, pool)).toBe(0); // espn shares 'chiefs' alone → 1 token, excluded
  });
});

describe('assembleStoryLeads — one lead per story, sub-markets suppressed', () => {
  const noPrior = new Map<string, Market>();

  it('elects one lead, suppresses members onto it as sub-signals, tags facets with storyId', () => {
    const lead = shapedM({ id: 'lead', title: 'US-Iran nuclear deal?', volume: 9_000_000 });
    const sub = shapedM({
      id: 'sub',
      title: 'Strait of Hormuz traffic back to normal by July 31?',
      volume: 2_000_000,
      favored: 'No',
      oddsPct: 40,
    });
    const story: StoryGroup = {
      storyId: 'st_abcd1234',
      lead,
      members: [lead, sub],
      sharedTokens: ['iran'],
    };
    const [out, ...rest] = assembleStoryLeads([story], new Map(), noPrior, NOW);

    // Exactly ONE ranked input (the lead); the sub-market is suppressed (not returned).
    expect(rest).toHaveLength(0);
    expect(out!.id).toBe('lead');
    expect(out!.isStoryLead).toBe(true);
    expect(out!.storyId).toBe('st_abcd1234');
    // The lead carries the suppressed facet as a sub-signal (lead excluded from its own list).
    expect(out!.subSignals?.map((s) => s.id)).toEqual(['sub']);
    // Every non-lead facet is tagged with the storyId (for the future sub→lead redirect).
    expect(sub.storyId).toBe('st_abcd1234');
    // A never-briefed, well-covered story is a 'feature' (footprint defaults to 0 here → explainer).
    expect(out!.format).toBe('explainer');
  });

  it('marks a folded-prop representative as a digest and pulls its siblings in as facets', () => {
    const rep = shapedM({ id: 'rep', title: 'Elon Musk # tweets June 22 - June 24?', volume: 50_000 });
    const sib = shapedM({ id: 'sib', title: 'Elon Musk # tweets June 25 - June 27?', volume: 20_000 });
    const story: StoryGroup = { storyId: 'st_prop', lead: rep, members: [rep], sharedTokens: [] };
    const folded = new Map<string, ShapedMarket[]>([['rep', [sib]]]);
    const [out] = assembleStoryLeads([story], folded, noPrior, NOW);

    expect(out!.format).toBe('digest'); // a prop rep is never briefed
    expect(out!.subSignals?.map((s) => s.id)).toEqual(['sib']); // folded sibling rides along
    expect(sib.storyId).toBe('st_prop');
  });

  it('marks a sports lead as a digest even with no folded siblings', () => {
    const game = shapedM({ id: 'game', category: 'Sports', title: 'Chiefs vs. Eagles — Winner?' });
    const story: StoryGroup = { storyId: 'st_game', lead: game, members: [game], sharedTokens: [] };
    const [out] = assembleStoryLeads([story], new Map(), noPrior, NOW);
    expect(out!.format).toBe('digest');
    expect(out!.subSignals).toBeUndefined(); // no other facets → no sub-signals attached
  });

  it('pulls in folded siblings of a NON-lead member (not just the lead) so none orphan', () => {
    // The lead is the broad story; a clustered member ('rep') is itself a prop rep with a
    // collapsed sibling. That sibling rode in on the member, not the lead — it must still
    // appear as a sub-signal (and be storyId-tagged), never orphaned into no story.
    const lead = shapedM({ id: 'lead', title: 'US-Iran nuclear deal?', volume: 9_000_000 });
    const rep = shapedM({ id: 'rep', title: 'Strait of Hormuz traffic normal by July 31?', volume: 2_000_000 });
    const sib = shapedM({ id: 'sib', title: 'Strait of Hormuz traffic normal by Aug 31?', volume: 1_000_000 });
    const story: StoryGroup = {
      storyId: 'st_iran',
      lead,
      members: [lead, rep],
      sharedTokens: ['iran'],
    };
    const folded = new Map<string, ShapedMarket[]>([['rep', [sib]]]);
    const [out] = assembleStoryLeads([story], folded, noPrior, NOW);
    expect(out!.subSignals?.map((s) => s.id)).toEqual(['rep', 'sib']); // sibling not orphaned
    expect(sib.storyId).toBe('st_iran'); // tagged onto the story like every other facet
  });

  it("assigns 'feature' to a well-covered new story (footprint>=2)", () => {
    const lead = shapedM({ id: 'covered', title: 'US-Iran nuclear deal?', newsFootprint: 4 });
    const story: StoryGroup = { storyId: 'st_cov', lead, members: [lead], sharedTokens: [] };
    const [out] = assembleStoryLeads([story], new Map(), noPrior, NOW);
    expect(out!.format).toBe('feature');
  });
});

describe('broadenQuery', () => {
  it('reduces a ticker/threshold title to its subject', () => {
    expect(broadenQuery('Will Silver (SI) hit $60 by end of June?')).toBe('Silver');
    expect(broadenQuery('Will Crude Oil (CL) hit $75 by end of June?')).toBe('Crude Oil');
  });
  it('keeps a multi-word subject and strips the possessive', () => {
    expect(broadenQuery("Will SpaceX's valuation hit $3.0T by June 30?")).toBe('SpaceX valuation');
  });
  it('cuts at a leading comparison verb', () => {
    expect(broadenQuery('Bitcoin above 52,000 on June 18?')).toBe('Bitcoin');
  });
  it('strips a leading "Will" from a non-threshold title', () => {
    expect(broadenQuery('Will the Lakers win the title?')).toBe('the Lakers win the title');
  });
});

describe('newsChanged', () => {
  const src = (title: string): Source => ({ domain: 'x.com', url: 'https://x/' + title, title });
  const hl = (title: string): Headline => ({
    title,
    outlet: 'X',
    source: { domain: 'x.com', url: 'https://x/' + title, title },
    publishedAt: null,
  });

  it('is true when ≥2 fetched headlines were not cited before', () => {
    const prior = [src('Alpha wins the vote'), src('Beta concedes race')];
    expect(
      newsChanged(
        [hl('Gamma breaks scandal'), hl('Delta responds'), hl('Alpha wins the vote')],
        prior,
      ),
    ).toBe(true);
  });

  it('is false when the same coverage is merely reordered/duplicated', () => {
    const prior = [src('Alpha wins the vote'), src('Beta concedes race')];
    expect(newsChanged([hl('Beta concedes race'), hl('Alpha wins the vote')], prior)).toBe(false);
  });

  it('ignores a trailing " - Publisher" suffix when matching coverage', () => {
    const prior = [src('Alpha wins the vote'), src('Beta concedes race')];
    const now = [hl('Alpha wins the vote - Reuters'), hl('Beta concedes race - AP')];
    expect(newsChanged(now, prior)).toBe(false); // same stories, just suffixed
  });

  it('treats any real news as new when there were no prior citations', () => {
    expect(newsChanged([hl('Something happened')], [])).toBe(true);
  });

  it('is false when there is no current coverage to report', () => {
    expect(newsChanged([], [src('Alpha wins the vote')])).toBe(false);
  });
});

describe('applyFallback', () => {
  const headline = (over: Partial<Headline> = {}): Headline => ({
    title: 'Talks resume in Geneva',
    outlet: 'Reuters',
    source: {
      domain: 'reuters.com',
      url: 'https://reuters.com/x',
      title: 'Talks resume in Geneva',
    },
    publishedAt: null,
    ...over,
  });

  it('writes reader-safe text, never the build/config key string, and stays un-synthesized', () => {
    const m = makeMarket({ analysis: '', synthesis: synth });
    applyFallback(m, [headline()], '2026-06-15T12:00:00Z');
    expect(m.analysis).not.toContain('GROQ_API_KEY');
    expect(m.analysis).toContain('Reuters');
    // No synthesis ⇒ hasBriefing() keeps it out of the index, sitemaps & archive.
    expect(m.synthesis).toBeNull();
    expect(m.generatedAt).toBe('2026-06-15T12:00:00Z');
  });
});

describe('eventContextLines', () => {
  const now = Date.parse('2026-06-18T12:00:00Z');
  const ev = (over: Partial<EventItem>): EventItem =>
    ({
      id: 'espn:1',
      title: 'Lakers @ Celtics',
      topic: 'Sports',
      kind: 'sports',
      status: 'scheduled',
      startTime: '2026-06-20T00:00:00Z',
      source: 'espn',
      ...over,
    }) as EventItem;

  it('renders a scheduled event with a forward time phrase', () => {
    expect(eventContextLines([ev({})], now)).toEqual(['Lakers @ Celtics — scheduled in 2d.']);
  });

  it('renders a final event with its detail', () => {
    expect(eventContextLines([ev({ status: 'final', detail: 'Final · 2–1' })], now)).toEqual([
      'Lakers @ Celtics — Final · 2–1.',
    ]);
    expect(eventContextLines([ev({ status: 'final' })], now)).toEqual([
      'Lakers @ Celtics — settled.',
    ]);
  });

  it('drops live in-progress events (stale at brief time) and caps at three', () => {
    const events = [
      ev({ status: 'live', detail: 'Q3 · 88–84' }),
      ev({ id: 'a', status: 'scheduled' }),
      ev({ id: 'b', status: 'final', detail: 'done' }),
      ev({ id: 'c', status: 'scheduled' }),
      ev({ id: 'd', status: 'scheduled' }),
    ];
    const lines = eventContextLines(events, now);
    expect(lines).toHaveLength(3);
    expect(lines.join(' ')).not.toContain('Q3'); // live skipped
  });

  it('returns [] for no events', () => {
    expect(eventContextLines(undefined, now)).toEqual([]);
    expect(eventContextLines([], now)).toEqual([]);
  });
});

describe('developingContextLines', () => {
  const now = Date.parse('2026-06-18T12:00:00Z');
  const b = (over: Partial<BreakingItem>): BreakingItem =>
    ({
      title: 'Ceasefire talks resume in Geneva',
      outlets: ['reuters.com', 'apnews.com'],
      url: 'https://example.com',
      topic: 'World',
      firstSeen: '2026-06-18T10:00:00Z',
      lastSeen: '2026-06-18T11:30:00Z',
      ...over,
    }) as BreakingItem;

  it('renders a cluster with outlet count and freshness, capped at two', () => {
    const lines = developingContextLines(
      [b({}), b({ title: 'Second story' }), b({ title: 'Third' })],
      now,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Ceasefire talks resume in Geneva (developing, 2 outlets, 30m ago).');
  });

  it('returns [] for no clusters', () => {
    expect(developingContextLines(undefined, now)).toEqual([]);
  });
});
