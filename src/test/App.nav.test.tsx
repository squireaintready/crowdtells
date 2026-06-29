import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { loadFeed } from '../lib/feed';
import type { Feed } from '../lib/types';
import { makeMarket } from './factory';

// Hermetic <App/> setup, mirroring App.window/App.admin: stub the feed fetch + inert
// engagement, and force the env-gated realtime/newsletter off. Additionally force
// commentsEnabled TRUE so the account affordance renders regardless of the local env's
// Supabase config (CI has it; a bare local checkout may not), and stub the lazy
// AccountMenu to a marker so the sheet's open/close is tested without pulling supabase-js.
vi.mock('../lib/feed', async (orig) => ({
  ...(await orig<typeof import('../lib/feed')>()),
  loadFeed: vi.fn(),
}));
vi.mock('../lib/engagement', () => ({
  fetchEngagement: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('../lib/social', async (orig) => ({
  ...(await orig<typeof import('../lib/social')>()),
  commentsEnabled: true,
  realtimeFeedEnabled: false,
  newsletterEnabled: false,
}));
vi.mock('../components/account/AccountMenu', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Sign in to Crowdtells">
      <button onClick={onClose}>CLOSE ACCOUNT</button>
    </div>
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

const cards = () => document.querySelectorAll('article[id^="s-"]').length;
/** Simulate a browser Back: revert the URL to a prior entry, then fire popstate —
 * the codebase's idiom for an OS/edge-swipe Back (see AccountMenu.openAdmin, which
 * dispatches a synthetic PopStateEvent the same way). */
function simulateBack(toSearch: string) {
  act(() => {
    window.history.replaceState(null, '', toSearch);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

beforeEach(() => {
  (loadFeed as Mock).mockResolvedValue(feedWith(5));
  window.history.replaceState(null, '', '/');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('App overlay history — Account sheet (Back closes it in-app)', () => {
  it('opening the account sheet pushes an ?o=account history entry', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBeGreaterThan(0));

    const pushSpy = vi.spyOn(window.history, 'pushState');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    // The sheet is open AND its open pushed a dedicated history entry (so Back can pop it).
    expect(await screen.findByText('CLOSE ACCOUNT')).toBeInTheDocument();
    await waitFor(() =>
      expect(pushSpy.mock.calls.some(([, , url]) => String(url).includes('o=account'))).toBe(true),
    );
    expect(window.location.search).toBe('?o=account');
    pushSpy.mockRestore();
  });

  it('a simulated Back closes the sheet and stays on the feed (does not leave the site)', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('CLOSE ACCOUNT');

    // Back: the OS reverts the URL to the entry beneath (the feed) and fires popstate.
    simulateBack('/');

    // The sheet is gone and the feed is still mounted underneath — Back closed the
    // modal rather than flying past it out of the app.
    await waitFor(() => expect(screen.queryByText('CLOSE ACCOUNT')).toBeNull());
    expect(cards()).toBeGreaterThan(0);
    expect(window.location.search).toBe('');
  });

  it('closing via the X is back-symmetric: it pops (history.back) and writes no new entry', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBeGreaterThan(0));
    // Establish a real prior entry so jsdom's history.back() actually navigates (a cold
    // page-load entry is always present in a real browser; jsdom needs an explicit one).
    act(() => window.history.pushState(null, '', '/'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('CLOSE ACCOUNT');
    expect(window.location.search).toBe('?o=account');

    const backSpy = vi.spyOn(window.history, 'back');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    fireEvent.click(screen.getByRole('button', { name: 'CLOSE ACCOUNT' }));

    // The close funnels through the SAME mechanism as Back (history.back) — proving the
    // two paths can't diverge — and writes NO history entry itself, so the stack stays
    // clean (no stranded/duplicate entry). jsdom then reverts the URL + fires popstate,
    // which clears the overlay and closes the sheet, exactly like a Back gesture.
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('CLOSE ACCOUNT')).toBeNull());
    expect(window.location.search).toBe('');
    expect(cards()).toBeGreaterThan(0);

    backSpy.mockRestore();
    pushSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  it('does NOT auto-open the sheet on a shared /?o=account landing (param stripped on load)', async () => {
    window.history.replaceState(null, '', '/?o=account');
    render(<App />);
    await waitFor(() => expect(cards()).toBeGreaterThan(0));

    // The overlay is in-session-only: a cold ?o= load must strip the param and show the
    // plain feed, never a modal the reader can't Back out of.
    expect(screen.queryByText('CLOSE ACCOUNT')).toBeNull();
    expect(window.location.search).toBe('');
  });
});

describe('App overlay history — Personalize picker (Back closes it in-app)', () => {
  it('opening the picker pushes an ?o=personalize entry; Back closes it onto the feed', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBeGreaterThan(0));

    const pushSpy = vi.spyOn(window.history, 'pushState');
    fireEvent.click(screen.getByRole('button', { name: 'Personalize' }));

    // The topic picker is open (its Topics group) AND opening pushed a back-dismissible entry.
    expect(await screen.findByRole('group', { name: 'Topics' })).toBeInTheDocument();
    await waitFor(() =>
      expect(pushSpy.mock.calls.some(([, , url]) => String(url).includes('o=personalize'))).toBe(true),
    );
    expect(window.location.search).toBe('?o=personalize');
    pushSpy.mockRestore();

    // Back pops the entry → the picker closes and the feed remains.
    simulateBack('/');
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Topics' })).toBeNull());
    expect(cards()).toBeGreaterThan(0);
    expect(window.location.search).toBe('');
  });

  it('closing the picker via X is back-symmetric (history.back, no new entry)', async () => {
    render(<App />);
    await waitFor(() => expect(cards()).toBeGreaterThan(0));
    act(() => window.history.pushState(null, '', '/'));
    fireEvent.click(screen.getByRole('button', { name: 'Personalize' }));
    await screen.findByRole('group', { name: 'Topics' });
    expect(window.location.search).toBe('?o=personalize');

    const backSpy = vi.spyOn(window.history, 'back');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    // The picker's own Close (×) button.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Topics' })).toBeNull());
    expect(window.location.search).toBe('');

    backSpy.mockRestore();
    pushSpy.mockRestore();
    replaceSpy.mockRestore();
  });
});
