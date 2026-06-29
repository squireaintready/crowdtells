import { describe, expect, it } from 'vitest';
import { fitBridging, type Rating, statusFor } from './bridging';

describe('statusFor', () => {
  it('stays pending below the minimum rater count, whatever the intercept', () => {
    expect(statusFor(0.9, 2, { minRaters: 5 })).toBe('pending');
    expect(statusFor(-0.9, 2, { minRaters: 5 })).toBe('pending');
  });
  it('grades once enough raters exist', () => {
    expect(statusFor(0.5, 6, { minRaters: 5, threshold: 0.25 })).toBe('helpful');
    expect(statusFor(-0.5, 6, { minRaters: 5, threshold: 0.25 })).toBe('not_helpful');
    expect(statusFor(0.1, 6, { minRaters: 5, threshold: 0.25 })).toBe('pending');
  });
});

describe('fitBridging — the bridging property', () => {
  // Two opinion clusters, established by polar notes they rate oppositely.
  const A = ['a1', 'a2', 'a3', 'a4', 'a5'];
  const B = ['b1', 'b2', 'b3', 'b4', 'b5'];
  const ratings: Rating[] = [];
  // Polar note P1: cluster A loves it, B hates it. P2: the reverse. These give the
  // model the signal to assign A and B opposite latent factors.
  for (const u of A) ratings.push({ noteId: 'P1', userId: u, helpful: true });
  for (const u of B) ratings.push({ noteId: 'P1', userId: u, helpful: false });
  for (const u of A) ratings.push({ noteId: 'P2', userId: u, helpful: false });
  for (const u of B) ratings.push({ noteId: 'P2', userId: u, helpful: true });
  // BRIDGE note: everyone, across both clusters, finds it helpful.
  for (const u of [...A, ...B]) ratings.push({ noteId: 'BRIDGE', userId: u, helpful: true });
  // PARTISAN note: helpful only to cluster A (5 raters — enough to clear minRaters,
  // so what distinguishes it from BRIDGE is bridging, not volume).
  for (const u of A) ratings.push({ noteId: 'PARTISAN', userId: u, helpful: true });

  const fit = fitBridging(ratings, { minRaters: 5, threshold: 0.25 });

  it('ranks the cross-cutting note clearly above the one-sided note', () => {
    const bridge = fit.get('BRIDGE')!;
    const partisan = fit.get('PARTISAN')!;
    // The pile-on note's helpfulness is absorbed into the viewpoint term, so its
    // intercept stays meaningfully below the cross-cutting note's.
    expect(bridge.intercept - partisan.intercept).toBeGreaterThan(0.08);
  });

  it('surfaces the cross-cutting note as helpful', () => {
    expect(fit.get('BRIDGE')!.status).toBe('helpful');
  });

  it('does NOT surface the one-sided note as helpful (no pile-on reward)', () => {
    expect(fit.get('PARTISAN')!.status).not.toBe('helpful');
  });

  it('is deterministic across runs (hash-seeded init)', () => {
    const again = fitBridging(ratings, { minRaters: 5, threshold: 0.25 });
    expect(again.get('BRIDGE')!.intercept).toBeCloseTo(fit.get('BRIDGE')!.intercept, 10);
  });

  it('returns an empty map for no ratings', () => {
    expect(fitBridging([]).size).toBe(0);
  });
});
