import { describe, expect, it } from 'vitest';
import {
  espnStatus,
  yyyymmdd,
  parseEspnEvents,
  jobsReportEvents,
  fomcEvents,
  statesOf,
  groupWeatherAlerts,
  sortEvents,
  pinEventsToMarkets,
  balanceStrip,
  wikiDayPage,
  parseWikipediaEvents,
  cleanPlace,
  parseEarthquakes,
  parseReliefWeb,
  parseGdacs,
  dedupeEvents,
  ymd,
  parseFinnhubEarnings,
  parseFinnhubIpo,
  parsePandaScore,
} from './events';
import { makeMarket } from '../../src/test/factory';
import type { EventItem } from '../../src/lib/types';

const NOW = Date.parse('2026-06-17T18:00:00.000Z');

describe('espnStatus', () => {
  it('maps ESPN lifecycle state to our coarse status', () => {
    expect(espnStatus('pre')).toBe('scheduled');
    expect(espnStatus('in')).toBe('live');
    expect(espnStatus('post')).toBe('final');
    expect(espnStatus(undefined)).toBe('scheduled');
  });
});

describe('yyyymmdd', () => {
  it('extracts a compact UTC date from an ISO instant', () => {
    expect(yyyymmdd('2026-06-17T18:00:00.000Z')).toBe('20260617');
  });
});

describe('cleanPlace + parseEarthquakes', () => {
  it('tidies a USGS place string', () => {
    expect(cleanPlace('12 km S of Foo, Country')).toBe('near Foo, Country');
    expect(cleanPlace('Kuwait')).toBe('Kuwait');
  });

  it('maps the USGS feed to global earthquake events (recent = live)', () => {
    const data = {
      features: [
        { id: 'a', properties: { mag: 6.2, place: '5 km S of Kuwait City, Kuwait', time: NOW - 30 * 60_000, url: 'https://usgs/a', type: 'earthquake' } },
        { id: 'b', properties: { mag: 4.8, place: 'off the coast of Japan', time: NOW - 6 * 3_600_000, url: 'https://usgs/b', type: 'earthquake' } },
        { id: 'c', properties: { mag: 3.1, place: 'nowhere', time: NOW, type: 'quarry blast' } }, // non-earthquake → dropped
      ],
    };
    const out = parseEarthquakes(data, NOW);
    expect(out.map((e) => e.id)).toEqual(['usgs:a', 'usgs:b']);
    expect(out[0]).toMatchObject({ kind: 'disaster', topic: 'Disasters', source: 'usgs', status: 'live' });
    expect(out[0]!.title).toBe('M6.2 — near Kuwait City, Kuwait');
    expect(out[1]!.status).toBe('final'); // 6h old
  });
});

describe('parseEspnEvents', () => {
  const scoreboard = {
    events: [
      {
        id: '1',
        date: '2026-06-17T23:00:00Z', // upcoming, scheduled
        name: 'Lakers at Celtics',
        status: { type: { state: 'pre', shortDetail: '7:00 PM ET' } },
        competitions: [{ competitors: [{ team: { abbreviation: 'LAL' }, homeAway: 'away' }, { team: { abbreviation: 'BOS' }, homeAway: 'home' }] }],
        links: [{ href: 'https://espn.com/game/1' }],
      },
      {
        id: '2',
        date: '2026-06-17T17:00:00Z', // live now
        name: 'Yankees at Red Sox',
        status: { type: { state: 'in', shortDetail: 'Top 5th' } },
        competitions: [{ competitors: [{ team: { abbreviation: 'NYY' }, score: '3', homeAway: 'away' }, { team: { abbreviation: 'BOS' }, score: '2', homeAway: 'home' }] }],
        links: [{ href: 'https://espn.com/game/2' }],
      },
      {
        id: '3',
        date: '2026-06-15T00:00:00Z', // final, but >12h old → dropped
        name: 'Old Game',
        status: { type: { state: 'post', shortDetail: 'Final' } },
        competitions: [{ competitors: [] }],
      },
    ],
  };

  it('maps games to events, drops stale finals, and builds a score line for live games', () => {
    const out = parseEspnEvents(scoreboard, 'Sports', NOW);
    expect(out.map((e) => e.id)).toEqual(['espn:1', 'espn:2']); // stale final #3 dropped
    const live = out.find((e) => e.id === 'espn:2')!;
    expect(live.status).toBe('live');
    expect(live.detail).toContain('NYY 3–2 BOS');
    expect(out.find((e) => e.id === 'espn:1')!.status).toBe('scheduled');
  });
});

