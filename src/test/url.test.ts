import { describe, expect, it } from 'vitest';
import { safeHref } from '../lib/url';

describe('safeHref', () => {
  it('allows http and https', () => {
    expect(safeHref('https://reuters.com/x')).toBe('https://reuters.com/x');
    expect(safeHref('http://example.com')).toBe('http://example.com');
  });
  it('rejects dangerous schemes and garbage', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>')).toBeNull();
    expect(safeHref('not a url')).toBeNull();
    expect(safeHref('')).toBeNull();
  });
});
