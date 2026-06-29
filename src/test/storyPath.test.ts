import { describe, expect, it } from 'vitest';
import { storyPath, storySlug } from '../lib/storyPath';

describe('storySlug', () => {
  it('passes through already-safe ids', () => {
    expect(storySlug('512345')).toBe('512345');
    expect(storySlug('sample-fed')).toBe('sample-fed');
  });
  it('replaces unsafe characters (colon in kalshi ids) with a dash', () => {
    expect(storySlug('kalshi:KXFED-26')).toBe('kalshi-KXFED-26');
  });
  it('trims leading/trailing dashes so filenames stay clean', () => {
    expect(storySlug(':weird:')).toBe('weird');
  });
});

describe('storyPath', () => {
  it('builds the /s/<slug> share path', () => {
    expect(storyPath('kalshi:KXFED-26')).toBe('/s/kalshi-KXFED-26');
  });
});
