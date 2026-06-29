import { describe, expect, it } from 'vitest';
import {
  BADGES,
  badgeProgress,
  brierScore,
  calibrationRating,
  calibrationVerdict,
  calledCorrectly,
  CONFIDENCE_STEPS,
  dayGap,
  impliedProb,
  LEVELS,
  levelFor,
  levelProgress,
  median,
  meritScore,
  MIN_CALLS_FOR_VERDICT,
  nextStreak,
  nextTierHint,
  normalizeOutcome,
  ourBrier,
  peerScore,
  type StreakState,
  tierFor,
  type TrustCounts,
} from '../lib/gamify';

describe('confidence ladder', () => {
  it('never offers 50 or 100 (the forbidden values)', () => {
    expect(CONFIDENCE_STEPS).not.toContain(50);
    expect(CONFIDENCE_STEPS).not.toContain(100);
    expect(Math.min(...CONFIDENCE_STEPS)).toBeGreaterThan(50);
    expect(Math.max(...CONFIDENCE_STEPS)).toBeLessThan(100);
  });
});

describe('impliedProb', () => {
  it('yes maps to the confidence, no maps to its complement', () => {
    expect(impliedProb('yes', 75)).toBeCloseTo(0.75);
    expect(impliedProb('no', 75)).toBeCloseTo(0.25);
    expect(impliedProb('yes', 95)).toBeCloseTo(0.95);
    expect(impliedProb('no', 55)).toBeCloseTo(0.45);
  });
});

describe('brierScore', () => {
  it('rewards confident-and-right, punishes confident-and-wrong', () => {
    expect(brierScore(0.95, true)).toBeCloseTo(0.0025);
    expect(brierScore(0.95, false)).toBeCloseTo(0.9025);
    // A timid 55% right beats an overconfident 95% wrong.
    expect(brierScore(0.55, true)).toBeLessThan(brierScore(0.95, false));
  });
  it('is bounded [0,1] for a single binary call', () => {
    for (const p of [0.05, 0.45, 0.55, 0.95]) {
      expect(brierScore(p, true)).toBeGreaterThanOrEqual(0);
      expect(brierScore(p, true)).toBeLessThanOrEqual(1);
    }
  });
});

describe('calledCorrectly', () => {
  it('is true when the side beyond 50/50 matched reality', () => {
    expect(calledCorrectly(0.75, true)).toBe(true);
    expect(calledCorrectly(0.25, false)).toBe(true);
    expect(calledCorrectly(0.75, false)).toBe(false);
    expect(calledCorrectly(0.25, true)).toBe(false);
  });
});

