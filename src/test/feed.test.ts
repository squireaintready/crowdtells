import { describe, expect, it } from 'vitest';
import type { Market } from '../lib/types';
import {
  categoriesOf,
  countByStatus,
  dedupeByEvent,
  engagementBoost,
  scoreboard,
  selectStories,
} from '../lib/feed';
import { canonicalCategory, isKnownCategory, isSportsFamily, topicRedirects } from '../lib/categories';
import { topicSlug } from '../lib/topicPath';
import type { EngagementStat } from '../lib/engagement';
import { makeMarket } from './factory';

const markets: Market[] = [
  // Identical (old) startDates → freshness is uniform, so these score-based ordering
  // tests are isolated from the recency boost. Distinct hooks → real headline tokens.
  makeMarket({
    id: 'a',
    category: 'Politics',
    volume: 300,
    volume24h: 60,
    score: 5,
    title: 'Election odds',
    hook: 'Election odds tighten',
    startDate: '2026-05-01T00:00:00Z',
    updatedAt: '2026-06-15T09:00:00Z',
  }),
  makeMarket({
    id: 'b',
    category: 'Crypto',
    volume: 900,
    volume24h: 90,
    score: 8,
    title: 'Bitcoin run',
    hook: 'Bitcoin run continues',
    startDate: '2026-05-01T00:00:00Z',
    updatedAt: '2026-06-15T08:00:00Z',
  }),
  makeMarket({
    id: 'c',
    category: 'Crypto',
    volume: 600,
    volume24h: 300, // highest 24h share → breaking
    score: 6,
    title: 'ETH merge',
    hook: 'Ethereum merge nears',
    startDate: '2026-05-01T00:00:00Z',
    generatedAt: '2026-06-15T10:00:00Z',
    updatedAt: '2026-06-15T11:00:00Z',
  }),
  makeMarket({ id: 'd', category: 'Sports', volume: 100, status: 'resolved' }),
];

