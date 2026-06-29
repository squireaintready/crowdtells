import { describe, expect, it } from 'vitest';
import type { BreakingItem, EventItem, Feed, Market } from '../src/lib/types';
import {
  buildBreakingEmail,
  detectBreakingEvents,
  recipientsForEvent,
  type BreakingEvent,
} from './send-breaking';

const NOW = Date.parse('2026-06-18T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function market(over: Partial<Market>): Market {
  return {
    id: 'm', source: 'polymarket', title: 'T', marketUrl: 'https://polymarket.com/event/s',
    image: '', category: 'Politics', description: '', favored: 'Yes', oddsPct: 60, alt: null,
    divergence: null, movement24h: 2, movement7d: 5, oddsHistory: [], volume: 1e6, volume24h: 1e5,
    liquidity: 1e4, openInterest: 1e4, comments: 0, score: 1, startDate: null,
    endDate: '2026-12-01T00:00:00Z', status: 'active', hook: 'A hook', analysis: 'a', take: '',
    marketRead: '', crowdVsCoverage: '', synthesis: null, sources: [], grounded: true,
    generatedAt: '2026-06-14T00:00:00Z', updatedAt: '2026-06-15T00:00:00Z', resolvedOutcome: null,
    calledCorrectly: null, resolvedAt: null, ...over,
  };
}

function cluster(over: Partial<BreakingItem>): BreakingItem {
  return {
    title: 'Outlets report a development', outlets: ['bbc.com', 'nytimes.com', 'apnews.com'],
    url: 'https://bbc.com/x', topic: 'Politics', firstSeen: hoursAgo(2), lastSeen: hoursAgo(1), ...over,
  };
}

// A non-sports real-world event by default — a sports 'final' is editorially never an
// alert (see the dedicated exclusion test), so the generic final-detection cases use a
// non-sports event; pass kind:'sports' to exercise the exclusion.
function event(over: Partial<EventItem>): EventItem {
  return {
    id: 'evt:1', title: 'Ceasefire takes effect', topic: 'World', kind: 'world', status: 'final',
    startTime: hoursAgo(4), endTime: hoursAgo(2), detail: 'Final · signed', source: 'wikipedia', ...over,
  };
}

const feed = (markets: Market[]): Feed => ({ generatedAt: 'x', version: 1, markets });

