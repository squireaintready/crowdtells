/**
 * "Developing" news layer — a corroborated, cross-topic live feed.
 *
 * TWO complementary free sources, pooled and clustered together so a cluster
 * surfaces only when >=2 DISTINCT publisher domains corroborate it within the
 * recent window (anti-noise by construction):
 *   1. GDELT DOC 2.0 (no key, ~15-min cadence) — broad, with a real domain +
 *      timestamp per article, but rate-limits a shared IP hard (GitHub Actions),
 *      so it is spaced + budgeted and may return little.
 *   2. A broad set of publisher RSS feeds across the political spectrum (BBC, NYT,
 *      NPR, Guardian, CBS, Fox, Sky, Al Jazeera, ESPN, Ars Technica, CoinDesk,
 *      Cointelegraph) — the reliable corroboration BASELINE that carries the strip
 *      when GDELT is throttled; each publisher is one domain, so cross-newsroom
 *      agreement = corroboration. The articles are pooled and filtered to the
 *      recent window BEFORE clustering, so a stale headline can't anchor (and age
 *      out) an otherwise-developing cluster.
 * Clusters are pinned to a related market by salient-token overlap (reusing the
 * canonical token aliasing).
 *
 * Honest by design: a ~15-min static pipeline is "first corroborated read", not
 * wire-speed alerting — so the surface says "Developing", never "Breaking"/"Live".
 * We show only headline + outlet + outbound link (the defensible aggregator line);
 * GDELT is credited in the UI colophon. Strictly best-effort: any source failure
 * yields [] and the rest of the pipeline is unaffected.
 */
import { getJson, getText, sleep } from './http';
import type { Config } from './config';
import type { BreakingItem, Market } from '../../src/lib/types';
import { canonicalToken } from './canonical';
import { extractSnippet } from './news';

const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_SPACING_MS = 5500; // respect GDELT's ~1-call/5s limit
const GDELT_TIMEOUT_MS = 12_000; // per-call timeout; a slow topic is skipped, not retried
const BREAKING_BUDGET_MS = 90_000; // hard wall-clock cap on the whole sweep
const BREAKING_WINDOW_MIN = 360; // a cluster is "developing" if active within 6h
// (also the pre-cluster pool filter: only articles this recent can form/join a
// cluster, so an old headline sharing tokens can't anchor a stale firstSeen)
const BREAKING_MAX = 12; // global strip size
const PIN_MIN_OVERLAP = 2; // shared salient tokens to pin a cluster to a market

/** Topic buckets → a GDELT query covering our category families. One call per
 * bucket; quoted phrases keep precision. */
const TOPIC_QUERIES: { topic: string; query: string }[] = [
  { topic: 'Politics', query: '(election OR Congress OR Senate OR "White House" OR parliament)' },
  { topic: 'Economics', query: '("Federal Reserve" OR inflation OR "interest rate" OR "jobs report" OR tariffs)' },
  { topic: 'Crypto', query: '(bitcoin OR ethereum OR cryptocurrency)' },
  { topic: 'World', query: '(ceasefire OR sanctions OR airstrike OR "peace deal" OR summit)' },
  { topic: 'Science and Technology', query: '("artificial intelligence" OR OpenAI OR semiconductor)' },
  { topic: 'Sports', query: '(championship OR "world cup" OR playoff OR finals)' },
  { topic: 'Climate and Weather', query: '(hurricane OR wildfire OR "heat wave" OR earthquake)' },
  { topic: 'Business', query: '(merger OR bankruptcy OR earnings OR layoffs)' },
];

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string; // "20260617T113000Z"
  domain?: string;
}

/** Parse GDELT's compact seendate ("YYYYMMDDTHHMMSSZ") to ISO; null if malformed. */
export function parseSeenDate(s: string | undefined): string | null {
  const m = (s ?? '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z` : null;
}

// Generic news scaffolding words that carry no event identity — excluded so two
// unrelated stories can't cluster (or mis-pin) on "report", "latest", etc.
const STOP = new Set(
  (
    'the a an of to in on for and or with from by at as is are be will would about ' +
    'over after into out new latest say says said report reports update live news how ' +
    'why what when who amid more most than that this they them their there here ' +
    // generic OUTCOME/scaffolding words: present in countless unrelated market titles
    // and headlines, so two different stories must not become "relevant" by sharing one.
    'win wins won winner winning lose loses lost beat beats title race deal plan meeting ' +
    'hit hits reach reaches cut cuts top tops set sets number highest lowest above below ' +
    'day days year years time next last close end first second during against between'
  ).split(' '),
);

/** Salient lowercase tokens of a headline (entities/nouns), alias-normalized, for
 * clustering + market pinning. Keeps len>=3 (so "fed"/"btc"/"oil"/"cpi" survive)
 * minus the stopword scaffolding. */
export function salientTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map(canonicalToken),
  );
}