describe('parseReliefWeb', () => {
  it('maps the v2 disasters payload to global disaster events', () => {
    const data = {
      data: [
        { id: 123, fields: { name: 'Philippines: Tropical Cyclone - Jun 2026', status: 'ongoing', primary_type: { name: 'Tropical Cyclone' }, url_alias: 'disaster/tc-2026-phl', date: { created: '2026-06-17T00:00:00+00:00' } } },
        { id: 9, fields: { name: 'Sudan: Floods', url_alias: 'https://reliefweb.int/disaster/fl-sdn' } },
        { id: 1 }, // no fields → dropped
      ],
    };
    const out = parseReliefWeb(data, '2026-06-17T18:00:00.000Z');
    expect(out.map((e) => e.id)).toEqual(['reliefweb:123', 'reliefweb:9']);
    expect(out[0]).toMatchObject({ kind: 'disaster', topic: 'Disasters', source: 'reliefweb', status: 'live' });
    expect(out[0]!.detail).toBe('Tropical Cyclone · ReliefWeb');
    expect(out[0]!.url).toBe('https://reliefweb.int/disaster/tc-2026-phl');
    expect(out[1]!.url).toBe('https://reliefweb.int/disaster/fl-sdn'); // absolute url_alias kept
  });
});

describe('parseGdacs', () => {
  const data = {
    features: [
      { properties: { eventtype: 'TC', eventid: 1, name: 'Tropical Cyclone Foo', alertlevel: 'Red', country: 'Philippines', fromdate: '2026-06-18T06:00:00', iscurrent: true, url: 'https://gdacs.org/x' } },
      { properties: { eventtype: 'FL', eventid: 2, name: 'Flood in Kenya', alertlevel: 'Orange', country: 'Kenya', fromdate: '2026-06-17T00:00:00', iscurrent: 'true' } },
      { properties: { eventtype: 'WF', eventid: 3, name: 'Minor fire', alertlevel: 'Green' } }, // not significant → dropped
      { properties: { eventtype: 'EQ', eventid: 4, name: 'Quake', alertlevel: 'Red' } }, // USGS owns quakes → dropped
    ],
  };
  it('keeps significant non-earthquake hazards, drops green + earthquakes', () => {
    const out = parseGdacs(data, NOW);
    expect(out.map((e) => e.id)).toEqual(['gdacs:TC:1', 'gdacs:FL:2']);
    expect(out[0]).toMatchObject({ kind: 'disaster', topic: 'Disasters', source: 'gdacs', status: 'live' });
    expect(out[0]!.detail).toBe('Tropical cyclone · GDACS');
    expect(out[0]!.url).toBe('https://gdacs.org/x');
  });
});