describe('detectBreakingEvents — resolution', () => {
  it('alerts a briefed, high-volume market that just resolved within the lookback', () => {
    const out = detectBreakingEvents(
      feed([market({ id: 'r', hook: 'Senate passes the bill', status: 'resolved', resolvedOutcome: 'Yes', resolvedAt: hoursAgo(1), volume: 8_000_000 })]),
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'resolved', detail: 'Resolved Yes' });
    expect(out[0]!.eventKey).toMatch(/^resolved:[a-z0-9]+$/); // content-keyed, not market-keyed
  });

  it('collapses several markets settling the same event into ONE resolution alert', () => {
    const out = detectBreakingEvents(
      feed([
        market({ id: 'fed1', hook: 'Fed holds rates steady', status: 'resolved', resolvedOutcome: 'Fed maintains rate', resolvedAt: hoursAgo(1), volume: 160_000_000 }),
        market({ id: 'fed2', hook: 'Fed holds rates steady', status: 'resolved', resolvedOutcome: 'No change', resolvedAt: hoursAgo(2), volume: 11_000_000 }),
      ]),
      NOW,
    );
    expect(out).toHaveLength(1); // same event → one alert
  });

  it('ignores a resolution older than the lookback window', () => {
    const out = detectBreakingEvents(
      feed([market({ id: 'r', status: 'resolved', resolvedOutcome: 'Yes', resolvedAt: hoursAgo(60) })]),
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  it('ignores a resolved market we never briefed', () => {
    const out = detectBreakingEvents(
      feed([market({ id: 'r', status: 'resolved', resolvedOutcome: 'Yes', resolvedAt: hoursAgo(1), generatedAt: null, hook: '' })]),
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  it('ignores a below-floor-volume resolution (novelty/prop/weather long tail)', () => {
    // Above the old $1M floor but below the $5M "serious money" bar → no alert.
    const out = detectBreakingEvents(
      feed([market({ id: 'r', category: 'Culture', hook: 'Elon Musk tweets 200-219 times', status: 'resolved', resolvedOutcome: '200-219', resolvedAt: hoursAgo(1), volume: 2_000_000 })]),
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  it('excludes quantity-novelty resolutions whose outcome is a bare number/range/measurement', () => {
    const tweets = market({ id: 'a', category: 'Culture', hook: 'Elon Musk tweets 200-219 times', status: 'resolved', resolvedOutcome: '200-219', resolvedAt: hoursAgo(1), volume: 9_000_000 });
    const btc = market({ id: 'b', category: 'Crypto', hook: 'Bitcoin closes above 52,000', status: 'resolved', resolvedOutcome: '52,000', resolvedAt: hoursAgo(1), volume: 9_000_000 });
    const temp = market({ id: 'c', category: 'Climate', hook: 'NYC high', status: 'resolved', resolvedOutcome: '75° to 76°', resolvedAt: hoursAgo(1), volume: 9_000_000 });
    expect(detectBreakingEvents(feed([tweets, btc, temp]), NOW)).toHaveLength(0);
  });

  it('keeps categorical resolutions (Yes/No and worded outcomes)', () => {
    const yes = market({ id: 'y', hook: 'Senate passes the bill', status: 'resolved', resolvedOutcome: 'Yes', resolvedAt: hoursAgo(1), volume: 9_000_000 });
    const no = market({ id: 'n', hook: 'Shutdown averted', status: 'resolved', resolvedOutcome: 'No', resolvedAt: hoursAgo(1), volume: 9_000_000 });
    const worded = market({ id: 'w', hook: 'Fed decision', status: 'resolved', resolvedOutcome: 'Above 3.25%', resolvedAt: hoursAgo(1), volume: 9_000_000 });
    expect(detectBreakingEvents(feed([yes, no, worded]), NOW)).toHaveLength(3);
  });

  it('excludes routine sports outcomes — by category AND by a sports hook on a mislabeled category', () => {
    const bySportsCategory = market({ id: 'a', category: 'Soccer', status: 'resolved', resolvedOutcome: 'Yes', resolvedAt: hoursAgo(1), volume: 30_000_000 });
    const bySportsHook = market({ id: 'b', category: 'Games', hook: 'England beats Croatia in World Cup thriller', status: 'resolved', resolvedOutcome: 'England', resolvedAt: hoursAgo(1), volume: 26_000_000 });
    expect(detectBreakingEvents(feed([bySportsCategory, bySportsHook]), NOW)).toHaveLength(0);
  });
});

describe('detectBreakingEvents — final event', () => {
  it('alerts a briefed market whose mapped event just went final (keyed by event id)', () => {
    const out = detectBreakingEvents(feed([market({ id: 'g', events: [event({})] })]), NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'final', eventKey: 'final:evt:1', headline: 'Ceasefire takes effect', detail: 'Final · signed' });
  });

  it('never alerts a routine sports result — even mapped to a non-sports market (a soccer FT mis-pinned to Culture, where the title carries no sport keyword)', () => {
    const out = detectBreakingEvents(
      feed([
        market({
          id: 'g',
          category: 'Culture',
          events: [event({ kind: 'sports', title: 'Saudi Arabia at Spain', detail: 'FT · KSA 0–4 ESP' })],
        }),
      ]),
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  it('ignores a final event that finished too long ago', () => {
    const out = detectBreakingEvents(feed([market({ id: 'g', events: [event({ endTime: hoursAgo(20) })] })]), NOW);
    expect(out).toHaveLength(0);
  });

  it('ignores a scheduled/live (not yet final) event', () => {
    const out = detectBreakingEvents(feed([market({ id: 'g', events: [event({ status: 'live', detail: 'Q3 · 60–58' })] })]), NOW);
    expect(out).toHaveLength(0);
  });
});

describe('detectBreakingEvents — developing cluster', () => {
  it('alerts a fresh, corroborated cluster pinned to a briefed market (keyed by content)', () => {
    const out = detectBreakingEvents(feed([market({ id: 'd', breaking: [cluster({ title: 'Big news' })] })]), NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'developing', headline: 'Big news' });
    // Content-keyed (not firstSeen, not marketId) — stable across re-clustering.
    expect(out[0]!.eventKey).toMatch(/^developing:[a-z0-9]+$/);
  });

  it('requires a strong corroboration floor (≥3 outlets) to push-alert', () => {
    const out = detectBreakingEvents(feed([market({ id: 'd', breaking: [cluster({ outlets: ['bbc.com', 'nytimes.com'] })] })]), NOW);
    expect(out).toHaveLength(0);
  });

  it('ignores a stale cluster', () => {
    const out = detectBreakingEvents(feed([market({ id: 'd', breaking: [cluster({ firstSeen: hoursAgo(10), lastSeen: hoursAgo(9) })] })]), NOW);
    expect(out).toHaveLength(0);
  });

  it('excludes a sports-headline cluster even when its market is not sports-categorized', () => {
    const out = detectBreakingEvents(
      feed([market({ id: 'd', category: 'Games', breaking: [cluster({ title: 'Australia v USA: how each can win their World Cup clash', outlets: ['a.com', 'b.com', 'c.com', 'd.com'] })] })]),
      NOW,
    );
    expect(out).toHaveLength(0);
  });
});

describe('detectBreakingEvents — odds swing', () => {
  it('alerts a big 24h move on a liquid, briefed market and keys by favored side', () => {
    const out = detectBreakingEvents(
      feed([market({ id: 's', movement24h: 25, volume24h: 500_000, favored: 'No', oddsPct: 71 })]),
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'swing', eventKey: 'swing:s:No' });
    expect(out[0]!.detail).toContain('No 71%');
    expect(out[0]!.detail).toContain('▲25');
  });

  it('ignores a sub-threshold move', () => {
    const out = detectBreakingEvents(feed([market({ id: 's', movement24h: 10, volume24h: 500_000 })]), NOW);
    expect(out).toHaveLength(0);
  });

  it('ignores a big move on a thin (low-volume) market', () => {
    const out = detectBreakingEvents(feed([market({ id: 's', movement24h: 25, volume24h: 100_000 })]), NOW);
    expect(out).toHaveLength(0);
  });
});

describe('detectBreakingEvents — ranking, dedup-shape, throttle', () => {
  it('ranks resolved > developing > final > swing and emits one event per market', () => {
    const out = detectBreakingEvents(
      feed([
        market({ id: 'swing', movement24h: 30, volume24h: 999_999 }),
        market({ id: 'final', events: [event({})] }),
        market({ id: 'dev', breaking: [cluster({})] }),
        market({ id: 'res', status: 'resolved', resolvedOutcome: 'Yes', resolvedAt: hoursAgo(1), volume: 8_000_000 }),
      ]),
      NOW,
      10, // lift the throttle so all four rank (default cap is 3)
    );
    expect(out.map((e) => e.kind)).toEqual(['resolved', 'developing', 'final', 'swing']);
  });

  it('a resolved market does not also fire a swing (one strongest event)', () => {
    const out = detectBreakingEvents(
      feed([market({ id: 'r', status: 'resolved', resolvedOutcome: 'No', resolvedAt: hoursAgo(1), volume: 8_000_000, movement24h: 40, volume24h: 999_999 })]),
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('resolved');
  });

  it('collapses the same story pinned to multiple markets into ONE alert', () => {
    const sameNews = { title: 'Oil supply glut forecast' };
    const out = detectBreakingEvents(
      feed([
        market({ id: 'mA', category: 'Economics', breaking: [cluster({ ...sameNews, outlets: ['a.com', 'b.com', 'c.com', 'd.com'] })] }),
        market({ id: 'mB', category: 'World', breaking: [cluster({ ...sameNews, outlets: ['a.com', 'b.com', 'c.com'] })] }),
      ]),
      NOW,
    );
    expect(out).toHaveLength(1); // one alert, not two
    expect(out[0]!.marketId).toBe('mA'); // higher priority (more outlets) wins
  });

  it('collapses one real-world event mapped to multiple markets into ONE final alert', () => {
    const out = detectBreakingEvents(
      feed([
        market({ id: 'mA', events: [event({ id: 'espn:42' })] }),
        market({ id: 'mB', events: [event({ id: 'espn:42' })] }),
      ]),
      NOW,
    );
    expect(out.filter((e) => e.kind === 'final')).toHaveLength(1);
  });

  it('returns the FULL ranked list by default (run-throttle lives in main, after dedup)', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      market({ id: `s${i}`, movement24h: 21 + i, volume24h: 500_000 }),
    );
    // No cap by default — so dedup can pick the top-N UNCLAIMED downstream.
    expect(detectBreakingEvents(feed(many), NOW)).toHaveLength(8);
    // …but the optional safety limit still slices when asked (used by tests).
    expect(detectBreakingEvents(feed(many), NOW, 3)).toHaveLength(3);
    // Highest 24h move ranks first.
    expect(detectBreakingEvents(feed(many), NOW)[0]!.marketId).toBe('s7');
  });
});

describe('recipientsForEvent', () => {
  const subs = [
    { email: 'all@x.com', topics: [] },
    { email: 'pol@x.com', topics: ['Politics'] },
    { email: 'sport@x.com', topics: ['Sports'] },
  ];
  it('includes all-topics subscribers and topic-matched ones, excludes mismatches', () => {
    const got = recipientsForEvent(subs, 'Politics').map((s) => s.email);
    expect(got).toEqual(['all@x.com', 'pol@x.com']);
  });
});

describe('buildBreakingEmail', () => {
  const ev: BreakingEvent = {
    marketId: 'm', kind: 'resolved', eventKey: 'resolved:m', category: 'Politics',
    priority: 3000, headline: 'Senate passes the bill', detail: 'Resolved Yes', slug: 'senate-bill',
  };
  const unsub = 'https://crowdtells.com/?unsubscribe=tok-1';

  it('builds a tagged subject and links to the briefing', () => {
    const out = buildBreakingEmail(ev, { siteUrl: 'https://crowdtells.com', unsubscribeUrl: unsub });
    expect(out.subject).toBe('Resolved: Senate passes the bill');
    expect(out.html).toContain('/s/senate-bill');
    expect(out.text).toContain('/s/senate-bill');
  });

  it('embeds the first-party unsubscribe link and never the tracking domain', () => {
    const out = buildBreakingEmail(ev, { siteUrl: 'https://crowdtells.com', unsubscribeUrl: unsub });
    expect(out.html).toContain(`href="${unsub}"`);
    expect(out.text).toContain(`Unsubscribe: ${unsub}`);
    expect(out.html).not.toContain('email.mg');
    expect(out.html).not.toContain('%unsubscribe_url%');
  });

  it('locks the color scheme (dark-mode-safe button) and escapes the headline', () => {
    const out = buildBreakingEmail(
      { ...ev, headline: 'A <script> & "quote"' },
      { siteUrl: 'https://crowdtells.com', unsubscribeUrl: unsub },
    );
    expect(out.html).toContain('color-scheme');
    expect(out.html).toContain('A &lt;script&gt; &amp; &quot;quote&quot;');
    expect(out.html).not.toContain('<script>');
  });

  it('enriches the alert with a standfirst + up to 3 pointers when the market is provided', () => {
    const m = market({
      id: 'm',
      dek: 'A short standfirst summarizing the result.',
      precedents: ['First data point.', 'Second data point.', 'Third data point.', 'Fourth (dropped).'],
    });
    const out = buildBreakingEmail(ev, { siteUrl: 'https://crowdtells.com', unsubscribeUrl: unsub }, m);
    expect(out.html).toContain('A short standfirst summarizing the result.');
    expect(out.html).toContain('Worth knowing');
    expect(out.html).toContain('First data point.');
    expect(out.html).not.toContain('Fourth (dropped).'); // capped at 3
    expect(out.text).toContain('A short standfirst summarizing the result.');
    expect(out.text).toContain('• First data point.');
  });

  it('omits the enrichment block when no market is provided (back-compat)', () => {
    const out = buildBreakingEmail(ev, { siteUrl: 'https://crowdtells.com', unsubscribeUrl: unsub });
    expect(out.html).not.toContain('Worth knowing');
  });

  it('on a final event: drops a bare-source detail and never grafts a mismatched market dek/pointers', () => {
    const finalEv: BreakingEvent = {
      ...ev, kind: 'final', detail: 'Wikipedia', headline: 'Bolivian president declares a state of emergency',
    };
    const mismatched = market({ id: 'm', dek: 'Hungary leader faces challenge', precedents: ['Unrelated fact.'] });
    const out = buildBreakingEmail(finalEv, { siteUrl: 'https://crowdtells.com', unsubscribeUrl: unsub }, mismatched);
    expect(out.html).toContain('Bolivian president'); // headline still shown
    expect(out.html).not.toContain('Wikipedia'); // bare single-word source suppressed (html + preheader)
    expect(out.html).not.toContain('Hungary'); // no mismatched market dek on a final
    expect(out.html).not.toContain('Worth knowing'); // no precedents on a final
    expect(out.text).not.toContain('Wikipedia');
  });
});