export interface NormArticle {
  title: string;
  domain: string;
  url: string;
  seenAt: string;
  topic: string;
  tokens: Set<string>;
  /** A clean reporting summary from the feed's <description>, when the feed carries one
   * (publisher-native feeds do; GDELT does not). Powers the briefing snippet layer so the
   * Developing fetch and the snippet layer share ONE feed fetch. Absent when no usable prose. */
  snippet?: string;
}

interface Cluster {
  title: string;
  url: string;
  topic: string;
  firstSeen: string;
  lastSeen: string;
  tokens: Set<string>;
  domains: Set<string>;
}

/** Cluster articles (from ANY source) whose salient tokens overlap into the same
 * event (>=2 shared tokens), collecting distinct outlet domains. Processed
 * newest-first so a cluster's representative title/url/topic is its freshest
 * article. Pure. */
export function clusterArticles(arts: NormArticle[]): Cluster[] {
  const sorted = [...arts].sort((a, b) => (a.seenAt < b.seenAt ? 1 : -1));
  const clusters: Cluster[] = [];
  for (const a of sorted) {
    if (a.tokens.size < 2) continue;
    let best: Cluster | null = null;
    let bestInter = 0;
    for (const c of clusters) {
      let inter = 0;
      for (const t of a.tokens) if (c.tokens.has(t)) inter++;
      if (inter >= 2 && inter > bestInter) {
        best = c;
        bestInter = inter;
      }
    }
    if (best) {
      best.domains.add(a.domain);
      for (const t of a.tokens) best.tokens.add(t);
      if (a.seenAt < best.firstSeen) best.firstSeen = a.seenAt;
      if (a.seenAt > best.lastSeen) best.lastSeen = a.seenAt;
    } else {
      clusters.push({
        title: a.title,
        url: a.url,
        topic: a.topic,
        firstSeen: a.seenAt,
        lastSeen: a.seenAt,
        tokens: new Set(a.tokens),
        domains: new Set([a.domain]),
      });
    }
  }
  return clusters;
}

/** Keep only corroborated (>=2 distinct domains) clusters first seen within the
 * recent window, as BreakingItems, ordered by freshest activity first. Pure. */
export function toBreakingItems(clusters: Cluster[], nowMs: number, windowMs: number): BreakingItem[] {
  return clusters
    .filter((c) => c.domains.size >= 2 && nowMs - Date.parse(c.firstSeen) <= windowMs)
    // Freshest activity first, with a title tiebreak so equal-timestamp clusters
    // order deterministically regardless of fetch order — the slice caps in
    // fetchBreaking (BREAKING_MAX) and pinToMarkets (2) make tie order load-bearing.
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.title.localeCompare(b.title))
    .map((c) => ({
      title: c.title,
      url: c.url,
      topic: c.topic,
      outlets: [...c.domains],
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
    }));
}

/** Keep only articles seen within the recent window — the pre-cluster pool filter,
 * so a stale headline sharing tokens can't join (and back-date the firstSeen of) an
 * actively-developing cluster and get it dropped by the window. Pure. */
export function filterRecent<T extends { seenAt: string }>(arts: T[], nowMs: number, windowMs: number): T[] {
  return arts.filter((a) => nowMs - Date.parse(a.seenAt) <= windowMs);
}

/** Pin developing clusters to ACTIVE markets they're clearly about (>=2 shared
 * salient tokens between the cluster headline and the market's title+favored).
 * Conservative, to avoid mis-pinning. Mutates `m.breaking` AND stamps `item.marketId`
 * on each pinned cluster so the global strip can deep-link a reader into our own
 * briefing. Clears any stale pin from a prior run first (a market keeps its array
 * across runs in the durable store), so a cluster that has aged out doesn't linger.
 * Markets are processed in feed order, so the strongest-ranked match wins an item's
 * `marketId` (set-once). Pure apart from the documented mutation. */
