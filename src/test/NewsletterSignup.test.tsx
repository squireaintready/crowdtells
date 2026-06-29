import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NewsletterSignup } from '../components/NewsletterSignup';

// The footer talks to the newsletter RPCs and reads the signed-in identity from
// the eager auth breadcrumb; mock both so we can drive each branch. DEFAULT_PREFS
// stays real (the component seeds its frequency from it).
const subscribe = vi.fn();
const saveMySubscription = vi.fn();
vi.mock('../lib/newsletter', async (orig) => ({
  ...(await orig<typeof import('../lib/newsletter')>()),
  subscribe: (...a: unknown[]) => subscribe(...a),
  saveMySubscription: (...a: unknown[]) => saveMySubscription(...a),
}));

let crumb: { id: string; email: string | null; name: string | null; avatar: string | null } | null = null;
vi.mock('../lib/authBreadcrumb', () => ({
  useAuthBreadcrumb: () => crumb,
}));

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

describe('NewsletterSignup', () => {
  it('anonymous signup → double opt-in, tells them to check their inbox', async () => {
    subscribe.mockResolvedValue('pending');
    render(<NewsletterSignup />);
    fillAndSubmit('reader@example.com');

    expect(await screen.findByText(/check your inbox to confirm/i)).toBeInTheDocument();
    expect(subscribe).toHaveBeenCalledWith('reader@example.com', expect.objectContaining({ frequency: 'weekly' }));
    expect(saveMySubscription).not.toHaveBeenCalled();
  });

  it('already-subscribed address → honest "already subscribed", no "check your inbox"', async () => {
    subscribe.mockResolvedValue('already');
    render(<NewsletterSignup />);
    fillAndSubmit('reader@example.com');

    expect(await screen.findByText(/already subscribed/i)).toBeInTheDocument();
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });

  it('signed-in reader subscribing their OWN email → auto-confirmed via the account, no confirm email', async () => {
    crumb = { id: 'u1', email: 'Joe@Example.com', name: 'Joe', avatar: null };
    saveMySubscription.mockResolvedValue('ok');
    render(<NewsletterSignup />);
    // Typed with different casing than the breadcrumb — must still match (normalized).
    fillAndSubmit('joe@example.com');

    expect(await screen.findByText(/you're subscribed/i)).toBeInTheDocument();
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
    expect(saveMySubscription).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('signed-in reader subscribing a DIFFERENT email → still double opt-in for that address', async () => {
    crumb = { id: 'u1', email: 'joe@example.com', name: 'Joe', avatar: null };
    subscribe.mockResolvedValue('pending');
    render(<NewsletterSignup />);
    fillAndSubmit('work@other.com');

    expect(await screen.findByText(/check your inbox to confirm/i)).toBeInTheDocument();
    expect(subscribe).toHaveBeenCalledWith('work@other.com', expect.anything());
    expect(saveMySubscription).not.toHaveBeenCalled();
  });

  it('stale session (account save fails) → falls back to double opt-in so they still subscribe', async () => {
    crumb = { id: 'u1', email: 'joe@example.com', name: 'Joe', avatar: null };
    saveMySubscription.mockResolvedValue('error');
    subscribe.mockResolvedValue('pending');
    render(<NewsletterSignup />);
    fillAndSubmit('joe@example.com');

    expect(await screen.findByText(/check your inbox to confirm/i)).toBeInTheDocument();
    expect(saveMySubscription).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('signed-in with no email on the breadcrumb (e.g. phone auth) → falls to double opt-in', async () => {
    crumb = { id: 'u1', email: null, name: null, avatar: null };
    subscribe.mockResolvedValue('pending');
    render(<NewsletterSignup />);
    fillAndSubmit('reader@example.com');

    expect(await screen.findByText(/check your inbox to confirm/i)).toBeInTheDocument();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(saveMySubscription).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before any round-trip', () => {
    render(<NewsletterSignup />);
    fillAndSubmit('not-an-email');

    expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
    expect(saveMySubscription).not.toHaveBeenCalled();
  });

  it('server failure → distinct "couldn’t subscribe" copy, not the invalid-email copy', async () => {
    subscribe.mockResolvedValue('error');
    render(<NewsletterSignup />);
    fillAndSubmit('reader@example.com');

    expect(await screen.findByText(/couldn.t subscribe right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/enter a valid email/i)).not.toBeInTheDocument();
  });
});
