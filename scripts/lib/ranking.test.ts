import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import type { ShapedMarket } from './shaped';
import {
  categoryFactors,
  imminenceWeight,
  isNewsworthy,
  newsScore,
  rankAndSelect,
  stalenessDecay,
} from './ranking';

const NOW = Date.parse('2026-06-15T00:00:00Z');

const cfg = (over: Partial<Config> = {}): Config =>
  ({
    minVolume: 10_000,
    feedSize: 3,
    diversity: 0.15,
    sourceDiversity: 0,
    kalshiBoost: 0.05,
    ...over,
  }) as unknown as Config;

// The two STORY-LAYER fields the generator stamps onto a market BEFORE ranking. They
// live on Market (src/lib/types.ts) but not on the leaner ShapedMarket, and the ranker
// reads them via its widened Scorable — so the tests build markets that carry them too.
type RankInput = ShapedMarket & { newsFootprint?: number; lastLedAt?: string };

function sm(over: Partial<RankInput>): RankInput {
  return {
    id: 'x',
    source: 'polymarket',
    title: 't',
    marketUrl: '',
    image: '',
    category: 'A',
    tags: [],
    kind: 'standing',
    description: '',
    favored: 'Yes',
    oddsPct: 50,
    alt: null,
    divergence: null,
    movement24h: 0,
    movement7d: null,
    volume: 1_000_000,
    volume24h: 100_000,
    liquidity: 0,
    openInterest: 0,
    comments: 0,
    score: 0,
    startDate: null,
    endDate: null,
    ...over,
  };
}

describe('isNewsworthy', () => {
  it('rejects illiquid markets', () => {
    expect(isNewsworthy(sm({ volume: 500 }), cfg(), NOW)).toBe(false);
  });
  it('rejects a settled, quiet binary market', () => {
    expect(isNewsworthy(sm({ oddsPct: 99, volume24h: 100, movement24h: 0 }), cfg(), NOW)).toBe(
      false,
    );
  });
  it('keeps a low-probability leader in a multi-candidate race (not "settled")', () => {
    expect(
      isNewsworthy(
        sm({ favored: 'Spain', oddsPct: 2, volume24h: 100, movement24h: 0 }),
        cfg(),
        NOW,
      ),
    ).toBe(true);
  });
  it('keeps a settled market that is still active', () => {
    expect(isNewsworthy(sm({ oddsPct: 99, volume24h: 400_000, movement24h: 3 }), cfg(), NOW)).toBe(
      true,
    );
  });
  it('rejects far-dated novelty with weak interest', () => {
    const endDate = new Date(NOW + 5 * 365 * 86_400_000).toISOString();
    expect(isNewsworthy(sm({ endDate, volume24h: 100 }), cfg(), NOW)).toBe(false);
  });
});

