import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { loadFeed } from '../lib/feed';
import type { Feed } from '../lib/types';
import { makeMarket } from './factory';

// Same hermetic setup as App.window.test: stub the feed fetch + inert engagement,
// and force the env-gated realtime/newsletter off. Stub the admin chunk to a marker
// so this test asserts the App routing wiring, not the whole console.
vi.mock('../lib/feed', async (orig) => ({
  ...(await orig<typeof import('../lib/feed')>()),
  loadFeed: vi.fn(),
}));
vi.mock('../lib/engagement', () => ({
  fetchEngagement: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('../lib/social', async (orig) => ({
  ...(await orig<typeof import('../lib/social')>()),
  realtimeFeedEnabled: false,
  newsletterEnabled: false,
}));
vi.mock('../components/admin/AdminPanel', () => ({
  default: ({ onExit }: { onExit: () => void }) => (
    <button onClick={onExit}>ADMIN MOUNTED</button>
  ),
}));

function feedWith(n: number): Feed {
  return {
    generatedAt: '2026-06-18T00:00:00Z',
    version: 1,
    markets: Array.from({ length: n }, (_, i) =>
      makeMarket({ id: `m${i}`, hook: `Headline ${i}`, title: `Story ${i}`, score: n - i, volume: 1000 })),
  };
}

beforeEach(() => {
  (loadFeed as Mock).mockResolvedValue(feedWith(5));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('App ?admin routing', () => {
  it('mounts the admin console on ?admin and exits back to the feed', async () => {
    window.history.replaceState(null, '', '/?admin');
    render(<App />);
    expect(await screen.findByText('ADMIN MOUNTED')).toBeInTheDocument();
    // The feed shell is NOT rendered during the takeover.
    expect(document.querySelectorAll('article[id^="s-"]').length).toBe(0);

    // Exiting returns to the feed.
    fireEvent.click(screen.getByText('ADMIN MOUNTED'));
    await waitFor(() => expect(document.querySelectorAll('article[id^="s-"]').length).toBeGreaterThan(0));
    expect(screen.queryByText('ADMIN MOUNTED')).toBeNull();
  });

  it('shows the feed (never the console) on a normal URL', async () => {
    window.history.replaceState(null, '', '/');
    render(<App />);
    await waitFor(() => expect(document.querySelectorAll('article[id^="s-"]').length).toBeGreaterThan(0));
    expect(screen.queryByText('ADMIN MOUNTED')).toBeNull();
  });
});
