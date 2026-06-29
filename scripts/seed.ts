/**
 * Writes a realistic sample feed to public/feed.json for local development and
 * as the committed fallback. The CI pipeline overwrites this with live data.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Feed, Market, OddsPoint } from '../src/lib/types';

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const future = (days: number) => new Date(now + days * 86_400_000).toISOString();
const past = (days: number) => new Date(now - days * 86_400_000).toISOString();

function history(points: number[]): OddsPoint[] {
  return points.map((p, i) => ({
    t: new Date(now - (points.length - 1 - i) * 3 * 3_600_000).toISOString(),
    p,
  }));
}

const markets: Market[] = [
  {
    id: 'sample-fed',
    source: 'polymarket',
    title: 'Will the Fed cut rates at its next meeting?',
    marketUrl: 'https://polymarket.com/event/fed-rate-cut',
    image: '',
    category: 'Economics',
    description: 'Resolves Yes if the FOMC lowers the target range at its next scheduled meeting.',
    favored: 'Yes',
    oddsPct: 68,
    take: 'Our read: the market looks a touch overconfident — a hot CPI print could snap this back fast.',
    marketRead:
      'The market is pricing a cut more confidently than the coverage’s cautious, data-dependent tone.',
    alt: {
      source: 'kalshi',
      favored: 'Yes',
      oddsPct: 61,
      volume: 540_000,
      marketUrl: 'https://kalshi.com/markets/KXFED',
    },
    divergence: 7,
    movement24h: 4.2,
    movement7d: 9.0,
    oddsHistory: history([58, 60, 59, 62, 64, 63, 66, 68]),
    volume: 2_400_000,
    volume24h: 620_000,
    liquidity: 310_000,
    openInterest: 540_000,
    comments: 1840,
    score: 6.0,
    startDate: past(54),
    endDate: future(12),
    status: 'active',
    hook: 'Will the Fed blink before the labor market does?',
    // Datapoints are woven in as {tokens}, hydrated from the live market values
    // at render (see src/lib/hydrate.ts) so the prose always matches the card.
    analysis:
      'The Federal Reserve heads into its next meeting under growing pressure to ease, and the ' +
      'crowd has moved faster than the press: traders now price a cut at {odds}, {move7d} over the ' +
      'past week. Officials remain split — services inflation is still running hot, and a hawkish ' +
      'faction wants more evidence before moving — with the next CPI print the decisive input. ' +
      'Kalshi is more cautious at {altOdds}, a {gap} gap that says the conviction isn’t universal. ' +
      'With {volume} riding on the question, the bigger risk to watch is a hot CPI snapping the ' +
      'consensus back.',
    synthesis: {
      consensus: [
        'Markets now lean toward a cut at the next meeting.',
        'Recent labor data came in softer than expected.',
      ],
      disputed: ['Whether services inflation is cooling fast enough to justify a cut.'],
      perspectives: [
        { source: 'Reuters', view: 'Frames the move as data-dependent, not a done deal.' },
        { source: 'Bloomberg', view: 'Emphasizes dovish repricing and crowded rate-cut bets.' },
      ],
    },
    sources: [
      {
        domain: 'reuters.com',
        url: 'https://www.reuters.com',
        title: 'Fed weighs rate path as jobs cool',
      },
      {
        domain: 'bloomberg.com',
        url: 'https://www.bloomberg.com',
        title: 'Traders pile into rate-cut bets',
      },
      { domain: 'wsj.com', url: 'https://www.wsj.com', title: 'Inside the Fed’s next decision' },
    ],
    grounded: true,
    crowdVsCoverage: 'ahead',
    generatedAt: iso(40 * 60_000),
    updatedAt: iso(18 * 60_000),
    resolvedOutcome: null,
    calledCorrectly: null,
    resolvedAt: null,
  },
  {
    id: 'kalshi:sample-gov',
    source: 'kalshi',
    title: 'Government shutdown before the funding deadline?',
    marketUrl: 'https://kalshi.com/markets/KXSHUTDOWN',
    image: '',
    category: 'Politics',
    description: 'Resolves Yes if a federal funding lapse begins before the deadline.',
    favored: 'No',
    oddsPct: 61,
    take: 'We think the base case is right, but rising open interest says traders aren’t fully convinced.',
    marketRead:
      'Traders are fading a shutdown faster than the reporting, which still hedges on the talks.',
    alt: null,
    divergence: null,
    movement24h: -3.5,
    movement7d: -7.0,
    oddsHistory: history([72, 70, 68, 67, 65, 64, 62, 61]),
    volume: 880_000,
    volume24h: 240_000,
    liquidity: 120_000,
    openInterest: 410_000,
    comments: 0,
    score: 5.4,
    startDate: past(20),
    endDate: future(6),
    status: 'active',
    hook: 'Is Washington quietly stepping back from the brink?',
    analysis:
      'Washington is inching toward a deal to keep the government funded, with leaders in both ' +
      'parties signaling a short-term stopgap is within reach before the deadline. Sticking ' +
      'points remain over topline spending and a handful of policy riders that could still ' +
      'derail talks. A lapse would furlough hundreds of thousands of workers and ripple through ' +
      'federal services. Sentiment has faded the odds of a shutdown, though steady positioning on ' +
      'the other side suggests few are treating a deal as done.',
    synthesis: {
      consensus: ['A short-term funding deal is the base case in most reporting.'],
      disputed: ['How close the two sides actually are on the topline number.'],
      perspectives: [
        {
          source: 'Politico',
          view: 'Cautious — flags unresolved riders that could blow up talks.',
        },
        { source: 'The Hill', view: 'More upbeat on a clean stopgap passing in time.' },
      ],
    },
    sources: [
      {
        domain: 'politico.com',
        url: 'https://www.politico.com',
        title: 'Shutdown talks inch forward',
      },
      {
        domain: 'thehill.com',
        url: 'https://thehill.com',
        title: 'Leaders eye stopgap to avoid lapse',
      },
    ],
    grounded: true,
    crowdVsCoverage: '',
    generatedAt: iso(70 * 60_000),
    updatedAt: iso(25 * 60_000),
    resolvedOutcome: null,
    calledCorrectly: null,
    resolvedAt: null,
  },
  {
    id: 'sample-btc',
    source: 'polymarket',
    title: 'Will Bitcoin close above $100k this month?',
    marketUrl: 'https://polymarket.com/event/bitcoin-100k',
    image: '',
    category: 'Crypto',
    description: 'Resolves Yes if BTC’s monthly close is above $100,000.',
    favored: 'No',
    oddsPct: 57,
    take: 'A coin-flip priced as one — we’d watch ETF flows over the round-number narrative.',
    marketRead:
      'The market reads this as a near coin-flip while the coverage leans cautious — the crowd is less committed than the headlines.',
    alt: null,
    divergence: null,
    movement24h: -3.1,
    movement7d: 2.0,
    oddsHistory: history([63, 62, 60, 61, 59, 58, 60, 57]),
    volume: 5_100_000,
    volume24h: 1_900_000,
    liquidity: 880_000,
    openInterest: 1_200_000,
    comments: 920,
    score: 7.0,
    startDate: past(12),
    endDate: future(9),
    status: 'active',
    hook: 'Can the bulls reclaim six figures before the clock runs out?',
    analysis:
      'Bitcoin is consolidating just below $100,000 after a months-long run, as the wave of ' +
      'spot-ETF inflows that powered the rally cools and leveraged bets get flushed out. Whether ' +
      'it can close the month above the milestone hinges on demand returning before the deadline. ' +
      'Analysts are split on whether the pause is healthy basing or the start of a deeper ' +
      'pullback. Observers read the monthly close as close to a coin-flip — a sign of how finely ' +
      'balanced the next move is.',
    synthesis: {
      consensus: [
        'Bitcoin is consolidating just under the $100k level.',
        'ETF inflows have slowed.',
      ],
      disputed: [],
      perspectives: [
        { source: 'CoinDesk', view: 'Reads consolidation as healthy for bulls.' },
        {
          source: 'The Block',
          view: 'Highlights fading inflows and downside risk into the close.',
        },
      ],
    },
    sources: [
      {
        domain: 'coindesk.com',
        url: 'https://www.coindesk.com',
        title: 'BTC consolidates under $100k',
      },
      {
        domain: 'theblock.co',
        url: 'https://www.theblock.co',
        title: 'ETF inflows cool as price stalls',
      },
    ],
    grounded: true,
    crowdVsCoverage: 'contested',
    generatedAt: iso(5 * 3_600_000),
    updatedAt: iso(35 * 60_000),
    resolvedOutcome: null,
    calledCorrectly: null,
    resolvedAt: null,
  },
  {
    id: 'sample-wc',
    source: 'polymarket',
    title: 'Who will win the 2026 FIFA World Cup?',
    marketUrl: 'https://polymarket.com/event/world-cup-winner',
    image: '',
    category: 'Sports',
    description: 'Resolves to the national team that wins the 2026 FIFA World Cup.',
    favored: 'Spain',
    oddsPct: 15,
    take: '15% feels generous given the bracket; the market may be overweighting recent form.',
    marketRead:
      'The market gives Spain a slim edge the coverage doesn’t single out, pricing the field as wide open.',
    alt: null,
    divergence: null,
    movement24h: 1.0,
    movement7d: -1.5,
    oddsHistory: history([12, 13, 13, 14, 14, 15, 14, 15]),
    volume: 48_900_000,
    volume24h: 2_100_000,
    liquidity: 7_200_000,
    openInterest: 3_400_000,
    comments: 1312,
    score: 5.2,
    startDate: past(180),
    endDate: future(40),
    status: 'active',
    hook: 'Is Spain quietly the smart money to lift the trophy?',
    analysis:
      'With the 2026 World Cup approaching, Spain has emerged as a quiet favorite on the strength ' +
      'of deep squad talent and a commanding qualifying campaign, though the title remains wide ' +
      'open. A tough projected bracket and injury questions temper the optimism, and recent ' +
      'friendlies have reshuffled the contenders. The smart-money read gives Spain a slim edge ' +
      'over a crowded field — a reminder that tournament outcomes often hinge as much on the ' +
      'draw as on form.',
    synthesis: {
      consensus: ['Spain is among the top tier of betting favorites.'],
      disputed: [],
      perspectives: [
        { source: 'ESPN', view: 'Bullish on squad depth and qualifying momentum.' },
        { source: 'The Athletic', view: 'Cautious, flagging bracket difficulty and injury risk.' },
      ],
    },
    sources: [
      {
        domain: 'espn.com',
        url: 'https://www.espn.com',
        title: 'Spain headline World Cup favorites',
      },
      { domain: 'nytimes.com', url: 'https://www.nytimes.com', title: 'The contenders, ranked' },
    ],
    grounded: true,
    crowdVsCoverage: '',
    generatedAt: iso(8 * 3_600_000),
    updatedAt: iso(50 * 60_000),
    resolvedOutcome: null,
    calledCorrectly: null,
    resolvedAt: null,
  },
  {
    id: 'sample-cpi',
    source: 'polymarket',
    title: 'Will CPI come in above 3.0% year-over-year?',
    marketUrl: 'https://polymarket.com/event/cpi-print',
    image: '',
    category: 'Economics',
    description: 'Resolved Yes if headline CPI printed above 3.0% YoY.',
    favored: 'No',
    oddsPct: 71,
    take: '',
    marketRead: '',
    alt: null,
    divergence: null,
    movement24h: null,
    movement7d: null,
    oddsHistory: history([60, 63, 66, 68, 70, 71]),
    volume: 1_350_000,
    volume24h: 0,
    liquidity: 90_000,
    openInterest: 0,
    comments: 240,
    score: 4.1,
    startDate: past(34),
    endDate: past(2),
    status: 'resolved',
    hook: 'Inflation cooled — and the crowd saw it coming',
    analysis:
      'Headline inflation eased to its slowest pace in months, landing below the 3.0% line. ' +
      'The market had leaned toward a sub-3 print for weeks, fading the hawkish tail.',
    synthesis: null,
    sources: [
      { domain: 'reuters.com', url: 'https://www.reuters.com', title: 'CPI cools below 3%' },
    ],
    grounded: true,
    crowdVsCoverage: '',
    generatedAt: past(3),
    updatedAt: past(2),
    resolvedOutcome: 'No',
    calledCorrectly: true,
    resolvedAt: past(2),
  },
  {
    id: 'kalshi:sample-mvp',
    source: 'kalshi',
    title: 'Who will win NBA MVP?',
    marketUrl: 'https://kalshi.com/markets/KXMVP',
    image: '',
    category: 'Sports',
    description: 'Resolved to the player named NBA Most Valuable Player.',
    favored: 'Nikola Jokić',
    oddsPct: 48,
    take: '',
    marketRead: '',
    alt: null,
    divergence: null,
    movement24h: null,
    movement7d: null,
    oddsHistory: history([41, 44, 46, 47, 49, 48]),
    volume: 720_000,
    volume24h: 0,
    liquidity: 40_000,
    openInterest: 0,
    comments: 0,
    score: 3.4,
    startDate: past(60),
    endDate: past(5),
    status: 'resolved',
    hook: 'The favorite slipped — voters went the other way',
    analysis:
      'The award went to a different frontrunner than the market’s slim favorite, in one of the ' +
      'tighter races in years. A late-season surge reshuffled the odds the crowd never fully priced.',
    synthesis: null,
    sources: [
      { domain: 'espn.com', url: 'https://www.espn.com', title: 'MVP race goes down to the wire' },
    ],
    grounded: true,
    crowdVsCoverage: '',
    generatedAt: past(6),
    updatedAt: past(5),
    resolvedOutcome: 'Shai Gilgeous-Alexander',
    calledCorrectly: false,
    resolvedAt: past(5),
  },
  {
    id: 'sample-rate-decision',
    source: 'polymarket',
    title: 'Will the central bank hold rates this meeting?',
    marketUrl: 'https://polymarket.com/event/rate-hold',
    image: '',
    category: 'Economics',
    description: 'Resolved Yes if the policy rate was left unchanged.',
    favored: 'Yes',
    oddsPct: 88,
    take: '',
    marketRead: '',
    alt: null,
    divergence: null,
    movement24h: null,
    movement7d: null,
    oddsHistory: history([80, 83, 85, 86, 88]),
    volume: 2_000_000,
    volume24h: 0,
    liquidity: 150_000,
    openInterest: 0,
    comments: 510,
    score: 4.8,
    startDate: past(28),
    endDate: past(1),
    status: 'resolved',
    hook: 'A hold was the safe call — and it was right',
    analysis:
      'Policymakers left rates unchanged, matching what the market had priced as the overwhelming ' +
      'favorite. The decision drew little surprise; the debate had already moved to the next meeting.',
    synthesis: null,
    sources: [
      { domain: 'wsj.com', url: 'https://www.wsj.com', title: 'Central bank holds steady' },
    ],
    grounded: true,
    crowdVsCoverage: '',
    generatedAt: past(2),
    updatedAt: past(1),
    resolvedOutcome: 'Yes',
    calledCorrectly: true,
    resolvedAt: past(1),
  },
];

const feed: Feed = { generatedAt: iso(18 * 60_000), version: 1, markets };

const out = process.env.FEED_PATH ?? 'public/feed.json';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(feed, null, 2));
console.log(`Wrote sample feed → ${out} (${markets.length} markets)`);
