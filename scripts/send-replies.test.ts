import { describe, expect, it } from 'vitest';
import type { Feed, Market } from '../src/lib/types';
import {
  buildReplyEmail,
  replyNotifyArmed,
  snippetOf,
  storyTitleFor,
  type PendingReply,
} from './send-replies';

function market(over: Partial<Market>): Market {
  return {
    id: 'm', source: 'polymarket', title: 'Event question', marketUrl: 'https://polymarket.com/event/s',
    image: '', category: 'Politics', description: '', favored: 'Yes', oddsPct: 60, alt: null,
    divergence: null, movement24h: 2, movement7d: 5, oddsHistory: [], volume: 1e6, volume24h: 1e5,
    liquidity: 1e4, openInterest: 1e4, comments: 0, score: 1, startDate: null,
    endDate: '2026-12-01T00:00:00Z', status: 'active', hook: 'A hook headline', analysis: 'a', take: '',
    marketRead: '', crowdVsCoverage: '', synthesis: null, sources: [], grounded: true,
    generatedAt: '2026-06-14T00:00:00Z', updatedAt: '2026-06-15T00:00:00Z', resolvedOutcome: null,
    calledCorrectly: null, resolvedAt: null, ...over,
  };
}
const feed = (markets: Market[]): Feed => ({ generatedAt: 'x', version: 1, markets });

describe('replyNotifyArmed — inert gating', () => {
  const creds = {
    MAILGUN_API_KEY: 'k', MAILGUN_DOMAIN: 'd', SUPABASE_URL: 'u', SUPABASE_SERVICE_KEY: 's',
  } as NodeJS.ProcessEnv;

  it('is INERT by default (no flag, no creds)', () => {
    expect(replyNotifyArmed({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('is inert when enabled but creds are missing', () => {
    expect(replyNotifyArmed({ REPLY_NOTIFY_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('is inert when creds are present but the flag is off', () => {
    expect(replyNotifyArmed(creds)).toBe(false);
  });

  it('arms only with the flag AND full Mailgun + Supabase creds', () => {
    expect(replyNotifyArmed({ ...creds, REPLY_NOTIFY_ENABLED: 'true' })).toBe(true);
    expect(replyNotifyArmed({ ...creds, REPLY_NOTIFY_ENABLED: '1' })).toBe(true);
    expect(replyNotifyArmed({ ...creds, REPLY_NOTIFY_ENABLED: 'on' })).toBe(true);
  });

  it('accepts VITE_SUPABASE_URL as the Supabase URL', () => {
    const { SUPABASE_URL: _omit, ...rest } = creds;
    void _omit;
    expect(replyNotifyArmed({ ...rest, VITE_SUPABASE_URL: 'u', REPLY_NOTIFY_ENABLED: 'true' })).toBe(true);
  });

  it('stays inert if Mailgun is half-configured (domain missing)', () => {
    const { MAILGUN_DOMAIN: _omit, ...rest } = creds;
    void _omit;
    expect(replyNotifyArmed({ ...rest, REPLY_NOTIFY_ENABLED: 'true' })).toBe(false);
  });
});

describe('snippetOf', () => {
  it('collapses whitespace and trims', () => {
    expect(snippetOf('  hello   world\n\tfoo ')).toBe('hello world foo');
  });
  it('caps long bodies with an ellipsis', () => {
    expect(snippetOf('abcdefghij', 5)).toBe('abcd…');
  });
  it('leaves a short body intact', () => {
    expect(snippetOf('short', 200)).toBe('short');
  });
});

describe('storyTitleFor', () => {
  it('uses the market hook when the conversation is in the live feed', () => {
    expect(storyTitleFor(feed([market({ id: 'a', hook: 'Fed holds rates' })]), 'a')).toBe('Fed holds rates');
  });
  it('falls back to the market title when there is no hook', () => {
    expect(storyTitleFor(feed([market({ id: 'a', hook: '', title: 'Plain title' })]), 'a')).toBe('Plain title');
  });
  it('falls back to a generic label when the market has aged out of the feed', () => {
    expect(storyTitleFor(feed([market({ id: 'a' })]), 'gone')).toBe('your story');
    expect(storyTitleFor(null, 'gone')).toBe('your story');
  });
});

describe('buildReplyEmail', () => {
  const reply: PendingReply = {
    commentId: 'c1', marketId: 'fed:july', parentEmail: 'you@x.com',
    replierName: 'Avery', snippet: 'Good point — the criteria say otherwise.',
  };
  const unsub = 'https://crowdtells.com/?reply_unsubscribe=tok-1';
  const opts = { siteUrl: 'https://crowdtells.com', storyTitle: 'Will the Fed cut in July?', unsubscribeUrl: unsub };

  it('builds a "<name> replied" subject naming the story', () => {
    const out = buildReplyEmail(reply, opts);
    expect(out.subject).toBe('Avery replied to your comment on Will the Fed cut in July?');
  });

  it('links to the story share page (slugged market id) in html and text', () => {
    const out = buildReplyEmail(reply, opts);
    expect(out.html).toContain('/s/fed-july');
    expect(out.text).toContain('/s/fed-july');
  });

  it('quotes the reply snippet and carries the first-party opt-out, never the tracking domain', () => {
    const out = buildReplyEmail(reply, opts);
    expect(out.html).toContain('Good point');
    expect(out.html).toContain(`href="${unsub}"`);
    expect(out.text).toContain(`Turn off reply notifications: ${unsub}`);
    expect(out.html).not.toContain('email.mg');
    expect(out.html).not.toContain('%unsubscribe_url%');
  });

  it('locks the color scheme and ESCAPES every user-supplied field (name, title, snippet)', () => {
    const out = buildReplyEmail(
      { ...reply, replierName: '<b>x</b>', snippet: 'a <script>alert(1)</script> & "q"' },
      { ...opts, storyTitle: 'Title <img> & "x"' },
    );
    expect(out.html).toContain('color-scheme');
    expect(out.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(out.html).toContain('a &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;');
    expect(out.html).toContain('Title &lt;img&gt; &amp; &quot;x&quot;');
    expect(out.html).not.toContain('<script>');
    expect(out.html).not.toContain('<img>');
  });

  it('defaults a blank replier name to "Someone"', () => {
    const out = buildReplyEmail({ ...reply, replierName: '' }, opts);
    expect(out.subject).toBe('Someone replied to your comment on Will the Fed cut in July?');
  });
});
