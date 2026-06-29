import { describe, expect, it } from 'vitest';
import { embedFeed, masterSitemap, storyPage, topicPage } from './syndication';
import { makeMarket } from '../../src/test/factory';
import type { Feed } from '../../src/lib/types';

// A non-null synthesis marks a real briefing — the gate (hasBriefing) for an
// indexable /s/ page + sitemap inclusion. Fixtures that stand in for a briefed
// story must set it, or they read as un-briefed stubs and get excluded.
const synth = { consensus: [], disputed: [], perspectives: [] };

describe('embedFeed', () => {
  const feed: Feed = {
    generatedAt: '2026-06-20T00:00:00Z',
    version: 1,
    markets: [
      makeMarket({
        id: 'e1',
        hook: 'Briefed & active',
        synthesis: synth,
        score: 9,
        oddsPct: 71.6,
        favored: 'Yes',
        divergence: 4.2,
        crowdVsCoverage: 'ahead',
      }),
      makeMarket({ id: 'e2', hook: 'No briefing', synthesis: null, score: 5 }), // excluded
      makeMarket({ id: 'e3', status: 'resolved', hook: 'Settled', synthesis: synth }), // excluded
    ],
  };
  const out = embedFeed(feed);

  it('includes only active briefed stories, ranked, stripped to display fields', () => {
    expect(out.markets.map((m) => m.id)).toEqual(['e1']);
    const e = out.markets[0]!;
    expect(e.slug).toBeTruthy();
    expect(e.oddsPct).toBe(72); // rounded
    expect(e.divergence).toBe(4); // rounded, >= 1
    expect(e.crowdVsCoverage).toBe('ahead');
    // no heavy fields leak into the slim projection
    const bag = e as unknown as Record<string, unknown>;
    expect(bag.analysis).toBeUndefined();
    expect(bag.sources).toBeUndefined();
  });
});

