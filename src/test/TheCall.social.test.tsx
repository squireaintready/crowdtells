import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMarket } from './factory';

// Signed-in reader.
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, ready: true }),
}));

// The reader has already locked a call (so the post-commit social blocks render),
// and the crowd distribution is non-empty.
vi.mock('../lib/calls', () => ({
  fetchMyCall: vi.fn(async () => ({
    targetOutcome: 'Yes',
    pick: 'yes',
    confidence: 75,
    hidden: false,
  })),
  fetchCallDistribution: vi.fn(async () => ({ n: 10, yesTarget: 7, noTarget: 3 })),
  fetchMyScore: vi.fn(async () => null),
  castCall: vi.fn(),
  hideCall: vi.fn(),
}));

// Enough calls over two days for the trend, plus two followed readers' calls.
vi.mock('../lib/socialGraph', () => ({
  fetchCallSeries: vi.fn(async () => [
    { day: '2026-06-18', yesTarget: 3, noTarget: 2 },
    { day: '2026-06-19', yesTarget: 4, noTarget: 1 },
  ]),
  fetchFollowedCalls: vi.fn(async () => [
    { displayName: 'Ana', avatarUrl: null, pick: 'yes', confidence: 85, targetOutcome: 'Yes' },
    { displayName: 'Sam', avatarUrl: null, pick: 'no', confidence: 65, targetOutcome: 'Yes' },
  ]),
}));

import TheCall from '../components/discussion/TheCall';

describe('TheCall — social reveal after a call', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the votes-over-time trend and the people-you-follow tally once the reader has called', async () => {
    const m = makeMarket({
      id: 'soc',
      status: 'active',
      favored: 'Yes',
      endDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    render(<TheCall market={m} />);

    // The "two crowds over time" chart (TrendChart: Readers line + Market overlay).
    expect(await screen.findByText(/the two crowds over time/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Readers in "Yes"/ })).toBeInTheDocument();

    // The followed-readers block: 1 of 2 called Yes (Ana yes, Sam no).
    expect(screen.getByText(/people you follow/i)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });
});