describe('newsScore', () => {
  it('news footprint is the PRIMARY axis: a covered story beats a higher-volume no-news prop', () => {
    // The inversion this rework exists for. The prop trades 20× the dollars but no
    // desk has touched it (footprint 0); the covered story has five outlets on it.
    // Real-world corroboration must win — money can no longer buy the front page.
    const covered = sm({ id: 'news', newsFootprint: 5, volume: 80_000, volume24h: 50_000 });
    const prop = sm({ id: 'prop', newsFootprint: 0, volume: 2_000_000, volume24h: 1_000_000 });
    expect(newsScore(covered, NOW)).toBeGreaterThan(newsScore(prop, NOW));
  });

  it('more outlets outrank fewer, all else equal (footprint is monotonic)', () => {
    const many = sm({ newsFootprint: 6 });
    const few = sm({ newsFootprint: 1 });
    const none = sm({ newsFootprint: 0 });
    expect(newsScore(many, NOW)).toBeGreaterThan(newsScore(few, NOW));
    expect(newsScore(few, NOW)).toBeGreaterThan(newsScore(none, NOW));
  });

  it('movement backstop: a footprint-0 market with a large 24h swing still scores meaningfully', () => {
    // A breaking market the crowd moved before coverage arrived must NOT sink to the
    // floor just because no outlet has written it up yet — it sits well above a flat,
    // no-news, no-move market, though still below a fully-corroborated story.
    const breaking = sm({ id: 'swing', newsFootprint: 0, movement24h: 28 });
    const flat = sm({ id: 'flat', newsFootprint: 0, movement24h: 0, oddsPct: 80 });
    const covered = sm({ id: 'covered', newsFootprint: 8, movement24h: 0 });
    expect(newsScore(breaking, NOW)).toBeGreaterThan(newsScore(flat, NOW) * 2);
    expect(newsScore(breaking, NOW)).toBeLessThan(newsScore(covered, NOW));
  });

  it('liquidity gate DAMPS a thin market but never inflates one above a covered story', () => {
    // Same news weight (footprint 4), wildly different volume: the deep-liquid one
    // scores a touch higher (the thin one is damped) — but a near-zero-volume,
    // well-covered story still beats a deep-liquid NO-news prop. Money only ever
    // pulls down.
    const deep = sm({ id: 'deep', newsFootprint: 4, volume24h: 2_000_000 });
    const thin = sm({ id: 'thin', newsFootprint: 4, volume24h: 1_000 });
    expect(newsScore(deep, NOW)).toBeGreaterThan(newsScore(thin, NOW)); // thin is damped
    const thinCovered = sm({ id: 'tc', newsFootprint: 5, volume24h: 500 });
    const deepProp = sm({ id: 'dp', newsFootprint: 0, volume24h: 5_000_000 });
    expect(newsScore(thinCovered, NOW)).toBeGreaterThan(newsScore(deepProp, NOW)); // never inflated
  });

  it('rewards a contested market over a settled one, all else equal', () => {
    const contested = sm({ oddsPct: 50, newsFootprint: 3, volume24h: 500_000 });
    const settled = sm({ oddsPct: 96, newsFootprint: 3, volume24h: 500_000 });
    expect(newsScore(contested, NOW)).toBeGreaterThan(newsScore(settled, NOW));
  });
  it('rewards imminent resolution of a long-standing question', () => {
    const standing = {
      category: 'Politics',
      startDate: new Date(NOW - 90 * 86_400_000).toISOString(),
    };
    const soon = sm({ ...standing, endDate: new Date(NOW + 86_400_000).toISOString() });
    const far = sm({ ...standing, endDate: new Date(NOW + 200 * 86_400_000).toISOString() });
    expect(newsScore(soon, NOW)).toBeGreaterThan(newsScore(far, NOW));
  });

  it('does not let a routine same-day sports match out-imminence a long-standing question', () => {
    // Both resolve tomorrow; identical money. The sports kickoff is routine, the
    // long-open question finally settling is the real "the wait ends" news.
    const tomorrow = new Date(NOW + 86_400_000).toISOString();
    const sport = sm({
      category: 'Sports',
      startDate: new Date(NOW - 2 * 86_400_000).toISOString(),
      endDate: tomorrow,
    });
    const standing = sm({
      category: 'Politics',
      startDate: new Date(NOW - 90 * 86_400_000).toISOString(),
      endDate: tomorrow,
    });
    expect(newsScore(standing, NOW)).toBeGreaterThan(newsScore(sport, NOW));
  });

  it('lifts a recently-opened non-sports market over an identical stale one', () => {
    const fresh = sm({ category: 'Politics', startDate: new Date(NOW - 86_400_000).toISOString() });
    const stale = sm({
      category: 'Politics',
      startDate: new Date(NOW - 150 * 86_400_000).toISOString(),
    });
    expect(newsScore(fresh, NOW)).toBeGreaterThan(newsScore(stale, NOW));
  });

  it('does NOT apply the freshness lift to sports (routine fresh matches stay damped)', () => {
    const freshSport = sm({
      category: 'Sports',
      startDate: new Date(NOW - 86_400_000).toISOString(),
    });
    const staleSport = sm({
      category: 'Sports',
      startDate: new Date(NOW - 150 * 86_400_000).toISOString(),
    });
    expect(newsScore(freshSport, NOW)).toBeCloseTo(newsScore(staleSport, NOW), 5);
  });
});

describe('imminenceWeight', () => {
  it('damps sports imminence to a flat baseline', () => {
    const start = new Date(NOW - 90 * 86_400_000).toISOString(); // long lead, but still sports
    const end = new Date(NOW + 86_400_000).toISOString();
    expect(imminenceWeight('Sports', start, end)).toBeLessThan(0.5);
    expect(imminenceWeight('Politics', start, end)).toBe(1); // a 91-day-old question
  });
  it('treats a freshly-opened non-sports question as only mildly imminent', () => {
    const start = new Date(NOW - 86_400_000).toISOString(); // opened a day before it resolves
    const end = new Date(NOW + 86_400_000).toISOString();
    expect(imminenceWeight('Politics', start, end)).toBeLessThan(0.4);
  });
  it('is moderate when the open date is unknown', () => {
    expect(imminenceWeight('Politics', null, new Date(NOW + 86_400_000).toISOString())).toBe(0.6);
  });
});

