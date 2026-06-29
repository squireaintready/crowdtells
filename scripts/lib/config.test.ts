import { describe, expect, it } from 'vitest';
import { parseKeyList } from './config';

describe('parseKeyList', () => {
  it('splits on commas, spaces, and newlines', () => {
    expect(parseKeyList('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(parseKeyList('a, b ,  c')).toEqual(['a', 'b', 'c']);
    expect(parseKeyList('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('trims and drops empties', () => {
    expect(parseKeyList(' a ,, b , ')).toEqual(['a', 'b']);
    expect(parseKeyList('')).toEqual([]);
    expect(parseKeyList(undefined)).toEqual([]);
  });

  it('handles a single key', () => {
    expect(parseKeyList('gsk_solo')).toEqual(['gsk_solo']);
  });
});
