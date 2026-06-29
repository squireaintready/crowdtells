import { afterEach, describe, expect, it } from 'vitest';
import { mailingAddress, oneClickUnsubUrl, replyToAddress, setListUnsubHeaders } from './mailMeta';

const NEWS = 'https://crowdtells.com/?unsubscribe=11111111-2222-3333-4444-555555555555';
const REPLY = 'https://crowdtells.com/?reply_unsubscribe=99999999-8888-7777-6666-555555555555';
const BASE = 'https://tywaueceynslsyvxkgdl.supabase.co';

afterEach(() => {
  delete process.env.LIST_UNSUBSCRIBE_POST_BASE;
  delete process.env.MAILING_ADDRESS;
  delete process.env.REPLY_TO;
});

describe('replyToAddress', () => {
  it('defaults to the monitored inbox', () => {
    expect(replyToAddress()).toBe('hello@crowdtells.com');
  });
  it('honors REPLY_TO when set', () => {
    process.env.REPLY_TO = 'desk@crowdtells.com';
    expect(replyToAddress()).toBe('desk@crowdtells.com');
  });
});

describe('mailingAddress', () => {
  it('is empty when unset (never a placeholder)', () => {
    expect(mailingAddress()).toBe('');
  });
  it('returns the configured address trimmed', () => {
    process.env.MAILING_ADDRESS = '  Crowdtells, PO Box 1, City, ST 00000  ';
    expect(mailingAddress()).toBe('Crowdtells, PO Box 1, City, ST 00000');
  });
});

describe('oneClickUnsubUrl', () => {
  it('derives a news one-click URL from the SPA link', () => {
    expect(oneClickUnsubUrl(NEWS, BASE)).toBe(
      `${BASE}/functions/v1/unsubscribe?token=11111111-2222-3333-4444-555555555555&kind=news`,
    );
  });
  it('derives a reply one-click URL (kind=reply)', () => {
    expect(oneClickUnsubUrl(REPLY, BASE)).toBe(
      `${BASE}/functions/v1/unsubscribe?token=99999999-8888-7777-6666-555555555555&kind=reply`,
    );
  });
  it('returns empty when no base is configured', () => {
    expect(oneClickUnsubUrl(NEWS, '')).toBe('');
  });
  it('returns empty for a URL with no unsubscribe token', () => {
    expect(oneClickUnsubUrl('https://crowdtells.com/', BASE)).toBe('');
  });
  it('returns empty for a malformed URL', () => {
    expect(oneClickUnsubUrl('not a url', BASE)).toBe('');
  });
});

describe('setListUnsubHeaders', () => {
  it('ships RFC 2369 only (the SPA link) by default — no one-click', () => {
    const body = new URLSearchParams();
    setListUnsubHeaders(body, NEWS);
    expect(body.get('h:List-Unsubscribe')).toBe(`<${NEWS}>`);
    expect(body.get('h:List-Unsubscribe-Post')).toBeNull();
  });
  it('upgrades to RFC 8058 one-click when the endpoint base is set', () => {
    process.env.LIST_UNSUBSCRIBE_POST_BASE = BASE;
    const body = new URLSearchParams();
    setListUnsubHeaders(body, NEWS);
    expect(body.get('h:List-Unsubscribe')).toBe(
      `<${BASE}/functions/v1/unsubscribe?token=11111111-2222-3333-4444-555555555555&kind=news>`,
    );
    expect(body.get('h:List-Unsubscribe-Post')).toBe('List-Unsubscribe=One-Click');
  });
});
