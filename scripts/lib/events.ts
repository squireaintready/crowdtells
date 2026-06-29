/**
 * "Events" layer — a time-aware companion to the "Developing" news strip. Where a
 * BreakingItem is corroborated coverage of something that happened, an EventItem is
 * a thing with a CLOCK on it: a game tipping off, a Fed decision, a market about to
 * resolve, severe weather underway. Surfaced in the widget's Events tab and, when an
 * event maps to a tracked story, on that story's article ("what's happening, when").
 *
 * FREE sources only, each best-effort (any failure yields [] and never breaks the
 * pipeline):
 *   1. Market-derived — our OWN tracked markets carry real resolution dates
 *      (`endDate`) and settlement, so a "resolves in 3d" / "decided" event needs no
 *      network call and is always accurate. This is how Fed/CPI/election/crypto
 *      events surface — via the actual prediction market's own clock.
 *   2. ESPN's free, no-key scoreboard API — live/scheduled/final games across the
 *      major leagues, the one place a market's `endDate` is coarser than the real
 *      kickoff/now-playing state.
 *   3. A computed US macro event (monthly jobs report, first Friday) — a stable
 *      calendar rule, labelled "est."; everything else macro rides source #1.
 *   4. NWS (api.weather.gov) active EXTREME alerts — live, unscheduled severe
 *      weather, grouped by event type so per-county noise collapses to one entry.
 *
 * Honest by design: we only ever claim a status we can stand behind — ESPN's own
 * pre/in/post state, a market's real end date, an alert that is currently active.
 */
import { getJson, getText } from './http';
import type { Config } from './config';
import type { EventItem, Market } from '../../src/lib/types';
import { salientTokens } from './breaking';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const PIN_MIN_OVERLAP = 2; // shared salient tokens to map an event to a market
const FETCH_TIMEOUT_MS = 12_000;
const MAX_PER_MARKET = 3; // events attached to a single story's article

/** A finished event older than this is no longer "what's happening" — dropped so
 * the strip stays current rather than listing yesterday's finals. */
const FINAL_RETAIN_HOURS = 12;

// ── 1. USGS earthquakes (global, real-time) ─────────────────────────────────

// Significant + M4.5 quakes worldwide in the past day — the canonical free, no-key
// global hazard feed. This is the "earthquake anywhere on earth" source that makes
// the strip genuinely global rather than US- or market-centric.
const USGS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const QUAKE_LIVE_MIN = 90; // a quake this recent reads as "live" (still in the news cycle)

interface UsgsFeature {
  id?: string;
  properties?: { mag?: number; place?: string; time?: number; url?: string; type?: string };
}

/** Tidy a USGS place ("12 km S of Foo, Country") into a readable location. Pure. */
export function cleanPlace(place: string): string {
  return place.replace(/^\d+\s*km\s+[NSEW]+\s+of\s+/i, 'near ').replace(/\s+/g, ' ').trim();
}

/** Parse the USGS GeoJSON feed into global earthquake EventItems. Pure. */
export function parseEarthquakes(data: { features?: UsgsFeature[] }, nowMs: number): EventItem[] {
  const out: EventItem[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    if (!f.id || !p || typeof p.mag !== 'number' || !p.place || typeof p.time !== 'number') continue;
    if (p.type && p.type !== 'earthquake') continue;
    const recent = nowMs - p.time <= QUAKE_LIVE_MIN * 60_000;
    out.push({
      id: `usgs:${f.id}`,
      title: `M${p.mag.toFixed(1)} — ${cleanPlace(p.place)}`,
      topic: 'Disasters',
      kind: 'disaster',
      status: recent ? 'live' : 'final',
      startTime: new Date(p.time).toISOString(),
      detail: 'Earthquake · USGS',
      url: p.url,
      source: 'usgs',
    });
  }
  return out;
}

