import { describe, expect, it } from 'vitest';
import {
  crowdRead,
  crowdShift,
  describeShift,
  isDecided,
  marketTiming,
  signalsFor,
  surgeScore,
} from '../lib/signals';
import { makeMarket } from './factory';

const NOW = Date.parse('2026-06-15T00:00:00Z');
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();
/** A daily belief series from day `start`→`end` (inclusive), p linear fromP→toP. */
const daily = (start: number, end: number, fromP: number, toP: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => ({
    t: inDays(start + i),
    p: Math.round((fromP + ((toP - fromP) * i) / (end - start)) * 10) / 10,
  }));
/** A well-funded, week-old active market with a daily belief arc — the firing baseline. */
const shiftMarket = (over = {}) =>
  makeMarket({
    volume: 5_000_000,
    startDate: inDays(-30),
    endDate: inDays(20),
    oddsHistory: [],
    favored: 'Yes',
    oddsPct: 85,
    oddsDaily: daily(-14, 0, 55, 85), // +15pts over the last week (anchor ~70 → 85)
    ...over,
  });

describe('surgeScore', () => {
  it('is the 24h share of lifetime volume', () => {
    expect(surgeScore(makeMarket({ volume: 1000, volume24h: 250 }))).toBeCloseTo(0.25);
    expect(surgeScore(makeMarket({ volume: 0, volume24h: 100 }))).toBe(0);
  });
});

describe('signalsFor', () => {
  it('flags a surge when 24h volume is a large share of lifetime', () => {
    const s = signalsFor(makeMarket({ volume: 1_000_000, volume24h: 300_000 }));
    expect(s.surging).toBe(true);
  });
  it('does not flag steady high-volume markets', () => {
    const s = signalsFor(makeMarket({ volume: 2_000_000_000, volume24h: 80_000_000 }));
    expect(s.surging).toBe(false); // 4% share
  });
  it('labels interest tier and trend', () => {
    const up = signalsFor(makeMarket({ volume: 6_000_000, movement24h: 5 }));
    expect(up.tier).toBe('high');
    expect(up.trend).toBe('up');
    expect(up.interest).toBe('$6M in play');

    const down = signalsFor(makeMarket({ volume: 50_000, movement24h: -3 }));
    expect(down.tier).toBe('modest');
    expect(down.trend).toBe('down');
  });
});

describe('isDecided', () => {
  it('flags a near-certain, steady market at/near its close', () => {
    expect(
      isDecided(makeMarket({ oddsPct: 99, movement24h: 0.4, endDate: inDays(0.4) }), NOW),
    ).toBe(true);
  });
  it('still flags it just past close (decided but not yet settled)', () => {
    expect(isDecided(makeMarket({ oddsPct: 99, movement24h: 0, endDate: inDays(-0.5) }), NOW)).toBe(
      true,
    );
  });
  it('does NOT flag a mere heavy favorite far from resolution', () => {
    expect(isDecided(makeMarket({ oddsPct: 99, movement24h: 0, endDate: inDays(30) }), NOW)).toBe(
      false,
    );
  });
  it('does NOT flag while the odds are still racing toward certainty', () => {
    expect(isDecided(makeMarket({ oddsPct: 99, movement24h: 6, endDate: inDays(0.5) }), NOW)).toBe(
      false,
    );
  });
  it('does NOT flag when the crowd is not near-certain', () => {
    expect(isDecided(makeMarket({ oddsPct: 90, movement24h: 0, endDate: inDays(0.5) }), NOW)).toBe(
      false,
    );
  });
  it('signalsFor exposes the decided flag', () => {
    const s = signalsFor(makeMarket({ oddsPct: 99, movement24h: 0, endDate: inDays(40 / 24) }));
    expect(typeof s.decided).toBe('boolean');
  });
});

describe('marketTiming', () => {
  it('states an upcoming resolution with an absolute date + relative hint', () => {
    const t = marketTiming(makeMarket({ status: 'active', endDate: inDays(3) }), NOW);
    expect(t.state).toBe('upcoming');
    expect(t.label).toMatch(/^Resolves /);
    expect(t.label).toMatch(/2026/); // absolute date, not just "in 3d"
    expect(t.hint).toBe('in 3d');
    expect(t.dateTime).toBe(inDays(3));
  });

  it('is honest when the window closed but the outcome is not captured yet', () => {
    // The bug this fixes: a past end date used to render "Resolved" over present-tense
    // preview prose. With no resolvedOutcome we say "Awaiting result" instead.
    const t = marketTiming(
      makeMarket({ status: 'active', endDate: inDays(-1), resolvedOutcome: null }),
      NOW,
    );
    expect(t.state).toBe('awaiting');
    expect(t.label).toBe('Awaiting result');
    expect(t.hint).toMatch(/^voting closed /);
  });

  it('shows the resolution date once the outcome is known', () => {
    const t = marketTiming(
      makeMarket({ status: 'resolved', resolvedOutcome: 'Yes', resolvedAt: inDays(-1) }),
      NOW,
    );
    expect(t.state).toBe('resolved');
    expect(t.label).toMatch(/^Resolved /);
    expect(t.dateTime).toBe(inDays(-1));
  });

  it('falls back to endDate for the resolved date when resolvedAt is absent', () => {
    const t = marketTiming(
      makeMarket({ status: 'resolved', resolvedOutcome: 'No', resolvedAt: null, endDate: inDays(-2) }),
      NOW,
    );
    expect(t.state).toBe('resolved');
    expect(t.dateTime).toBe(inDays(-2));
  });

  it('claims nothing when there is no end date', () => {
    const t = marketTiming(makeMarket({ status: 'active', endDate: null }), NOW);
    expect(t.state).toBe('open');
    expect(t.label).toBe('');
  });

  it('does NOT show a perpetual "Awaiting result" on an archived/cooled market', () => {
    // An archived market past its close with no captured outcome is old news, not pending.
    const t = marketTiming(
      makeMarket({ status: 'archived', endDate: inDays(-30), resolvedOutcome: null }),
      NOW,
    );
    expect(t.state).toBe('open');
    expect(t.label).toBe('');
  });

  it('reads an archived-but-resolved market as Resolved (outcome known → settled)', () => {
    const t = marketTiming(
      makeMarket({ status: 'archived', resolvedOutcome: 'Yes', resolvedAt: inDays(-20) }),
      NOW,
    );
    expect(t.state).toBe('resolved');
    expect(t.label).toMatch(/^Resolved /);
  });
});