describe('dedupeEvents', () => {
  const usgs = (id: string, title: string): EventItem => ({
    id, title, topic: 'Disasters', kind: 'disaster', status: 'live', startTime: '2026-06-17T17:00:00Z', source: 'usgs',
  });
  const wiki = (id: string, title: string): EventItem => ({
    id, title, topic: 'World', kind: 'world', status: 'final', startTime: '2026-06-17T00:00:00Z', source: 'wikipedia',
  });

  it('drops a Wikipedia earthquake report that a USGS event already covers (one event)', () => {
    const out = dedupeEvents([
      usgs('usgs:a', 'M6.2 — near Kuwait City, Kuwait'),
      wiki('wiki:1', 'A magnitude 6.2 earthquake strikes near Kuwait City, Kuwait'),
      wiki('wiki:2', 'Parliament passes the budget in Kuwait'), // not a quake → kept
    ]);
    expect(out.map((e) => e.id)).toEqual(['usgs:a', 'wiki:2']);
  });

  it('keeps two genuinely-different quakes in the same region (distinct ids)', () => {
    const out = dedupeEvents([
      usgs('usgs:a', 'M5.4 — central Mid-Atlantic Ridge'),
      usgs('usgs:b', 'M5.1 — central Mid-Atlantic Ridge'),
    ]);
    expect(out).toHaveLength(2); // structured quakes are never merged with each other
  });

  it('removes exact id collisions', () => {
    const out = dedupeEvents([usgs('usgs:a', 'M5 — X'), usgs('usgs:a', 'M5 — X dup')]);
    expect(out).toHaveLength(1);
  });

  it('collapses the same disaster across structured sources, keeping the more authoritative one', () => {
    const gdacs: EventItem = { id: 'gdacs:FL:9', title: 'Flood in Jakarta Indonesia', topic: 'Disasters', kind: 'disaster', status: 'live', startTime: '2026-06-17T00:00:00Z', source: 'gdacs' };
    const relief: EventItem = { id: 'reliefweb:5', title: 'Indonesia: Jakarta Floods - Jun 2026', topic: 'Disasters', kind: 'disaster', status: 'live', startTime: '2026-06-17T00:00:00Z', source: 'reliefweb' };
    const out = dedupeEvents([relief, gdacs]); // order shouldn't matter
    // GDACS (rank 1) beats ReliefWeb (rank 2) for the same Jakarta/Indonesia flood.
    expect(out.map((e) => e.id)).toEqual(['gdacs:FL:9']);
  });
});

describe('Finnhub financial calendar', () => {
  it('ymd formats the date param', () => {
    expect(ymd('2026-06-18T18:00:00.000Z')).toBe('2026-06-18');
  });

  it('surfaces the biggest upcoming earnings, dropping micro-caps with no estimate', () => {
    const data = {
      earningsCalendar: [
        { date: '2026-06-19', symbol: 'AAPL', hour: 'amc', revenueEstimate: 90e9, epsEstimate: 1.5 },
        { date: '2026-06-20', symbol: 'TINY', hour: 'bmo' }, // no estimate → dropped
        { date: '2026-06-19', symbol: 'NKE', hour: 'amc', revenueEstimate: 12e9 },
      ],
    };
    const out = parseFinnhubEarnings(data);
    expect(out.map((e) => e.title)).toEqual(['AAPL earnings', 'NKE earnings']); // biggest first, TINY dropped
    expect(out[0]).toMatchObject({ kind: 'economic', topic: 'Companies', source: 'finnhub', status: 'scheduled' });
    expect(out[0]!.detail).toBe('After close · Finnhub');
  });

  it('maps upcoming IPOs', () => {
    const out = parseFinnhubIpo({ ipoCalendar: [{ date: '2026-06-25', name: 'Acme Corp', symbol: 'ACME', exchange: 'NASDAQ' }] });
    expect(out[0]).toMatchObject({ title: 'Acme Corp IPO', topic: 'Markets', kind: 'economic', source: 'finnhub' });
    expect(out[0]!.detail).toBe('IPO · NASDAQ');
  });
});

