import { describe, expect, it } from 'vitest';
import {
  type CallSeriesDay,
  type FollowedCall,
  seriesTotal,
  summarizeFollowedCalls,
  voteShareSeries,
} from '../lib/socialVotes';

const fc = (pick: 'yes' | 'no', confidence: number, name = 'R'): FollowedCall => ({
  displayName: name,
  avatarUrl: null,
  pick,
  confidence,
  targetOutcome: 'Yes',
});

describe('summarizeFollowedCalls', () => {
  it('tallies yes/no and the mean confidence', () => {
    const s = summarizeFollowedCalls([fc('yes', 80), fc('yes', 70), fc('no', 60)]);
    expect(s).toEqual({ n: 3, yes: 2, no: 1, avgConfidence: 70 });
  });
  it('is zero-safe on an empty set', () => {
    expect(summarizeFollowedCalls([])).toEqual({ n: 0, yes: 0, no: 0, avgConfidence: 0 });
  });
});

describe('voteShareSeries', () => {
  const day = (d: string, y: number, n: number): CallSeriesDay => ({
    day: d,
    yesTarget: y,
    noTarget: n,
  });

  it('builds a cumulative yes-share line anchored at UTC noon', () => {
    const pts = voteShareSeries([day('2026-06-10', 1, 1), day('2026-06-11', 2, 0)]);
    expect(pts).toEqual([
      { t: '2026-06-10T12:00:00.000Z', p: 50 }, // 1 of 2
      { t: '2026-06-11T12:00:00.000Z', p: 75 }, // cumulative 3 of 4
    ]);
  });

  it('skips leading empty days (no calls yet → no point)', () => {
    const pts = voteShareSeries([day('2026-06-10', 0, 0), day('2026-06-11', 1, 0)]);
    expect(pts).toEqual([{ t: '2026-06-11T12:00:00.000Z', p: 100 }]);
  });

  it('is empty for an empty series', () => {
    expect(voteShareSeries([])).toEqual([]);
  });
});

describe('seriesTotal', () => {
  it('sums all calls across the day buckets', () => {
    expect(
      seriesTotal([
        { day: 'a', yesTarget: 3, noTarget: 2 },
        { day: 'b', yesTarget: 1, noTarget: 4 },
      ]),
    ).toBe(10);
  });
});