export function pinToMarkets(items: BreakingItem[], markets: Market[]): number {
  let pinned = 0;
  // Tokenize each item's title ONCE up front, not once per market — the inner filter ran
  // salientTokens(item.title) for every (market × item) pair (mirrors pinEventsToMarkets).
  const tokenized = items.map((it) => ({ it, tokens: salientTokens(it.title) }));
  for (const m of markets) {
    if (m.status !== 'active') continue;
    if (m.breaking) m.breaking = undefined; // drop last run's pins before re-pinning
    const mTokens = salientTokens(`${m.title} ${m.favored ?? ''}`);
    const pins = tokenized
      .filter(({ tokens }) => {
        const shared: string[] = [];
        for (const t of tokens) if (mTokens.has(t)) shared.push(t);
        // Match on >=2 shared tokens OR a single DISTINCTIVE one (a proper noun len>=5
        // like "lakers"/"bitcoin"): a sparse market title (one team name) still pins on
        // its lone strong entity, so the strengthened stoplist didn't strand it. Mirrors
        // pinEventsToMarkets so both live surfaces use one relevance rule.
        const distinctive = shared.some((t) => t.length >= 5);
        return shared.length >= PIN_MIN_OVERLAP || (shared.length >= 1 && distinctive);
      })
      .map(({ it }) => it);
    if (pins.length) {
      const chosen = pins.slice(0, 2);
      // Deep-link THIS market from the global strip item — first (strongest-ranked)
      // market to claim an item wins, so the link points at the most relevant story.
      for (const it of chosen) if (it.marketId === undefined) it.marketId = m.id;
      m.breaking = chosen;
      pinned++;
    }
  }
  return pinned;
}

async function fetchTopic(q: { topic: string; query: string }, config: Config): Promise<NormArticle[]> {
  const url =
    `${GDELT}?query=${encodeURIComponent(`${q.query} sourcelang:eng`)}` +
    `&mode=artlist&format=json&maxrecords=75&timespan=1h&sort=datedesc`;
  try {
    const data = await getJson<{ articles?: GdeltArticle[] }>(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      retries: 1, // GDELT rate-limits a shared IP hard — skip a slow topic, don't wait
      timeoutMs: GDELT_TIMEOUT_MS,
    });
    const out: NormArticle[] = [];
    for (const a of data.articles ?? []) {
      const seenAt = parseSeenDate(a.seendate);
      if (!a.title || !a.domain || !a.url || !seenAt) continue;
      out.push({ title: a.title, domain: a.domain, url: a.url, seenAt, topic: q.topic, tokens: salientTokens(a.title) });
    }
    return out;
  } catch {
    return []; // best-effort — a stalled GDELT must never break the pipeline
  }
}

