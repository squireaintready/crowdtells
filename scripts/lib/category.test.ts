import { describe, expect, it } from 'vitest';
import { normalizeCategory } from './category';

describe('normalizeCategory', () => {
  it('upper-cases all-lowercase acronyms', () => {
    expect(normalizeCategory('fomc')).toBe('FOMC');
    expect(normalizeCategory('  fomc ')).toBe('FOMC');
  });

  it('title-cases an all-lowercase multi-word tag (upper acronyms within)', () => {
    expect(normalizeCategory('world elections')).toBe('World Elections');
    expect(normalizeCategory('us politics')).toBe('US Politics');
  });

  it('trusts anything already carrying a capital (never mangles FIFA/IEM)', () => {
    expect(normalizeCategory('FIFA World Cup')).toBe('FIFA World Cup');
    expect(normalizeCategory('IEM Cologne')).toBe('IEM Cologne');
    expect(normalizeCategory('Politics')).toBe('Politics');
    expect(normalizeCategory('Strait of Hormuz')).toBe('Strait of Hormuz');
  });

  it('falls back to Markets for empty/missing', () => {
    expect(normalizeCategory('')).toBe('Markets');
    expect(normalizeCategory(undefined)).toBe('Markets');
    expect(normalizeCategory(null)).toBe('Markets');
  });
});