describe('median', () => {
  it('handles odd and even counts', () => {
    expect(median([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
    expect(median([0.1, 0.2, 0.3, 0.4])).toBeCloseTo(0.25);
    expect(median([])).toBe(0);
  });
});

describe('peerScore', () => {
  it('is negative when you beat the room', () => {
    expect(peerScore(0.1, 0.25)).toBeCloseTo(-0.15);
    expect(peerScore(0.4, 0.25)).toBeCloseTo(0.15);
  });
});

describe('ourBrier', () => {
  it('scores our briefed read against the real outcome, case/space-insensitively', () => {
    // Briefed favored "Yes" at 80% and Yes won → small Brier.
    expect(ourBrier(80, 'Yes', 'yes')).toBeCloseTo(0.04);
    // Briefed favored "Trump" at 60% but "Biden" won → larger Brier.
    expect(ourBrier(60, 'Donald Trump', 'donald   trump')).toBeCloseTo(0.16);
    expect(ourBrier(60, 'Donald Trump', 'Joe Biden')).toBeCloseTo(0.36);
  });
});

describe('normalizeOutcome', () => {
  it('lowercases, collapses whitespace, trims', () => {
    expect(normalizeOutcome('  Donald   TRUMP ')).toBe('donald trump');
  });
});

describe('calibrationRating', () => {
  it('maps Brier 0→100, 0.25→50, 0.5→0 and clamps', () => {
    expect(calibrationRating(0)).toBe(100);
    expect(calibrationRating(0.25)).toBe(50);
    expect(calibrationRating(0.5)).toBe(0);
    expect(calibrationRating(0.9)).toBe(0); // clamp
  });
});

describe('calibrationVerdict', () => {
  it('says building below the sample gate regardless of score', () => {
    expect(calibrationVerdict(0.01, MIN_CALLS_FOR_VERDICT - 1)).toBe('Building your record');
  });
  it('grades once enough has resolved', () => {
    expect(calibrationVerdict(0.1, 30)).toMatch(/Sharp/);
    expect(calibrationVerdict(0.18, 30)).toMatch(/Well-calibrated/);
    expect(calibrationVerdict(0.4, 30)).toMatch(/Overconfident/);
  });
});

describe('dayGap', () => {
  it('counts whole UTC days', () => {
    expect(dayGap('2026-06-01', '2026-06-01')).toBe(0);
    expect(dayGap('2026-06-01', '2026-06-02')).toBe(1);
    expect(dayGap('2026-06-01', '2026-06-04')).toBe(3);
  });
});

describe('nextStreak', () => {
  const base: StreakState = { current: 4, longest: 9, lastDate: '2026-06-10' };
  it('starts at 1 from nothing', () => {
    expect(nextStreak({ current: 0, longest: 0, lastDate: null }, '2026-06-10')).toEqual({
      current: 1,
      longest: 1,
      lastDate: '2026-06-10',
    });
  });
  it('does not double-count the same day', () => {
    expect(nextStreak(base, '2026-06-10')).toEqual({ ...base, lastDate: '2026-06-10' });
  });
  it('increments on a consecutive day', () => {
    expect(nextStreak(base, '2026-06-11')).toEqual({
      current: 5,
      longest: 9,
      lastDate: '2026-06-11',
    });
  });
  it('survives a single missed day (the free grace)', () => {
    // missed the 11th, read the 12th → gap 2 → continues
    expect(nextStreak(base, '2026-06-12').current).toBe(5);
  });
  it('resets after two+ missed days', () => {
    expect(nextStreak(base, '2026-06-14')).toEqual({
      current: 1,
      longest: 9,
      lastDate: '2026-06-14',
    });
  });
  it('updates the longest when the current passes it', () => {
    const s: StreakState = { current: 9, longest: 9, lastDate: '2026-06-10' };
    expect(nextStreak(s, '2026-06-11').longest).toBe(10);
  });
});

describe('tierFor', () => {
  const reader: TrustCounts = {
    briefingsRead: 2,
    callsMade: 0,
    resolvedCalls: 0,
    commentsPosted: 0,
    avgPeer: 0,
    daysSinceActive: 0,
  };
  it('defaults to reader', () => {
    expect(tierFor(reader)).toBe('reader');
  });
  it('promotes to contributor on reading + some contribution', () => {
    expect(tierFor({ ...reader, briefingsRead: 6, callsMade: 3 })).toBe('contributor');
    expect(tierFor({ ...reader, briefingsRead: 6, commentsPosted: 3 })).toBe('contributor');
    // reading alone is not enough
    expect(tierFor({ ...reader, briefingsRead: 20 })).toBe('reader');
  });
  it('promotes to steward only with calibration + activity', () => {
    const stewardish: TrustCounts = {
      briefingsRead: 20,
      callsMade: 15,
      resolvedCalls: 12,
      commentsPosted: 12,
      avgPeer: -0.05,
      daysSinceActive: 3,
    };
    expect(tierFor(stewardish)).toBe('steward');
    // beaten by the crowd → not steward
    expect(tierFor({ ...stewardish, avgPeer: 0.05 })).toBe('contributor');
    // gone quiet → decays out of steward
    expect(tierFor({ ...stewardish, daysSinceActive: 30 })).toBe('contributor');
    // too few resolved calls → not yet steward
    expect(tierFor({ ...stewardish, resolvedCalls: 4 })).toBe('contributor');
  });
});

// These fixtures are the contract the SQL mirror (recompute_trust) must reproduce —
// changing a weight here means changing the schema in lockstep.
describe('meritScore', () => {
  const ZERO = {
    briefingsRead: 0,
    callsMade: 0,
    resolvedCalls: 0,
    avgPeer: 0,
    commentsPosted: 0,
    helpfulNotes: 0,
  };
  it('is zero from nothing', () => {
    expect(meritScore(ZERO)).toBe(0);
  });
  it('caps consumption so volume alone cannot climb', () => {
    // 30 reads cap at 25 (×1); 100 comments cap at 20 (×2). Accuracy must do the rest.
    expect(meritScore({ ...ZERO, briefingsRead: 30 })).toBe(25);
    expect(meritScore({ ...ZERO, briefingsRead: 1000, commentsPosted: 1000 })).toBe(25 + 40);
  });
  it('rewards accuracy + edge + helpfulness the most', () => {
    // 25 reads(25) + 20 calls(60) + 15 resolved(90) + edge(−0.05×15×80=60) + 12 comments(24)
    // + 1 helpful note(30) = 289.
    expect(
      meritScore({
        briefingsRead: 25,
        callsMade: 20,
        resolvedCalls: 15,
        avgPeer: -0.05,
        commentsPosted: 12,
        helpfulNotes: 1,
      }),
    ).toBe(289);
    // Being beaten by the crowd (positive peer) adds no edge — never negative merit.
    expect(meritScore({ ...ZERO, resolvedCalls: 10, avgPeer: 0.2 })).toBe(60);
  });
});

describe('levelFor', () => {
  it('climbs within the reader band by merit', () => {
    expect(levelFor('reader', 0).level).toBe(1);
    expect(levelFor('reader', 25).level).toBe(2);
    expect(levelFor('reader', 70).level).toBe(3);
  });
  it('cannot exceed the band ceiling without the tier (un-farmable)', () => {
    expect(levelFor('reader', 100000).level).toBe(3);
    expect(levelFor('contributor', 100000).level).toBe(5);
  });
  it('clamps UP to the band floor so level never disagrees with tier', () => {
    expect(levelFor('contributor', 0).level).toBe(4);
    expect(levelFor('steward', 0).level).toBe(6);
  });
  it('reaches the top only as a steward with the merit', () => {
    expect(levelFor('steward', 650).level).toBe(7);
    expect(levelFor('steward', 379).level).toBe(6);
  });
});

describe('levelProgress', () => {
  it('reports fractional progress mid-band', () => {
    const p = levelProgress('reader', 47); // L2 (25) → L3 (70): 22/45
    expect(p.current.level).toBe(2);
    expect(p.next?.level).toBe(3);
    expect(p.progress).toBeCloseTo(22 / 45);
    expect(p.gatedByTier).toBe(false);
  });
  it('flags a tier gate at the band ceiling', () => {
    const p = levelProgress('reader', 80); // maxed reader band
    expect(p.current.level).toBe(3);
    expect(p.next?.level).toBe(4);
    expect(p.gatedByTier).toBe(true);
    expect(p.meritToGo).toBe(0);
  });
  it('has no next at the very top', () => {
    const p = levelProgress('steward', 99999);
    expect(p.current.level).toBe(7);
    expect(p.next).toBeNull();
    expect(p.progress).toBe(1);
  });
});

describe('LEVELS + badges + hints', () => {
  it('is a coherent 7-rung ladder with monotonic merit floors', () => {
    expect(LEVELS).toHaveLength(7);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i]!.meritFloor).toBeGreaterThan(LEVELS[i - 1]!.meritFloor);
      expect(LEVELS[i]!.level).toBe(i + 1);
    }
  });
  it('exposes the two new verification badges', () => {
    expect(BADGES.fact_checker).toBeTruthy();
    expect(BADGES.bridge_builder).toBeTruthy();
  });
  it('gives a tier hint until the top', () => {
    expect(nextTierHint('reader')).toMatch(/Contributor/);
    expect(nextTierHint('contributor')).toMatch(/Steward/);
    expect(nextTierHint('steward')).toBeNull();
  });
  it('exposes the five new tiered/tenure badges', () => {
    for (const id of ['sharp_ii', 'sharp_iii', 'devoted', 'stalwart', 'founding_reader']) {
      expect(BADGES[id]).toBeTruthy();
    }
  });
});

describe('badgeProgress', () => {
  const sig = { resolvedCalls: 8, currentStreak: 12, alignedVotes: 6, helpfulNotes: 0 };
  it('reports count progress for the count-based badges, mirroring the SQL thresholds', () => {
    expect(badgeProgress('calibrated', sig)).toEqual({ have: 8, need: MIN_CALLS_FOR_VERDICT });
    expect(badgeProgress('devoted', sig)).toEqual({ have: 12, need: 30 });
    expect(badgeProgress('fact_checker', sig)).toEqual({ have: 6, need: 15 });
  });
  it('returns null for compound / tier-gated / one-off badges (no misleading bar)', () => {
    // sharp* also need a crowd-beating edge; contributor/steward are tier-gated; founding is a flag.
    for (const id of ['sharp', 'sharp_ii', 'bridge_builder', 'contributor', 'founding_reader']) {
      expect(badgeProgress(id, sig)).toBeNull();
    }
  });
});