async function fetchEarthquakes(config: Config, nowMs: number): Promise<EventItem[]> {
  try {
    const data = await getJson<{ features?: UsgsFeature[] }>(USGS, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      retries: 1,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    return parseEarthquakes(data, nowMs);
  } catch {
    return []; // best-effort
  }
}

// ── 1b. GDACS global disaster alerts (no key) ────────────────────────────────

// The Global Disaster Alert and Coordination System (UN/EC) — worldwide tropical
// cyclones, floods, wildfires, volcanoes, droughts. Free, no key. We SKIP its
// earthquakes (USGS owns those — avoids USGS/GDACS quake dupes) and keep only
// Orange/Red alerts (significant), so the strip carries the consequential hazards
// rather than every minor green advisory.
const GDACS = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP';
const GDACS_TYPE: Record<string, string> = {
  TC: 'Tropical cyclone',
  FL: 'Flood',
  WF: 'Wildfire',
  VO: 'Volcano',
  DR: 'Drought',
};

interface GdacsFeature {
  properties?: {
    eventtype?: string;
    eventid?: number | string;
    name?: string;
    alertlevel?: string;
    country?: string;
    fromdate?: string;
    iscurrent?: boolean | string;
    url?: string;
  };
}

/** Parse the GDACS event list into significant non-earthquake disaster events. Pure. */
export function parseGdacs(data: { features?: GdacsFeature[] }, nowMs: number): EventItem[] {
  const out: EventItem[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    if (!p || p.eventid == null) continue;
    if (p.eventtype === 'EQ') continue; // USGS owns earthquakes
    const label = GDACS_TYPE[p.eventtype ?? ''];
    if (!label) continue; // only the known hazard families
    if (p.alertlevel !== 'Orange' && p.alertlevel !== 'Red') continue; // significant only
    const startMs = p.fromdate ? Date.parse(p.fromdate) : NaN;
    const title = (p.name && String(p.name).trim()) || `${label}${p.country ? ` — ${p.country}` : ''}`;
    const live = p.iscurrent === true || p.iscurrent === 'true';
    out.push({
      id: `gdacs:${p.eventtype}:${p.eventid}`,
      title,
      topic: 'Disasters',
      kind: 'disaster',
      status: live ? 'live' : 'final',
      startTime: Number.isFinite(startMs) ? new Date(startMs).toISOString() : new Date(nowMs).toISOString(),
      detail: `${label} · GDACS`,
      url: typeof p.url === 'string' && p.url.startsWith('http') ? p.url : undefined,
      source: 'gdacs',
    });
  }
  return out;
}

async function fetchGdacs(config: Config, nowMs: number): Promise<EventItem[]> {
  try {
    const data = await getJson<{ features?: GdacsFeature[] }>(GDACS, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      retries: 1,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    return parseGdacs(data, nowMs);
  } catch {
    return []; // best-effort
  }
}

// ── 1c. ReliefWeb disasters (UN OCHA, global) — DORMANT until appname set ─────

// Broader global disasters than seismic-only USGS: floods, storms, epidemics,
// droughts, conflicts. ReliefWeb gates its v2 API on a REGISTERED appname
// (request at https://apidoc.reliefweb.int/parameters#appname); until config sets
// one this source is skipped, so the strip degrades to USGS + Wikipedia. The query
// shape follows the documented v2 API; best-effort so a hiccup never breaks a run.
const RELIEFWEB = 'https://api.reliefweb.int/v2/disasters';

interface ReliefWebItem {
  id?: string | number;
  fields?: {
    name?: string;
    status?: string;
    url_alias?: string;
    primary_type?: { name?: string };
    date?: { created?: string };
  };
}

/** Parse a ReliefWeb v2 disasters payload into global disaster EventItems. Pure. */
export function parseReliefWeb(data: { data?: ReliefWebItem[] }, nowIso: string): EventItem[] {
  const out: EventItem[] = [];
  for (const d of data.data ?? []) {
    const f = d.fields;
    if (d.id == null || !f?.name) continue;
    const type = f.primary_type?.name;
    const url = f.url_alias
      ? f.url_alias.startsWith('http')
        ? f.url_alias
        : `https://reliefweb.int/${f.url_alias.replace(/^\/+/, '')}`
      : undefined;
    out.push({
      id: `reliefweb:${d.id}`,
      title: f.name,
      topic: 'Disasters',
      kind: 'disaster',
      status: 'live', // ReliefWeb "current"/"ongoing" disasters are active situations
      startTime: f.date?.created ?? nowIso,
      detail: type ? `${type} · ReliefWeb` : 'ReliefWeb',
      url,
      source: 'reliefweb',
    });
  }
  return out;
}

async function fetchReliefWeb(config: Config, nowIso: string): Promise<EventItem[]> {
  if (!config.reliefwebAppname) return []; // dormant until an approved appname is set
  const url =
    `${RELIEFWEB}?appname=${encodeURIComponent(config.reliefwebAppname)}` +
    `&filter%5Bfield%5D=status&filter%5Bvalue%5D=ongoing&sort%5B%5D=date.created%3Adesc&limit=8` +
    `&fields%5Binclude%5D%5B%5D=name&fields%5Binclude%5D%5B%5D=status` +
    `&fields%5Binclude%5D%5B%5D=primary_type&fields%5Binclude%5D%5B%5D=url_alias&fields%5Binclude%5D%5B%5D=date`;
  try {
    const data = await getJson<{ data?: ReliefWebItem[] }>(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      retries: 1,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    return parseReliefWeb(data, nowIso);
  } catch {
    return []; // best-effort
  }
}

// ── 2. ESPN scoreboards ─────────────────────────────────────────────────────

// One scoreboard call per league covers all of that league's games in the date
// window (live + scheduled + just-finished). Out-of-season leagues return zero
// events, so the list can stay broad cheaply.
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
// Broad, free, no-key coverage across the sports families our markets actually track
// (Sports, Soccer, FIFA World Cup, Tennis…). Out-of-season leagues just return zero
// events, so the list stays wide cheaply. All run in one parallel batch.
const ESPN_LEAGUES: { path: string; topic: string }[] = [
  // US major leagues
  { path: 'basketball/nba', topic: 'Sports' },
  { path: 'basketball/wnba', topic: 'Sports' },
  { path: 'football/nfl', topic: 'Sports' },
  { path: 'football/college-football', topic: 'Sports' },
  { path: 'baseball/mlb', topic: 'Sports' },
  { path: 'baseball/college-baseball', topic: 'Sports' },
  { path: 'hockey/nhl', topic: 'Sports' },
  // Soccer — domestic top flights + continental + international
  { path: 'soccer/usa.1', topic: 'Soccer' },
  { path: 'soccer/eng.1', topic: 'Soccer' },
  { path: 'soccer/esp.1', topic: 'Soccer' },
  { path: 'soccer/ger.1', topic: 'Soccer' },
  { path: 'soccer/ita.1', topic: 'Soccer' },
  { path: 'soccer/fra.1', topic: 'Soccer' },
  { path: 'soccer/uefa.champions', topic: 'Soccer' },
  { path: 'soccer/uefa.europa', topic: 'Soccer' },
  { path: 'soccer/fifa.world', topic: 'FIFA World Cup' },
  // Individual sports — the "event" is the tournament/bout
  { path: 'tennis/atp', topic: 'Tennis' },
  { path: 'tennis/wta', topic: 'Tennis' },
  { path: 'golf/pga', topic: 'Sports' },
  { path: 'racing/f1', topic: 'Sports' },
  { path: 'mma/ufc', topic: 'Sports' },
];
const ESPN_WINDOW_DAYS = 3; // today .. +3d of fixtures

interface EspnCompetitor {
  team?: { displayName?: string; abbreviation?: string };
  score?: string;
  homeAway?: string;
}
interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  status?: { type?: { state?: string; completed?: boolean; shortDetail?: string } };
  competitions?: { competitors?: EspnCompetitor[] }[];
  links?: { href?: string }[];
}

/** ESPN's lifecycle state → our coarse status. Pure. */
export function espnStatus(state: string | undefined): EventItem['status'] {
  if (state === 'in') return 'live';
  if (state === 'post') return 'final';
  return 'scheduled';
}

/** Compact YYYYMMDD (UTC) for an ISO instant. Pure. */
export function yyyymmdd(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

/** Parse one ESPN scoreboard payload into EventItems, dropping stale finals. Pure. */
export function parseEspnEvents(
  data: { events?: EspnEvent[] },
  topic: string,
  nowMs: number,
): EventItem[] {
  const out: EventItem[] = [];
  for (const e of data.events ?? []) {
    const startMs = e.date ? Date.parse(e.date) : NaN;
    if (!e.id || !Number.isFinite(startMs)) continue;
    const state = e.status?.type?.state;
    const status = espnStatus(state);
    // A finished game older than the retain window is no longer "happening".
    if (status === 'final' && nowMs - startMs > FINAL_RETAIN_HOURS * HOUR_MS) continue;
    const comp = e.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const score = scoreLine(competitors);
    const head = e.status?.type?.shortDetail?.trim();
    const detail =
      status === 'scheduled'
        ? head || undefined
        : [head, score].filter(Boolean).join(' · ') || undefined;
    out.push({
      id: `espn:${e.id}`,
      title: e.name || e.shortName || 'Match',
      topic,
      kind: 'sports',
      status,
      startTime: new Date(startMs).toISOString(),
      detail,
      url: e.links?.find((l) => l.href)?.href,
      source: 'espn',
    });
  }
  return out;
}

/** "AWAY 2–3 HOME" from competitors, or '' when scores aren't posted. Pure. */
function scoreLine(competitors: EspnCompetitor[]): string {
  if (competitors.length !== 2) return '';
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1];
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0];
  const aS = away?.score;
  const hS = home?.score;
  if (aS == null || hS == null || aS === '' || hS === '') return '';
  const aT = away?.team?.abbreviation || away?.team?.displayName || '';
  const hT = home?.team?.abbreviation || home?.team?.displayName || '';
  return `${aT} ${aS}–${hS} ${hT}`.trim();
}

async function fetchEspnLeague(
  league: { path: string; topic: string },
  range: string,
  config: Config,
  nowMs: number,
): Promise<EventItem[]> {
  try {
    const data = await getJson<{ events?: EspnEvent[] }>(
      `${ESPN}/${league.path}/scoreboard?dates=${range}`,
      {
        headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
        retries: 1,
        timeoutMs: FETCH_TIMEOUT_MS,
      },
    );
    return parseEspnEvents(data, league.topic, nowMs);
  } catch {
    return []; // best-effort — a stalled league is skipped, never fatal
  }
}

// ── 3. Computed macro event (monthly jobs report) ───────────────────────────

/**
 * The US jobs report (Employment Situation) lands the first Friday of each month
 * at 8:30am ET — a stable enough rule to surface as a SCHEDULED economics event for
 * the current and next month. Labelled "est." because BLS occasionally shifts it;
 * Fed/CPI ride the market-derived layer (the real prediction-market end dates).
 * Pure.
 */
export function jobsReportEvents(nowMs: number): EventItem[] {
  const out: EventItem[] = [];
  const now = new Date(nowMs);
  for (let i = 0; i < 2; i++) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + i;
    const first = new Date(Date.UTC(y, m, 1));
    // 0=Sun..6=Sat; days to the first Friday (5).
    const firstFriday = 1 + ((5 - first.getUTCDay() + 7) % 7);
    // 8:30am ET ≈ 12:30 UTC (EDT) — fine for an "est." day-level marker.
    const when = new Date(Date.UTC(y, m, firstFriday, 12, 30));
    const whenMs = when.getTime();
    if (whenMs < nowMs - DAY_MS) continue; // already old
    out.push({
      id: `econ:jobs-${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`,
      title: 'US jobs report (Employment Situation)',
      topic: 'Economics',
      kind: 'economic',
      status: 'scheduled',
      startTime: when.toISOString(),
      detail: 'BLS · est.',
      source: 'econ',
    });
  }
  return out;
}

