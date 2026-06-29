import { afterEach, describe, expect, it } from 'vitest';
import {
  makeSnippetResolver,
  matchSnippets,
  parseFeedSnippets,
  snippetPoolFromArticles,
  snippetsForMarket,
  type SnippetItem,
} from './snippets';
import { salientTokens, type NormArticle } from './breaking';
import type { Config } from './config';
import type { Headline } from './news';
import type { Market } from '../../src/lib/types';

const market = (title: string, category: string): Market =>
  ({ title, category }) as unknown as Market;

const rss = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Bitcoin rallies past $100,000 as ETF inflows surge</title>
  <description>Bitcoin climbed above $100,000 on Thursday for the first time, driven by record inflows into spot exchange-traded funds and renewed institutional demand.</description>
</item>
<item>
  <title>Senate advances funding bill ahead of shutdown deadline</title>
  <description>The Senate voted to advance a stopgap spending measure on Wednesday, easing fears of a government shutdown when current funding lapses at the end of the month.</description>
</item>
<item>
  <title>Paywalled story</title>
  <description>Subscribe to read the full story and support our journalism.</description>
</item>
</channel></rss>`;

describe('parseFeedSnippets', () => {
  it('keeps items with real prose, drops paywall/junk, tags the outlet', () => {
    const items = parseFeedSnippets(rss, 'coindesk.com');
    expect(items).toHaveLength(2); // the paywall item is dropped
    expect(items[0]).toMatchObject({ outlet: 'coindesk.com' });
    expect(items[0]?.text).toContain('first time');
    expect(items[0]?.tokens.has('btc')).toBe(true); // salientTokens canonicalizes bitcoin→btc
  });

  it('parses Atom <entry> feeds via <summary>', () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Hurricane warning issued for the Gulf Coast</title>
        <summary>Forecasters issued a hurricane warning for parts of the Gulf Coast on Friday as the storm strengthened to a Category 3 with sustained winds near 120 mph.</summary>
      </entry></feed>`;
    const items = parseFeedSnippets(atom, 'nws.gov');
    expect(items).toHaveLength(1);
    expect(items[0]?.text).toContain('Category 3');
  });
});

describe('snippetsForMarket', () => {
  const pool: SnippetItem[] = parseFeedSnippets(rss, 'coindesk.com');

  it('matches a market that shares salient tokens with a pooled item', () => {
    const out = snippetsForMarket(market('Will Bitcoin hit $100,000 in 2026?', 'Crypto'), pool);
    expect(out).toHaveLength(1);
    expect(out[0]?.outlet).toBe('coindesk.com');
    expect(out[0]?.text).toContain('Bitcoin');
  });

  it('returns nothing for a market with no token overlap', () => {
    expect(snippetsForMarket(market('Will the Lakers win the NBA title?', 'Sports'), pool)).toEqual(
      [],
    );
  });

  it('returns nothing for an empty pool', () => {
    expect(snippetsForMarket(market('Will Bitcoin hit $100,000?', 'Crypto'), [])).toEqual([]);
  });

  it('de-duplicates near-identical syndicated prose and caps the count', () => {
    const dup: SnippetItem = { ...pool[0]!, outlet: 'reuters.com' };
    const out = snippetsForMarket(
      market('Will Bitcoin hit $100,000 in 2026?', 'Crypto'),
      [pool[0]!, dup],
      3,
    );
    expect(out).toHaveLength(1); // same text → one excerpt
  });
});

describe('snippetPoolFromArticles', () => {
  const art = (title: string, snippet?: string): NormArticle => ({
    title,
    domain: 'npr.org',
    url: 'https://npr.org/x',
    seenAt: '2026-06-18T12:00:00Z',
    topic: 'Politics',
    tokens: salientTokens(title),
    snippet,
  });

  it('keeps only articles that carried prose, mapping domain→outlet', () => {
    const pool = snippetPoolFromArticles([
      art(
        'Senate passes the funding bill',
        'The Senate passed a stopgap measure Wednesday to avert a shutdown.',
      ),
      art('Headline with no description'), // no snippet → dropped
    ]);
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ outlet: 'npr.org' });
    expect(pool[0]?.text).toContain('stopgap');
  });
});

