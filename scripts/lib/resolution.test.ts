import { describe, expect, it } from 'vitest';
import { winnerOf as pmWinner } from './polymarket';
import { winnerOf as kalshiWinner } from './kalshi';
import { decideCorrect, pendingResolutions } from './resolution';
import type { Market, MarketStatus } from '../../src/lib/types';

// Field shapes below mirror the live Polymarket Gamma + Kalshi APIs: prices come
// as JSON-encoded strings, the resolved side settles to "1", Kalshi exposes a
// "yes"/"no" `result` on finalized markets.

describe('Polymarket winnerOf', () => {
  it('returns the outcome priced at 1 for a resolved binary market', () => {
    const event = { markets: [{ outcomes: '["Yes", "No"]', outcomePrices: '["1", "0"]' }] };
    expect(pmWinner(event)).toBe('Yes');
  });

  it('returns the losing-side name when "No" settles', () => {
    const event = { markets: [{ outcomes: '["Yes", "No"]', outcomePrices: '["0", "1"]' }] };
    expect(pmWinner(event)).toBe('No');
  });

  it('picks the winning candidate in a grouped (multi-market) event', () => {
    const event = {
      markets: [
        { groupItemTitle: 'Trump', outcomes: '["Yes", "No"]', outcomePrices: '["0", "1"]' },
        { groupItemTitle: 'Harris', outcomes: '["Yes", "No"]', outcomePrices: '["1", "0"]' },
      ],
    };
    expect(pmWinner(event)).toBe('Harris');
  });

  it('returns null when nothing has resolved to 1 (still trading)', () => {
    const event = { markets: [{ outcomes: '["Yes", "No"]', outcomePrices: '["0.62", "0.38"]' }] };
    expect(pmWinner(event)).toBeNull();
  });
});

describe('Kalshi winnerOf', () => {
  it('maps a finalized single binary market to Yes/No', () => {
    expect(kalshiWinner([{ status: 'finalized', result: 'yes' }])).toBe('Yes');
    expect(kalshiWinner([{ status: 'finalized', result: 'no' }])).toBe('No');
  });

  it('returns the winning candidate subtitle in a multi-market event', () => {
    const markets = [
      { status: 'finalized', result: 'no', yes_sub_title: 'OpenAI' },
      { status: 'finalized', result: 'yes', yes_sub_title: 'Anthropic' },
      { status: 'finalized', result: 'no', yes_sub_title: 'Google' },
    ];
    expect(kalshiWinner(markets)).toBe('Anthropic');
  });

  it('returns null until markets are settled', () => {
    expect(kalshiWinner([{ status: 'active', result: '' }])).toBeNull();
  });
});

describe('decideCorrect', () => {
  it('matches the favored side against the winner, case/space-insensitive', () => {
    expect(decideCorrect('Yes', 'Yes')).toBe(true);
    expect(decideCorrect('  donald   trump ', 'Donald Trump')).toBe(true);
    expect(decideCorrect('Nikola Jokić', 'Shai Gilgeous-Alexander')).toBe(false);
  });
});

describe('pendingResolutions', () => {
  const NOW = Date.parse('2026-06-15T00:00:00Z');
  const cfg = { resolveCaptureDays: 60, resolveCaptureMax: 50 } as Parameters<
    typeof pendingResolutions
  >[2];
  const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
  const m = (over: Partial<Market>): Market =>
    ({
      id: 'x',
      status: 'resolved' as MarketStatus,
      generatedAt: daysAgo(30),
      resolvedOutcome: null,
      endDate: daysAgo(2),
      favored: 'Yes',
      source: 'polymarket',
      ...over,
    }) as Market;

  it('captures a briefed RESOLVED market that has ended but is uncaptured', () => {
    expect(pendingResolutions([m({})], NOW, cfg)).toHaveLength(1);
  });

  it('ALSO captures a briefed ARCHIVED market that settled late (the scoreboard bug)', () => {
    // Aged past resolvedRetainDays → store.ts flipped it to 'archived' — but the
    // platform only just posted the outcome. It must still be re-queried.
    const late = m({ status: 'archived', endDate: daysAgo(20) });
    expect(pendingResolutions([late], NOW, cfg)).toHaveLength(1);
  });

  it('skips markets already captured, never-briefed, or not yet ended', () => {
    const captured = m({ resolvedOutcome: 'Yes' });
    const unbriefed = m({ generatedAt: null });
    const future = m({ endDate: daysAgo(-5) }); // ends in the future
    const active = m({ status: 'active' });
    expect(pendingResolutions([captured, unbriefed, future, active], NOW, cfg)).toHaveLength(0);
  });

  it('drops markets ended beyond the capture horizon (treated as indeterminate)', () => {
    const stale = m({ status: 'archived', endDate: daysAgo(90) }); // > 60d
    expect(pendingResolutions([stale], NOW, cfg)).toHaveLength(0);
  });

  it('caps the batch oldest-ended first so a backlog drains across runs', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      m({ id: `m${i}`, endDate: daysAgo(i + 1) }),
    );
    const capped = { resolveCaptureDays: 60, resolveCaptureMax: 3 } as typeof cfg;
    const out = pendingResolutions(many, NOW, capped);
    expect(out).toHaveLength(3);
    expect(out[0]!.id).toBe('m9'); // oldest end date (9 days ago) first
  });
});