describe('storyPage', () => {
  const m = makeMarket({
    id: 'kalshi:KXFED-26',
    source: 'kalshi',
    hook: 'Fed "blinks" first?',
    favored: 'Yes',
    oddsPct: 62,
    analysis: 'Pricing has swung toward a cut. The decisive input is CPI. Positioning is crowded.',
    take: 'The move looks priced; watch the dot plot.',
    synthesis: synth,
    category: 'Economics',
    sources: [
      { domain: 'reuters.com', url: 'https://reuters.com/fed', title: 'Fed weighs a cut' },
      { domain: 'bloomberg.com', url: 'https://bloomberg.com/fed' },
    ],
    generatedAt: '2026-06-15T12:00:00Z',
    updatedAt: '2026-06-15T12:30:00Z',
  });
  const page = storyPage(m, [
    makeMarket({ id: 'kalshi:CPI-26', hook: 'CPI cools again?', category: 'Economics' }),
  ]);

  it('carries the story-specific OG title and description', () => {
    expect(page).toContain('property="og:title" content="Fed &quot;blinks&quot; first?"');
    expect(page).toContain('The decisive input is CPI');
    expect(page).toContain('twitter:card" content="summary_large_image"');
  });

  it('is self-canonical at its /s/<slug>.html URL', () => {
    expect(page).toContain('rel="canonical" href="https://crowdtells.com/s/kalshi-KXFED-26"');
    expect(page).toContain(
      'property="og:url" content="https://crowdtells.com/s/kalshi-KXFED-26"',
    );
  });

  it('renders the full briefing as indexable body content; redirect is share-only (#app)', () => {
    // The whole briefing is in the visible body, not just meta.
    expect(page).toContain('<p>Pricing has swung toward a cut');
    expect(page).toContain('Our take');
    expect(page).toContain('The move looks priced');
    // Never an unconditional auto-redirect: no meta-refresh, and the only client
    // redirect is gated on the share-only #app marker — so crawlers and organic
    // visits (which never carry the hash) get the full static page.
    expect(page).not.toContain('http-equiv="refresh"');
    expect(page).toMatch(/location\.hash\s*===?\s*['"]#app['"]/);
  });

  it('renders high-confidence precedents as crawlable body content', () => {
    const withPrec = storyPage(
      makeMarket({
        id: 'kalshi:PREC-26',
        hook: 'A story with precedent',
        analysis: 'Lead text here.',
        synthesis: synth,
        precedents: ['No sitting governor has won the nomination since 1972'],
      }),
    );
    expect(withPrec).toContain('<h2>The precedent</h2>');
    expect(withPrec).toContain('No sitting governor has won the nomination since 1972');
    expect(withPrec).toContain('Context compiled by Crowdtells');
  });

  it('renders a pinned "Developing" block linking out (nofollow)', () => {
    const withBreaking = storyPage(
      makeMarket({
        id: 'kalshi:DEV-26',
        hook: 'A developing story',
        analysis: 'Lead text here.',
        synthesis: synth,
        breaking: [
          {
            title: 'Fed signals a surprise cut',
            outlets: ['reuters.com', 'bbc.com'],
            url: 'https://reuters.com/fed-cut',
            topic: 'Economics',
            firstSeen: '2026-06-17T11:30:00.000Z',
          },
        ],
      }),
    );
    expect(withBreaking).toContain('class="dev-flag">Developing');
    expect(withBreaking).toContain('Fed signals a surprise cut');
    expect(withBreaking).toContain('href="https://reuters.com/fed-cut"');
    expect(withBreaking).toContain('rel="noopener nofollow"');
    expect(withBreaking).toContain('2 outlets');
  });

  it('escapes a hostile URL in a Developing link (no href attribute break-out)', () => {
    // safeHref only checks the protocol and returns the RAW url, so a quote/tag in an
    // external RSS/GDELT link survives — it MUST be xml()-escaped at the call site.
    const evil = storyPage(
      makeMarket({
        id: 'kalshi:EVIL-26',
        hook: 'A developing story',
        analysis: 'Lead text here.',
        synthesis: synth,
        breaking: [
          {
            title: 'Hostile link',
            outlets: ['x.com'],
            url: 'https://evil.com/x"><script>alert(1)</script>',
            topic: 'Economics',
            firstSeen: '2026-06-17T11:30:00.000Z',
          },
        ],
      }),
    );
    expect(evil).not.toContain('"><script>alert(1)</script>'); // must not break out of href
    expect(evil).toContain('&quot;&gt;&lt;script&gt;'); // xml-escaped instead
  });

  it('is indexable and links into the live SPA via a CTA, not a redirect', () => {
    expect(page).toContain('content="index, follow, max-image-preview:large');
    expect(page).toContain('class="cta" href="/?s=kalshi%3AKXFED-26"');
  });

  it('links cited sources and related stories', () => {
    expect(page).toContain('href="https://reuters.com/fed"');
    expect(page).toContain('Fed weighs a cut'); // uses the source title when present
    expect(page).toContain('bloomberg.com'); // falls back to domain when no title
    expect(page).toContain('href="https://crowdtells.com/s/kalshi-CPI-26"');
    expect(page).toContain('CPI cools again?');
  });

  it('links up to its category hub (Home → Topic → Article)', () => {
    expect(page).toContain('class="cat" href="/topic/economics"');
    expect(page).toContain('"item":"https://crowdtells.com/topic/economics"');
    // "View all <category>" loops back to the hub from related stories.
    expect(page).toContain('href="/topic/economics">View all Economics markets');
  });

  it('discloses AI authorship, RSS, and source-based attribution', () => {
    expect(page).toContain('AI-written briefing grounded in 2 sources');
    expect(page).toContain('rel="alternate" type="application/rss+xml"');
    expect(page).toContain('property="article:author" content="Samuel Jo"');
    expect(page).toContain('"isBasedOn"');
    expect(page).toContain('"url":"https://reuters.com/fed"'); // source attribution in JSON-LD
    // Cited sources are provenance refs (CreativeWork), not Articles — so they
    // don't draw "missing image/author" warnings in the rich-results validator.
    expect(page).toContain('"@type":"CreativeWork"');
    expect(page).not.toContain('"@type":"NewsArticle","url":"https://reuters.com/fed"');
  });

  it('ships FAQPage + an answer box + a named human (Person) byline (E-E-A-T + GEO)', () => {
    expect(page).toContain('"@type":"FAQPage"');
    expect(page).toContain('class="answer"');
    expect(page).toContain('Frequently asked questions');
    expect(page).toContain('Edited by <a href="/about">Samuel Jo</a>');
    expect(page).toContain('"@type":"Person","name":"Samuel Jo"');
  });

  it('emits NewsArticle + BreadcrumbList JSON-LD that cannot break out of the script tag', () => {
    expect(page).toContain('"@type":"NewsArticle"');
    expect(page).toContain('"@type":"BreadcrumbList"');
    expect(page).toContain('"datePublished":"2026-06-15T12:00:00Z"');
    expect(page).toContain('"articleBody":"Pricing has swung toward a cut');
    // No raw "<" survives inside any JSON-LD payload.
    for (const seg of page.split('application/ld+json').slice(1)) {
      const json = seg.slice(seg.indexOf('>') + 1, seg.indexOf('</script>'));
      expect(json).not.toContain('<');
      expect(() => JSON.parse(json.replace(/\\u003c/g, '<'))).not.toThrow();
    }
  });

  it('emits schema-valid NewsArticle image (ImageObject) + isBasedOn publisher (Organization)', () => {
    expect(page).toContain(
      '"image":{"@type":"ImageObject","url":"https://crowdtells.com/og.png","width":1200,"height":630}',
    );
    expect(page).toContain('"publisher":{"@type":"Organization","name":"reuters.com"}');
    expect(page).not.toContain('"image":["https://crowdtells.com/og.png"]'); // no bare array
  });

  it('gives the BreadcrumbList final crumb a self-URL (item)', () => {
    // The article itself (position 3) now carries its own item URL.
    expect(page).toContain('"item":"https://crowdtells.com/s/kalshi-KXFED-26"}]');
  });

  it('styles the Market-lens callout with the centered top-fade, never a left accent bar', () => {
    expect(page).toContain('.lens,.take{position:relative');
    expect(page).toContain(
      '.lens::before,.take::before{content:\'\';position:absolute;top:0;left:14%;right:14%;height:2px;background:linear-gradient(to right,transparent,var(--accent),transparent)}',
    );
    expect(page).not.toContain('.lens{border-left'); // the old house-style violation is gone
  });

  it('escapes hostile content in the briefing and headline', () => {
    const evil = storyPage(
      makeMarket({
        id: 'x',
        hook: '<script>alert(1)</script>',
        analysis: 'Body with <img src=x onerror=alert(1)> injected.',
        generatedAt: '2026-06-15T00:00:00Z',
      }),
    );
    expect(evil).not.toContain('<script>alert(1)</script>');
    expect(evil).not.toContain('<img src=x onerror');
    expect(evil).toContain('&lt;script&gt;');
  });

  it('survives pre-migration records with a missing source/marketUrl', () => {
    // A real record can predate the `source` field and lack a marketUrl; a
    // single undefined field must never crash the whole generate run.
    const m = makeMarket({
      id: '351730',
      hook: 'Iran v New Zealand: live',
      generatedAt: '2026-06-15T00:00:00Z',
    });
    // @ts-expect-error simulate a legacy/partial record
    m.source = undefined;
    // @ts-expect-error simulate a missing market URL
    m.marketUrl = undefined;
    const page = storyPage(m);
    expect(page).toContain('<h1>Iran v New Zealand: live</h1>');
    expect(page).toContain('Polymarket'); // missing source falls back to Polymarket
  });
});

describe('single-match sports stay out of the index', () => {
  const s = { consensus: ['x'], disputed: [], perspectives: [] };
  const match = makeMarket({
    id: 'm1',
    category: 'Soccer',
    title: 'Austria vs Jordan',
    hook: 'Austria face Jordan',
    synthesis: s,
    generatedAt: '2026-06-15T12:00:00Z',
  });

  it('noindexes a single-match sports page but still renders it for users', () => {
    const page = storyPage(match);
    expect(page).toContain('content="noindex, follow"');
    expect(page).toContain('<h1>Austria face Jordan</h1>');
  });

  it('keeps a politics "vs" race and a sports futures indexed', () => {
    const race = makeMarket({
      id: 'm2',
      category: 'Politics',
      title: 'Trump vs Newsom 2028',
      hook: 'Trump vs Newsom',
      synthesis: s,
      generatedAt: '2026-06-15T12:00:00Z',
    });
    const futures = makeMarket({
      id: 'm3',
      category: 'Soccer',
      title: 'Who wins the 2026 World Cup?',
      hook: 'World Cup race',
      synthesis: s,
      generatedAt: '2026-06-15T12:00:00Z',
    });
    expect(storyPage(race)).toContain('content="index, follow, max-image-preview:large');
    expect(storyPage(futures)).toContain('content="index, follow, max-image-preview:large');
  });

  it('excludes single-match sports from the master sitemap', () => {
    const feed: Feed = { generatedAt: '2026-06-15T12:00:00Z', version: 1, markets: [match] };
    expect(masterSitemap(feed, [])).not.toContain('/s/m1');
  });
});

describe('consensus follows the two-source rule on /s/ pages', () => {
  const briefed = (sourceCount: number) =>
    makeMarket({
      id: 'c1',
      category: 'Politics',
      title: 'Will the budget pass?',
      hook: 'Budget vote nears',
      analysis: 'A stopgap is the base case as the deadline approaches.',
      synthesis: {
        consensus: ['A short-term funding deal is the base case.'],
        disputed: [],
        perspectives: [],
      },
      sources: Array.from({ length: sourceCount }, (_, i) => ({
        domain: `outlet${i}.com`,
        url: `https://outlet${i}.com/a`,
      })),
      generatedAt: '2026-06-15T12:00:00Z',
    });

  it('shows "what the coverage agrees on" (section + FAQ) when >= 2 sources back it', () => {
    const page = storyPage(briefed(2));
    expect(page).toContain('What the coverage agrees on');
    expect(page).toContain('A short-term funding deal is the base case.');
    expect(page).toContain('What do the sources agree on?'); // FAQ JSON-LD entry too
  });

  it('omits consensus (section + FAQ) when only one source informed it', () => {
    const page = storyPage(briefed(1));
    expect(page).not.toContain('What the coverage agrees on');
    expect(page).not.toContain('What do the sources agree on?');
  });
});

describe('topicPage', () => {
  const stories = [
    makeMarket({
      id: 'a',
      hook: 'Fed blinks first?',
      analysis: 'Pricing has swung toward a cut; CPI is the decisive input.',
      sources: [{ domain: 'reuters.com', url: 'https://reuters.com/a' }],
      category: 'Economics',
      generatedAt: '2026-06-15T12:00:00Z',
    }),
    makeMarket({
      id: 'b',
      hook: 'Recession by year end?',
      analysis: 'The yield curve un-inverted; the crowd is fading recession risk.',
      category: 'Economics',
      generatedAt: '2026-06-15T11:00:00Z',
    }),
  ];
  const page = topicPage('Economics', stories, ['Politics', 'Crypto']);

  it('is a self-canonical, indexable hub at /topic/<slug>', () => {
    expect(page).toContain('rel="canonical" href="https://crowdtells.com/topic/economics"');
    expect(page).toContain('content="index, follow');
    expect(page).toContain('<title>Economics news &amp; prediction markets — Crowdtells</title>');
  });

  it('carries real per-story content (excerpt), not a thin link list', () => {
    expect(page).toContain('href="https://crowdtells.com/s/a"');
    expect(page).toContain('Fed blinks first?');
    expect(page).toContain('Pricing has swung toward a cut'); // briefing excerpt is on the page
    expect(page).toContain('Recession by year end?');
  });

  it('cross-links sibling topic hubs and deep-links the filtered live feed', () => {
    expect(page).toContain('href="/topic/politics"');
    expect(page).toContain('href="/topic/crypto"');
    expect(page).toContain('class="cta" href="/?c=Economics"');
  });

  it('ships an answer box + data-driven FAQPage on the hub (AEO / zero-position)', () => {
    expect(page).toContain('class="answer"');
    expect(page).toContain('"@type":"FAQPage"');
    expect(page).toContain('What are the top Economics prediction markets right now?');
    expect(page).toContain('Frequently asked questions');
    // The FAQ is derived from the live data the page shows (Google's FAQ policy).
    expect(page).toContain('Fed blinks first?');
  });

  it('emits CollectionPage + ItemList + BreadcrumbList JSON-LD, escaped', () => {
    expect(page).toContain('"@type":"CollectionPage"');
    expect(page).toContain('"@type":"ItemList"');
    expect(page).toContain('"@type":"BreadcrumbList"');
    for (const seg of page.split('application/ld+json').slice(1)) {
      const json = seg.slice(seg.indexOf('>') + 1, seg.indexOf('</script>'));
      expect(json).not.toContain('<');
      expect(() => JSON.parse(json.replace(/\\u003c/g, '<'))).not.toThrow();
    }
  });
});

describe('masterSitemap', () => {
  const feed: Feed = {
    generatedAt: '2026-06-15T12:00:00Z',
    version: 1,
    markets: [
      makeMarket({
        id: 'a',
        category: 'Economics',
        synthesis: synth,
        generatedAt: '2026-06-15T12:00:00Z',
      }),
      makeMarket({
        id: 'b',
        category: 'Economics',
        status: 'resolved',
        synthesis: synth,
        generatedAt: '2026-06-14T12:00:00Z',
        updatedAt: '2026-06-15T09:00:00Z',
      }),
      makeMarket({ id: 'c', category: 'Politics', generatedAt: null }), // unbriefed → excluded
    ],
  };
  const xml = masterSitemap(feed, ['Economics']);

  it('lists home, hubs, briefed articles, and static pages', () => {
    expect(xml).toContain('<loc>https://crowdtells.com/</loc>');
    expect(xml).toContain('<loc>https://crowdtells.com/topic/economics</loc>');
    expect(xml).toContain('<loc>https://crowdtells.com/s/a</loc>');
    expect(xml).toContain('<loc>https://crowdtells.com/s/b</loc>');
    expect(xml).toContain('<loc>https://crowdtells.com/about</loc>');
    expect(xml).toContain('<loc>https://crowdtells.com/privacy</loc>');
    expect(xml).toContain('<loc>https://crowdtells.com/terms</loc>');
  });

  it('omits unbriefed stories and carries lastmod for articles', () => {
    expect(xml).not.toContain('/s/c.html');
    expect(xml).toContain('<lastmod>2026-06-15T09:00:00Z</lastmod>');
  });
});