describe('categoryFactors', () => {
  it('trims a high-volume category and lifts a low-volume one, symmetrically', () => {
    const factors = categoryFactors([
      sm({ id: 's1', category: 'Sports', volume24h: 2_000_000 }),
      sm({ id: 's2', category: 'Sports', volume24h: 2_000_000 }),
      sm({ id: 'g1', category: 'Geopolitics', volume24h: 100_000 }),
    ]);
    expect(factors.get('Sports')!).toBeLessThan(1);
    expect(factors.get('Geopolitics')!).toBeGreaterThan(1);
  });
  it('stays within the ±25% bound', () => {
    const factors = categoryFactors([
      sm({ id: 'a', category: 'Whale', volume24h: 500_000_000 }),
      sm({ id: 'b', category: 'Minnow', volume24h: 10_000 }),
    ]);
    for (const f of factors.values()) {
      expect(f).toBeGreaterThanOrEqual(0.75);
      expect(f).toBeLessThanOrEqual(1.25);
    }
  });
});

describe('rankAndSelect', () => {
  it('fills to feedSize and stamps the score', () => {
    const markets = [
      sm({ id: '1', volume24h: 900_000 }),
      sm({ id: '2', volume24h: 800_000 }),
      sm({ id: '3', volume24h: 700_000 }),
      sm({ id: '4', volume24h: 600_000 }),
    ];
    const out = rankAndSelect(markets, cfg({ feedSize: 3 }), NOW);
    expect(out).toHaveLength(3);
    expect(out.every((m) => m.score > 0)).toBe(true);
  });

  it('never under-fills even when every candidate shares one category', () => {
    const markets = Array.from({ length: 6 }, (_, i) =>
      sm({ id: String(i), category: 'A', volume24h: 1_000_000 - i }),
    );
    const out = rankAndSelect(markets, cfg({ feedSize: 5 }), NOW);
    expect(out).toHaveLength(5); // diversity is soft — it never starves the feed
  });

  it('interleaves categories so no single topic dominates the top', () => {
    const markets = [
      sm({ id: 'a1', category: 'A', volume24h: 1_000_000 }),
      sm({ id: 'a2', category: 'A', volume24h: 990_000 }),
      sm({ id: 'a3', category: 'A', volume24h: 980_000 }),
      sm({ id: 'a4', category: 'A', volume24h: 970_000 }),
      sm({ id: 'b1', category: 'B', volume24h: 500_000 }),
    ];
    const out = rankAndSelect(markets, cfg({ feedSize: 3, diversity: 0.5 }), NOW);
    expect(out.map((m) => m.category)).toContain('B');
  });

  it('source diversity interleaves the minority platform into a flooded feed', () => {
    const markets = [
      sm({ id: 'p1', source: 'polymarket', volume24h: 1_000_000 }),
      sm({ id: 'p2', source: 'polymarket', volume24h: 990_000 }),
      sm({ id: 'p3', source: 'polymarket', volume24h: 980_000 }),
      sm({ id: 'k1', source: 'kalshi', volume24h: 600_000 }),
    ];
    // No source penalty AND no Kalshi bonus → the minority platform earns nothing and
    // the three higher-merit Polymarket markets take every slot.
    const flooded = rankAndSelect(
      markets,
      cfg({ feedSize: 3, sourceDiversity: 0, kalshiBoost: 0 }),
      NOW,
    );
    expect(flooded.every((m) => m.source === 'polymarket')).toBe(true); // no penalty → all PM
    const balanced = rankAndSelect(
      markets,
      cfg({ feedSize: 3, sourceDiversity: 0.3, kalshiBoost: 0.1 }),
      NOW,
    );
    expect(balanced.some((m) => m.source === 'kalshi')).toBe(true); // penalty pulls Kalshi in
  });

  it('gives Kalshi a soft edge over an equally-scored Polymarket market', () => {
    const markets = [
      sm({ id: 'p', source: 'polymarket', volume24h: 500_000 }),
      sm({ id: 'k', source: 'kalshi', volume24h: 500_000 }),
    ];
    const out = rankAndSelect(markets, cfg({ feedSize: 1, kalshiBoost: 0.2 }), NOW);
    expect(out[0]?.source).toBe('kalshi');
  });

  it('a well-covered hard-news story tops a no-coverage sports match of equal money', () => {
    // The source emits the FINE category ("Soccer"), never a literal "Sports". Equal
    // money + odds, but the diplomatic story is corroborated by real outlets and the
    // routine match is not — so news footprint, the primary axis, puts the summit first.
    const out = rankAndSelect(
      [
        sm({ id: 'match', category: 'Soccer', volume24h: 1_000_000, oddsPct: 52, newsFootprint: 0 }),
        sm({
          id: 'summit',
          category: 'Geopolitics',
          volume24h: 1_000_000,
          oddsPct: 52,
          newsFootprint: 4,
        }),
      ],
      cfg({ feedSize: 2, diversity: 0 }),
      NOW,
    );
    expect(out[0]?.id).toBe('summit');
  });

  it('hard sports slot cap: no more than SPORTS_SLOT_CAP non-exempt sports are selected', () => {
    // Ten routine sports lines (none imminent/major) compete against four hard-news
    // stories for a big feed. Even though sports dominate the candidate pool, the cap
    // (default 6) bounds how many reach the feed, leaving room for the news.
    const sports = Array.from({ length: 10 }, (_, i) =>
      sm({
        id: `s${i}`,
        category: 'Soccer',
        volume24h: 5_000_000 - i, // huge money — the old code would let these flood
        newsFootprint: 0,
        // far-dated so none qualify as an imminent exempt major
        endDate: new Date(NOW + 30 * 86_400_000).toISOString(),
      }),
    );
    const news = Array.from({ length: 4 }, (_, i) =>
      sm({ id: `n${i}`, category: `News${i}`, volume24h: 100_000, newsFootprint: 4 }),
    );
    const out = rankAndSelect([...sports, ...news], cfg({ feedSize: 12, diversity: 0 }), NOW);
    const sportsCount = out.filter((m) => m.category === 'Soccer').length;
    expect(sportsCount).toBeLessThanOrEqual(6); // SPORTS_SLOT_CAP default
    expect(out.some((m) => m.category.startsWith('News'))).toBe(true); // news got slots
  });

  it('an imminent/major sports market is EXEMPT from the cap', () => {
    // SEVEN routine sports lines (same category, far-dated → none exempt) compete for a
    // big feed; only SPORTS_SLOT_CAP (6) of them may pass. PLUS one long-standing
    // competition resolving within ~a day (a final) — exempt, so it earns a slot ON TOP
    // of the six. Result: the 6 highest-volume routines + the exempt final; the 7th
    // routine is capped out. (One category, strictly-decreasing volume → deterministic.)
    const far = new Date(NOW + 30 * 86_400_000).toISOString();
    const routine = Array.from({ length: 7 }, (_, i) =>
      sm({ id: `r${i}`, category: 'Soccer', volume24h: 4_000_000 - i * 1000, endDate: far }),
    );
    const finalMatch = sm({
      id: 'final',
      category: 'Soccer',
      volume24h: 1_000, // tiny money — only its imminence (a long-awaited final) gets it in
      startDate: new Date(NOW - 60 * 86_400_000).toISOString(), // long-standing → high imminence
      endDate: new Date(NOW + 20 * 3_600_000).toISOString(), // ~20h → inside the exempt window
    });
    const out = rankAndSelect([...routine, finalMatch], cfg({ feedSize: 12, diversity: 0 }), NOW);
    expect(out.some((m) => m.id === 'final')).toBe(true); // exempt major gets in past the cap
    const routinesIn = out.filter((m) => m.id.startsWith('r') && m.id !== 'final');
    expect(routinesIn).toHaveLength(6); // exactly SPORTS_SLOT_CAP non-exempt sports
    expect(out.some((m) => m.id === 'r6')).toBe(false); // the lowest routine is capped out
  });

  it('exempt sports majors are themselves capped at SPORTS_EXEMPT_CAP', () => {
    // FIVE imminent "majors" (long-standing competitions resolving inside the exempt window):
    // without an exempt cap all five would bypass the slot cap and flood a fixture-dense day.
    // Only SPORTS_EXEMPT_CAP (2) may pass — so total sports stays bounded even on a big day.
    const longAgo = new Date(NOW - 60 * 86_400_000).toISOString();
    const soon = new Date(NOW + 20 * 3_600_000).toISOString();
    const majors = Array.from({ length: 5 }, (_, i) =>
      sm({
        id: `maj${i}`,
        category: 'Soccer',
        volume24h: 4_000_000 - i * 1000,
        startDate: longAgo,
        endDate: soon,
      }),
    );
    const out = rankAndSelect(majors, cfg({ feedSize: 12, diversity: 0 }), NOW);
    expect(out.filter((m) => m.id.startsWith('maj')).length).toBeLessThanOrEqual(2);
  });

  it('digests (props/sports lines) are damped below the news tier and cannot lead', () => {
    // A prop digest with a hard swing + deep money would, without the damp, ride the breaking
    // backstop above real news. DIGEST_DAMP keeps the whole digest tier below the reporting.
    const newsItem = sm({ id: 'news', category: 'World', newsFootprint: 4, movement24h: 5 });
    const propDigest = sm({
      id: 'prop',
      category: 'Culture',
      format: 'digest',
      newsFootprint: 1,
      movement24h: 25, // a hard swing that would otherwise lift it via the backstop
      volume24h: 5_000_000,
    });
    const out = rankAndSelect([propDigest, newsItem], cfg({ feedSize: 2, diversity: 0 }), NOW);
    expect(out[0]?.id).toBe('news'); // the digest never outranks reporting
    expect(out.find((m) => m.id === 'prop')!.score).toBeLessThan(
      out.find((m) => m.id === 'news')!.score,
    );
  });

  it('subtle churn: a market that led recently is dipped vs an identical one that has not', () => {
    // Two markets identical in every scoring input; only one carries a recent lastLedAt.
    // With one feed slot, the one that has NOT led recently is preferred — the feed
    // rotates day to day. The dip is small, so it only breaks a near-tie like this.
    const ledRecently = sm({
      id: 'led',
      category: 'A',
      newsFootprint: 4,
      lastLedAt: new Date(NOW - 2 * 3_600_000).toISOString(), // led 2h ago
    });
    const fresh = sm({ id: 'fresh', category: 'A', newsFootprint: 4 }); // never led
    const out = rankAndSelect([ledRecently, fresh], cfg({ feedSize: 1, diversity: 0 }), NOW);
    expect(out[0]?.id).toBe('fresh');
  });

  it('churn dip does NOT displace a genuinely dominant story', () => {
    // A clearly stronger story (more outlets) that led an hour ago still beats a weaker
    // one that never led — the dip is comparable to a diversity step, not a demotion.
    const dominant = sm({
      id: 'dominant',
      category: 'A',
      newsFootprint: 8,
      lastLedAt: new Date(NOW - 1 * 3_600_000).toISOString(),
    });
    const weaker = sm({ id: 'weaker', category: 'B', newsFootprint: 1 });
    const out = rankAndSelect([dominant, weaker], cfg({ feedSize: 1, diversity: 0 }), NOW);
    expect(out[0]?.id).toBe('dominant');
  });
});

