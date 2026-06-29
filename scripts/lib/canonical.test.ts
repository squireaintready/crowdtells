import { describe, expect, it } from 'vitest';
import { canonicalToken, quantKey, quantMatch, thresholdYesProb } from './canonical';

describe('canonicalToken', () => {
  it('collapses cross-platform asset + institution + month phrasings', () => {
    expect(canonicalToken('bitcoin')).toBe('btc');
    expect(canonicalToken('btc')).toBe('btc');
    expect(canonicalToken('ethereum')).toBe('eth');
    expect(canonicalToken('fomc')).toBe('fed');
    expect(canonicalToken('fed')).toBe('fed');
    expect(canonicalToken('jun')).toBe('june');
    expect(canonicalToken('june')).toBe('june');
  });
  it('leaves unknown tokens untouched', () => {
    expect(canonicalToken('senate')).toBe('senate');
  });
});

describe('quantKey', () => {
  it('parses an explicit price-threshold question', () => {
    expect(quantKey('Will Bitcoin reach $150,000 by the end of 2026?', '2026-12-31T00:00:00Z')).toEqual({
      entity: 'BTC',
      threshold: 150000,
      direction: 'above',
      period: '2026-12',
    });
  });
  it('handles k/m suffixes and below-direction', () => {
    expect(quantKey('Will ETH drop below $1.5k in March 2026?', '2026-03-31T00:00:00Z')).toEqual({
      entity: 'ETH',
      threshold: 1500,
      direction: 'below',
      period: '2026-03',
    });
  });
  it('returns null when there is no explicit $ threshold (e.g. a max/range question)', () => {
    // The year "2026" must NOT be parsed as a threshold.
    expect(quantKey('How high will Bitcoin get in 2026?', '2026-12-31T00:00:00Z')).toBeNull();
  });
  it('returns null for non-asset questions', () => {
    expect(quantKey('Will the Fed cut rates to $0?', '2026-09-18T00:00:00Z')).toBeNull();
  });
  it('parses an index/commodity $ threshold (beyond crypto)', () => {
    expect(quantKey('Will gold close above $3,000 in July 2026?', '2026-07-31T00:00:00Z')).toEqual({
      entity: 'GOLD',
      threshold: 3000,
      direction: 'above',
      period: '2026-07',
    });
  });
  it('parses a macro percent threshold (CPI/inflation/rates)', () => {
    expect(quantKey('Will CPI inflation come in above 3% in July 2026?', '2026-07-15T00:00:00Z')).toEqual({
      entity: 'CPI',
      threshold: 3,
      direction: 'above',
      period: '2026-07',
    });
  });
});

describe('quantMatch', () => {
  const k = (over: Partial<ReturnType<typeof quantKey>> = {}) => ({
    entity: 'BTC',
    threshold: 150000,
    direction: 'above' as const,
    period: '2026-12',
    ...over,
  });
  it('matches the same question framed differently across platforms', () => {
    expect(quantMatch(k(), k({ threshold: 150500 }))).toBe(true); // within 1%
  });
  it('rejects a different threshold / period / direction / asset', () => {
    expect(quantMatch(k(), k({ threshold: 200000 }))).toBe(false);
    expect(quantMatch(k(), k({ period: '2026-06' }))).toBe(false);
    expect(quantMatch(k(), k({ direction: 'below' }))).toBe(false);
    expect(quantMatch(k(), k({ entity: 'ETH' }))).toBe(false);
  });
});

describe('thresholdYesProb', () => {
  const key = { entity: 'BTC', threshold: 150000, direction: 'above' as const, period: '2026-12' };
  it('reads P(threshold met) across Yes/No and price-rung framings', () => {
    expect(thresholdYesProb('Yes', 22, key)).toBe(22);
    expect(thresholdYesProb('No', 78, key)).toBe(22); // P(yes) = 100 - 78
    expect(thresholdYesProb('$150,000 or above', 22, key)).toBe(22); // rung matches direction
    expect(thresholdYesProb('Below $150,000', 78, key)).toBe(22); // opposite rung → invert
  });
});
