import { describe, expect, it } from 'vitest';
import type { Feed, Market } from '../src/lib/types';
import {
  buildDigest,
  dedupeRecipients,
  filterByTopics,
  planRecipientGroups,
  selectDigestStories,
} from './send-digest';

function market(over: Partial<Market>): Market {
  return {
    id: 'm', source: 'polymarket', title: 'T', marketUrl: 'https://polymarket.com/event/s',
    image: '', category: 'Politics', description: '', favored: 'Yes', oddsPct: 60, alt: null,
    divergence: null, movement24h: 2, movement7d: 5, oddsHistory: [], volume: 1e6, volume24h: 1e5,
    liquidity: 1e4, openInterest: 1e4, comments: 0, score: 1, startDate: null,
    endDate: '2026-12-01T00:00:00Z', status: 'active', hook: 'A hook', analysis: 'a', take: '',
    marketRead: '', crowdVsCoverage: '', synthesis: null, sources: [], grounded: true,
    generatedAt: '2026-06-14T00:00:00Z', updatedAt: '2026-06-15T00:00:00Z', resolvedOutcome: null,
    calledCorrectly: null, resolvedAt: null, ...over,
  };
}

const feed = (markets: Market[]): Feed => ({ generatedAt: 'x', version: 1, markets });
const opts = { cadence: 'weekly' as const, siteUrl: 'https://crowdtells.com' };

describe('selectDigestStories', () => {
  it('includes only active + briefed markets', () => {
    const out = selectDigestStories([
      market({ id: 'a' }),
      market({ id: 'b', status: 'archived' }), // excluded
      market({ id: 'c', generatedAt: null, hook: '' }), // excluded (no briefing)
      market({ id: 'd', status: 'resolved' }), // excluded (not active)
    ]);
    expect(out.map((m) => m.id)).toEqual(['a']);
  });

  it('leads with the biggest 7d mover, then by score, deduped', () => {
    const out = selectDigestStories([
      market({ id: 'small', movement7d: 1, score: 9 }),
      market({ id: 'mover', movement7d: -40, score: 1 }),
      market({ id: 'mid', movement7d: 2, score: 5 }),
    ]);
    expect(out[0]?.id).toBe('mover'); // biggest |move| leads
    expect(out).toHaveLength(3);
    expect(new Set(out.map((m) => m.id)).size).toBe(3); // no dupes
  });

  it('caps at the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => market({ id: `m${i}`, score: i }));
    expect(selectDigestStories(many)).toHaveLength(6);
  });

  it('leads on the 24h mover for a daily, but the 7d mover for a weekly', () => {
    const markets = [
      market({ id: 'week', movement7d: 40, movement24h: 1, score: 1 }),
      market({ id: 'day', movement7d: 2, movement24h: 30, score: 1 }),
    ];
    expect(selectDigestStories(markets, 6, 'daily')[0]?.id).toBe('day');
    expect(selectDigestStories(markets, 6, 'weekly')[0]?.id).toBe('week');
  });
});

describe('buildDigest', () => {
  it('builds subject from the lead hook and a story count', () => {
    const out = buildDigest(feed([market({ id: 'a', hook: 'Fed holds steady', movement7d: 9 })]), opts);
    expect(out.subject).toContain('Fed holds steady');
    expect(out.storyCount).toBe(1);
  });

  it('emits per-story links, the structured odds line, and the supplied first-party unsubscribe link', () => {
    const unsub = 'https://crowdtells.com/?unsubscribe=tok-123';
    const out = buildDigest(feed([market({ id: 'abc', favored: 'Yes', oddsPct: 63, movement7d: 4 })]), {
      ...opts,
      unsubscribeUrl: unsub,
    });
    expect(out.html).toContain('/s/');
    expect(out.html).toContain('Yes 63% ▲4');
    // Opt-out is a first-party token link on crowdtells.com (valid cert + DB
    // writeback) — never Mailgun's tracking subdomain.
    expect(out.html).toContain(`href="${unsub}"`);
    expect(out.text).toContain(`Unsubscribe: ${unsub}`);
    expect(out.html).not.toContain('%unsubscribe_url%');
    expect(out.html).not.toContain('email.mg');
  });

  it('locks the color scheme and sets an inbox preheader from the lead story', () => {
    const out = buildDigest(feed([market({ id: 'abc', hook: 'Fed holds steady', movement7d: 9 })]), opts);
    expect(out.html).toContain('color-scheme'); // light-only meta (no dark-mode wash)
    expect(out.html).toMatch(/display:none[\s\S]*Fed holds steady/); // hidden preheader leads with the story
  });

  it('escapes HTML in story hooks', () => {
    const out = buildDigest(feed([market({ id: 'x', hook: 'A <script> & "quote"' })]), opts);
    expect(out.html).toContain('A &lt;script&gt; &amp; &quot;quote&quot;');
    expect(out.html).not.toContain('<script>');
  });

  it('renders a per-issue dateline (ET) in the header and text, so Gmail cannot trim the header as repeated', () => {
    // 2026-06-21T18:00:00Z is Sunday June 21 in ET → "Sunday, June 21".
    const out = buildDigest(feed([market({ id: 'a', hook: 'Fed holds steady' })]), {
      ...opts,
      date: new Date('2026-06-21T18:00:00Z'),
    });
    expect(out.html).toContain('Sunday, June 21');
    expect(out.text).toContain('Sunday, June 21');
  });

  it('handles an empty feed without throwing', () => {
    const out = buildDigest(feed([]), opts);
    expect(out.storyCount).toBe(0);
    expect(out.subject).toMatch(/brief/i);
  });
});