/**
 * FOMC interest-rate decisions — the single highest-impact scheduled finance event,
 * and the one a "what's happening and when" wire should never miss. The Fed publishes
 * its meeting calendar a year ahead and the dates are firm, so we embed the 2026
 * decision days (day two of each two-day meeting; the statement lands ~2pm ET). This is
 * free + no-key + offline; it degrades gracefully (an un-refreshed table just yields
 * nothing for a future year — never wrong data — since past dates are filtered out).
 * ⚠️ Refresh annually from federalreserve.gov/monetarypolicy/fomccalendars.htm.
 */
const FOMC_DECISION_DATES = [
  '2026-01-28',
  '2026-03-18',
  '2026-04-29',
  '2026-06-17',
  '2026-07-29',
  '2026-09-16',
  '2026-10-28',
  '2026-12-09',
];

export function fomcEvents(nowMs: number): EventItem[] {
  const out: EventItem[] = [];
  // Sort defensively (ISO YYYY-MM-DD sorts chronologically) so the "next meeting" + the
  // `break` stay correct even if next year's hand-edited table is pasted out of order.
  for (const day of [...FOMC_DECISION_DATES].sort()) {
    // ~2pm ET ≈ 18:30 UTC — a day-level "est." marker (DST makes it 18:00–19:00).
    const whenMs = Date.parse(`${day}T18:30:00.000Z`);
    if (!Number.isFinite(whenMs)) continue;
    if (whenMs < nowMs - DAY_MS) continue; // already past — drop
    // Only surface the NEXT meeting (the strip wants "what's imminent", not a year of dates).
    out.push({
      id: `econ:fomc-${day}`,
      title: 'Fed interest-rate decision (FOMC)',
      topic: 'Economics',
      kind: 'economic',
      status: 'scheduled',
      startTime: new Date(whenMs).toISOString(),
      detail: 'Fed · 2pm ET',
      source: 'econ',
    });
    break; // just the next upcoming meeting
  }
  return out;
}