describe('crowdRead', () => {
  it('reads Yes/No markets naturally', () => {
    expect(crowdRead(makeMarket({ favored: 'Yes', oddsPct: 68 }))).toBe('Crowd estimate: 68% yes');
    expect(crowdRead(makeMarket({ favored: 'No', oddsPct: 61 }))).toBe('Crowd estimate: 61% no');
  });
  it('reads candidate markets with the name', () => {
    expect(crowdRead(makeMarket({ favored: 'Spain', oddsPct: 15 }))).toBe(
      'Crowd estimate: Spain 15%',
    );
  });
});

describe('crowdShift', () => {
  it('fires on a large, well-funded, week-developed move', () => {
    expect(crowdShift(shiftMarket(), NOW)).toEqual({
      dir: 'climbed',
      fromPct: 70,
      toPct: 85,
      days: 7,
    });
  });
  it("reads a lead change as 'swung' (was behind 50%, now ahead)", () => {
    const m = shiftMarket({ oddsDaily: daily(-10, 0, 35, 65), oddsPct: 65 });
    expect(crowdShift(m, NOW)).toEqual({ dir: 'swung', fromPct: 44, toPct: 65, days: 7 });
  });
  it("reads a weakening favorite as 'slipped'", () => {
    const s = crowdShift(shiftMarket({ oddsDaily: daily(-14, 0, 95, 65), oddsPct: 65 }), NOW);
    expect(s?.dir).toBe('slipped');
    expect(s!.fromPct).toBeGreaterThan(s!.toPct);
  });
  it('stays SILENT on a small move (< 12pt over the week)', () => {
    expect(crowdShift(shiftMarket({ oddsDaily: daily(-14, 0, 70, 76), oddsPct: 76 }), NOW)).toBeNull();
  });
  it('stays SILENT on a thin (low-volume) market', () => {
    expect(crowdShift(shiftMarket({ volume: 500_000 }), NOW)).toBeNull();
  });
  it('stays SILENT on a brand-new market (opened < 7 days ago)', () => {
    expect(crowdShift(shiftMarket({ startDate: inDays(-3) }), NOW)).toBeNull();
  });
  it('stays SILENT without a real arc (too few daily points)', () => {
    expect(crowdShift(shiftMarket({ oddsDaily: daily(-3, 0, 55, 85) }), NOW)).toBeNull();
  });
  it('stays SILENT once the story is resolved or effectively decided', () => {
    expect(crowdShift(shiftMarket({ status: 'resolved' }), NOW)).toBeNull();
    expect(
      crowdShift(shiftMarket({ oddsPct: 99, movement24h: 0, endDate: inDays(0.5) }), NOW),
    ).toBeNull();
  });
  it('stays SILENT on an in-window lead flip (revisions show the favored changed)', () => {
    // Favored is 'No' now; a within-window revision shows 'Yes' led — the series mixes
    // two outcomes' probabilities, so any from→to would misattribute. Suppress.
    const m = shiftMarket({
      favored: 'No',
      oddsPct: 72,
      oddsDaily: daily(-14, 0, 55, 72),
      revisions: [{ generatedAt: inDays(-4), oddsPct: 58, favored: 'Yes', hook: '', dek: '' }],
    });
    expect(crowdShift(m, NOW)).toBeNull();
  });
  it('suppresses even when the flip revision PREDATES the 7-day anchor (sparse rebriefs)', () => {
    // A flip's revision is stamped at the prior briefing, which can sit before the
    // anchor (~7d). The window must reach the series start so the flip is still caught.
    const m = shiftMarket({
      favored: 'No',
      oddsPct: 72,
      oddsDaily: daily(-14, 0, 51, 72),
      revisions: [{ generatedAt: inDays(-9), oddsPct: 51, favored: 'Yes', hook: '', dek: '' }],
    });
    expect(crowdShift(m, NOW)).toBeNull();
  });
  it("labels a multi-outcome plurality leader crossing 50% as 'climbed', not 'swung'", () => {
    // Spain led the whole week (45%→60%, plurality→majority) — it strengthened, the lead
    // never changed hands, so 'swung behind' would over-claim. Only binary Yes/No swing.
    const s = crowdShift(
      shiftMarket({ favored: 'Spain', oddsPct: 60, oddsDaily: daily(-10, 0, 40, 60) }),
      NOW,
    );
    expect(s?.dir).toBe('climbed');
  });
});

describe('describeShift', () => {
  it('states a climb as a labeled metric line', () => {
    expect(describeShift({ dir: 'climbed', fromPct: 70, toPct: 85, days: 7 }, 'Lakers')).toBe(
      'Confidence in Lakers has climbed from ~70% to ~85% over the past 7 days.',
    );
  });
  it('states a lead change in the crowd-swung voice', () => {
    expect(describeShift({ dir: 'swung', fromPct: 44, toPct: 65, days: 7 }, 'Lakers')).toBe(
      'The crowd has swung behind Lakers, from ~44% to ~65% over the past 7 days.',
    );
  });
});
