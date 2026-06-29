import { describe, expect, it, vi } from 'vitest';
import { shapeEvent, fillTemplateBlank, fetchTopMarkets } from './polymarket';
import * as http from './http';
import type { Config } from './config';

const binaryEvent = {
  id: '1',
  title: 'Will X happen?',
  slug: 'will-x',
  image: 'img.png',
  volume: 1000,
  volume24hr: 50,
  liquidity: 200,
  openInterest: 10,
  endDate: '2026-12-01T00:00:00Z',
  active: true,
  closed: false,
  tags: [{ label: 'Politics' }, { label: 'World' }],
  markets: [
    {
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.68", "0.32"]',
      oneDayPriceChange: 0.04,
      active: true,
      closed: false,
    },
  ],
};

describe('shapeEvent — binary', () => {
  it('picks the favored outcome and scales odds', () => {
    const m = shapeEvent(binaryEvent)!;
    expect(m.favored).toBe('Yes');
    expect(m.oddsPct).toBe(68);
    expect(m.movement24h).toBe(4); // 0.04 * 100, Yes favored
    expect(m.category).toBe('Politics');
    expect(m.volume).toBe(1000);
    expect(m.liquidity).toBe(200);
  });

  it('flips movement sign when No is favored', () => {
    const m = shapeEvent({
      ...binaryEvent,
      markets: [
        { outcomes: '["Yes","No"]', outcomePrices: '["0.30","0.70"]', oneDayPriceChange: 0.04 },
      ],
    })!;
    expect(m.favored).toBe('No');
    expect(m.oddsPct).toBe(70);
    expect(m.movement24h).toBe(-4);
  });
});

describe('shapeEvent — grouped', () => {
  it('chooses the highest-Yes candidate across sub-markets', () => {
    const m = shapeEvent({
      ...binaryEvent,
      title: 'World Cup Winner',
      markets: [
        {
          groupItemTitle: 'Spain',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.15","0.85"]',
          oneDayPriceChange: 0.01,
        },
        {
          groupItemTitle: 'Brazil',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.22","0.78"]',
          oneDayPriceChange: -0.02,
        },
      ],
    })!;
    expect(m.favored).toBe('Brazil');
    expect(m.oddsPct).toBe(22);
    expect(m.movement24h).toBe(-2);
  });
});

describe('shapeEvent — grouped edge cases', () => {
  it('flips movement sign when a candidate market lists ["No","Yes"]', () => {
    const m = shapeEvent({
      ...binaryEvent,
      title: 'Winner',
      markets: [
        {
          groupItemTitle: 'A',
          outcomes: '["No","Yes"]',
          outcomePrices: '["0.4","0.6"]',
          oneDayPriceChange: 0.05,
        },
        {
          groupItemTitle: 'B',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.2","0.8"]',
          oneDayPriceChange: 0.01,
        },
      ],
    })!;
    expect(m.favored).toBe('A');
    expect(m.oddsPct).toBe(60);
    expect(m.movement24h).toBe(-5); // change tracks "No" (idx 0), favored is "Yes"
  });

  it('handles a single remaining candidate (length 1) as grouped', () => {
    const m = shapeEvent({
      ...binaryEvent,
      title: 'Winner',
      markets: [
        {
          groupItemTitle: 'Brazil',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.70","0.30"]',
          oneDayPriceChange: 0.03,
        },
      ],
    })!;
    expect(m.favored).toBe('Brazil');
    expect(m.oddsPct).toBe(70);
  });

  it('routes non-Yes/No grouped markets (Over/Under) to argmax, not the group title', () => {
    const m = shapeEvent({
      ...binaryEvent,
      title: 'Total goals',
      markets: [
        {
          groupItemTitle: 'Total 2.5',
          outcomes: '["Over","Under"]',
          outcomePrices: '["0.62","0.38"]',
          oneDayPriceChange: 0.02,
        },
        {
          groupItemTitle: 'Total 3.5',
          outcomes: '["Over","Under"]',
          outcomePrices: '["0.30","0.70"]',
          oneDayPriceChange: -0.01,
        },
      ],
    })!;
    expect(m.favored).toBe('Over'); // first market argmax, not "Total 2.5"
    expect(m.oddsPct).toBe(62);
  });
});

