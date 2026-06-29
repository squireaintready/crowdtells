import { describe, expect, it } from 'vitest';
import { topicPath, topicSlug } from '../lib/topicPath';

describe('topicSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(topicSlug('Politics')).toBe('politics');
    expect(topicSlug('World Affairs')).toBe('world-affairs');
  });

  it('strips punctuation and collapses separators', () => {
    expect(topicSlug('U.S. Politics')).toBe('u-s-politics');
    expect(topicSlug('Crypto & Web3')).toBe('crypto-web3');
    expect(topicSlug('  Sports!  ')).toBe('sports');
  });

  it('builds a root-relative hub path', () => {
    expect(topicPath('Economics')).toBe('/topic/economics');
  });
});