// ── 4. NWS severe weather ───────────────────────────────────────────────────

const NWS_ALERTS = 'https://api.weather.gov/alerts/active?severity=Extreme&status=actual&message_type=alert';
const WEATHER_MAX = 4; // distinct severe-weather event types surfaced

interface NwsFeature {
  properties?: { event?: string; ends?: string; expires?: string; onset?: string; areaDesc?: string };
}

/** US state abbreviations referenced in an NWS areaDesc ("Iberia, LA; ..."). Pure. */
export function statesOf(areaDesc: string | undefined): string[] {
  const set = new Set<string>();
  for (const m of (areaDesc ?? '').matchAll(/\b([A-Z]{2})\b/g)) set.add(m[1]!);
  return [...set];
}

/**
 * Collapse the many per-county Extreme alerts into one event PER alert type (e.g.
 * a single "Tornado Watch" spanning the states it touches), so the strip shows a
 * handful of meaningful severe-weather events, not hundreds of county rows. Pure.
 */
export function groupWeatherAlerts(features: NwsFeature[], nowMs: number): EventItem[] {
  const byEvent = new Map<string, { states: Set<string>; ends: number }>();
  for (const f of features) {
    const p = f.properties;
    if (!p?.event) continue;
    const g = byEvent.get(p.event) ?? { states: new Set<string>(), ends: 0 };
    for (const s of statesOf(p.areaDesc)) g.states.add(s);
    const endMs = p.ends || p.expires ? Date.parse((p.ends || p.expires)!) : NaN;
    if (Number.isFinite(endMs)) g.ends = Math.max(g.ends, endMs);
    byEvent.set(p.event, g);
  }
  // Widest-reaching (most states) first — by the actual state COUNT, not title length
  // (a long event name on a single state must not outrank a short one spanning many).
  return [...byEvent.entries()]
    .sort((a, b) => b[1].states.size - a[1].states.size)
    .slice(0, WEATHER_MAX)
    .map(([event, g]) => {
      const states = [...g.states].sort();
      return {
        id: `nws:${event.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        title: states.length ? `${event} — ${states.slice(0, 6).join(', ')}` : event,
        topic: 'Climate and Weather',
        kind: 'weather',
        status: 'live',
        startTime: new Date(nowMs).toISOString(),
        endTime: g.ends ? new Date(g.ends).toISOString() : undefined,
        detail: 'Severe · NWS',
        source: 'nws',
      };
    });
}

async function fetchWeatherEvents(config: Config, nowMs: number): Promise<EventItem[]> {
  try {
    const data = await getJson<{ features?: NwsFeature[] }>(NWS_ALERTS, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/geo+json' },
      retries: 1,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    return groupWeatherAlerts(data.features ?? [], nowMs);
  } catch {
    return [];
  }
}

// ── 5. Wikipedia "Current events" (unscheduled world events) ────────────────

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_MAX = 14; // distinct world events surfaced from the day's portal (the
// global-events backbone — armed conflicts, disasters, politics, science, business)
const WIKI_MIN_LEN = 25;
const WIKI_MAX_LEN = 200;

/** UTC "YYYY_Month_DD" for the Portal:Current_events/<day> subpage. Pure. */
export function wikiDayPage(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${d.getUTCFullYear()}_${month}_${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Strip a leaf <li>'s trailing "(Source) (Source)" citations + tags into a clean
 * one-line headline. Pure. */
function cleanWikiTitle(liInner: string): string {
  return liInner
    .replace(/<[^>]+>/g, '')
    .replace(/&[#\w]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*\([^()]*\))+\s*$/, '') // drop trailing publisher citations
    .trim();
}

/**
 * Parse the day's "Current events" portal HTML into world EventItems. We keep only
 * LEAF list items (an <li> with no nested <ul> — the actual events, not the category
 * headers), clean the trailing source citations, and take the first external link as
 * the follow URL. status 'final' (they've happened) anchored to the day. Pure.
 */
export function parseWikipediaEvents(html: string, nowIso: string): EventItem[] {
  const dayStart = `${nowIso.slice(0, 10)}T00:00:00.000Z`;
  const out: EventItem[] = [];
  const seen = new Set<string>();
  // Leaf <li> only: its content must not open a nested <li>/<ul> (those are the
  // category branches, not the actual events). The negative lookahead keeps the
  // match from spanning into a nested list.
  for (const m of html.matchAll(/<li>((?:(?!<li|<ul|<\/li>)[\s\S])*)<\/li>/g)) {
    const inner = m[1]!;
    const title = cleanWikiTitle(inner);
    if (title.length < WIKI_MIN_LEN || title.length > WIKI_MAX_LEN) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const link = inner.match(/href="(https?:\/\/[^"]+)"/);
    out.push({
      id: `wikipedia:${nowIso.slice(0, 10)}:${key.replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
      title,
      topic: 'World',
      kind: 'world',
      status: 'final',
      startTime: dayStart,
      detail: 'Wikipedia',
      url: link?.[1],
      source: 'wikipedia',
    });
    if (out.length >= WIKI_MAX) break;
  }
  return out;
}

async function fetchWikipediaEvents(config: Config, nowIso: string): Promise<EventItem[]> {
  const load = async (page: string): Promise<EventItem[]> => {
    const url =
      `${WIKI_API}?action=parse&page=${encodeURIComponent(`Portal:Current_events/${page}`)}` +
      `&prop=text&format=json&formatversion=2&disabletoc=1`;
    const raw = await getText(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      retries: 1,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    const html = (JSON.parse(raw) as { parse?: { text?: string } }).parse?.text ?? '';
    return parseWikipediaEvents(html, nowIso);
  };
  try {
    let items = await load(wikiDayPage(nowIso));
    // Today's portal can be empty early in the UTC day — fall back to yesterday so
    // the world strip isn't blank in those hours.
    if (items.length < 2) {
      const y = await load(wikiDayPage(new Date(Date.parse(nowIso) - DAY_MS).toISOString()));
      if (y.length > items.length) items = y;
    }
    return items;
  } catch {
    return [];
  }
}

// ── 6. Finnhub financial calendar (earnings + IPOs) — DORMANT until key set ──

// The financial-events backbone for the Financials / Companies / Markets / Economics
// families. Finnhub's free tier covers the earnings + IPO calendars (the economic
// calendar is premium, so macro still rides the computed jobs marker + Wikipedia).
// Gated on a free API key; skipped when unset.
const FINNHUB = 'https://finnhub.io/api/v1';
const FIN_WINDOW_DAYS = 10; // upcoming financial calendar horizon
const FIN_EARNINGS_MAX = 6; // biggest upcoming reporters (avoid micro-cap noise)
const FIN_IPO_MAX = 3;

/** YYYY-MM-DD (UTC) — the date format Finnhub's calendar params want. Pure. */
export function ymd(iso: string): string {
  return iso.slice(0, 10);
}

interface FinnhubEarning {
  date?: string;
  symbol?: string;
  hour?: string;
  revenueEstimate?: number;
  epsEstimate?: number;
}
interface FinnhubIpo {
  date?: string;
  name?: string;
  symbol?: string;
  exchange?: string;
}

/** Notable upcoming earnings → events. Ranked by revenue estimate so the biggest
 * reporters surface, not every micro-cap on the tape. Pure. */
export function parseFinnhubEarnings(data: { earningsCalendar?: FinnhubEarning[] }): EventItem[] {
  return (data.earningsCalendar ?? [])
    .filter((e) => e.symbol && e.date && (e.revenueEstimate || e.epsEstimate))
    .sort((a, b) => (b.revenueEstimate ?? 0) - (a.revenueEstimate ?? 0))
    .slice(0, FIN_EARNINGS_MAX)
    .map((e) => ({
      id: `finnhub:earn:${e.symbol}:${e.date}`,
      title: `${e.symbol} earnings`,
      topic: 'Companies',
      kind: 'economic' as const,
      status: 'scheduled' as const,
      startTime: `${e.date}T12:00:00.000Z`,
      detail: e.hour === 'bmo' ? 'Before open · Finnhub' : e.hour === 'amc' ? 'After close · Finnhub' : 'Earnings · Finnhub',
      source: 'finnhub' as const,
    }));
}

/** Upcoming IPOs → events. Pure. */
export function parseFinnhubIpo(data: { ipoCalendar?: FinnhubIpo[] }): EventItem[] {
  return (data.ipoCalendar ?? [])
    .filter((i) => i.name && i.date)
    .slice(0, FIN_IPO_MAX)
    .map((i) => ({
      id: `finnhub:ipo:${i.symbol ?? i.name}:${i.date}`,
      title: `${i.name} IPO`,
      topic: 'Markets',
      kind: 'economic' as const,
      status: 'scheduled' as const,
      startTime: `${i.date}T12:00:00.000Z`,
      detail: i.exchange ? `IPO · ${i.exchange}` : 'IPO · Finnhub',
      source: 'finnhub' as const,
    }));
}

async function fetchFinnhub(config: Config, nowIso: string): Promise<EventItem[]> {
  if (!config.finnhubApiKey) return []; // dormant until a free key is set
  const from = ymd(nowIso);
  const to = ymd(new Date(Date.parse(nowIso) + FIN_WINDOW_DAYS * DAY_MS).toISOString());
  const key = encodeURIComponent(config.finnhubApiKey);
  const opts = {
    headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
    retries: 1,
    timeoutMs: FETCH_TIMEOUT_MS,
  };
  const [earn, ipo] = await Promise.all([
    getJson<{ earningsCalendar?: FinnhubEarning[] }>(`${FINNHUB}/calendar/earnings?from=${from}&to=${to}&token=${key}`, opts)
      .then(parseFinnhubEarnings)
      .catch(() => []),
    getJson<{ ipoCalendar?: FinnhubIpo[] }>(`${FINNHUB}/calendar/ipo?from=${from}&to=${to}&token=${key}`, opts)
      .then(parseFinnhubIpo)
      .catch(() => []),
  ]);
  return [...earn, ...ipo];
}

// ── 7. PandaScore esports (matches) — DORMANT until token set ────────────────

// ESPN has no esports feed, yet Esports / Games / IEM are a top category family for
// us. PandaScore covers CS, Dota, LoL, Valorant, etc. Gated on a free token; skipped
// when unset.
const PANDASCORE = 'https://api.pandascore.co';
const PANDA_MAX = 12;

interface PandaMatch {
  id?: number;
  name?: string;
  status?: string; // not_started | running | finished
  begin_at?: string | null;
  scheduled_at?: string | null;
  videogame?: { name?: string };
  league?: { name?: string };
  tournament?: { tier?: string };
  opponents?: { opponent?: { name?: string } }[];
}

// PandaScore lists every tier down to local weeklies; keep only the top tiers (the
// IEM/Major/Worlds-grade events our audience follows), skipping c/d. Matches with no
// tier are kept (don't over-filter).
const PANDA_TIERS = new Set(['s', 'a', 'b']);

/** Map PandaScore matches to esports events, top-tier only, freshest title form. Pure. */
export function parsePandaScore(matches: PandaMatch[]): EventItem[] {
  const out: EventItem[] = [];
  for (const m of matches) {
    const when = m.begin_at ?? m.scheduled_at;
    if (m.id == null || !when) continue;
    // Guard the unvalidated upstream date: an unparseable value would make
    // new Date(when).toISOString() throw RangeError, rejecting the events
    // Promise.all and losing every event that run (ESPN's parser guards likewise).
    if (!Number.isFinite(Date.parse(when))) continue;
    const tier = m.tournament?.tier;
    if (tier && !PANDA_TIERS.has(tier)) continue; // drop small/weekly tournaments
    const names = (m.opponents ?? []).map((o) => o.opponent?.name).filter(Boolean);
    // Prefer a clean "A vs B"; fall back to the (often verbose) match name, then league.
    const title = (names.length === 2 ? `${names[0]} vs ${names[1]}` : m.name || m.league?.name) || 'Match';
    const status = m.status === 'running' ? 'live' : m.status === 'finished' ? 'final' : 'scheduled';
    const game = m.videogame?.name;
    out.push({
      id: `pandascore:${m.id}`,
      title,
      topic: 'Esports',
      kind: 'esports',
      status,
      startTime: new Date(when).toISOString(),
      detail: [game, m.league?.name].filter(Boolean).join(' · ') || 'Esports',
      source: 'pandascore',
    });
  }
  return out;
}

async function fetchPandaScore(config: Config): Promise<EventItem[]> {
  if (!config.pandascoreToken) return []; // dormant until a free token is set
  const auth = { Authorization: `Bearer ${config.pandascoreToken}`, Accept: 'application/json', 'User-Agent': config.userAgent };
  const opts = { headers: auth, retries: 1, timeoutMs: FETCH_TIMEOUT_MS };
  // Fetch wide (top tiers are a minority of all matches) then tier-filter in parse.
  const [running, upcoming] = await Promise.all([
    getJson<PandaMatch[]>(`${PANDASCORE}/matches/running?page%5Bsize%5D=25`, opts).catch(() => []),
    getJson<PandaMatch[]>(`${PANDASCORE}/matches/upcoming?sort=begin_at&page%5Bsize%5D=50`, opts).catch(() => []),
  ]);
  return parsePandaScore([...running, ...upcoming]).slice(0, PANDA_MAX);
}

// ── Ordering + assembly ─────────────────────────────────────────────────────

/** Status rank for ordering: live first, then scheduled, then final. */
const STATUS_RANK: Record<EventItem['status'], number> = { live: 0, scheduled: 1, final: 2 };

// Words that mark a 'world' (Wikipedia) item as a disaster/hazard REPORT — likely the
// same real-world event a structured source (USGS/GDACS/ReliefWeb) already carries.
const DISASTER_RE =
  /\b(earthquake|quake|magnitude|tremor|seismic|tsunami|volcan|erupt|aftershock|cyclone|hurricane|typhoon|flood|wildfire|landslide|drought|eruption)\b/i;

// Which source to KEEP when two sources describe the same hazard (lower = more
// authoritative/precise). USGS quakes win; structured alert systems beat the
// Wikipedia news write-up.
const HAZARD_SRC_RANK: Partial<Record<EventItem['source'], number>> = {
  usgs: 0,
  gdacs: 1,
  reliefweb: 2,
  wikipedia: 3,
};

/** Is this event a hazard report eligible for cross-source de-duplication? */
function isHazard(e: EventItem): boolean {
  return e.kind === 'disaster' || (e.kind === 'world' && DISASTER_RE.test(e.title));
}

/**
 * De-duplicate events so one real-world event shows once:
 *  1) exact id collisions (source-prefixed) — the cheap guard;
 *  2) cross-source hazards: when two DIFFERENT sources describe the same disaster
 *     (>=2 shared salient tokens — e.g. GDACS "Tropical cyclone … Philippines" and a
 *     Wikipedia write-up, or a USGS quake and its Wikipedia report), keep only the
 *     most authoritative source (USGS > GDACS > ReliefWeb > Wikipedia).
 *
 * Two hazards from the SAME source are never merged (distinct ids = distinct events,
 * e.g. two quakes on the same ridge), so genuinely different events always survive.
 * Pure.
 */
export function dedupeEvents(events: EventItem[]): EventItem[] {
  const byId = new Map<string, EventItem>();
  for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
  const list = [...byId.values()];

  // Process hazards most-authoritative-first; drop a later one that overlaps a kept
  // hazard from a DIFFERENT source. Stable index tiebreak keeps output deterministic.
  const rankOf = (e: EventItem) => HAZARD_SRC_RANK[e.source] ?? 9;
  const order = list
    .map((e, i) => ({ e, i }))
    .filter((x) => isHazard(x.e))
    .sort((a, b) => rankOf(a.e) - rankOf(b.e) || a.i - b.i);

  const kept: { tokens: Set<string>; source: EventItem['source'] }[] = [];
  const drop = new Set<string>();
  for (const { e } of order) {
    const tokens = salientTokens(e.title);
    let dup = false;
    for (const k of kept) {
      if (k.source === e.source) continue; // never merge within one source
      let inter = 0;
      for (const t of tokens) if (k.tokens.has(t)) inter++;
      if (inter >= 2) {
        dup = true;
        break;
      }
    }
    if (dup) drop.add(e.id);
    else kept.push({ tokens, source: e.source });
  }
  return list.filter((e) => !drop.has(e.id));
}

// Per-kind ceilings for the global strip. Weighted toward GLOBAL/MACRO real-world
// events (world current events + disasters), which are the point of the strip; a full
// league slate would otherwise crowd them out. No 'market' kind — prediction-market
// resolution dates are useful data points but not news the reader cares about here.
const KIND_CAP: Record<EventItem['kind'], number> = {
  world: 9, // global current events (Wikipedia) — armed conflicts, politics, science…
  disaster: 5, // earthquakes + hazards worldwide (USGS/ReliefWeb)
  economic: 6, // financial calendar (earnings + IPOs + macro) — a top market family
  esports: 2, // CS/Dota/LoL/Valorant (PandaScore) — toned down by default (a thin slice)
  sports: 3, // traditional sports — toned down by default; a thin slice, not a section
  weather: 4, // severe weather (US, NWS)
};

/**
 * Pick the global strip with category diversity: admit each event up to its kind's
 * HARD ceiling (live/soonest first via the pre-sort), so the strip reads as a curated,
 * global-events-weighted mix — never 24 games or 24 of one kind. The caps are
 * deliberately not back-filled: a curated handful per category beats padding the strip
 * with more of whatever is plentiful that day. Re-sorted for display. Pure.
 */
export function balanceStrip(events: EventItem[], max: number): EventItem[] {
  const ordered = sortEvents(events);
  const out: EventItem[] = [];
  const perKind = new Map<EventItem['kind'], number>();
  for (const e of ordered) {
    if (out.length >= max) break;
    const n = perKind.get(e.kind) ?? 0;
    if (n >= KIND_CAP[e.kind]) continue;
    perKind.set(e.kind, n + 1);
    out.push(e);
  }
  return sortEvents(out);
}

/**
 * Order the strip: live now → soonest upcoming → most-recent finished. Within
 * scheduled, the nearest start comes first; within final, the most recent. Pure.
 */
export function sortEvents(events: EventItem[]): EventItem[] {
  return [...events].sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    const at = Date.parse(a.startTime);
    const bt = Date.parse(b.startTime);
    if (a.status === 'final') return bt - at; // most recent first
    return at - bt; // soonest first (live + scheduled)
  });
}

