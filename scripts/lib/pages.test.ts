import { describe, expect, it } from 'vitest';
import {
  accuracyPage,
  accuracyStats,
  embedDocsPage,
  eventPage,
  explainerPage,
  guidesIndexPage,
  mispricedPage,
} from './pages';
import { EXPLAINERS, EVENTS } from './content/evergreen';
import { makeMarket } from '../../src/test/factory';
import type { Feed } from '../../src/lib/types';

const synth = { consensus: ['x'], disputed: [], perspectives: [] };
const lastmod = '2026-06-17T00:00:00Z';
const hubSet = new Set<string>(['Economics']);

/** Every emitted page must keep its JSON-LD un-breakable + parseable. */
function assertLdSafe(page: string) {
  for (const seg of page.split('application/ld+json').slice(1)) {
    const json = seg.slice(seg.indexOf('>') + 1, seg.indexOf('</script>'));
    expect(json).not.toContain('<');
    expect(() => JSON.parse(json.replace(/\\u003c/g, '<'))).not.toThrow();
  }
}

describe('content data', () => {
  it('ships 14 substantial explainers and 17 event hubs', () => {
    expect(EXPLAINERS).toHaveLength(14);
    expect(EVENTS).toHaveLength(17);
    for (const p of [...EXPLAINERS, ...EVENTS]) {
      expect(p.sections.length).toBeGreaterThanOrEqual(3);
      expect(p.faq.length).toBeGreaterThanOrEqual(2);
      expect(p.intro.length).toBeGreaterThan(40);
    }
  });
});

describe('explainerPage', () => {
  const c = EXPLAINERS.find((e) => e.slug === 'how-prediction-markets-work')!;
  const page = explainerPage(c, lastmod, hubSet);

  it('is self-canonical at /learn/<slug> and on the new brand', () => {
    expect(page).toContain(
      'rel="canonical" href="https://crowdtells.com/learn/how-prediction-markets-work"',
    );
    expect(page).toContain("font-family:'Source Serif 4'");
    expect(page).toContain("[data-theme='bordeaux']");
    expect(page).toContain('content="index, follow, max-image-preview:large');
  });

  it('renders Article + FAQPage JSON-LD, a Person author, and the authored content', () => {
    expect(page).toContain('"@type":"Article"');
    expect(page).toContain('"@type":"FAQPage"');
    expect(page).toContain('"@type":"Person","name":"Samuel Jo"');
    expect(page).toContain('<h1>How Prediction Markets Work</h1>');
    expect(page).toContain('Frequently asked questions');
    assertLdSafe(page);
  });

  it('dates the Article with both datePublished and a per-run dateModified', () => {
    expect(page).toContain('"datePublished":"2026-06-17"');
    expect(page).toContain(`"dateModified":"${lastmod}"`);
  });
});

describe('eventPage', () => {
  const c = EVENTS.find((e) => e.slug === 'fed-rate-decision-odds')!;
  const live = [
    makeMarket({
      id: 'fed1',
      title: 'Will the Fed cut rates in July?',
      hook: 'Fed weighs a July cut',
      category: 'Economics',
      synthesis: synth,
      analysis: 'A cut is on the table.',
      sources: [{ domain: 'reuters.com', url: 'https://reuters.com/x' }],
    }),
  ];

  it('embeds live markets + an ItemList when matches are trading', () => {
    const page = eventPage(c, live, lastmod, hubSet);
    expect(page).toContain('Live markets');
    expect(page).toContain('href="https://crowdtells.com/s/fed1"');
    expect(page).toContain('"@type":"ItemList"');
    expect(page).toContain(
      'rel="canonical" href="https://crowdtells.com/event/fed-rate-decision-odds"',
    );
    assertLdSafe(page);
  });

  it('stays substantial (evergreen content) when no live markets match', () => {
    const page = eventPage(c, [], lastmod, hubSet);
    expect(page).toContain('live-empty');
    expect(page).toContain('"@type":"Article"');
    expect(page).not.toContain('"@type":"ItemList"');
  });
});

describe('guidesIndexPage', () => {
  const page = guidesIndexPage(lastmod);
  it('lists explainers and event hubs and is a CollectionPage', () => {
    expect(page).toContain('href="https://crowdtells.com/learn/how-prediction-markets-work"');
    expect(page).toContain('href="https://crowdtells.com/event/fed-rate-decision-odds"');
    expect(page).toContain('"@type":"CollectionPage"');
    expect(page).toContain('rel="canonical" href="https://crowdtells.com/learn"');
    assertLdSafe(page);
  });
});

