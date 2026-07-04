import { getText } from './http';
import type { Config } from './config';
import type { Source } from '../../src/lib/types';

/** Headlines retrieved for a market, fed to the model and cited in the briefing. */
export interface Headline {
  title: string;
  /** Human-readable publisher name, e.g. "Politico". */
  outlet: string;
  source: Source;
  publishedAt: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m?.[1] ? decodeEntities(m[1]) : null;
}

/** Shared RSS free-text normalizer: decode entities/CDATA, strip HTML tags, collapse
 * whitespace. Used for both titles and description/summary prose. */
export function plainText(raw: string | undefined | null): string {
  if (!raw) return '';
  return decodeEntities(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trim free text to a cap on a WORD boundary (never mid-word/mid-clause), adding an
 * ellipsis when truncated. Used to bound a market's resolution-criteria text without
 * cutting the operative rule mid-sentence (the briefing must read the whole rule). */
export function clampText(raw: string | undefined | null, max: number): string {
  const t = (raw ?? '').trim();
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '').trim() + '…';
}

// Subscriber/paywall/consent/boilerplate strings that masquerade as a summary on
// paywalled or JS-gated outlets — feeding "Subscribe to read the full story" as
// reporting would be worse than the headline, so we reject any snippet containing one.
const SNIPPET_JUNK =
  /\b(subscribe|sign\s?up|sign\s?in|log\s?in|continue reading|read (the )?(full|more)|cookies?|advertisement|all rights reserved|enable javascript|your browser|view comments|getty images|this content)\b/i;

/**
 * A short, clean reporting summary from an RSS item's description/summary, or '' when
 * there is none worth feeding. Rejects junk (paywall/consent boilerplate), too-short
 * blurbs, and Google-News-style "title repeated" descriptions; caps the result at a
 * sentence-ish length on a word boundary. The one place real prose enters the prompt,
 * so it is filtered conservatively.
 */
export function extractSnippet(raw: string | undefined | null, title: string): string {
  const s = plainText(raw);
  if (s.length < 60 || SNIPPET_JUNK.test(s)) return '';
  const norm = (x: string): string =>
    x
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const nt = norm(title);
  const ns = norm(s);
  // Drop a description that is just the headline (+ maybe a publisher tag) with no prose.
  if (ns === nt || (nt && ns.startsWith(nt) && ns.slice(nt.length).trim().length < 30)) return '';
  if (s.length <= 240) return s;
  return (
    s
      .slice(0, 240)
      .replace(/\s+\S*$/, '')
      .trim() + '…'
  );
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Google News RSS item links are opaque news.google.com redirects, not the real
 * publisher article URL. */
function isGoogleNewsHost(host: string): boolean {
  return host === 'google.com' || host.endsWith('.google.com');
}

// Social / video / pure-aggregator domains are not journalistic sources.
const NON_JOURNALISTIC = new Set([
  'youtube.com',
  'm.youtube.com',
  'facebook.com',
  'reddit.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'linkedin.com',
  'pinterest.com',
  'msn.com',
  // Trading / betting / prediction-market PLATFORMS — the subject (and competitors),
  // not journalism. They publish keyword-stuffed market/price/odds pages (Coinbase's
  // "Highest temperature in DC on Jun 17?", DraftKings' "MLB Weather Report", Robinhood's
  // daily temperature pages) that Google News indexes and that otherwise pollute a
  // story's citations with non-reporting that merely repeats the question.
  'coinbase.com',
  'robinhood.com',
  'draftkings.com',
  'dknetwork.draftkings.com',
  'fanduel.com',
  'kalshi.com',
  'polymarket.com',
  'binance.com',
  'binance.us',
  'kraken.com',
  'crypto.com',
  'coinmarketcap.com',
  'bet365.com',
  'caesars.com',
  // Third-party odds / prediction-market AGGREGATORS that merely RE-PUBLISH the market
  // question (often a verbatim clone of the title) rather than report — an
  // allow-by-default list otherwise lets a story cite a copy of its own question
  // (observed: mlq.ai citing "Elon Musk # tweets June 20-22" on the June 22-24 market).
  'mlq.ai',
  'oddspedia.com',
  'electionbettingodds.com',
  'predictit.org',
  'manifold.markets',
  'metaculus.com',
  'adjacentnews.com',
  'polymarketanalytics.com',
  'forecastex.com',
  // Crypto-exchange blogs + SEO content farms that auto-generate "<asset> price
  // prediction" / "will X tweet N times" pages around a market and surface in Google
  // News as if they were reporting — observed manufacturing fake "perspectives" on the
  // Elon-tweet-count and daily-price props (WEEX, Catcher-Predict-style aggregators).
  'weex.com',
  'basenor.com',
  'startuphub.ai',
  'teslaoracle.com',
]);

/** A domain is non-journalistic if it's on the list OR a subdomain of one (so
 * "dknetwork.draftkings.com" and "pro.coinbase.com" are both excluded). */
function isNonJournalistic(domain: string): boolean {
  if (NON_JOURNALISTIC.has(domain)) return true;
  for (const d of NON_JOURNALISTIC) if (domain.endsWith(`.${d}`)) return true;
  return false;
}

/** Google News titles are "Headline - Publisher"; drop the trailing publisher. */
function cleanTitle(title: string): string {
  return title.replace(/\s+-\s+[^-]+$/, '').trim() || title.trim();
}

export function parseRss(xml: string, limit: number): Headline[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const out: Headline[] = [];
  const seenDomains = new Set<string>();

  for (const [, block] of items) {
    if (!block) continue;
    const rawTitle = tag(block, 'title');
    const link = tag(block, 'link');
    if (!rawTitle || !link) continue;

    const sourceMatch = block.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
    const sourceUrl = sourceMatch?.[1];
    const domain = domainFromUrl(sourceUrl ?? '') || domainFromUrl(link);
    if (!domain || seenDomains.has(domain)) continue; // one citation per publisher
    if (isNonJournalistic(domain)) continue; // keep real outlets only
    seenDomains.add(domain);

    const clean = cleanTitle(rawTitle);
    const outlet = sourceMatch?.[2] ? decodeEntities(sourceMatch[2]) : domain;
    // `url` = the real publisher origin (<source url>), so citations + the isBasedOn
    // provenance name the publisher (e.g. reuters.com), not Google — a cleaner
    // attribution/originality signal. Falls back to the item link when no usable
    // origin is given.
    const linkUrl = link.trim();
    const url =
      isGoogleNewsHost(domainFromUrl(linkUrl)) &&
      sourceUrl &&
      !isGoogleNewsHost(domainFromUrl(sourceUrl))
        ? sourceUrl
        : linkUrl;
    // `articleUrl` = the link to the actual STORY a reader clicks. Google News only
    // exposes an opaque redirect to it (the <link>), never the publisher's bare article
    // URL, so we keep it separate from the publisher origin above and let citation links
    // prefer it. Only set when it actually differs from `url` (i.e. we had a real origin).
    const pubDate = tag(block, 'pubDate');
    const source: Source = { domain, url, title: clean };
    if (linkUrl && linkUrl !== url) source.articleUrl = linkUrl;
    // Persist a normalized publish time so the article TrendChart can plot when each
    // cited story landed (the feed's raw pubDate parses cleanly to ISO; skip if not).
    const pubMs = pubDate ? Date.parse(pubDate) : NaN;
    if (Number.isFinite(pubMs)) source.publishedAt = new Date(pubMs).toISOString();
    out.push({
      title: clean,
      outlet,
      source,
      // One source of truth: the same normalized ISO as the source (or null), never the
      // raw RFC-822 string — so the briefing's relativeAge and the chart's coverage ticks
      // can't disagree, and an unparseable date becomes null rather than garbage.
      publishedAt: source.publishedAt ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// Bound results to RECENT coverage via Google News's `when:` operator. Without a
// window it happily returns months-old evergreen pieces for a standing question, and
// those stale citations read as "news from last week" inside a fresh briefing. 14d
// keeps slow-burn stories citable while capping staleness; the 12h newsCheck loop
// swaps in newer pieces as they land.
const NEWS_MAX_AGE = 'when:14d';

/** Retrieve recent real headlines for a market. Returns [] on any failure. */
export async function fetchHeadlines(query: string, config: Config): Promise<Headline[]> {
  const url =
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(`${query} ${NEWS_MAX_AGE}`) +
    '&hl=en-US&gl=US&ceid=US:en';
  try {
    const xml = await getText(url, {
      headers: { 'User-Agent': config.userAgent },
      timeoutMs: 15000,
      retries: 3,
    });
    return parseRss(xml, config.newsPerMarket);
  } catch {
    return [];
  }
}