// The reliable RSS corroboration baseline — a broad, cross-spectrum set so the
// strip stands on its own when GDELT is throttled. Multiple feeds may share a
// domain (corroboration counts DISTINCT publishers), so BBC+Guardian agreeing = 2.
// Feeds are validated to emit RSS 2.0 <item>s with real pubDates (Atom-only feeds
// won't parse; stale feeds like the deprecated CNN RSS are excluded).
export const RSS_FEEDS: { url: string; domain: string; topic: string }[] = [
  // World / general — the corroboration backbone (multiple newsrooms per event).
  { url: 'https://www.france24.com/en/rss', domain: 'france24.com', topic: 'World' },
  { url: 'https://www.scmp.com/rss/91/feed', domain: 'scmp.com', topic: 'World' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', domain: 'bbc.com', topic: 'World' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', domain: 'bbc.com', topic: 'Economics' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', domain: 'nytimes.com', topic: 'World' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', domain: 'nytimes.com', topic: 'Politics' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', domain: 'nytimes.com', topic: 'World' },
  { url: 'https://feeds.npr.org/1001/rss.xml', domain: 'npr.org', topic: 'Politics' },
  { url: 'https://feeds.npr.org/1004/rss.xml', domain: 'npr.org', topic: 'World' },
  { url: 'https://www.theguardian.com/world/rss', domain: 'theguardian.com', topic: 'World' },
  { url: 'https://www.theguardian.com/us-news/rss', domain: 'theguardian.com', topic: 'Politics' },
  { url: 'https://www.cbsnews.com/latest/rss/main', domain: 'cbsnews.com', topic: 'World' },
  { url: 'https://moxie.foxnews.com/google-publisher/politics.xml', domain: 'foxnews.com', topic: 'Politics' },
  { url: 'https://moxie.foxnews.com/google-publisher/world.xml', domain: 'foxnews.com', topic: 'World' },
  { url: 'https://feeds.skynews.com/feeds/rss/world.xml', domain: 'sky.com', topic: 'World' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', domain: 'aljazeera.com', topic: 'World' },
  { url: 'https://feeds.washingtonpost.com/rss/world', domain: 'washingtonpost.com', topic: 'World' },
  { url: 'https://rss.dw.com/rdf/rss-en-world', domain: 'dw.com', topic: 'World' },
  // Politics — broaden the spectrum so a US political story corroborates fast.
  { url: 'https://thehill.com/news/feed/', domain: 'thehill.com', topic: 'Politics' },
  // Politico's politicopicks feed now 403s bots; its congress feed is open + live.
  { url: 'https://rss.politico.com/congress.xml', domain: 'politico.com', topic: 'Politics' },
  { url: 'https://api.axios.com/feed/', domain: 'axios.com', topic: 'Politics' },
  { url: 'https://feeds.nbcnews.com/nbcnews/public/politics', domain: 'nbcnews.com', topic: 'Politics' },
  { url: 'https://abcnews.go.com/abcnews/politicsheadlines', domain: 'abcnews.go.com', topic: 'Politics' },
  // Economics / business / markets — the finance corroboration backbone. All verified
  // free + no-key + RSS-2.0-with-pubDates (2026-06-22).
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', domain: 'cnbc.com', topic: 'Economics' },
  { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', domain: 'cnbc.com', topic: 'Markets' },
  // MarketWatch moved off the old feeds.marketwatch.com host (it 301s to dowjones now);
  // both MW feeds point at the live dowjones-hosted endpoints.
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', domain: 'marketwatch.com', topic: 'Economics' },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines', domain: 'marketwatch.com', topic: 'Markets' },
  // WSJ's free public markets feed — a top-tier markets newsroom for corroboration.
  { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', domain: 'wsj.com', topic: 'Markets' },
  // The Federal Reserve's own monetary-policy press releases — the authoritative
  // primary source on rate decisions / FOMC statements.
  { url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', domain: 'federalreserve.gov', topic: 'Economics' },
  { url: 'https://www.investing.com/rss/news_25.rss', domain: 'investing.com', topic: 'Economics' },
  { url: 'https://finance.yahoo.com/news/rssindex', domain: 'yahoo.com', topic: 'Markets' },
  { url: 'https://markets.businessinsider.com/rss/news', domain: 'businessinsider.com', topic: 'Markets' },
  { url: 'https://www.forbes.com/business/feed/', domain: 'forbes.com', topic: 'Economics' },
  { url: 'https://seekingalpha.com/market_currents.xml', domain: 'seekingalpha.com', topic: 'Markets' },
  // Sports.
  { url: 'https://www.espn.com/espn/rss/news', domain: 'espn.com', topic: 'Sports' },
  { url: 'https://www.cbssports.com/rss/headlines/', domain: 'cbssports.com', topic: 'Sports' },
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', domain: 'bbc.com', topic: 'Sports' },
  { url: 'https://www.skysports.com/rss/12040', domain: 'skysports.com', topic: 'Sports' },
  // Tech.
  { url: 'https://feeds.arstechnica.com/arstechnica/index', domain: 'arstechnica.com', topic: 'Science and Technology' },
  { url: 'https://www.theverge.com/rss/index.xml', domain: 'theverge.com', topic: 'Science and Technology' },
  { url: 'https://techcrunch.com/feed/', domain: 'techcrunch.com', topic: 'Science and Technology' },
  { url: 'https://www.wired.com/feed/rss', domain: 'wired.com', topic: 'Science and Technology' },
  { url: 'https://www.theregister.com/headlines.atom', domain: 'theregister.com', topic: 'Science and Technology' },
  // Science.
  { url: 'https://www.sciencedaily.com/rss/top/science.xml', domain: 'sciencedaily.com', topic: 'Science and Technology' },
  { url: 'https://phys.org/rss-feed/', domain: 'phys.org', topic: 'Science and Technology' },
  { url: 'https://www.space.com/feeds/all', domain: 'space.com', topic: 'Science and Technology' },
  // Crypto.
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss', domain: 'coindesk.com', topic: 'Crypto' },
  { url: 'https://cointelegraph.com/rss', domain: 'cointelegraph.com', topic: 'Crypto' },
  { url: 'https://decrypt.co/feed', domain: 'decrypt.co', topic: 'Crypto' },
  { url: 'https://www.theblock.co/rss.xml', domain: 'theblock.co', topic: 'Crypto' },
  { url: 'https://blockworks.co/feed', domain: 'blockworks.co', topic: 'Crypto' },
  // Climate (a top category for us) + Health + Entertainment.
  { url: 'https://insideclimatenews.org/feed/', domain: 'insideclimatenews.org', topic: 'Climate and Weather' },
  { url: 'https://www.carbonbrief.org/feed', domain: 'carbonbrief.org', topic: 'Climate and Weather' },
  { url: 'https://www.statnews.com/feed/', domain: 'statnews.com', topic: 'Health' },
  { url: 'https://www.who.int/rss-feeds/news-english.xml', domain: 'who.int', topic: 'Health' },
  { url: 'https://variety.com/feed/', domain: 'variety.com', topic: 'Entertainment' },
  { url: 'https://www.billboard.com/feed/', domain: 'billboard.com', topic: 'Entertainment' },
];

// Per (domain,title) the pool can carry one article — a publisher that lists the
// same headline in several of its feeds (e.g. an NYT story in both World + Home)
// must still count as ONE outlet, or self-syndication would fake corroboration.
// Also caps any single domain's contribution so one chatty feed can't dominate a
// run's pool and crowd out cross-newsroom agreement.
const PER_DOMAIN_POOL_CAP = 60;

/** Drop exact (domain + normalized-title) duplicates from the pool and cap each
 * domain's contribution, keeping the freshest of any repeat. The corroboration gate
 * counts DISTINCT domains, so a publisher repeating a headline across its own feeds
 * must not inflate a cluster. Pure. */
export function dedupePool(arts: NormArticle[]): NormArticle[] {
  const byKey = new Map<string, NormArticle>();
  for (const a of arts) {
    const key = `${a.domain} ${a.title.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    const prev = byKey.get(key);
    if (!prev || a.seenAt > prev.seenAt) byKey.set(key, a);
  }
  const perDomain = new Map<string, number>();
  const out: NormArticle[] = [];
  // Freshest-first so the per-domain cap keeps a domain's most recent articles.
  for (const a of [...byKey.values()].sort((x, y) => (x.seenAt < y.seenAt ? 1 : -1))) {
    const n = perDomain.get(a.domain) ?? 0;
    if (n >= PER_DOMAIN_POOL_CAP) continue;
    perDomain.set(a.domain, n + 1);
    out.push(a);
  }
  return out;
}

/** Second-pass consolidation: merge clusters that clearly describe the SAME event
 * but didn't unify in one greedy pass (token sets drift as members accrete, so two
 * partial clusters of one story can coexist). Merge when their token sets overlap
 * by >=3 salient tokens, folding the smaller (fewer outlets) into the larger and
 * keeping the freshest representative. Reduces near-duplicate strip entries. Pure. */
export function consolidateClusters(clusters: Cluster[]): Cluster[] {
  const kept: Cluster[] = [];
  // Largest-corroboration first, so a small partial folds into the established one.
  for (const c of [...clusters].sort((a, b) => b.domains.size - a.domains.size)) {
    const host = kept.find((k) => {
      if (k.topic !== c.topic) return false;
      let inter = 0;
      for (const t of c.tokens) if (k.tokens.has(t)) inter++;
      return inter >= 3;
    });
    if (host) {
      for (const d of c.domains) host.domains.add(d);
      for (const t of c.tokens) host.tokens.add(t);
      if (c.firstSeen < host.firstSeen) host.firstSeen = c.firstSeen;
      if (c.lastSeen > host.lastSeen) {
        host.lastSeen = c.lastSeen;
        host.title = c.title; // freshest activity sets the representative headline
        host.url = c.url;
      }
    } else {
      kept.push({ ...c, tokens: new Set(c.tokens), domains: new Set(c.domains) });
    }
  }
  return kept;
}

/** First <tag>…</tag> inside an item block, CDATA-aware. */
function rssTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

const decodeEntities = (s: string): string =>
  s
    // Numeric entities first (smart quotes/em-dashes that feeds like Variety emit as
    // &#8216; / &#x2019;), then named, then &amp; LAST so a "&amp;#8216;" sequence
    // resolves correctly rather than double-decoding.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Parse an RSS 2.0 feed into normalized articles (title + link + pubDate). Pure. */
export function parseRss(xml: string, feed: { domain: string; topic: string }): NormArticle[] {
  const out: NormArticle[] = [];
  // RSS uses <item>; Atom uses <entry> (e.g. The Register, Blockworks). Detect and
  // split accordingly — the RSS path is unchanged, Atom is handled additively.
  const isAtom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const title = decodeEntities(rssTag(block, 'title'));
    // RSS: <link>url</link>. Atom: <link href="url" rel="alternate"/> — prefer the
    // alternate (canonical article) link, else the first href.
    let link = rssTag(block, 'link');
    if (!link) {
      const alt = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
        || block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i)
        || block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      link = alt ? decodeEntities(alt[1]!) : '';
    }
    const pub =
      rssTag(block, 'pubDate') ||
      rssTag(block, 'dc:date') ||
      rssTag(block, 'published') ||
      rssTag(block, 'updated');
    const ms = Date.parse(pub);
    if (!title || !link || !Number.isFinite(ms)) continue;
    // Prefer the short <description> summary; fall back to content only when absent (it can
    // be the full article HTML). extractSnippet strips/junk-filters/caps it; '' → no snippet.
    const desc =
      rssTag(block, 'description') ||
      rssTag(block, 'summary') ||
      rssTag(block, 'content:encoded') ||
      rssTag(block, 'content');
    out.push({
      title,
      domain: feed.domain,
      url: link,
      seenAt: new Date(ms).toISOString(),
      topic: feed.topic,
      tokens: salientTokens(title),
      snippet: extractSnippet(desc, title) || undefined,
    });
  }
  return out;
}

async function fetchRss(feed: (typeof RSS_FEEDS)[number], config: Config): Promise<NormArticle[]> {
  try {
    const xml = await getText(feed.url, {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      retries: 1,
      timeoutMs: GDELT_TIMEOUT_MS,
    });
    return parseRss(xml, feed);
  } catch {
    return []; // best-effort
  }
}

/** Fetch the publisher-RSS baseline once — concurrent, no rate limit. Shared by the
 * Developing strip AND the briefing snippet layer (snippets.ts), so a run pulls these
 * ~47 feeds a single time. Each NormArticle carries its title tokens + (when present) a
 * clean <description> snippet. Best-effort: a failed feed contributes []. */
export async function fetchRssPool(config: Config): Promise<NormArticle[]> {
  const out: NormArticle[] = [];
  for (const items of await Promise.all(RSS_FEEDS.map((f) => fetchRss(f, config)))) {
    out.push(...items);
  }
  return out;
}

/** Build the global "Developing" strip: pool GDELT (spaced + budgeted) + the RSS
 * baseline (parallel, no rate limit), cluster across both, keep corroborated +
 * recent. Best-effort throughout. `rssPool` lets the caller pass an already-fetched
 * RSS baseline (shared with the snippet layer) to avoid re-fetching the same feeds. */
export async function fetchBreaking(
  config: Config,
  nowIso: string,
  rssPool?: NormArticle[],
): Promise<BreakingItem[]> {
  const nowMs = Date.parse(nowIso);
  const windowMs = BREAKING_WINDOW_MIN * 60_000;
  const started = Date.now();
  const pool: NormArticle[] = [];
  // GDELT — broad but rate-limited; the 8 topics run SERIALLY with GDELT_SPACING_MS
  // between them (a shared CI IP gets 429'd otherwise), so the sweep adds ~38.5s/run.
  // BREAKING_SKIP_GDELT=1 (set on the high-frequency market-hours cron in pipeline.yml)
  // skips it to stay within the free Actions budget; the parallel RSS baseline below
  // still corroborates, so the strip degrades to RSS-only rather than emptying.
  if (process.env.BREAKING_SKIP_GDELT !== '1') {
    for (let i = 0; i < TOPIC_QUERIES.length; i++) {
      if (Date.now() - started > BREAKING_BUDGET_MS) break;
      pool.push(...(await fetchTopic(TOPIC_QUERIES[i]!, config)));
      if (i < TOPIC_QUERIES.length - 1) await sleep(GDELT_SPACING_MS);
    }
  }
  // RSS baseline — reuse the shared pool when given, else fetch it now.
  pool.push(...(rssPool ?? (await fetchRssPool(config))));
  // Filter to the recent window BEFORE clustering: a feed lists articles spanning
  // many hours, and clustering keys a cluster's firstSeen to its OLDEST member —
  // so without this, one stale headline sharing tokens would anchor an actively-
  // developing story to an old timestamp and the window filter would drop it
  // (the more outlets corroborate, the likelier one is stale). Scoping the pool to
  // recent articles keeps clusters genuinely fresh and lets corroboration help.
  const recent = dedupePool(filterRecent(pool, nowMs, windowMs));
  const clusters = consolidateClusters(clusterArticles(recent));
  return toBreakingItems(clusters, nowMs, windowMs).slice(0, BREAKING_MAX);
}