describe('mispricedPage', () => {
  const feed: Feed = {
    generatedAt: lastmod,
    version: 1,
    markets: [
      makeMarket({
        id: 'mp1',
        hook: 'Crowd-ahead story',
        synthesis: synth,
        crowdVsCoverage: 'ahead',
      }),
      makeMarket({
        id: 'mp2',
        hook: 'Aligned story',
        synthesis: synth,
        crowdVsCoverage: 'aligned',
      }),
    ],
  };
  const page = mispricedPage(feed, lastmod);

  it('lists only divergent markets and is self-canonical', () => {
    expect(page).toContain('rel="canonical" href="https://crowdtells.com/mispriced"');
    expect(page).toContain('href="https://crowdtells.com/s/mp1"'); // ahead → listed
    expect(page).not.toContain('href="https://crowdtells.com/s/mp2"'); // aligned → excluded
    assertLdSafe(page);
  });
});

describe('accuracyStats', () => {
  const resolved = (over: Parameters<typeof makeMarket>[0]) =>
    makeMarket({ status: 'resolved', resolvedOutcome: 'Yes', ...over });

  it('computes hit rate, calibration buckets, and category breakdown', () => {
    const markets = [
      // 3 sports hits, 1 sports miss → 75% in Sports
      resolved({ id: 's1', category: 'Sports', calledCorrectly: true, firstBriefedOddsPct: 92 }),
      resolved({ id: 's2', category: 'Sports', calledCorrectly: true, firstBriefedOddsPct: 88 }),
      resolved({ id: 's3', category: 'Sports', calledCorrectly: true, firstBriefedOddsPct: 71 }),
      resolved({ id: 's4', category: 'Sports', calledCorrectly: false, firstBriefedOddsPct: 64 }),
      // 1 politics hit
      resolved({ id: 'p1', category: 'Politics', calledCorrectly: true, firstBriefedOddsPct: 55 }),
      // active markets are ignored
      makeMarket({ id: 'a1', status: 'active', resolvedOutcome: null, calledCorrectly: null }),
    ];
    const s = accuracyStats(markets);
    expect(s.scored).toBe(5);
    expect(s.hits).toBe(4);
    expect(s.hitRate).toBeCloseTo(0.8);
    expect(s.calibratedN).toBe(5);
    // 60–70 band holds only s4 (64%, a miss) → actual 0
    const band60 = s.buckets.find((b) => b.lo === 60)!;
    expect(band60.n).toBe(1);
    expect(band60.actual).toBe(0);
    // category breakdown sorted by sample size, Sports first
    expect(s.byCategory[0]?.category).toBe('Sports');
    expect(s.byCategory[0]?.rate).toBeCloseTo(0.75);
  });

  it('handles an empty record without throwing', () => {
    const s = accuracyStats([makeMarket({ status: 'active' })]);
    expect(s.scored).toBe(0);
    expect(s.hitRate).toBeNull();
  });
});

describe('embedDocsPage', () => {
  const page = embedDocsPage(lastmod);
  it('is self-canonical at /embed, ships the escaped snippet + a live widget, JSON-LD safe', () => {
    expect(page).toContain('rel="canonical" href="https://crowdtells.com/embed"');
    // the copy-paste snippet is HTML-escaped (not a live tag in the doc body)
    expect(page).toContain('&lt;div data-crowdtells=&quot;top&quot;&gt;');
    // but the page itself loads the real widget for the live demo
    expect(page).toContain('<script src="/embed.js" async></script>');
    expect(page).toContain('<div data-crowdtells="top"></div>');
    assertLdSafe(page);
  });
});

describe('accuracyPage', () => {
  const feed: Feed = {
    generatedAt: lastmod,
    version: 1,
    markets: [
      makeMarket({
        id: 'ac1',
        status: 'resolved',
        hook: 'Settled story',
        synthesis: synth,
        resolvedOutcome: 'Yes',
        calledCorrectly: true,
        briefedOddsPct: 78,
        resolvedAt: '2026-06-19T00:00:00Z',
      }),
    ],
  };
  const page = accuracyPage(feed, lastmod);

  it('is self-canonical at /accuracy with safe JSON-LD and the track-record framing', () => {
    expect(page).toContain('rel="canonical" href="https://crowdtells.com/accuracy"');
    expect(page).toContain('We keep score on ourselves');
    expect(page).toContain('href="https://crowdtells.com/s/ac1"'); // links the settled story
    assertLdSafe(page);
  });
});
