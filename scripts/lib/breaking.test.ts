import { describe, expect, it } from 'vitest';
import {
  parseSeenDate,
  parseRss,
  salientTokens,
  clusterArticles,
  toBreakingItems,
  filterRecent,
  pinToMarkets,
  dedupePool,
  consolidateClusters,
  RSS_FEEDS,
} from './breaking';
import { makeMarket } from '../../src/test/factory';
import type { BreakingItem } from '../../src/lib/types';

const art = (title: string, domain: string, seenAt: string, topic = 'Economics') => ({
  title,
  domain,
  url: `https://${domain}/x`,
  seenAt,
  topic,
  tokens: salientTokens(title),
});

const NOW = Date.parse('2026-06-17T12:00:00Z');
const WINDOW = 120 * 60_000;
const recent = '2026-06-17T11:30:00.000Z';

describe('parseSeenDate', () => {
  it('parses GDELT compact timestamps', () => {
    expect(parseSeenDate('20260617T113000Z')).toBe('2026-06-17T11:30:00.000Z');
  });
  it('returns null for malformed input', () => {
    expect(parseSeenDate('2026-06-17')).toBeNull();
    expect(parseSeenDate(undefined)).toBeNull();
  });
});

describe('salientTokens', () => {
  it('keeps entity tokens, aliases, and drops scaffolding/stopwords', () => {
    const t = salientTokens('Latest report: Bitcoin surges as the Fed meets');
    expect(t.has('btc')).toBe(true); // bitcoin → btc alias
    expect(t.has('fed')).toBe(true);
    expect(t.has('surges')).toBe(true);
    expect(t.has('the')).toBe(false); // stopword
    expect(t.has('report')).toBe(false); // scaffolding
    expect(t.has('latest')).toBe(false);
  });
});