describe('matchSnippets', () => {
  const items: SnippetItem[] = [
    {
      outlet: 'a.com',
      text: 'Bitcoin topped $100k on heavy ETF inflows.',
      tokens: salientTokens('Bitcoin tops 100k on ETF inflows'),
    },
    {
      outlet: 'b.com',
      text: 'The Lakers advanced to the finals.',
      tokens: salientTokens('Lakers advance to the finals'),
    },
  ];
  it('returns only items meeting the overlap threshold', () => {
    const want = salientTokens('Will Bitcoin ETF inflows push 100k');
    const out = matchSnippets(want, items, 3);
    expect(out).toHaveLength(1);
    expect(out[0]?.outlet).toBe('a.com');
  });
  it('returns [] when want or items are empty', () => {
    expect(matchSnippets(new Set(), items)).toEqual([]);
    expect(matchSnippets(salientTokens('anything'), [])).toEqual([]);
  });
});

describe('makeSnippetResolver', () => {
  const cfg = (over: Partial<Config> = {}): Config =>
    ({ snippetProbeEnabled: true, userAgent: 'test', ...over }) as unknown as Config;
  const pool: SnippetItem[] = parseFeedSnippets(rss, 'coindesk.com');

  it('returns shared-pool matches without probing when the pool hits', async () => {
    const resolver = makeSnippetResolver(pool, cfg());
    const out = await resolver.forMarket(
      market('Will Bitcoin hit $100,000 in 2026?', 'Crypto'),
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.outlet).toBe('coindesk.com');
  });

  it('returns [] (no probe) for a pool miss when probing is disabled', async () => {
    const resolver = makeSnippetResolver(pool, cfg({ snippetProbeEnabled: false }));
    const headlines: Headline[] = [
      {
        title: 'x',
        outlet: 'Omaha',
        source: { domain: 'omaha.com', url: '', title: '' },
        publishedAt: null,
      },
    ];
    const out = await resolver.forMarket(
      market('Will the WHO declare a hantavirus pandemic?', 'Health'),
      headlines,
    );
    expect(out).toEqual([]);
  });
});

describe('makeSnippetResolver — tier-2 probe (network path)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const cfg = (over: Partial<Config> = {}): Config =>
    ({ snippetProbeEnabled: true, userAgent: 'test', ...over }) as unknown as Config;
  const headline = (domain: string): Headline => ({
    title: 'x',
    outlet: domain,
    source: { domain, url: '', title: '' },
    publishedAt: null,
  });
  const omahaMarket = market(
    'Will the WHO declare a hantavirus pandemic from the Omaha cruise ship?',
    'Health',
  );

  it('probes a niche publisher feed on a pool miss, matches, and caches the domain', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('omaha.com/feed')) {
        return new Response(
          `<rss><channel><item>
            <title>Hantavirus cases confirmed aboard the Omaha cruise ship</title>
            <description>Health officials confirmed three hantavirus cases tied to a cruise ship docked in Omaha on Tuesday, urging passengers to watch for symptoms.</description>
          </item></channel></rss>`,
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const resolver = makeSnippetResolver([], cfg()); // empty pool → forces the probe
    const out = await resolver.forMarket(omahaMarket, [headline('omaha.com')]);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toContain('three hantavirus cases');
    expect(calls.some((c) => c.includes('omaha.com/feed'))).toBe(true);

    const before = calls.length;
    await resolver.forMarket(omahaMarket, [headline('omaha.com')]); // same domain again
    expect(calls.length).toBe(before); // domain cache → no re-fetch
  });

  it('does not probe when SNIPPET_PROBE_ENABLED is off', async () => {
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched++;
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const resolver = makeSnippetResolver([], cfg({ snippetProbeEnabled: false }));
    const out = await resolver.forMarket(omahaMarket, [headline('omaha.com')]);
    expect(out).toEqual([]);
    expect(fetched).toBe(0);
  });

  it('does not probe a domain already in the shared pool', async () => {
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched++;
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const resolver = makeSnippetResolver([], cfg());
    // npr.org is in RSS_FEEDS (POOL_DOMAINS) → already covered by the pool, never probed.
    const out = await resolver.forMarket(market('Some niche Senate story', 'Politics'), [
      headline('npr.org'),
    ]);
    expect(out).toEqual([]);
    expect(fetched).toBe(0);
  });
});