describe('stalenessDecay', () => {
  it('does not decay while the resolution window is still open', () => {
    expect(stalenessDecay(new Date(NOW + 86_400_000).toISOString(), NOW)).toBe(1);
    expect(stalenessDecay(null, NOW)).toBe(1);
  });
  it('sinks gradually after the window closes, monotonically, to a floor', () => {
    const h6 = stalenessDecay(new Date(NOW - 6 * 3_600_000).toISOString(), NOW);
    const h24 = stalenessDecay(new Date(NOW - 24 * 3_600_000).toISOString(), NOW);
    expect(h6).toBeLessThan(1);
    expect(h24).toBeLessThan(h6); // older = more demoted
    const h72 = stalenessDecay(new Date(NOW - 72 * 3_600_000).toISOString(), NOW);
    expect(h72).toBeGreaterThanOrEqual(0.4); // never zeroed
    expect(h72).toBeCloseTo(0.4, 5); // fully decayed past 48h
  });
});

// The old 0.8× SPORTS_EDITORIAL_WEIGHT soft demotion (and its editorialWeight export)
// is GONE — sports are now bounded by the HARD slot cap in rankAndSelect (covered in
// the 'rankAndSelect' suite). What survives is the sports-imminence damping, which the
// score still uses to keep a routine same-day match from buying "the wait is ending"
// credit; verify it fires on the fine-grained sports tags the sources actually emit.
describe('sports imminence damping (fine categories)', () => {
  it('fires on a fine sports category, not just literal "Sports"', () => {
    const start = new Date(NOW - 90 * 86_400_000).toISOString(); // long-open, but a match
    const end = new Date(NOW + 86_400_000).toISOString();
    expect(imminenceWeight('Soccer', start, end)).toBeLessThan(0.5);
    expect(imminenceWeight('Tennis', start, end)).toBeLessThan(0.5);
    expect(imminenceWeight('Politics', start, end)).toBe(1); // non-sports unaffected
  });
});