/**
 * Map non-market events (ESPN/econ/weather) to the tracked market they're about by
 * salient-token overlap, and attach every event (market-born or mapped) to its
 * story's `m.events` (cap MAX_PER_MARKET, time-sorted). Clears each active market's
 * prior-run events first so nothing goes stale. Mutates markets + event.marketId.
 * Returns how many events were mapped to a market. Pure apart from the mutation.
 */
export function pinEventsToMarkets(events: EventItem[], markets: Market[]): number {
  const active = markets.filter((m) => m.status === 'active');
  for (const m of active) if (m.events) m.events = undefined;

  // Pre-tokenize markets once.
  const mt = active.map((m) => ({ m, tokens: salientTokens(`${m.title} ${m.favored ?? ''}`) }));
  let mapped = 0;
  for (const ev of events) {
    if (ev.marketId) continue; // market-derived events already carry their link
    const evTokens = salientTokens(ev.title);
    let best: (typeof mt)[number] | null = null;
    let bestScore = 0;
    for (const cand of mt) {
      const shared: string[] = [];
      for (const t of evTokens) if (cand.tokens.has(t)) shared.push(t);
      // A match qualifies on >=2 shared tokens OR a single DISTINCTIVE token (a
      // proper noun ~len>=5 like "lakers"/"bitcoin"/"powell"): a sports event is
      // "TeamA at TeamB" and the market names one team, so the lone team token is a
      // strong, low-noise signal, while the length floor rejects 3–4-char coincidences.
      const distinctive = shared.some((t) => t.length >= 5);
      if (shared.length < PIN_MIN_OVERLAP && !(shared.length >= 1 && distinctive)) continue;
      // Score by shared count, then by the longest shared token, so the most specific
      // market wins an event deterministically.
      const score = shared.length * 100 + Math.max(0, ...shared.map((t) => t.length));
      if (score > bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    if (best) {
      ev.marketId = best.m.id;
      mapped++;
    }
  }

  // Group by marketId and attach.
  const byMarket = new Map<string, EventItem[]>();
  for (const ev of events) {
    if (!ev.marketId) continue;
    const list = byMarket.get(ev.marketId);
    if (list) list.push(ev);
    else byMarket.set(ev.marketId, [ev]);
  }
  const byId = new Map(active.map((m) => [m.id, m]));
  for (const [id, evs] of byMarket) {
    const m = byId.get(id);
    if (m) m.events = sortEvents(evs).slice(0, MAX_PER_MARKET);
  }
  return mapped;
}

/**
 * Build the global Events strip — GLOBAL / MACRO real-world events, not market
 * resolution dates. A computed macro marker (offline) plus the networked global
 * sources (one parallel batch, run on every cron) spanning our category families:
 * Wikipedia's curated daily world
 * events, USGS earthquakes + ReliefWeb disasters (dormant until an appname), ESPN
 * across many leagues (US majors, soccer, World Cup, tennis, golf, F1, MMA), Finnhub
 * financial calendar (earnings + IPOs, dormant until a key) and PandaScore esports
 * (dormant until a token), plus US severe weather. Pooled, de-duplicated (one event
 * shows once), ordered, per-kind capped for a diverse mix. Best-effort throughout —
 * any source failure just contributes []. Mutates each market's `m.events` via
 * pinEventsToMarkets so a story about, say, a Kuwait quake shows that event.
 */
export async function fetchEvents(
  config: Config,
  markets: Market[],
  nowIso: string,
): Promise<EventItem[]> {
  const nowMs = Date.parse(nowIso);
  const pool: EventItem[] = [];

  // Offline sources (no network, always available): the monthly jobs report + the
  // next FOMC rate decision — the two highest-impact scheduled US macro events.
  pool.push(...jobsReportEvents(nowMs), ...fomcEvents(nowMs));

  // Networked sources, all in ONE parallel batch (~2-3s wall, unlike GDELT's 38.5s
  // serial sweep) — so they run on EVERY cron, including the 15-min market-hours one.
  // Skipping them there (as we briefly did) saved ~0 billed minutes but emptied the
  // events strip to the lone jobs marker during peak hours; not worth it. Each source
  // is best-effort (a failure contributes []).
  const start = yyyymmdd(nowIso);
  const end = yyyymmdd(new Date(nowMs + ESPN_WINDOW_DAYS * DAY_MS).toISOString());
  const range = `${start}-${end}`;
  const [espn, weather, world, quakes, gdacs, disasters, financial, esports] = await Promise.all([
    Promise.all(ESPN_LEAGUES.map((l) => fetchEspnLeague(l, range, config, nowMs))),
    fetchWeatherEvents(config, nowMs),
    fetchWikipediaEvents(config, nowIso),
    fetchEarthquakes(config, nowMs),
    fetchGdacs(config, nowMs),
    fetchReliefWeb(config, nowIso),
    fetchFinnhub(config, nowIso),
    fetchPandaScore(config),
  ]);
  for (const items of espn) pool.push(...items);
  pool.push(...weather, ...world, ...quakes, ...gdacs, ...disasters, ...financial, ...esports);

  // Collapse duplicates (id collisions + the same disaster reported by Wikipedia AND
  // a structured source) so one real-world event shows once.
  const all = dedupeEvents(pool);

  pinEventsToMarkets(all, markets);
  return balanceStrip(all, config.eventsMax);
}
