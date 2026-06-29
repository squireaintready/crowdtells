import { describe, expect, it } from 'vitest';
import { buildConfirmationEmail, isUnprovisionedError } from './send-confirmations';

describe('buildConfirmationEmail', () => {
  const confirmUrl = 'https://crowdtells.com/?confirm=11111111-2222-3333-4444-555555555555';

  it('has a sensible confirmation subject', () => {
    const out = buildConfirmationEmail(confirmUrl);
    expect(out.subject).toMatch(/confirm/i);
    expect(out.subject).toContain('Crowdtells');
  });

  it('puts the confirm URL in both the html and the plaintext', () => {
    const out = buildConfirmationEmail(confirmUrl);
    expect(out.html).toContain(confirmUrl);
    expect(out.text).toContain(confirmUrl);
  });

  it('includes a confirm CTA in both html and text', () => {
    const out = buildConfirmationEmail(confirmUrl);
    expect(out.html).toContain('href="' + confirmUrl + '"'); // the button links to it
    expect(out.html).toMatch(/Confirm subscription/i);
    expect(out.text).toMatch(/confirm your subscription/i);
  });

  it('explains why they got it (no unsubscribe footer — not subscribed yet)', () => {
    const out = buildConfirmationEmail(confirmUrl);
    expect(out.html).toMatch(/if that wasn't you/i);
    expect(out.text).toMatch(/if that wasn't you/i);
    expect(out.html).not.toContain('%unsubscribe_url%');
    expect(out.text).not.toContain('%unsubscribe_url%');
  });

  it('surfaces a per-send timestamp (escaped) so Gmail does not thread/collapse repeats', () => {
    const out = buildConfirmationEmail(confirmUrl, 'reader@example.com', 'Wed, 18 Jun 2026 18:28:47 GMT');
    expect(out.html).toContain('Requested Wed, 18 Jun 2026 18:28:47 GMT');
    expect(out.text).toContain('Requested Wed, 18 Jun 2026 18:28:47 GMT');
    // Omitted when not provided → no stray "Requested" line.
    expect(buildConfirmationEmail(confirmUrl).html).not.toContain('Requested');
  });

  it('names the confirming address (escaped) when given, for clarity + per-recipient uniqueness', () => {
    const out = buildConfirmationEmail(confirmUrl, 'reader@example.com');
    expect(out.html).toContain('reader@example.com was entered');
    expect(out.text).toContain('reader@example.com was entered');
    // Defense-in-depth: an address with HTML-dangerous chars is escaped in the html.
    const evil = buildConfirmationEmail(confirmUrl, 'a"<b>@x.com');
    expect(evil.html).not.toContain('<b>');
    expect(evil.html).toContain('&lt;b&gt;');
  });

  it('falls back to a generic line when no address is given', () => {
    const out = buildConfirmationEmail(confirmUrl);
    expect(out.html).toContain('someone entered this email');
    expect(out.text).toContain('someone entered this email');
  });

  it('escapes HTML-dangerous characters in the confirm URL (button + visible link)', () => {
    const out = buildConfirmationEmail('https://crowdtells.com/?confirm=a"><script>x');
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('locks the color scheme and ships an inbox preheader (dark-mode-safe brand button)', () => {
    const out = buildConfirmationEmail(confirmUrl);
    expect(out.html).toContain('color-scheme'); // light-only meta — no auto dark-mode wash
    expect(out.html).toMatch(/display:none[\s\S]*Confirm your email/); // hidden inbox preview line
  });

  it('offers a copy-paste fallback link in case the button does not render', () => {
    const out = buildConfirmationEmail(confirmUrl);
    expect(out.html).toMatch(/Button not working/i);
    // The confirm URL appears for both the button href and the visible fallback.
    expect(out.html.match(new RegExp(confirmUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('isUnprovisionedError', () => {
  it('treats a missing double-opt-in column as not-yet-provisioned (skip, not fail)', () => {
    const real =
      'Supabase pending fetch failed: 400 {"code":"42703","message":"column subscribers.confirm_token does not exist"}';
    expect(isUnprovisionedError(real)).toBe(true);
    expect(isUnprovisionedError('column subscribers.confirm_sent_at does not exist')).toBe(true);
  });

  it('treats a missing RPC/table (PostgREST schema cache) as not-yet-provisioned', () => {
    // The breaking sender's claim_breaking_alert RPC won't exist until schema.sql
    // is re-run; PostgREST answers 404 PGRST202 "Could not find the function …".
    const missingRpc =
      'Supabase claim_breaking_alert failed: 404 {"code":"PGRST202","message":"Could not find the function public.claim_breaking_alert(text, text, text) in the schema cache"}';
    expect(isUnprovisionedError(missingRpc)).toBe(true);
    expect(isUnprovisionedError('relation "public.breaking_alerts" does not exist')).toBe(true);
    expect(isUnprovisionedError('{"code":"42P01","message":"undefined_table"}')).toBe(true);
  });

  it('does NOT swallow genuine errors (auth, network, server)', () => {
    expect(isUnprovisionedError('Supabase pending fetch failed: 401 invalid api key')).toBe(false);
    expect(isUnprovisionedError('Supabase pending fetch failed: 500 internal error')).toBe(false);
    expect(isUnprovisionedError('fetch failed: ECONNREFUSED')).toBe(false);
  });
});
