import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AdminPanel from '../components/admin/AdminPanel';

// Drive the gate by swapping the mocked auth user + is_admin result per test.
let mockUser: { email: string } | null = null;
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    ready: true,
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/admin', () => ({
  amIAdmin: vi.fn(),
  listUsers: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  listPipelineRuns: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

import { amIAdmin } from '../lib/admin';

beforeEach(() => {
  mockUser = null;
  (amIAdmin as Mock).mockReset();
});
afterEach(cleanup);

describe('AdminPanel access gate', () => {
  it('shows a sign-in gate when signed out (never the console)', async () => {
    mockUser = null;
    render(<AdminPanel onExit={vi.fn()} />);
    expect(await screen.findByText('Continue with Google')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Users' })).toBeNull();
  });

  it('refuses a signed-in non-admin (server is the real boundary; UI shows no access)', async () => {
    mockUser = { email: 'reader@example.com' };
    (amIAdmin as Mock).mockResolvedValue(false);
    render(<AdminPanel onExit={vi.fn()} />);
    expect(await screen.findByText('No admin access')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Users' })).toBeNull();
  });

  it('renders the console for an admin', async () => {
    mockUser = { email: 'boss@example.com' };
    (amIAdmin as Mock).mockResolvedValue(true);
    render(<AdminPanel onExit={vi.fn()} />);
    expect(await screen.findByRole('tab', { name: 'Operations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Audit log' })).toBeInTheDocument();
    // Default Operations tab loads (mocked empty) → empty state, not a crash.
    await waitFor(() =>
      expect(screen.getByText(/No pipeline runs recorded yet/i)).toBeInTheDocument(),
    );
  });
});
