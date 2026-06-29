import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NewsletterPrompt } from '../components/NewsletterPrompt';

// Same boundaries as the footer test: mock the RPC wrappers + the auth breadcrumb.
const subscribe = vi.fn();
const saveMySubscription = vi.fn();
vi.mock('../lib/newsletter', async (orig) => ({
  ...(await orig<typeof import('../lib/newsletter')>()),
  subscribe: (...a: unknown[]) => subscribe(...a),
  saveMySubscription: (...a: unknown[]) => saveMySubscription(...a),
}));

let crumb: { id: string; email: string | null; name: string | null; avatar: string | null } | null = null;
vi.mock('../lib/authBreadcrumb', () => ({ useAuthBreadcrumb: () => crumb }));

function renderPrompt(overrides: Partial<Parameters<typeof NewsletterPrompt>[0]> = {}) {
  const props = { visible: true, onClose: vi.fn(), onIgnore: vi.fn(), onSubscribed: vi.fn(), ...overrides };
  return { ...render(<NewsletterPrompt {...props} />), props };
}
function fillAndSubmit(email: string) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
}

beforeEach(() => {
  crumb = null;
  subscribe.mockReset();
  saveMySubscription.mockReset();
});
afterEach(cleanup);

describe('NewsletterPrompt (engaged-reader slide-in)', () => {
  it('anonymous → double opt-in, check your inbox', async () => {
    subscribe.mockResolvedValue('pending');
    renderPrompt();
    fillAndSubmit('reader@example.com');

    expect(await screen.findByText(/check your inbox to confirm/i)).toBeInTheDocument();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(saveMySubscription).not.toHaveBeenCalled();
  });

  it('signed-in reader subscribing their OWN email → auto-confirmed (no confirm email)', async () => {
    crumb = { id: 'u1', email: 'Joe@Example.com', name: 'Joe', avatar: null };
    saveMySubscription.mockResolvedValue('ok');
    renderPrompt();
    fillAndSubmit('joe@example.com');

    expect(await screen.findByText(/you're subscribed/i)).toBeInTheDocument();
    expect(saveMySubscription).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('already-subscribed → honest already message', async () => {
    subscribe.mockResolvedValue('already');
    renderPrompt();
    fillAndSubmit('reader@example.com');
    expect(await screen.findByText(/already subscribed/i)).toBeInTheDocument();
  });

  it('server failure → distinct "couldn’t subscribe" copy, not the invalid-email copy', async () => {
    subscribe.mockResolvedValue('error');
    renderPrompt();
    fillAndSubmit('reader@example.com');

    expect(await screen.findByText(/couldn.t subscribe right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/enter a valid email/i)).not.toBeInTheDocument();
  });

  it('client-side invalid email → invalid-email copy, no round-trip', () => {
    renderPrompt();
    fillAndSubmit('not-an-email');
    expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe('NewsletterPrompt — auto-retract when ignored', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('slides away (onIgnore) after sitting visible + ignored', () => {
    const { props } = renderPrompt();
    expect(props.onIgnore).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(18_000));
    expect(props.onIgnore).toHaveBeenCalledTimes(1);
  });

  it('does NOT auto-retract once the reader focuses the field (never cut off)', () => {
    const { props } = renderPrompt();
    fireEvent.focus(screen.getByLabelText('Email address'));
    act(() => vi.advanceTimersByTime(60_000));
    expect(props.onIgnore).not.toHaveBeenCalled();
  });

  it('does not fire onIgnore while hidden — a contextual hide is not an "ignore"', () => {
    const { props } = renderPrompt({ visible: false });
    act(() => vi.advanceTimersByTime(60_000));
    expect(props.onIgnore).not.toHaveBeenCalled();
  });
});
