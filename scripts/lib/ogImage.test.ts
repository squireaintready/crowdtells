// @vitest-environment node
// (ogImage is Node-only; wawoff2's WASM binding rejects jsdom-realm buffers.)
import { describe, expect, it } from 'vitest';
import { loadOgFonts, ogSvg, renderOgPng, wrapLines } from './ogImage';
import { makeMarket } from '../../src/test/factory';

describe('wrapLines', () => {
  it('keeps a short headline on one line', () => {
    expect(wrapLines('Fed blinks first?', 24, 3)).toEqual(['Fed blinks first?']);
  });

  it('wraps a long headline and clamps to maxLines with an ellipsis', () => {
    const lines = wrapLines(
      'Will the Federal Reserve blink before the labor market finally cracks under pressure this year',
      24,
      3,
    );
    expect(lines.length).toBe(3);
    expect(lines[2]?.endsWith('…')).toBe(true);
  });
});

describe('ogSvg', () => {
  const svg = ogSvg(
    makeMarket({
      hook: 'Fed blinks first?',
      dek: 'Inflation hits a 3-year high',
      category: 'Economics',
      source: 'kalshi',
      favored: 'Yes',
      oddsPct: 68,
      volume: 2_400_000,
    }),
  );

  it('is a 1200x630 card using the brand fonts (not system serifs)', () => {
    expect(svg).toContain('viewBox="0 0 1200 630"');
    expect(svg).toContain('font-family="Fraunces"');
    expect(svg).toContain('font-family="Inter"');
    expect(svg).not.toContain('Georgia');
    expect(svg).not.toContain('Helvetica');
  });

  it('renders the headline, news standfirst, category eyebrow, quiet crowd cue, and wordmark', () => {
    expect(svg).toContain('Fed blinks first?');
    expect(svg).toContain('Inflation hits a 3-year high'); // the news dek/standfirst
    expect(svg).toContain('>ECONOMICS<'); // category only — news-first, no betting platform
    expect(svg).not.toContain('KALSHI');
    expect(svg).not.toContain('POLYMARKET');
    expect(svg).toContain('Crowd: 68% yes'); // quiet crowd cue
    expect(svg).not.toContain('traded'); // dollar volume dropped
    expect(svg).toContain('>CROWDTELLS<');
  });

  it('escapes hostile content in the headline', () => {
    const evil = ogSvg(makeMarket({ hook: '<script>alert(1)</script> & more' }));
    expect(evil).not.toContain('<script>alert(1)</script>');
    expect(evil).toContain('&lt;script&gt;');
    expect(evil).toContain('&amp;');
  });
});

describe('renderOgPng (integration: woff2 → ttf → resvg)', () => {
  it('rasterizes a real PNG using the decompressed site fonts', async () => {
    const fonts = await loadOgFonts('public');
    const png = renderOgPng(ogSvg(makeMarket({ hook: 'Render check' })), fonts);
    // PNG magic bytes
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.length).toBeGreaterThan(2000); // non-trivial image, not a blank/failed render
  });
});
