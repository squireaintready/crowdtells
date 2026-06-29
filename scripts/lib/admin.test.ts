import { describe, expect, it } from 'vitest';
import { eqEmail, ilikeEmail } from './admin';

describe('ilikeEmail', () => {
  it('escapes LIKE wildcards so a literal _ / % cannot over-match other rows', () => {
    // The "_" must be backslash-escaped (then URL-encoded) so it matches a
    // literal underscore, not "any single character".
    expect(ilikeEmail('a_b@x.com')).toBe('email=ilike.a%5C_b%40x.com');
    expect(ilikeEmail('a%b@x.com')).toBe('email=ilike.a%5C%25b%40x.com');
    expect(ilikeEmail('a\\b@x.com')).toBe('email=ilike.a%5C%5Cb%40x.com');
  });
  it('leaves a plain address untouched (besides URL-encoding)', () => {
    expect(ilikeEmail('jane.doe@x.com')).toBe('email=ilike.jane.doe%40x.com');
  });
});

describe('eqEmail', () => {
  it('builds an exact, URL-encoded equality filter', () => {
    expect(eqEmail('jane@x.com')).toBe('email=eq.jane%40x.com');
  });
});
