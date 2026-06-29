import { describe, expect, it } from 'vitest';
import type { Market } from '../../src/lib/types';
import { scoreMarket } from './scoring';

// A minimal resolved Market; only the fields the scorer reads matter.
const mkt = (over: Partial<Market>): Market =>
  ({
    id: 'm1',
    favored: 'Yes',
    oddsPct: 60,
    resolvedOutcome: 'Yes',
    ...over,
  }) as Market;

describe('scoreMarket', () => {
  it('grades a binary market with a Brier per call + a market-relative peer', () => {
    const m = mkt({ resolvedOutcome: 'Yes', briefedFavored: 'Yes', briefedOddsPct: 70 });
    const out = scoreMarket(m, [
      { user_id: 'a', target_outcome: 'Yes', pick: 'yes', confidence: 75 },
      { user_id: 'b', target_outcome: 'Yes', pick: 'no', confidence: 85 },
    ]);
    expect(out.nCalls).toBe(2);
    const a = out.scores.find((s) => s.user_id === 'a')!;
    const b = out.scores.find((s) => s.user_id === 'b')!;
    expect(a.prob).toBeCloseTo(0.75);
    expect(a.won).toBe(true);
    expect(a.brier).toBeCloseTo(0.0625);
    expect(b.prob).toBeCloseTo(0.15);
    expect(b.brier).toBeCloseTo(0.7225);
    // median of the two briers, and peer = brier − median (negative = sharper)
    expect(out.medianBrier).toBeCloseTo(0.3925);
    expect(a.peer).toBeCloseTo(-0.33);
    expect(b.peer).toBeCloseTo(0.33);
    // our briefed read (70% Yes, Yes won) scored the same way
    expect(out.ourBrier).toBeCloseTo(0.09);
  });

  it('freezes the target so a lead-flip after the call cannot change the grade', () => {
    // The market's CURRENT favored is "No" (it flipped), but the reader called the
    // frozen target "Yes" — and Yes is what resolved, so they were right.
    const m = mkt({ favored: 'No', oddsPct: 55, resolvedOutcome: 'Yes' });
    const out = scoreMarket(m, [
      { user_id: 'a', target_outcome: 'Yes', pick: 'yes', confidence: 65 },
    ]);
    expect(out.scores[0]!.won).toBe(true);
    expect(out.scores[0]!.prob).toBeCloseTo(0.65);
  });

  it('handles a multi-outcome market (target candidate did not win)', () => {
    const m = mkt({ favored: 'Trump', oddsPct: 60, resolvedOutcome: 'Biden' });
    const out = scoreMarket(m, [
      { user_id: 'a', target_outcome: 'Trump', pick: 'yes', confidence: 95 },
    ]);
    const a = out.scores[0]!;
    expect(a.won).toBe(false);
    expect(a.prob).toBeCloseTo(0.95);
    expect(a.brier).toBeCloseTo(0.9025); // confidently wrong → heavily penalized
  });

  it('records a resolution even with zero calls (platform calibration only)', () => {
    const m = mkt({ resolvedOutcome: 'Yes', briefedFavored: 'Yes', briefedOddsPct: 80 });
    const out = scoreMarket(m, []);
    expect(out.nCalls).toBe(0);
    expect(out.scores).toEqual([]);
    expect(out.medianBrier).toBeNull();
    expect(out.ourBrier).toBeCloseTo(0.04);
  });

  it('falls back to the live favored/odds when no briefed snapshot exists', () => {
    const m = mkt({ favored: 'Yes', oddsPct: 50, resolvedOutcome: 'No' });
    const out = scoreMarket(m, []);
    // our read was 50% Yes, but No won → brier (0.5−0)² = 0.25
    expect(out.ourBrier).toBeCloseTo(0.25);
  });
});
