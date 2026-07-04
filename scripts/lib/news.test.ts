import { describe, expect, it, vi } from 'vitest';
import { extractSnippet, fetchHeadlines, parseRss, plainText } from './news';
import * as http from './http';
import type { Config } from './config';

const rss = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Shutdown talks collapse again - Reuters</title>
  <link>https://news.google.com/rss/articles/AAA</link>
  <pubDate>Wed, 10 Jun 2026 10:00:00 GMT</pubDate>
  <source url="https://www.reuters.com">Reuters</source>
</item>
<item>
  <title>A different read on the budget fight - Politico</title>
  <link>https://news.google.com/rss/articles/BBB</link>
  <source url="https://www.politico.com">Politico</source>
</item>
<item>
  <title>Reuters covers it again - Reuters</title>
  <link>https://news.google.com/rss/articles/CCC</link>
  <source url="https://www.reuters.com">Reuters</source>
</item>
</channel></rss>`;

describe('fetchHeadlines', () => {
  it('bounds the Google News query to recent coverage (when:14d)', async () => {
    const spy = vi.spyOn(http, 'getText').mockResolvedValue('<rss></rss>');
    const cfg = { userAgent: 'x', newsPerMarket: 8 } as Config;
    await fetchHeadlines('iran nuclear deal', cfg);
    // Stale citations read as "news from last week" in a fresh briefing — the recency
    // operator must ride inside the encoded q= param on every headline fetch.
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('iran nuclear deal when:14d')),
      expect.anything(),
    );
    vi.restoreAllMocks();
  });
});

describe('parseRss', () => {
  it('parses outlet, domain, and cleans titles', () => {
    const items = parseRss(rss, 10);
    expect(items).toHaveLength(2); // reuters deduped
    expect(items[0]).toMatchObject({
      title: 'Shutdown talks collapse again',
      outlet: 'Reuters',
      source: { domain: 'reuters.com', url: 'https://www.reuters.com' },
    });
    expect(items[1]?.outlet).toBe('Politico');
    expect(items[1]?.source.domain).toBe('politico.com');
  });

  it('exposes the article link separately from the publisher origin', () => {
    const items = parseRss(rss, 10);
    // `url` = publisher origin (for attribution/isBasedOn); `articleUrl` = the link a
    // reader clicks to reach the actual story (Google News only gives a redirect to it).
    expect(items[0]?.source.url).toBe('https://www.reuters.com');
    expect(items[0]?.source.articleUrl).toBe('https://news.google.com/rss/articles/AAA');
  });

  it('persists a normalized publishedAt on the source when the feed dates it', () => {
    const items = parseRss(rss, 10);
    // Reuters item has a pubDate → ISO on the source (powers the TrendChart ticks).
    expect(items[0]?.source.publishedAt).toBe('2026-06-10T10:00:00.000Z');
    // Politico item has no pubDate → field absent (not an invalid date).
    expect(items[1]?.source.publishedAt).toBeUndefined();
    // The Headline mirrors the SAME normalized value (never the raw RFC-822 string),
    // and an undated item is null — one source of truth for "when published".
    expect(items[0]?.publishedAt).toBe('2026-06-10T10:00:00.000Z');
    expect(items[1]?.publishedAt).toBeNull();
  });

  it('omits articleUrl when no publisher origin is given (url already is the link)', () => {
    const xml = `<rss><channel>
      <item><title>Bare item - Reuters</title><link>https://news.google.com/rss/articles/ZZZ</link></item>
    </channel></rss>`;
    const items = parseRss(xml, 10);
    expect(items[0]?.source.url).toBe('https://news.google.com/rss/articles/ZZZ');
    expect(items[0]?.source.articleUrl).toBeUndefined();
  });

  it('respects the limit', () => {
    expect(parseRss(rss, 1)).toHaveLength(1);
  });

  it('returns nothing for empty feeds', () => {
    expect(parseRss('<rss></rss>', 5)).toEqual([]);
  });

  it('skips non-journalistic sources (social/video)', () => {
    const xml = `<rss><channel>
      <item><title>Clip - YouTube</title><link>https://news.google.com/x</link>
        <source url="https://www.youtube.com">YouTube</source></item>
      <item><title>Real report - Reuters</title><link>https://news.google.com/y</link>
        <source url="https://www.reuters.com">Reuters</source></item>
    </channel></rss>`;
    const items = parseRss(xml, 10);
    expect(items).toHaveLength(1);
    expect(items[0]?.source.domain).toBe('reuters.com');
  });

  it('skips trading/betting platforms that keyword-stuff market pages (and subdomains)', () => {
    // Coinbase republishing the market question, DraftKings' weather report, Robinhood's
    // price page — not journalism. A real outlet on the same topic survives.
    const xml = `<rss><channel>
      <item><title>Highest temperature in Washington DC on Jun 17, 2026? - Coinbase</title>
        <link>https://news.google.com/a</link><source url="https://www.coinbase.com">Coinbase</source></item>
      <item><title>MLB Weather Report - DraftKings Network</title>
        <link>https://news.google.com/b</link><source url="https://dknetwork.draftkings.com">DK Network</source></item>
      <item><title>Miami Daily Temperature Low - Robinhood</title>
        <link>https://news.google.com/c</link><source url="https://robinhood.com">Robinhood</source></item>
      <item><title>Southern California heat wave intensifies - Los Angeles Times</title>
        <link>https://news.google.com/d</link><source url="https://www.latimes.com">Los Angeles Times</source></item>
    </channel></rss>`;
    const items = parseRss(xml, 10);
    expect(items.map((i) => i.source.domain)).toEqual(['latimes.com']); // only the real outlet
  });
});

describe('plainText', () => {
  it('strips CDATA, tags, and decodes entities', () => {
    expect(plainText('<![CDATA[<p>Hello &amp; <b>welcome</b>]]>')).toBe('Hello & welcome');
    expect(plainText('Rates held at 5.5&#37;')).toBe('Rates held at 5.5%');
    expect(plainText(null)).toBe('');
  });
});

describe('extractSnippet', () => {
  const title = 'Mangione legal team drops psychiatric defense';

  it('keeps a real publisher summary, capped on a word boundary', () => {
    const desc =
      'In a court filing Thursday, the defense said it would not present psychiatric evidence in the 28-year-old’s state murder case, a reversal from a day earlier.';
    const s = extractSnippet(desc, title);
    expect(s).toContain('court filing Thursday');
    expect(s.length).toBeLessThanOrEqual(241);
  });

  it('rejects a Google-News-style description that is just the headline + publisher', () => {
    expect(extractSnippet(`<a href="x">${title}</a>&nbsp;&nbsp;NPR`, title)).toBe('');
  });

  it('rejects paywall/consent boilerplate and too-short blurbs', () => {
    expect(
      extractSnippet('Subscribe to read the full story and support our journalism.', title),
    ).toBe('');
    expect(
      extractSnippet(
        'Please enable JavaScript to view the comments powered by our provider.',
        title,
      ),
    ).toBe('');
    expect(extractSnippet('Short.', title)).toBe('');
    expect(extractSnippet(undefined, title)).toBe('');
  });
});
