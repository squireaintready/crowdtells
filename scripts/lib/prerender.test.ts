import { describe, expect, it } from 'vitest';
import { homeSummaryHtml, injectHomeSummary } from './prerender';
import { makeMarket } from '../../src/test/factory';
import type { Feed } from '../../src/lib/types';

// Non-null synthesis = a real briefing (hasBriefing gate); fixtures standing in
// for briefed stories must set it, or they're excluded as un-briefed stubs.
const synth = { consensus: [], disputed: [], perspectives: [] };

const INDEX =
  '<!doctype html><html lang="en"><head><title>Crowdtells</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';

const feed: Feed = {
  generatedAt: '2026-06-16T12:00:00Z',
  version: 1,
  markets: [
    makeMarket({
      id: '351731',
      hook: 'France and Senegal set for a showdown',
      analysis: 'The crowd makes France a heavy favorite heading into the match.',
      category: 'Sports',
      synthesis: synth,
      generatedAt: '2026-06-16T11:00:00Z',
      score: 9,
    }),
    makeMarket({
      id: 'kalshi:KXFED-26',
      hook: 'Fed blinks first?',
      analysis: 'Pricing has swung toward a cut.',
      category: 'Economics',
      source: 'kalshi',
      synthesis: synth,
      generatedAt: '2026-06-16T10:00:00Z',
      score: 5,
    }),
    makeMarket({ id: 'unbriefed', generatedAt: null, score: 8 }),
  ],
};

describe('homeSummaryHtml', () => {
  const { head, root } = homeSummaryHtml(feed);

  it('renders an <h1> and the top briefed stories, linking the /s/ pages', () => {
    expect(root).toContain('<h1 class="ssg-title">');
    expect(root).toContain('France and Senegal set for a showdown');
    expect(root).toContain('href="/s/351731"');
    expect(root).toContain('href="/s/kalshi-KXFED-26"');
  });

  it('omits unbriefed stories', () => {
    expect(root).not.toContain('/s/unbriefed.html');
  });

  it('surfaces Home→Topic links for categories with a hub (≥2 briefed stories)', () => {
    const twoEcon: Feed = {
      generatedAt: '2026-06-16T12:00:00Z',
      version: 1,
      markets: [
        makeMarket({
          id: 'e1',
          category: 'Economics',
          synthesis: synth,
          generatedAt: '2026-06-16T11:00:00Z',
        }),
        makeMarket({
          id: 'e2',
          category: 'Economics',
          synthesis: synth,
          generatedAt: '2026-06-16T10:00:00Z',
        }),
      ],
    };
    const out = homeSummaryHtml(twoEcon).root;
    expect(out).toContain('Browse by topic');
    expect(out).toContain('href="/topic/economics"');
  });

  it('emits ItemList JSON-LD that cannot break out of the script tag', () => {
    expect(head).toContain('"@type":"ItemList"');
    const seg = head.slice(head.indexOf('application/ld+json'));
    const json = seg.slice(seg.indexOf('>') + 1, seg.indexOf('</script>'));
    expect(json).not.toContain('<');
    expect(JSON.parse(json.replace(/\\u003c/g, '<'))['@type']).toBe('ItemList');
  });
});

describe('injectHomeSummary', () => {
  it('injects inside #root (still mountable) and into <head>', () => {
    const out = injectHomeSummary(INDEX, feed);
    expect(out).toContain('<div id="root"><!--SSG:HOME-->');
    expect(out).toContain('<!--/SSG:HOME--></div>');
    expect(out).toContain('id="root"'); // root preserved for createRoot()
    expect(out).toContain('<!--SSG:HEAD-->');
    expect(out).toContain('src="/src/main.tsx"'); // app entry untouched
  });

  it('is idempotent — re-running yields exactly one injection', () => {
    const once = injectHomeSummary(INDEX, feed);
    const twice = injectHomeSummary(once, feed);
    expect(twice.match(/<!--SSG:HOME-->/g)?.length).toBe(1);
    expect(twice.match(/<!--SSG:HEAD-->/g)?.length).toBe(1);
  });

  it('escapes hostile content from a hook', () => {
    const evil: Feed = {
      ...feed,
      markets: [
        makeMarket({
          id: 'x',
          hook: '<script>alert(1)</script>',
          synthesis: synth,
          generatedAt: '2026-06-16T11:00:00Z',
        }),
      ],
    };
    const out = injectHomeSummary(INDEX, evil);
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('still injects an intro when no stories are briefed', () => {
    const empty: Feed = { ...feed, markets: [makeMarket({ id: 'y', generatedAt: null })] };
    const out = injectHomeSummary(INDEX, empty);
    expect(out).toContain('<h1 class="ssg-title">');
    expect(out).toContain('<div id="root"><!--SSG:HOME-->');
  });
});
