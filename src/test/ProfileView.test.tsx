import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// The page fetches the opt-in public profile on mount; stub that one call so we can render both
// the private and the populated states without a live backend.
const mockFetch = vi.fn();
vi.mock('../lib/calls', () => ({ fetchPublicProfile: (id: string) => mockFetch(id) }));

import { ProfileView } from '../components/profile/ProfileView';

describe('ProfileView', () => {
  beforeEach(() => mockFetch.mockReset());

  it('shows the private state when there is no public profile', async () => {
    mockFetch.mockResolvedValue(null);
    render(<ProfileView userId="u1" />);
    await waitFor(() => expect(screen.getByText('This profile is private')).toBeTruthy());
  });

  it('renders the level title, identity, and badges for a public profile', async () => {
    mockFetch.mockResolvedValue({
      displayName: 'Avery',
      avatarUrl: null,
      memberSince: '2025-01-01T00:00:00Z',
      tier: 'contributor',
      level: 5, // → "Correspondent"
      currentStreak: 12,
      longestStreak: 14,
      badges: ['first_call', 'sharp'],
      calibration: { nResolved: 31, correct: 22, meanBrier: 0.135 },
    });
    render(<ProfileView userId="u1" />);
    await waitFor(() => expect(screen.getByText('Correspondent')).toBeTruthy());
    expect(screen.getByText('Avery')).toBeTruthy();
    expect(screen.getByText(/Level 5 of 7/)).toBeTruthy();
    expect(screen.getByText('First call')).toBeTruthy();
  });

  it('hides calibration when the reader did not share their calls', async () => {
    mockFetch.mockResolvedValue({
      displayName: 'Quiet Reader',
      avatarUrl: null,
      memberSince: '2026-01-01T00:00:00Z',
      tier: 'reader',
      level: 2,
      currentStreak: 0,
      longestStreak: 0,
      badges: [],
      calibration: null,
    });
    render(<ProfileView userId="u2" />);
    await waitFor(() => expect(screen.getByText('Quiet Reader')).toBeTruthy());
    expect(screen.queryByText(/calls resolved/)).toBeNull();
  });
});