describe('filterByTopics', () => {
  const ms = [
    market({ id: 'p', category: 'Politics' }),
    market({ id: 'c', category: 'Crypto' }),
    market({ id: 's', category: 'Sports' }),
  ];
  it('returns all markets when topics is empty/absent (no filter)', () => {
    expect(filterByTopics(ms, []).map((m) => m.id)).toEqual(['p', 'c', 's']);
    expect(filterByTopics(ms, undefined).map((m) => m.id)).toEqual(['p', 'c', 's']);
  });
  it('keeps only markets in the chosen categories', () => {
    expect(filterByTopics(ms, ['Politics', 'Sports']).map((m) => m.id)).toEqual(['p', 's']);
  });
  it('is empty when no market matches the topics', () => {
    expect(filterByTopics(ms, ['Weather'])).toEqual([]);
  });
});

describe('planRecipientGroups', () => {
  it('groups recipients by their exact (sorted) topic set; all-topics cohort together', () => {
    const groups = planRecipientGroups([
      { email: 'a@x.com', topics: [] },
      { email: 'b@x.com', topics: ['Crypto', 'Politics'] },
      { email: 'c@x.com', topics: ['Politics', 'Crypto'] }, // same set, different order
      { email: 'd@x.com', topics: [] },
    ]);
    const all = groups.find((g) => g.topics.length === 0);
    const cryptoPolitics = groups.find((g) => g.topics.join(',') === 'Crypto,Politics');
    expect(groups).toHaveLength(2);
    expect(all?.emails.sort()).toEqual(['a@x.com', 'd@x.com']);
    expect(cryptoPolitics?.emails.sort()).toEqual(['b@x.com', 'c@x.com']);
  });
  it('de-duplicates case-variant emails within a cohort', () => {
    const groups = planRecipientGroups([
      { email: 'News@x.com', topics: [] },
      { email: 'news@x.com', topics: [] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.emails).toEqual(['News@x.com']);
  });

  it('carries each kept address its unsubscribe token (first-seen wins)', () => {
    const groups = planRecipientGroups([
      { email: 'A@x.com', topics: [], unsubscribeToken: 'tok-A' },
      { email: 'a@x.com', topics: [], unsubscribeToken: 'tok-dupe' }, // deduped away
      { email: 'b@x.com', topics: [], unsubscribeToken: 'tok-B' },
    ]);
    const all = groups.find((g) => g.topics.length === 0);
    expect(all?.emails).toEqual(['A@x.com', 'b@x.com']);
    expect(all?.tokens['A@x.com']).toBe('tok-A'); // the kept casing keeps its own token
    expect(all?.tokens['b@x.com']).toBe('tok-B');
  });

  it('omits tokens for subscribers without one (pre-migration)', () => {
    const groups = planRecipientGroups([{ email: 'a@x.com', topics: [] }]);
    expect(groups[0]?.tokens).toEqual({});
  });
});

describe('dedupeRecipients', () => {
  it('collapses case-variant duplicates to one, keeping first-seen casing', () => {
    expect(dedupeRecipients(['News@x.com', 'news@x.com', 'a@b.com'])).toEqual([
      'News@x.com',
      'a@b.com',
    ]);
  });
  it('trims, drops blanks/nullish, and preserves order', () => {
    expect(dedupeRecipients([' a@b.com ', '', null, undefined, 'c@d.com', 'A@B.COM'])).toEqual([
      'a@b.com',
      'c@d.com',
    ]);
  });
});
