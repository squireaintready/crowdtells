import { describe, expect, it } from 'vitest';
import { downsample, mapPolymarket, mapKalshi } from './history';
import type { OddsPoint } from '../../src/lib/types';

const pts = (n: number): OddsPoint[] =>
  Array.from({ length: n }, (_, i) => ({ t: `2026-06-01T00:00:${String(i).padStart(2, '0')}.000Z`, p: i }));

describe('downsample', () => {
  it('returns the series unchanged when at or under the cap', () => {
    const p = pts(5);
    expect(downsample(p, 10)).toBe(p);
    expect(downsample(p, 5)).toBe(p);
  });

  it('reduces to exactly max points, keeping the first and last exact', () => {
    const p = pts(100);
    const d = downsample(p, 10);
    expect(d).toHaveLength(10);
    expect(d[0]).toEqual(p[0]);
    expect(d[d.length - 1]).toEqual(p[p.length - 1]);
  });
});

describe('mapPolymarket', () => {
  it('maps {t(sec), p(0-1)} to ISO + favored percent', () => {
    const out = mapPolymarket({
      history: [
        { t: 1781118000, p: 0.1645 },
        { t: 1781121600, p: 0.51 },
      ],
    });
    expect(out).toEqual([
      { t: new Date(1781118000 * 1000).toISOString(), p: 16.5 },
      { t: new Date(1781121600 * 1000).toISOString(), p: 51 },
    ]);
  });

  it('skips malformed points and tolerates an empty history', () => {
    expect(mapPolymarket({})).toEqual([]);
    expect(mapPolymarket({ history: [{ t: NaN, p: 0.5 }] })).toEqual([]);
  });
});

describe('mapKalshi', () => {
  const candle = (ts: number, bid: string, ask: string, close?: string) => ({
    end_period_ts: ts,
    price: close ? { close_dollars: close } : {},
    yes_bid: { close_dollars: bid },
    yes_ask: { close_dollars: ask },
  });

  it('uses the last-trade close when present, else the bid/ask midpoint', () => {
    const out = mapKalshi(
      { candlesticks: [candle(1781118000, '0.40', '0.60'), candle(1781121600, '0.10', '0.20', '0.55')] },
      false,
    );
    expect(out[0]!.p).toBe(50); // midpoint of 0.40 / 0.60
    expect(out[1]!.p).toBe(55); // last-trade close wins
  });

  it('inverts the yes price for a No-favored single binary', () => {
    const out = mapKalshi({ candlesticks: [candle(1781118000, '0.20', '0.20')] }, true);
    expect(out[0]!.p).toBe(80); // 1 - 0.20
  });

  it('skips priceless candles', () => {
    expect(mapKalshi({ candlesticks: [candle(1781118000, '0', '0')] }, false)).toEqual([]);
  });
});
