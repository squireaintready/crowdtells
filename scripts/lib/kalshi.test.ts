import { describe, expect, it } from 'vitest';
import { shapeKalshiEvent } from './kalshi';

const base = {
  event_ticker: 'E1',
  series_ticker: 'KXTEST',
  title: 'Who IPOs first?',
  category: 'Financials',
};

describe('shapeKalshiEvent — candidate event', () => {
  it('picks the highest-yes candidate and converts contracts to USD', () => {
    const m = shapeKalshiEvent({
      ...base,
      markets: [
        {
          status: 'active',
          yes_sub_title: 'Anthropic',
          last_price_dollars: '0.82',
          previous_price_dollars: '0.78',
          volume_fp: '1000',
          volume_24h_fp: '100',
          open_interest_fp: '500',
          liquidity_dollars: '40',
        },
        {
          status: 'active',
          yes_sub_title: 'OpenAI',
          last_price_dollars: '0.18',
          previous_price_dollars: '0.22',
          volume_fp: '2000',
          volume_24h_fp: '200',
          open_interest_fp: '900',
          liquidity_dollars: '30',
        },
      ],
    })!;
    expect(m.favored).toBe('Anthropic'); // highest-yes candidate (not a price ladder)
    expect(m.oddsPct).toBe(82);
    expect(m.movement24h).toBe(4); // (0.82 - 0.78) * 100
    expect(m.volume).toBe(1180); // SUM across contracts: 1000*0.82 + 2000*0.18
    expect(m.openInterest).toBe(572); // 500*0.82 + 900*0.18
    expect(m.liquidity).toBe(40); // headline contract's, already USD
    expect(m.kind).toBe('standing');
    expect(m.tags).toEqual([]);
    expect(m.source).toBe('kalshi');
    expect(m.id).toBe('kalshi:E1');
    expect(m.marketUrl).toBe('https://kalshi.com/markets/KXTEST');
  });
});

describe('shapeKalshiEvent — price ladder', () => {
  it('leads with the contested rung (nearest 50%), not the foregone deep-ITM one', () => {
    const m = shapeKalshiEvent({
      ...base,
      title: 'What price will Bitcoin hit in 2026?',
      category: 'Crypto',
      markets: [
        // Deep ITM, foregone (old code would headline this), tiny depth.
        { status: 'active', yes_sub_title: '$50,000 or above', last_price_dollars: '0.98', previous_price_dollars: '0.98', volume_fp: '100', volume_24h_fp: '10', open_interest_fp: '50' },
        // Contested rung — the real story.
        { status: 'active', yes_sub_title: '$150,000 or above', last_price_dollars: '0.46', previous_price_dollars: '0.40', volume_fp: '4000', volume_24h_fp: '2000', open_interest_fp: '3000' },
        // Long shot.
        { status: 'active', yes_sub_title: '$250,000 or above', last_price_dollars: '0.05', previous_price_dollars: '0.06', volume_fp: '500', volume_24h_fp: '100', open_interest_fp: '400' },
      ],
    })!;
    expect(m.favored).toBe('$150,000 or above'); // contested rung, not the 98% one
    expect(m.oddsPct).toBe(46);
    expect(m.kind).toBe('standing'); // no intraday clock time → not ephemeral
  });

  it('classifies a daily intraday ladder as ephemeral', () => {
    const m = shapeKalshiEvent({
      ...base,
      title: 'BTC price on Jun 19, 2026 at 5pm EDT?',
      category: 'Crypto',
      markets: [
        { status: 'active', yes_sub_title: '$50,500 or above', last_price_dollars: '0.50', volume_fp: '1000', volume_24h_fp: '500' },
        { status: 'active', yes_sub_title: '$51,000 or above', last_price_dollars: '0.30', volume_fp: '800', volume_24h_fp: '400' },
        { status: 'active', yes_sub_title: '$51,500 or above', last_price_dollars: '0.10', volume_fp: '300', volume_24h_fp: '100' },
      ],
    })!;
    expect(m.kind).toBe('ephemeral'); // "at 5pm EDT" intraday → dropped from the feed
  });
});

describe('shapeKalshiEvent — single binary', () => {
  it('favors No and signs movement accordingly', () => {
    const m = shapeKalshiEvent({
      ...base,
      markets: [
        {
          status: 'active',
          yes_sub_title: 'X',
          last_price_dollars: '0.30',
          previous_price_dollars: '0.35',
          volume_fp: '1000',
          volume_24h_fp: '0',
          open_interest_fp: '0',
          liquidity_dollars: '0',
        },
      ],
    })!;
    expect(m.favored).toBe('No');
    expect(m.oddsPct).toBe(70);
    expect(m.movement24h).toBe(5); // No strengthened as Yes fell 5pts
    expect(m.volume).toBe(300); // 1000 * 0.30
  });

  it('suppresses movement when there is no last trade', () => {
    const m = shapeKalshiEvent({
      ...base,
      markets: [
        {
          status: 'active',
          last_price_dollars: '0',
          yes_bid_dollars: '0.40',
          yes_ask_dollars: '0.44',
          previous_price_dollars: '0.50',
          volume_fp: '1000',
        },
      ],
    })!;
    expect(m.movement24h).toBeNull();
    expect(m.oddsPct).toBe(58); // No favored at 1 - 0.42 mid
  });
});

describe('shapeKalshiEvent — guards', () => {
  it('returns null when no market has a price', () => {
    expect(
      shapeKalshiEvent({ ...base, markets: [{ status: 'active', last_price_dollars: '0' }] }),
    ).toBeNull();
  });
  it('returns null with no markets', () => {
    expect(shapeKalshiEvent({ ...base, markets: [] })).toBeNull();
  });
});