describe('parsePandaScore (esports)', () => {
  it('maps top-tier matches: running→live, "A vs B" title, game/league detail; drops small tiers', () => {
    const out = parsePandaScore([
      { id: 1, status: 'running', begin_at: '2026-06-18T17:00:00Z', videogame: { name: 'CS2' }, league: { name: 'IEM Cologne' }, tournament: { tier: 'a' }, opponents: [{ opponent: { name: 'NAVI' } }, { opponent: { name: 'FaZe' } }] },
      { id: 2, status: 'not_started', scheduled_at: '2026-06-19T15:00:00Z', name: 'Grand Final', videogame: { name: 'Dota 2' }, league: { name: 'The International' }, tournament: { tier: 's' } },
      { id: 9, status: 'not_started', begin_at: '2026-06-18T11:00:00Z', name: 'Weekly cup', videogame: { name: 'StarCraft 2' }, tournament: { tier: 'd' } }, // small tier → dropped
      { id: 3, status: 'not_started' }, // no time → dropped
    ]);
    expect(out.map((e) => e.id)).toEqual(['pandascore:1', 'pandascore:2']);
    expect(out[0]).toMatchObject({ kind: 'esports', topic: 'Esports', status: 'live', source: 'pandascore' });
    expect(out[0]!.title).toBe('NAVI vs FaZe'); // opponents preferred over verbose match name
    expect(out[0]!.detail).toBe('CS2 · IEM Cologne');
    expect(out[1]!.title).toBe('Grand Final'); // no 2 opponents yet → match name
  });

  it('keeps matches with no tier (does not over-filter)', () => {
    const out = parsePandaScore([
      { id: 5, status: 'not_started', begin_at: '2026-06-19T15:00:00Z', videogame: { name: 'VALORANT' }, opponents: [{ opponent: { name: 'A' } }, { opponent: { name: 'B' } }] },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('jobsReportEvents', () => {
  it('produces upcoming first-Friday jobs-report markers', () => {
    const out = jobsReportEvents(Date.parse('2026-06-17T18:00:00Z'));
    expect(out.length).toBeGreaterThanOrEqual(1);
    for (const e of out) {
      expect(e.kind).toBe('economic');
      expect(new Date(e.startTime).getUTCDay()).toBe(5); // a Friday
    }
  });
});

describe('fomcEvents', () => {
  it('surfaces the next upcoming FOMC decision as a scheduled economic event', () => {
    // Just before the 2026-06-17 meeting → that one is next.
    const out = fomcEvents(Date.parse('2026-06-10T00:00:00Z'));
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('economic');
    expect(out[0]!.status).toBe('scheduled');
    expect(out[0]!.title).toMatch(/FOMC/);
    expect(out[0]!.startTime.slice(0, 10)).toBe('2026-06-17');
  });
  it('rolls to the following meeting once one has passed', () => {
    const out = fomcEvents(Date.parse('2026-06-20T00:00:00Z'));
    expect(out[0]!.startTime.slice(0, 10)).toBe('2026-07-29');
  });
  it('yields nothing once the embedded calendar is exhausted (graceful, never wrong)', () => {
    expect(fomcEvents(Date.parse('2027-06-01T00:00:00Z'))).toEqual([]);
  });
});

describe('statesOf + groupWeatherAlerts', () => {
  it('extracts state codes from an areaDesc', () => {
    expect(statesOf('Iberia, LA; St. Martin, LA; George, MS').sort()).toEqual(['LA', 'MS']);
  });

  it('collapses many per-county alerts into one event per alert type, spanning states', () => {
    const features = [
      { properties: { event: 'Tornado Watch', areaDesc: 'Iberia, LA; St. Martin, LA', ends: '2026-06-18T06:00:00Z' } },
      { properties: { event: 'Tornado Watch', areaDesc: 'George, MS; Stone, MS', ends: '2026-06-18T07:00:00Z' } },
      { properties: { event: 'Flash Flood Warning', areaDesc: 'Harris, TX', ends: '2026-06-17T22:00:00Z' } },
    ];
    const out = groupWeatherAlerts(features, NOW);
    const tornado = out.find((e) => e.title.startsWith('Tornado Watch'))!;
    expect(tornado.title).toContain('LA');
    expect(tornado.title).toContain('MS');
    expect(tornado.status).toBe('live');
    expect(tornado.endTime).toBe('2026-06-18T07:00:00.000Z'); // latest end across the group
    expect(out).toHaveLength(2); // two distinct event types
  });
});

describe('wikiDayPage', () => {
  it('formats the UTC day as the portal subpage name', () => {
    expect(wikiDayPage('2026-06-17T18:00:00.000Z')).toBe('2026_June_17');
    expect(wikiDayPage('2026-01-05T02:00:00.000Z')).toBe('2026_January_05');
  });
});

describe('parseWikipediaEvents', () => {
  const html = `
    <div class="current-events-content">
      <ul>
        <li>Armed conflicts and attacks
          <ul>
            <li><a href="/wiki/Gaza">Gaza war</a>: <a href="https://reuters.com/x">Hamas reports progress in ceasefire talks.</a> (Reuters) (CNN)</li>
            <li>Short</li>
          </ul>
        </li>
        <li>Disasters
          <ul>
            <li>A magnitude 6.1 earthquake strikes off the coast of northern Japan. (<a href="https://bbc.com/y">BBC</a>)</li>
          </ul>
        </li>
      </ul>
    </div>`;

  it('keeps leaf events, strips trailing citations, takes the first external link', () => {
    const out = parseWikipediaEvents(html, '2026-06-17T18:00:00.000Z');
    expect(out.length).toBe(2); // "Short" dropped (too short), category headers skipped
    expect(out[0]).toMatchObject({ kind: 'world', status: 'final', topic: 'World', source: 'wikipedia' });
    expect(out[0]!.title).toBe('Gaza war: Hamas reports progress in ceasefire talks.');
    expect(out[0]!.url).toBe('https://reuters.com/x'); // first external link, not the /wiki/ one
    expect(out[0]!.startTime).toBe('2026-06-17T00:00:00.000Z');
    expect(out[1]!.title).toContain('earthquake');
  });
});

describe('sortEvents', () => {
  it('orders live → soonest upcoming → most-recent finished', () => {
    const ev = (id: string, status: EventItem['status'], startTime: string): EventItem => ({
      id, title: id, topic: 'X', kind: 'sports', status, startTime, source: 'espn',
    });
    const out = sortEvents([
      ev('finalOld', 'final', '2026-06-17T10:00:00Z'),
      ev('soon', 'scheduled', '2026-06-17T20:00:00Z'),
      ev('later', 'scheduled', '2026-06-18T20:00:00Z'),
      ev('live', 'live', '2026-06-17T17:00:00Z'),
      ev('finalNew', 'final', '2026-06-17T16:00:00Z'),
    ]);
    expect(out.map((e) => e.id)).toEqual(['live', 'soon', 'later', 'finalNew', 'finalOld']);
  });
});

describe('balanceStrip', () => {
  const sport = (id: string, marketId?: string): EventItem => ({
    id, title: id, topic: 'Sports', kind: 'sports', status: 'scheduled', startTime: '2026-06-17T20:00:00Z', source: 'espn', marketId,
  });
  const macro: EventItem = { id: 'm', title: 'jobs', topic: 'Economics', kind: 'economic', status: 'scheduled', startTime: '2026-06-19T12:00:00Z', source: 'econ' };

  const quake = (id: string): EventItem => ({
    id, title: id, topic: 'Disasters', kind: 'disaster', status: 'final', startTime: '2026-06-17T16:00:00Z', source: 'usgs',
  });

  it('hard-caps each category so no single kind dominates the strip', () => {
    // 30 sports alone → capped to the sports ceiling (a curated 3, toned down — not 24).
    expect(balanceStrip(Array.from({ length: 30 }, (_, i) => sport(`g${i}`)), 24).filter((e) => e.kind === 'sports')).toHaveLength(3);
    // 20 earthquakes alone → capped to the disaster ceiling (5).
    expect(balanceStrip(Array.from({ length: 20 }, (_, i) => quake(`q${i}`)), 24).filter((e) => e.kind === 'disaster')).toHaveLength(5);
  });

  it('keeps the strip diverse and global-weighted when categories are plentiful', () => {
    const weather: EventItem = { id: 'wx', title: 'Tornado', topic: 'Climate', kind: 'weather', status: 'live', startTime: '2026-06-17T18:00:00Z', source: 'nws' };
    const events = [
      macro, weather,
      ...Array.from({ length: 20 }, (_, i) => quake(`q${i}`)), // many global quakes
      ...Array.from({ length: 30 }, (_, i) => sport(`g${i}`)), // a full sports slate
    ];
    const out = balanceStrip(events, 24);
    // Scarce categories survive the flood...
    expect(out.some((e) => e.id === 'm')).toBe(true);
    expect(out.some((e) => e.id === 'wx')).toBe(true);
    // ...sports is held to its (lower) ceiling so global events lead.
    expect(out.filter((e) => e.kind === 'sports').length).toBe(3);
    expect(out.filter((e) => e.kind === 'disaster').length).toBe(5);
  });

  it('respects the overall max', () => {
    // A diverse pool larger than max, so the overall cap binds before any kind ceiling.
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => quake(`q${i}`)),
      ...Array.from({ length: 5 }, (_, i) => sport(`g${i}`)),
    ];
    expect(balanceStrip(pool, 4)).toHaveLength(4);
  });
});

describe('pinEventsToMarkets', () => {
  it('maps a sports event to the market it is about and attaches both to the story', () => {
    const market = makeMarket({ id: 'lakers', title: 'Will the Lakers win the championship?', category: 'NBA', status: 'active' });
    const espn: EventItem = {
      id: 'espn:9', title: 'Lakers at Celtics', topic: 'Sports', kind: 'sports', status: 'live', startTime: '2026-06-17T23:00:00Z', source: 'espn',
    };
    const mapped = pinEventsToMarkets([espn], [market]);
    expect(mapped).toBe(1);
    expect(espn.marketId).toBe('lakers');
    expect(market.events?.map((e) => e.id)).toEqual(['espn:9']);
  });

  it('clears a stale events array from a prior run', () => {
    const market = makeMarket({ id: 'm', title: 'Totally unrelated question', category: 'Politics', status: 'active' });
    market.events = [{ id: 'old:1', title: 'x', topic: 'Sports', kind: 'sports', status: 'final', startTime: '2026-06-10T00:00:00Z', source: 'espn' }];
    pinEventsToMarkets([], [market]);
    expect(market.events).toBeUndefined();
  });

  it('ties a global earthquake to the story it is about (the Kuwait case)', () => {
    const market = makeMarket({
      id: 'kw',
      title: 'Will a major earthquake hit Kuwait this year?',
      category: 'World',
      status: 'active',
    });
    const quake: EventItem = {
      id: 'usgs:abc', title: 'M6.2 — near Kuwait City, Kuwait', topic: 'Disasters', kind: 'disaster', status: 'live', startTime: '2026-06-17T17:30:00Z', source: 'usgs',
    };
    const mapped = pinEventsToMarkets([quake], [market]);
    expect(mapped).toBe(1);
    expect(quake.marketId).toBe('kw');
    expect(market.events?.map((e) => e.id)).toEqual(['usgs:abc']);
  });

  it('respects an event that already carries a marketId (defensive)', () => {
    const market = makeMarket({ id: 'x', title: 'Totally unrelated question', category: 'Politics', status: 'active' });
    const pre: EventItem = {
      id: 'usgs:z', title: 'M5 somewhere', topic: 'Disasters', kind: 'disaster', status: 'final', startTime: '2026-06-17T00:00:00Z', source: 'usgs', marketId: 'preset',
    };
    const mapped = pinEventsToMarkets([pre], [market]);
    expect(mapped).toBe(0); // already linked → not re-pinned
  });
});
