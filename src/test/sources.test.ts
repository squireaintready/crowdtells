import { describe, expect, it } from 'vitest';
import { coverageDistribution, leanForOutlet, leanOf, outletName } from '../lib/sources';

describe('outlet lean', () => {
  it('maps known outlets and ignores unknowns', () => {
    expect(leanOf('nytimes.com')).toBe('left');
    expect(leanOf('www.foxnews.com')).toBe('right');
    expect(leanOf('reuters.com')).toBe('center');
    expect(leanOf('espn.com')).toBeNull();
  });

  it('computes a distribution and flags a blindspot when a wing is absent', () => {
    const d = coverageDistribution(['nytimes.com', 'cnn.com', 'reuters.com']);
    expect(d).toMatchObject({ left: 2, center: 1, right: 0, known: 3 });
    expect(d.blindspot).toBe('right');
  });

  it('no blindspot below 3 recognized outlets', () => {
    const d = coverageDistribution(['nytimes.com', 'foxnews.com', 'espn.com']);
    expect(d.known).toBe(2);
    expect(d.blindspot).toBeNull();
  });
});

describe('outletName', () => {
  it('maps known domains to proper publication names (www-insensitive)', () => {
    expect(outletName('politico.com')).toBe('Politico');
    expect(outletName('www.thehill.com')).toBe('The Hill');
    expect(outletName('apnews.com')).toBe('AP');
  });
  it('falls back to the bare host for unknown domains', () => {
    expect(outletName('www.example-blog.org')).toBe('example-blog.org');
  });
});

describe('leanForOutlet', () => {
  it('resolves a lean from a proper name, a domain, or a display label', () => {
    expect(leanForOutlet('Politico')).toBe('left');
    expect(leanForOutlet('politico.com')).toBe('left');
    expect(leanForOutlet('The Guardian')).toBe('left');
    expect(leanForOutlet('reuters.com')).toBe('center');
    expect(leanForOutlet('Reuters')).toBe('center');
    expect(leanForOutlet('Fox News')).toBe('right');
  });
  it('returns null for an outlet we do not recognize', () => {
    expect(leanForOutlet('Some Local Blog')).toBeNull();
    expect(leanForOutlet('example-blog.org')).toBeNull();
  });
});
