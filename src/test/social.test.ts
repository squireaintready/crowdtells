import { describe, expect, it } from 'vitest';
import { MAX_COMMENT, validateComment } from '../lib/comments';
import { storyUrl } from '../lib/social';

describe('validateComment', () => {
  it('trims and returns valid text', () => {
    expect(validateComment('  hello world  ')).toBe('hello world');
  });
  it('rejects empty / whitespace', () => {
    expect(() => validateComment('   ')).toThrow();
    expect(() => validateComment('')).toThrow();
  });
  it('rejects over-length bodies', () => {
    expect(() => validateComment('x'.repeat(MAX_COMMENT + 1))).toThrow();
    expect(validateComment('x'.repeat(MAX_COMMENT))).toHaveLength(MAX_COMMENT);
  });
});

describe('storyUrl', () => {
  it('points at the per-story share page', () => {
    expect(storyUrl('abc-123')).toContain('/s/abc-123');
  });
  it('slugifies ids so the filename is safe (colon → dash)', () => {
    expect(storyUrl('kalshi:KXFED-26')).toContain('/s/kalshi-KXFED-26');
  });
});