describe('shapeEvent — guards', () => {
  it('returns null without markets', () => {
    expect(shapeEvent({ id: '1', title: 'x', markets: [] })).toBeNull();
  });
  it('skips zero-price markets', () => {
    expect(
      shapeEvent({
        ...binaryEvent,
        markets: [{ outcomes: '["Yes","No"]', outcomePrices: '["0","0"]' }],
      }),
    ).toBeNull();
  });
  it('falls back to a default category', () => {
    const m = shapeEvent({ ...binaryEvent, tags: [] })!;
    expect(m.category).toBe('Markets');
  });
});

describe('fillTemplateBlank — scalar/ladder titles', () => {
  it('fills a no-space blank with the favored level, dropping the arrow', () => {
    expect(fillTemplateBlank('Will Silver (SI) hit__ by end of June?', '↓ $60')).toBe(
      'Will Silver (SI) hit $60 by end of June?',
    );
  });
  it('fills a spaced blank and a no-space arrow level', () => {
    expect(fillTemplateBlank("Will SpaceX's valuation hit __ by June 30?", '↑$3.0T')).toBe(
      "Will SpaceX's valuation hit $3.0T by June 30?",
    );
  });
  it('fills a leading blank', () => {
    expect(
      fillTemplateBlank('Will __ ships transit the Strait of Hormuz on any day by June 30?', '20+'),
    ).toBe('Will 20+ ships transit the Strait of Hormuz on any day by June 30?');
  });
  it('fills a longer underscore run', () => {
    expect(fillTemplateBlank('Bitcoin above ___ on June 18?', '52,000')).toBe(
      'Bitcoin above 52,000 on June 18?',
    );
  });
  it('leaves a normal title untouched', () => {
    expect(fillTemplateBlank('Will X happen?', 'Yes')).toBe('Will X happen?');
  });
  it('leaves the blank when the level is empty after cleaning', () => {
    expect(fillTemplateBlank('Will X hit __ today?', '↑')).toBe('Will X hit __ today?');
  });
  it('inserts a "$" level literally (not as a replacement pattern)', () => {
    // "$&"/"$1" are special in String.replace; the function replacement must keep
    // the dollar sign + digits intact.
    expect(fillTemplateBlank('Gold hits __ this year?', '$1,800')).toBe(
      'Gold hits $1,800 this year?',
    );
  });
});

describe('shapeEvent — ladder blank', () => {
  it('fills the group title blank from the favored strike', () => {
    const m = shapeEvent({
      ...binaryEvent,
      title: 'Will Silver (SI) hit__ by end of June?',
      markets: [
        {
          groupItemTitle: '↓ $50',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.10","0.90"]',
        },
        {
          groupItemTitle: '↓ $60',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.22","0.78"]',
        },
      ],
    })!;
    expect(m.favored).toBe('↓ $60');
    expect(m.title).toBe('Will Silver (SI) hit $60 by end of June?');
  });
});

describe('fetchTopMarkets — two-page volume fetch (discovery)', () => {
  const ev = (id: string) => ({ ...binaryEvent, id });
  const idOf = (id: string) => shapeEvent(ev(id))!.id;

  it('fills the top page to polymarketLimit, then adds page-2 discovery (deduped, capped)', async () => {
    const page1 = [ev('a'), ev('b'), ev('c')];
    const page2 = [ev('b'), ev('d'), ev('e')]; // 'b' duplicates a page-1 pick
    vi.spyOn(http, 'getJson').mockImplementation((url: string) =>
      Promise.resolve(/offset=0&/.test(url) ? page1 : page2),
    );
    const cfg = { polymarketLimit: 2, polymarketDiscoveryLimit: 2, userAgent: 'x' } as Config;
    const shaped = await fetchTopMarkets(cfg);
    // page1 → a,b (cap 2); page2 → b deduped, d,e added (cap 2)
    expect(shaped.map((m) => m.id)).toEqual([idOf('a'), idOf('b'), idOf('d'), idOf('e')]);
    vi.restoreAllMocks();
  });

  it('skips the second page entirely when discovery is disabled', async () => {
    const spy = vi
      .spyOn(http, 'getJson')
      .mockImplementation(() => Promise.resolve([ev('a'), ev('b')]));
    const cfg = { polymarketLimit: 5, polymarketDiscoveryLimit: 0, userAgent: 'x' } as Config;
    const shaped = await fetchTopMarkets(cfg);
    expect(shaped).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1); // only the top page is fetched
    vi.restoreAllMocks();
  });
});
