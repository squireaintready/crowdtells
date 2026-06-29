import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { loadFeed } from '../lib/feed';
import type { Feed } from '../lib/types';
import { makeMarket } from './factory';

// Partial-mock the feed module: keep the real ranking/selection logic, stub only
// the network fetch so we control the corpus size. Engagement is stubbed inert so
// the lazy bulk RPC never touches supabase.
vi.mock('../lib/feed', async (orig) => ({
  ...(await orig<typeof import('../lib/feed')>()),
  loadFeed: vi.fn(),
}));
vi.mock('../lib/engagement', () => ({
  fetchEngagement: vi.fn().mockResolvedValue(new Map()),
}));
// Render <App/> hermetically: CI sets VITE_SUPABASE_* + VITE_REALTIME_FEED=true,
// which would otherwise make App open a real Supabase Realtime subscription on
// mount (and throw). Force the env-gated side effects off so the test exercises
// only the static-feed windowing path, exactly as it does locally.
vi.mock('../lib/social', async (orig) => ({
  ...(await orig<typeof import('../lib/social')>()),
  realtimeFeedEnabled: false,
  newsletterEnabled: false,
}));

const PAGE = 12;
const TOTAL = 20;

function feedWith(n: number): Feed {
  return {
    generatedAt: '2026-06-18T00:00:00Z',
    version: 1,
    markets: Array.from({ length: n }, (_, i) =>
      makeMarket({
        id: `m${i}`,
        hook: `Headline number ${i}`,
        title: `Story ${i}`,
        score: n - i, // descending, deterministic Top order
        volume: 1000 * (n - i),
      }),
    ),
  };
}

const cards = () => document.querySelectorAll('article[id^="s-"]').length;
const loadMoreBtn = () => screen.queryByRole('button', { name: /Load \d+ more/ });
const liveText = () =>
  document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? null;

beforeEach(() => {
  (loadFeed as Mock).mockResolvedValue(feedWith(TOTAL));
  window.history.replaceState(null, '', '/');
  // jsdom doesn't implement scrollTo; App's scroll-restoration effect calls it.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('App feed windowing (pagination)', () => {
  it('renders only the first page, then grows a page at a time until exhausted', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBe(PAGE));
    // 20 total − 12 shown = 8 left; the label caps the next batch at what remains.
    expect(loadMoreBtn()).toHaveTextContent('Load 8 more stories');

    fireEvent.click(loadMoreBtn()!);
    await waitFor(() => expect(cards()).toBe(TOTAL));
    // Everything shown → the pager is gone (footer reachable, no infinite scroll trap).
    expect(loadMoreBtn()).toBeNull();
  });

  it('collapses the window back to one page when the reader changes section', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBe(PAGE));
    fireEvent.click(loadMoreBtn()!);
    await waitFor(() => expect(cards()).toBe(TOTAL));

    // Switching section is a fresh list — it must reset to the first page.
    fireEvent.click(screen.getByRole('button', { name: 'Trending' }));
    await waitFor(() => expect(cards()).toBe(PAGE));
    expect(loadMoreBtn()).toBeTruthy();
  });

  it('announces each loaded batch and clears the announcement on navigation', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBe(PAGE));
    // Nothing announced on first paint.
    expect(liveText()).toBe('');

    fireEvent.click(loadMoreBtn()!);
    await waitFor(() => expect(liveText()).toBe('Showing 20 of 20 stories.'));

    // Navigating away must clear the stale count so AT never re-reads it.
    fireEvent.click(screen.getByRole('button', { name: 'Trending' }));
    await waitFor(() => expect(liveText()).toBe(''));
  });

  it('collapses the window back to one page on a new search', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBe(PAGE));
    fireEvent.click(loadMoreBtn()!);
    await waitFor(() => expect(cards()).toBe(TOTAL));

    // Every fixture title contains "Story" → the search still matches all 20, but
    // the window resets to the first page of the result set.
    fireEvent.change(screen.getByLabelText('Search stories'), {
      target: { value: 'Story' },
    });
    await waitFor(() => expect(cards()).toBe(PAGE));
  });
});

describe('App digest open (no content-less ArticleView)', () => {
  it('opens the platform for a digest market instead of an in-app article', async () => {
    // A feed whose deep-linked market is a digest (a sports line / recurring prop): it is
    // never briefed and has no in-app article, so opening it (here via a shared ?s= URL)
    // must send the reader to the platform, not a content-less ArticleView.
    const digestUrl = 'https://polymarket.com/event/the-digest';
    (loadFeed as Mock).mockResolvedValue({
      generatedAt: '2026-06-18T00:00:00Z',
      version: 1,
      markets: [
        makeMarket({ id: 'briefed', title: 'A real story' }),
        makeMarket({ id: 'dgst', format: 'digest', title: 'A line on the board', marketUrl: digestUrl }),
      ],
    } satisfies Feed);
    window.history.replaceState(null, '', '/?s=dgst');
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    render(<App />);

    // The platform opens in a new tab…
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(digestUrl, '_blank', 'noopener,noreferrer'),
    );
    // …and no in-app article mounts (the ArticleView back-link is absent).
    expect(screen.queryByRole('button', { name: /Top stories/ })).toBeNull();

    vi.unstubAllGlobals();
  });
});

describe('App deep-link history (Back stays in-site)', () => {
  it('synthesizes a feed entry behind a deep-linked article, then pushes the article', async () => {
    // Arrive directly on a shared article URL (also the target of the /s/#app bounce).
    window.history.replaceState(null, '', '/?s=m5');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    render(<App />);

    // The deep-link opens the article AND pushes it as its own history entry. Before
    // the fix the loop guard suppressed this push (the landing URL already had ?s=),
    // leaving the article as the only in-site entry → Back left the site.
    await waitFor(() =>
      expect(pushSpy.mock.calls.some(([, , url]) => String(url).includes('s=m5'))).toBe(true),
    );

    // The fix first rewrites the landing entry to the feed "home" (no ?s=), so the
    // pushed article sits ON TOP of a feed entry — Back lands on the feed, not the
    // page the reader came from.
    expect(replaceSpy.mock.calls.some(([, , url]) => !String(url).includes('s='))).toBe(true);

    pushSpy.mockRestore();
    replaceSpy.mockRestore();
  });
});