describe('selectStories', () => {
  it('past shows only resolved', () => {
    expect(selectStories(markets, { section: 'past', query: '', category: null })).toHaveLength(1);
  });

  it('top orders by persisted score, diversified so a topic does not clump', () => {
    // scores: b=8, c=6, a=5 — but b and c are both Crypto, so diversity lifts
    // Politics 'a' above the second Crypto.
    const out = selectStories(markets, { section: 'top', query: '', category: null });
    expect(out.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('top personalizes: a followed topic floats to the lead', () => {
    const out = selectStories(markets, {
      section: 'top',
      query: '',
      category: null,
      topics: ['Politics'],
    });
    expect(out[0]?.id).toBe('a'); // Politics boosted past the bigger Crypto market
  });

  it('top floats a story readers are reacting to right now (engagement velocity)', () => {
    // No engagement → b leads (score 8). A real crowd reacting to c (score 6) — well
    // above the anti-brigade floor — lifts it past b.
    const engagement = new Map<string, EngagementStat>([
      ['c', { likes: 120, comments: 40, users: 150 }],
    ]);
    const out = selectStories(markets, {
      section: 'top',
      query: '',
      category: null,
      engagement,
    });
    expect(out[0]?.id).toBe('c');
  });

  it('trending sorts active by total volume', () => {
    const out = selectStories(markets, { section: 'trending', query: '', category: null });
    expect(out.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('wall lists active markets ranked by money (and excludes resolved)', () => {
    const out = selectStories(markets, { section: 'wall', query: '', category: null });
    expect(out.map((m) => m.id)).toEqual(['b', 'c', 'a']); // volume desc; 'd' (resolved) dropped
  });

  it('breaking sorts active by magnitude-aware 24h surge', () => {
    const out = selectStories(markets, { section: 'breaking', query: '', category: null });
    expect(out[0]?.id).toBe('c'); // 0.5 surge share × the most 24h volume
  });

  it('movers sorts by absolute 24h odds swing and drops flat markets', () => {
    const ms = [
      makeMarket({ id: 'big', movement24h: 8 }),
      makeMarket({ id: 'small', movement24h: -2 }),
      makeMarket({ id: 'flat', movement24h: 0 }),
    ];
    const out = selectStories(ms, { section: 'movers', query: '', category: null });
    expect(out.map((m) => m.id)).toEqual(['big', 'small']);
  });

  it('keeps a high-move digest below briefed stories in movers and breaking', () => {
    // A digest with the biggest 24h swing AND the most 24h-surge volume — on the raw
    // movement/surge axes it would lead both sections. The digest damp must hold it below
    // the genuinely briefed stories regardless.
    const ms = [
      makeMarket({ id: 'digest', format: 'digest', movement24h: 30, volume: 100, volume24h: 100 }),
      makeMarket({ id: 'briefed-a', movement24h: 5, volume: 100, volume24h: 40 }),
      makeMarket({ id: 'briefed-b', movement24h: 3, volume: 100, volume24h: 20 }),
    ];
    const movers = selectStories(ms, { section: 'movers', query: '', category: null });
    expect(movers.map((m) => m.id)).toEqual(['briefed-a', 'briefed-b', 'digest']);
    const breaking = selectStories(ms, { section: 'breaking', query: '', category: null });
    expect(breaking[breaking.length - 1]?.id).toBe('digest'); // never tops the surge sort
    expect(breaking.indexOf(breaking.find((m) => m.format !== 'digest')!)).toBe(0);
  });

  it('latest sorts by most recently opened (startDate, since updatedAt is uniform)', () => {
    const ms = [
      makeMarket({ id: 'old', startDate: '2026-05-01T00:00:00Z', updatedAt: '2026-06-21T00:00:00Z' }),
      makeMarket({ id: 'new', startDate: '2026-06-20T00:00:00Z', updatedAt: '2026-06-21T00:00:00Z' }),
      makeMarket({ id: 'mid', startDate: '2026-06-01T00:00:00Z', updatedAt: '2026-06-21T00:00:00Z' }),
    ];
    const out = selectStories(ms, { section: 'latest', query: '', category: null });
    expect(out.map((m) => m.id)).toEqual(['new', 'mid', 'old']); // newest startDate first
  });

  it('filters by category and query', () => {
    expect(
      selectStories(markets, { section: 'trending', query: '', category: 'Crypto' }).map(
        (m) => m.id,
      ),
    ).toEqual(['b', 'c']);
    expect(
      selectStories(markets, { section: 'trending', query: 'bitcoin', category: null }).map(
        (m) => m.id,
      ),
    ).toEqual(['b']);
  });
});


describe('canonicalCategory', () => {
  it('collapses traditional-sports labels to Sports and gaming to Esports', () => {
    for (const c of ['Sports', 'Soccer', 'FIFA World Cup', 'MLB', 'NBA', 'U.S. Open 2026'])
      expect(canonicalCategory(c)).toBe('Sports');
    for (const c of ['Esports', 'Games', 'IEM Cologne']) expect(canonicalCategory(c)).toBe('Esports');
  });
  it('merges scattered beats into their canonical bucket', () => {
    expect(canonicalCategory('Tweet Markets')).toBe('Culture');
    expect(canonicalCategory('Financials')).toBe('Markets');
    expect(canonicalCategory('Foreign Policy')).toBe('Geopolitics');
    expect(canonicalCategory('Trump')).toBe('Politics');
    expect(canonicalCategory('Bitcoin')).toBe('Crypto');
    expect(canonicalCategory('Box Office')).toBe('Entertainment');
  });
  it('merges the live-feed strays the sources emit as one-off tags', () => {
    expect(canonicalCategory('French Election')).toBe('Politics');
    expect(canonicalCategory('United States')).toBe('Politics');
    expect(canonicalCategory('Military Strikes')).toBe('Geopolitics');
    expect(canonicalCategory('U.S. x Iran')).toBe('Geopolitics');
    expect(canonicalCategory('COMEX Gold Futures')).toBe('Commodities');
    expect(canonicalCategory('FDV')).toBe('Crypto');
    expect(canonicalCategory('Continental Futures')).toBe('Sports');
    expect(canonicalCategory('Team Props')).toBe('Sports');
    expect(canonicalCategory('Counter Strike 2')).toBe('Esports');
    expect(canonicalCategory('YouTube')).toBe('Culture');
    expect(canonicalCategory('Pandemics')).toBe('Health');
  });
  it('recognizes taxonomy members via isKnownCategory (the shaper tag-picking gate)', () => {
    expect(isKnownCategory('Geopolitics')).toBe(true); // a bucket name is its own key
    expect(isKnownCategory('Pandemics')).toBe(true); // CANON-mapped stray
    expect(isKnownCategory('Soccer')).toBe(true); // sports family
    expect(isKnownCategory('Hide From New')).toBe(false); // ops label
    expect(isKnownCategory('Quantum Computing')).toBe(false); // genuinely new beat
    expect(isKnownCategory('')).toBe(false);
  });
  it('passes an unknown category through unchanged (never mis-buckets a new beat)', () => {
    expect(canonicalCategory('Quantum Computing')).toBe('Quantum Computing');
    expect(canonicalCategory('')).toBe('Markets'); // empty → the default bucket
  });
});

describe('isSportsFamily (shared sports predicate)', () => {
  it('matches coarse labels, fine-grained tags, and free-text titles', () => {
    for (const c of ['Sports', 'Soccer', 'MLB', 'Formula 1', 'Esports', 'Counter-Strike'])
      expect(isSportsFamily(c)).toBe(true);
    expect(isSportsFamily('Wyndham Clark leads the U.S. Open golf')).toBe(true); // title
    expect(isSportsFamily('Politics')).toBe(false);
    expect(isSportsFamily('')).toBe(false);
    expect(isSportsFamily(undefined)).toBe(false);
  });
  it('agrees with canonicalCategory routing to Sports/Esports', () => {
    expect(isSportsFamily('NBA') && canonicalCategory('NBA') === 'Sports').toBe(true);
    expect(isSportsFamily('Valorant') && canonicalCategory('Valorant') === 'Esports').toBe(true);
  });
});

describe('topicRedirects', () => {
  const lines = topicRedirects(topicSlug);
  it('301s changed hub slugs to the canonical hub, and never a slug to itself', () => {
    expect(lines).toContain('/topic/soccer /topic/sports 301');
    expect(lines).toContain('/topic/financials /topic/markets 301');
    expect(lines).toContain('/topic/tweet-markets /topic/culture 301');
    // a category that is already canonical must NOT redirect to itself
    expect(lines.some((l) => l.startsWith('/topic/politics /topic/politics'))).toBe(false);
    for (const l of lines) expect(l).toMatch(/^\/topic\/[a-z0-9-]+ \/topic\/[a-z0-9-]+ 301$/);
  });
});

describe('rankTop diversity', () => {
  const old = '2026-01-01T00:00:00Z'; // old → freshness uniform, isolates diversity
  it('does not stack a category family at the top (sports across labels)', () => {
    // 3 sports under different labels + 1 comparable-score non-sports story. The
    // family penalty lifts the lone non-sports story up, not stranding it last.
    const ms = [
      makeMarket({ id: 's1', category: 'Soccer', score: 10, hook: 'France vs Spain', startDate: old }),
      makeMarket({ id: 's2', category: 'MLB', score: 9.5, hook: 'Mets vs Phillies', startDate: old }),
      makeMarket({ id: 's3', category: 'NBA', score: 9, hook: 'Celtics vs Lakers', startDate: old }),
      makeMarket({ id: 'p1', category: 'Politics', score: 8, hook: 'Senate control on the line', startDate: old }),
    ];
    const out = selectStories(ms, { section: 'top', query: '', category: null });
    // before the fix p1 (a different beat) sat 4th behind all 3 sports; now it's lifted
    expect(out.indexOf(out.find((m) => m.id === 'p1')!)).toBeLessThan(3);
  });
  it('pushes a near-duplicate headline down (same event, different category)', () => {
    const ms = [
      makeMarket({ id: 'm1', category: 'Tweet Markets', score: 10, hook: 'Elon Musk tweet count this week', startDate: old }),
      makeMarket({ id: 'm2', category: 'Culture', score: 9.8, hook: 'Elon Musk tweet count this week range', startDate: old }),
      makeMarket({ id: 'x', category: 'Politics', score: 6, hook: 'Government shutdown odds', startDate: old }),
    ];
    const out = selectStories(ms, { section: 'top', query: '', category: null });
    // the unrelated story beats the Musk near-twin despite a lower score
    expect(out.map((m) => m.id)).toEqual(['m1', 'x', 'm2']);
  });
});

describe('engagementBoost', () => {
  it('a small ring of accounts earns NOTHING (anti-brigade floor)', () => {
    expect(engagementBoost(undefined)).toBe(1);
    expect(engagementBoost({ likes: 2, comments: 0, users: 2 })).toBe(1);
    expect(engagementBoost({ likes: 8, comments: 0, users: 8 })).toBe(1); // a few ≠ a lot
    expect(engagementBoost({ likes: 10, comments: 0, users: 10 })).toBeCloseTo(1, 5); // ramp origin
  });
  it('grows with distinct users above the floor, monotonically, and stays capped', () => {
    const few = engagementBoost({ likes: 20, comments: 5, users: 25 });
    const many = engagementBoost({ likes: 90, comments: 25, users: 110 });
    expect(many).toBeGreaterThan(few);
    expect(few).toBeGreaterThan(1);
    expect(engagementBoost({ likes: 9999, comments: 9999, users: 9999 })).toBeLessThanOrEqual(1.45);
  });
});

describe('dedupeByEvent', () => {
  it('drops a near-duplicate headline, keeping the higher-priority one', () => {
    const ms = [
      makeMarket({ id: '1', hook: 'US and Iran sign diplomatic agreement', score: 9 }),
      makeMarket({ id: '2', hook: 'US and Iran to sign diplomatic agreement Friday', score: 8 }),
      makeMarket({ id: '3', hook: 'Bitcoin tops 100k', score: 7 }),
    ];
    expect(dedupeByEvent(ms, 6).map((m) => m.id)).toEqual(['1', '3']);
  });
  it('keeps genuinely distinct stories and respects the limit', () => {
    const ms = [
      makeMarket({ id: '1', hook: 'US and Iran sign diplomatic agreement' }),
      makeMarket({ id: '2', hook: 'US and Iran release 14-point agreement text' }),
      makeMarket({ id: '3', hook: 'Fed holds rates steady' }),
    ];
    expect(dedupeByEvent(ms, 2).map((m) => m.id)).toEqual(['1', '2']); // distinct beats, capped at 2
  });
});

describe('categoriesOf / countByStatus', () => {
  it('returns categories by frequency', () => {
    expect(categoriesOf(markets)).toEqual(['Crypto', 'Politics', 'Sports']);
  });
  it('drops thin categories below minCount (keeps the chip rail clean)', () => {
    // Crypto has 2 (b, c), Politics + Sports have 1 each → only Crypto clears ≥2
    expect(categoriesOf(markets, 2)).toEqual(['Crypto']);
  });
  it('counts per status', () => {
    expect(countByStatus(markets, 'active')).toBe(3);
    expect(countByStatus(markets, 'resolved')).toBe(1);
  });
});

describe('scoreboard', () => {
  it('counts only resolved markets with a captured outcome', () => {
    const ms = [
      makeMarket({ id: '1', status: 'resolved', calledCorrectly: true }),
      makeMarket({ id: '2', status: 'resolved', calledCorrectly: true }),
      makeMarket({ id: '3', status: 'resolved', calledCorrectly: false }),
      makeMarket({ id: '4', status: 'resolved', calledCorrectly: null }), // not captured yet
      makeMarket({ id: '5', status: 'active', calledCorrectly: true }), // never counts
    ];
    expect(scoreboard(ms)).toEqual({ correct: 2, total: 3, pct: 67 });
  });

  it('is empty (no division by zero) with nothing resolved', () => {
    expect(scoreboard([makeMarket({ status: 'active' })])).toEqual({
      correct: 0,
      total: 0,
      pct: 0,
    });
  });
});
