import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// The hub reads the signed-in reader's own standing on mount. Stub auth + the fetchers (and the
// analytics no-op) so we can exercise the signed-out, ranked, not-yet-ranked, and category states
// without a live backend.
const h = vi.hoisted(() => ({
  auth: { user: null as null | { id: string }, ready: true },
  trust: vi.fn(),
  cal: vi.fn(),
  badges: vi.fn(),
  pct: vi.fn(),
  cats: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/posthog', () => ({ track: () => undefined }));
vi.mock('../lib/calls', () => ({
  fetchMyTrust: () => h.trust(),
  fetchMyCalibration: () => h.cal(),
  fetchMyBadges: () => h.badges(),
  fetchMyPercentile: () => h.pct(),
  fetchMyCategoryPercentile: () => h.cats(),
}));

import { StandingHub } from '../components/standing/StandingHub';

const TRUST = {
  tier: 'contributor' as const,
  briefingsRead: 40,
  callsMade: 18,
  resolvedCalls: 31,
  commentsPosted: 12,
  currentStreak: 12,
  longestStreak: 14,
  merit: 260,
  level: 5, // → "Correspondent"
  helpfulNotes: 1,
  claimsVoted: 8,
  alignedVotes: 6,
};
const CAL = {
  nResolved: 31,
  correct: 22,
  meanBrier: 0.135,
  avgPeer: -0.05,
  buckets: [{ conf: 70, n: 10, hitRate: 0.7 }],
  platformOurBrier: 0.18,
};

describe('StandingHub', () => {
  beforeEach(() => {
    h.auth = { user: null, ready: true };
    h.trust.mockReset();
    h.cal.mockReset();
    h.badges.mockReset();
    h.pct.mockReset();
    h.cats.mockReset();
    h.cats.mockResolvedValue([]); // default: no category clears the floor
  });

  it('prompts a signed-out reader to sign in', async () => {
    render(<StandingHub />);
    await waitFor(() => expect(screen.getByText(/Sign in from the feed/)).toBeTruthy());
  });

  it('renders level, a ranked percentile, badges, progress, and the ladder', async () => {
    h.auth = { user: { id: 'u1' }, ready: true };
    h.trust.mockResolvedValue(TRUST);
    h.cal.mockResolvedValue(CAL);
    h.badges.mockResolvedValue(['first_call', 'sharp']);
    h.pct.mockResolvedValue({ ranked: true, percentile: 82, cohort: 40, nResolved: 31 });

    render(<StandingHub />);
    // "Correspondent" is the hero level title AND its rung on the ladder, so expect both.
    await waitFor(() => expect(screen.getAllByText('Correspondent').length).toBeGreaterThan(1));
    // private percentile card — "sharper than 82%" → top 18% (text spans <b>, so check flattened)
    expect(screen.getByText('among callers')).toBeTruthy();
    expect(document.body.textContent).toContain('Sharper than');
    expect(document.body.textContent).toContain('track record');
    // gallery + ladder + explainer are all present
    expect(screen.getByText('First call')).toBeTruthy();
    expect(screen.getByText('The ladder')).toBeTruthy();
    expect(screen.getByText('How Standing works')).toBeTruthy();
    // a still-to-earn badge from the new tiers shows its how-to (not yet held)
    expect(screen.getByText('Sharper')).toBeTruthy();
    // a count-based locked badge shows live progress (devoted: 12/30-day streak, not yet held)
    expect(document.body.textContent).toContain('day streak');
  });

  it('renders per-category rank bands when a category clears the floor', async () => {
    h.auth = { user: { id: 'u3' }, ready: true };
    h.trust.mockResolvedValue(TRUST);
    h.cal.mockResolvedValue(CAL);
    h.badges.mockResolvedValue([]);
    h.pct.mockResolvedValue({ ranked: true, percentile: 70, cohort: 20, nResolved: 31 });
    h.cats.mockResolvedValue([{ category: 'Economics', n: 9, cohort: 12, percentile: 90 }]);

    render(<StandingHub />);
    await waitFor(() => expect(screen.getByText('Economics')).toBeTruthy());
    // percentile 90 → "Top 10%"
    expect(document.body.textContent).toContain('Top 10%');
  });

  it('shows the honest unlock copy when the reader has too few resolved calls to rank', async () => {
    h.auth = { user: { id: 'u2' }, ready: true };
    h.trust.mockResolvedValue({ ...TRUST, resolvedCalls: 2, level: 2, tier: 'reader' });
    h.cal.mockResolvedValue({ ...CAL, nResolved: 2, correct: 1, buckets: [] });
    h.badges.mockResolvedValue(['first_call']);
    h.pct.mockResolvedValue({ ranked: false, reason: 'need_calls', need: 8, nResolved: 2 });

    render(<StandingHub />);
    await waitFor(() => expect(screen.getByText('among callers')).toBeTruthy());
    expect(document.body.textContent).toContain('Resolve');
    expect(document.body.textContent).toContain('more calls');
    // not ranked → no leaderboard framing leaked
    expect(document.body.textContent).not.toContain('Sharper than');
  });
});