describe('parseRss', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[Fed holds rates steady]]></title><link>https://bbc.com/a</link><pubDate>Wed, 17 Jun 2026 11:30:00 GMT</pubDate></item>
    <item><title>Markets rally &amp; bonds dip</title><link>https://bbc.com/b</link><pubDate>Wed, 17 Jun 2026 11:00:00 GMT</pubDate></item>
    <item><title>No date here</title><link>https://bbc.com/c</link></item>
  </channel></rss>`;
  it('parses items (CDATA, entities, pubDate), tags the feed domain/topic, skips dateless', () => {
    const arts = parseRss(xml, { domain: 'bbc.com', topic: 'World' });
    expect(arts).toHaveLength(2); // the dateless item is skipped
    expect(arts[0]).toMatchObject({
      title: 'Fed holds rates steady',
      domain: 'bbc.com',
      topic: 'World',
      seenAt: '2026-06-17T11:30:00.000Z',
    });
    expect(arts[1]!.title).toBe('Markets rally & bonds dip'); // entity decoded
  });

  it('decodes numeric entities (smart quotes / em-dashes) in titles', () => {
    const xml = `<rss><channel>
      <item><title>&#8216;A Brighter Word&#8217; &#8212; review</title><link>https://variety.com/a</link><pubDate>Wed, 17 Jun 2026 11:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const arts = parseRss(xml, { domain: 'variety.com', topic: 'Entertainment' });
    expect(arts[0]!.title).toBe('‘A Brighter Word’ — review');
  });

  it('captures a clean <description> snippet, dropping title-repeats (feeds the briefing layer)', () => {
    const xml = `<rss><channel>
      <item><title>Senate advances the funding bill</title><link>https://npr.org/a</link>
        <pubDate>Wed, 17 Jun 2026 11:00:00 GMT</pubDate>
        <description>The Senate voted Wednesday to advance a stopgap spending measure, easing fears of a shutdown at month's end.</description></item>
      <item><title>Just the title repeated</title><link>https://npr.org/b</link>
        <pubDate>Wed, 17 Jun 2026 11:00:00 GMT</pubDate>
        <description>Just the title repeated&nbsp;&nbsp;NPR</description></item>
    </channel></rss>`;
    const arts = parseRss(xml, { domain: 'npr.org', topic: 'Politics' });
    expect(arts[0]!.snippet).toContain('stopgap spending measure');
    expect(arts[1]!.snippet).toBeUndefined(); // title-repeat → no usable prose
  });

  it('parses Atom feeds (<entry>, <link href rel=alternate>, <published>)', () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Chip giant ships new GPU</title>
        <link rel="alternate" href="https://theregister.com/a"/>
        <link rel="self" href="https://theregister.com/self"/>
        <published>2026-06-17T11:30:00Z</published></entry>
      <entry><title>Crypto exchange hacked</title>
        <link href="https://blockworks.co/b"/>
        <published>2026-06-17T10:00:00Z</published></entry>
    </feed>`;
    const arts = parseRss(atom, { domain: 'theregister.com', topic: 'Tech' });
    expect(arts).toHaveLength(2);
    expect(arts[0]).toMatchObject({ title: 'Chip giant ships new GPU', url: 'https://theregister.com/a' }); // alternate link
    expect(arts[1]!.url).toBe('https://blockworks.co/b');
  });
});

describe('clusterArticles + toBreakingItems', () => {
  it('corroborates the same event across sources (GDELT + RSS, distinct domains)', () => {
    const arts = [
      art('Fed holds interest rates steady', 'reuters.com', recent, 'Economics'),
      art('Federal Reserve keeps rates steady', 'bbc.com', recent, 'World'),
    ];
    const items = toBreakingItems(clusterArticles(arts), NOW, WINDOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.outlets.slice().sort()).toEqual(['bbc.com', 'reuters.com']);
  });

  it('clusters same-event articles, counts distinct domains, gates on corroboration', () => {
    const arts = [
      art('Fed holds interest rates steady', 'reuters.com', recent),
      art('Federal Reserve keeps rates steady at meeting', 'bbc.com', recent),
      art('Hurricane makes landfall in Florida', 'cnn.com', recent), // single source
    ];
    const items = toBreakingItems(clusterArticles(arts), NOW, WINDOW);
    const fed = items.find((i) => /rates/i.test(i.title));
    expect(fed).toBeTruthy();
    expect(fed!.outlets.length).toBe(2); // reuters + bbc corroborate
    // the single-domain hurricane cluster is NOT corroborated → dropped
    expect(items.some((i) => /Hurricane/i.test(i.title))).toBe(false);
  });

  it('drops clusters first seen outside the recent window', () => {
    const old = '2026-06-17T08:00:00.000Z'; // 4h ago, beyond the 2h window
    const arts = [art('Fed holds rates steady', 'reuters.com', old), art('Fed keeps rates steady', 'bbc.com', old)];
    expect(toBreakingItems(clusterArticles(arts), NOW, WINDOW)).toEqual([]);
  });

  it('tracks firstSeen (oldest member) and lastSeen (freshest member)', () => {
    const t0 = '2026-06-17T09:30:00.000Z'; // 2.5h ago
    const t1 = '2026-06-17T11:45:00.000Z'; // 15m ago
    const arts = [
      art('Fed holds interest rates steady', 'reuters.com', t1),
      art('Federal Reserve keeps rates steady', 'bbc.com', t0),
    ];
    const [c] = clusterArticles(arts);
    expect(c!.firstSeen).toBe(t0);
    expect(c!.lastSeen).toBe(t1);
    const SIX_H = 360 * 60_000;
    expect(toBreakingItems(clusterArticles(arts), NOW, SIX_H)[0]!.lastSeen).toBe(t1);
  });

  it('orders developing items by freshest activity (lastSeen) first', () => {
    const older = '2026-06-17T10:30:00.000Z'; // 90m ago
    const newer = '2026-06-17T11:50:00.000Z'; // 10m ago
    const arts = [
      art('Bitcoin tops $200k milestone', 'coindesk.com', older, 'Crypto'),
      art('Bitcoin surges past $200k', 'cointelegraph.com', older, 'Crypto'),
      art('Senate passes the spending bill', 'reuters.com', newer),
      art('Senate approves the spending package', 'bbc.com', newer),
    ];
    const items = toBreakingItems(clusterArticles(arts), NOW, 360 * 60_000);
    expect(items).toHaveLength(2); // two distinct corroborated clusters
    expect(items[0]!.title).toMatch(/Senate/); // newer activity sorts first
  });
});

describe('filterRecent (pre-cluster pool filter)', () => {
  const SIX_H = 360 * 60_000;

  it('excludes a stale corroborating article so the fresh cluster survives where firstSeen-keying would drop it', () => {
    const fresh1 = '2026-06-17T11:50:00.000Z'; // 10m ago
    const fresh2 = '2026-06-17T11:40:00.000Z'; // 20m ago
    const stale = '2026-06-17T03:00:00.000Z'; // 9h ago — shares tokens, beyond 6h
    const pool = [
      art('Senate passes the spending bill', 'reuters.com', fresh1),
      art('Senate approves the spending package', 'bbc.com', fresh2),
      art('Senate spending bill first floated last week', 'cnn.com', stale),
    ];
    // OLD path (cluster the whole pool): the stale member back-dates firstSeen to
    // 9h ago, so the window drops the whole (genuinely developing) cluster.
    expect(toBreakingItems(clusterArticles(pool), NOW, SIX_H)).toHaveLength(0);
    // NEW path: pre-filter drops the stale article; the two fresh outlets still
    // corroborate and the cluster survives with a fresh firstSeen.
    const items = toBreakingItems(clusterArticles(filterRecent(pool, NOW, SIX_H)), NOW, SIX_H);
    expect(items).toHaveLength(1);
    expect(items[0]!.outlets.slice().sort()).toEqual(['bbc.com', 'reuters.com']);
  });

  it('drops articles with an unparseable seenAt (NaN never passes the window)', () => {
    const arts = [art('Valid fresh story', 'bbc.com', '2026-06-17T11:55:00.000Z'), art('Bad date', 'cnn.com', 'not-a-date')];
    expect(filterRecent(arts, NOW, SIX_H).map((a) => a.domain)).toEqual(['bbc.com']);
  });
});

describe('pinToMarkets', () => {
  const item = (title: string, topic: string): BreakingItem => ({
    title,
    outlets: ['a.com', 'b.com'],
    url: 'https://a.com/x',
    topic,
    firstSeen: recent,
  });

  it('pins a cluster to the market it is about, leaving unrelated markets alone', () => {
    const items = [
      item('Fed holds interest rates steady', 'Economics'),
      item('Lakers win the championship', 'Sports'),
    ];
    const fed = makeMarket({ id: 'fed', title: 'Will the Fed cut interest rates in July?', status: 'active' });
    const btc = makeMarket({ id: 'btc', title: 'Will Bitcoin hit $200k?', status: 'active' });
    pinToMarkets(items, [fed, btc]);
    expect(fed.breaking?.map((b) => b.topic)).toEqual(['Economics']);
    expect(btc.breaking).toBeUndefined();
  });

  it('never pins to a non-active market', () => {
    const fed = makeMarket({ id: 'fed', title: 'Fed cuts interest rates', status: 'resolved' });
    pinToMarkets([item('Fed holds interest rates steady', 'Economics')], [fed]);
    expect(fed.breaking).toBeUndefined();
  });

  it('stamps the matched marketId on the pinned item for in-app deep-linking', () => {
    const items = [item('Fed holds interest rates steady', 'Economics')];
    const fed = makeMarket({ id: 'fed', title: 'Will the Fed cut interest rates in July?', status: 'active' });
    pinToMarkets(items, [fed]);
    expect(items[0]!.marketId).toBe('fed');
    expect(fed.breaking?.[0]?.marketId).toBe('fed');
  });

  it('clears a stale pin from a prior run when nothing matches this run', () => {
    const fed = makeMarket({ id: 'fed', title: 'Will the Fed cut interest rates in July?', status: 'active' });
    fed.breaking = [item('Old stale headline about something', 'Economics')];
    pinToMarkets([item('Lakers win the championship tonight', 'Sports')], [fed]);
    expect(fed.breaking).toBeUndefined();
  });

  it('pins a sparse single-entity market on its lone DISTINCTIVE token (post-stoplist)', () => {
    // "Will the Lakers win the title?" reduces to {lakers} once win/title are stopped; it
    // must still pin a Lakers story on that one strong entity (>=5 chars) rather than be
    // stranded by the sharper stoplist.
    const lakers = makeMarket({
      id: 'lal',
      title: 'Will the Lakers win the title?',
      favored: 'Lakers',
      status: 'active',
    });
    pinToMarkets([item('Lakers sign a new head coach for next season', 'Sports')], [lakers]);
    expect(lakers.breaking?.map((b) => b.topic)).toEqual(['Sports']);
  });

  it('does NOT pin on a single SHORT (non-distinctive) shared token', () => {
    const oil = makeMarket({ id: 'oil', title: 'Will oil top $100?', favored: 'Yes', status: 'active' });
    pinToMarkets([item('Big Oil lobby fights a new climate rule', 'Markets')], [oil]);
    expect(oil.breaking).toBeUndefined();
  });
});

describe('dedupePool', () => {
  it('collapses a publisher repeating the same headline across its own feeds to one, keeping the freshest', () => {
    const out = dedupePool([
      art('Senate passes the bill', 'nytimes.com', '2026-06-17T10:00:00.000Z'),
      art('Senate passes the bill', 'nytimes.com', '2026-06-17T11:00:00.000Z'),
      art('Senate passes the bill', 'bbc.com', '2026-06-17T10:30:00.000Z'),
    ]);
    expect(out).toHaveLength(2); // one nyt (freshest) + one bbc
    const nyt = out.find((a) => a.domain === 'nytimes.com');
    expect(nyt?.seenAt).toBe('2026-06-17T11:00:00.000Z');
  });
});

describe('consolidateClusters', () => {
  it('merges two partial clusters of the same event (>=3 shared tokens) into one', () => {
    // Two clusters that each corroborate (2 domains) but describe the same event with
    // overlapping-but-not-identical token sets, so a single greedy pass leaves them split.
    const clusters = clusterArticles([
      art('Hurricane Milton barrels toward Florida coast', 'bbc.com', '2026-06-17T10:00:00.000Z', 'Climate'),
      art('Hurricane Milton barrels toward Florida coast', 'cnn.com', '2026-06-17T10:01:00.000Z', 'Climate'),
      art('Hurricane Milton strengthens near Florida landfall', 'npr.org', '2026-06-17T10:05:00.000Z', 'Climate'),
      art('Hurricane Milton strengthens near Florida landfall', 'sky.com', '2026-06-17T10:06:00.000Z', 'Climate'),
    ]);
    const merged = consolidateClusters(clusters);
    // Whatever the greedy split produced, consolidation should collapse to a single event.
    expect(merged.length).toBeLessThanOrEqual(clusters.length);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.domains.size).toBe(4);
  });
});

describe('RSS_FEEDS source list', () => {
  it('is all https with non-empty domain + topic, and unique urls', () => {
    const urls = new Set<string>();
    for (const f of RSS_FEEDS) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.domain.length).toBeGreaterThan(0);
      expect(f.topic.length).toBeGreaterThan(0);
      expect(urls.has(f.url)).toBe(false); // no duplicate feeds
      urls.add(f.url);
    }
  });

  it('drops the dead MarketWatch host and carries the verified finance additions', () => {
    const urls = RSS_FEEDS.map((f) => f.url);
    // The old feeds.marketwatch.com host now 301s — must be gone.
    expect(urls.some((u) => u.includes('feeds.marketwatch.com'))).toBe(false);
    // The free finance additions are present.
    expect(urls).toContain('https://feeds.a.dj.com/rss/RSSMarketsMain.xml'); // WSJ Markets
    expect(urls).toContain('https://www.federalreserve.gov/feeds/press_monetary.xml'); // Fed
    expect(RSS_FEEDS.some((f) => f.domain === 'wsj.com')).toBe(true);
    expect(RSS_FEEDS.some((f) => f.domain === 'federalreserve.gov')).toBe(true);
  });
});
