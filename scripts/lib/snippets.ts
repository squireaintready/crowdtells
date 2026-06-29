/**
 * Briefing snippet layer — real reporting PROSE for the Groq prompt.
 *
 * The per-market news fetch (news.ts → Google News RSS) yields only headline TITLES:
 * Google's RSS <description> is just the title repeated, and the article link is an
 * opaque redirect, so there is no clean, free way to read the article body. Publisher-
 * native feeds, by contrast, carry a real one- or two-sentence summary per item.
 *
 * Two tiers, both best-effort and conservative (matched only when >= MIN_TOKEN_OVERLAP
 * salient title tokens overlap, so a loose match can't inject an unrelated story; the
 * text is passed to Groq as UNTRUSTED DATA — see groq.ts snippetBlock):
 *   1. The SHARED pool — the publisher feeds the Developing layer already fetches once
 *      per run (breaking.ts RSS_FEEDS → NormArticle[].snippet). Zero extra fetches.
 *   2. Per-market PROBE — for a niche story the section feeds don't cover, fetch the
 *      native feed of the publishers actually reporting it (from the market's own Google
 *      headlines), discovered via /feed,/rss then homepage autodiscovery. Domain-cached
 *      and hard-capped by a per-run wall-clock budget so it can't stretch the run.
 * Any failure degrades to title-only (an empty result); 100% of briefings still run.
 */
import { getText } from './http';
import type { Config } from './config';
import type { Headline } from './news';
import type { Market } from '../../src/lib/types';
import { RSS_FEEDS, salientTokens, type NormArticle } from './breaking';
import { extractSnippet, plainText } from './news';

/** A publisher-feed item that carried usable summary prose. */
export interface SnippetItem {
  /** Publisher domain, e.g. "npr.org" — the attribution label shown to the model. */
  outlet: string;
  /** The cleaned, capped summary prose. */
  text: string;
  /** Salient tokens of the item's title, for matching it to a market. */
  tokens: Set<string>;
}

/** What a resolved briefing gets: the matched excerpts (outlet + prose), already capped. */
export type MarketSnippet = { outlet: string; text: string };

const PER_FEED_ITEMS = 12; // newest items per probed feed we keep prose from
const MIN_TOKEN_OVERLAP = 2; // shared salient title tokens to count as the same story
const MAX_PER_MARKET = 3;
// Per-market probe (tier 2) bounds — a steward of the metered Actions budget.
const PROBE_TIMEOUT_MS = 4000; // short per-fetch budget — never the 15s headline timeout
const PROBE_BUDGET_MS = 20_000; // hard wall-clock cap on ALL probing across the run
const MAX_PROBE_DOMAINS = 2; // publishers probed per niche market
const PROBE_PATHS = ['/feed', '/rss']; // cheap guesses tried before homepage autodiscovery

// Domains already in the shared pool — never probe these per-market (we have them).
const POOL_DOMAINS = new Set(RSS_FEEDS.map((f) => f.domain));

function firstTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? (m[1] ?? '') : '';
}

/** Title + clean summary of each item in a publisher feed that carries usable prose.
 * Handles both RSS <item> and Atom <entry>. Pure. */
export function parseFeedSnippets(xml: string, domain: string): SnippetItem[] {
  const isAtom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  const out: SnippetItem[] = [];
  for (const block of blocks) {
    const title = plainText(firstTag(block, 'title'));
    const desc =
      firstTag(block, 'description') ||
      firstTag(block, 'summary') ||
      firstTag(block, 'content:encoded') ||
      firstTag(block, 'content');
    const text = extractSnippet(desc, title);
    if (!title || !text) continue;
    out.push({ outlet: domain, text, tokens: salientTokens(title) });
    if (out.length >= PER_FEED_ITEMS) break;
  }
  return out;
}

/** Derive the snippet pool from the already-fetched publisher-RSS articles (the ones the
 * Developing layer pulled) — the items that carried usable <description> prose. Pure, no
 * fetch: this is what makes the snippet layer share the Developing fetch. */
export function snippetPoolFromArticles(articles: NormArticle[]): SnippetItem[] {
  const out: SnippetItem[] = [];
  for (const a of articles) {
    if (a.snippet) out.push({ outlet: a.domain, text: a.snippet, tokens: a.tokens });
  }
  return out;
}

/** The best few excerpts in `items` for a story described by `want` salient tokens:
 * items sharing >= MIN_TOKEN_OVERLAP tokens, strongest first, de-duplicated by prose so
 * syndicated copies don't repeat. Pure. */
export function matchSnippets(
  want: Set<string>,
  items: SnippetItem[],
  max = MAX_PER_MARKET,
): MarketSnippet[] {
  if (items.length === 0 || want.size === 0) return [];
  const scored: { item: SnippetItem; overlap: number }[] = [];
  for (const item of items) {
    let overlap = 0;
    for (const t of item.tokens) if (want.has(t)) overlap++;
    if (overlap >= MIN_TOKEN_OVERLAP) scored.push({ item, overlap });
  }
  scored.sort((a, b) => b.overlap - a.overlap);
  const out: MarketSnippet[] = [];
  const seen = new Set<string>();
  for (const { item } of scored) {
    const key = item.text.slice(0, 60).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ outlet: item.outlet, text: item.text });
    if (out.length >= max) break;
  }
  return out;
}

/** Salient tokens describing a market (title + category), for snippet matching. */
function wantTokens(m: Market): Set<string> {
  return new Set<string>([...salientTokens(m.title), ...salientTokens(m.category)]);
}

/** Tier-1 convenience: best shared-pool excerpts for a market. Pure. */
export function snippetsForMarket(
  m: Market,
  pool: SnippetItem[],
  max = MAX_PER_MARKET,
): MarketSnippet[] {
  return matchSnippets(wantTokens(m), pool, max);
}

async function tryGet(url: string, config: Config): Promise<string | null> {
  try {
    return await getText(url, {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/html',
      },
      retries: 1, // ONE attempt, no retry (http.ts `retries` = total attempts, not extra)
      timeoutMs: PROBE_TIMEOUT_MS,
    });
  } catch {
    return null;
  }
}

/** The publisher's feed URL via HTML autodiscovery (`<link rel=alternate type=rss/atom>`),
 * resolved absolute. null when the homepage has no discoverable feed. */
async function discoverFeedUrl(domain: string, config: Config): Promise<string | null> {
  const html = await tryGet(`https://${domain}/`, config);
  if (!html) return null;
  const tag = html.match(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i);
  const href = tag?.[0].match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) return null;
  try {
    return new URL(href, `https://${domain}/`).toString();
  } catch {
    return null;
  }
}

/** Best-effort: recover a publisher's feed (common paths, then autodiscovery) and parse
 * its items' summary prose. [] on any failure. */
async function probeDomain(domain: string, config: Config): Promise<SnippetItem[]> {
  for (const path of PROBE_PATHS) {
    const xml = await tryGet(`https://${domain}${path}`, config);
    const items = xml ? parseFeedSnippets(xml, domain) : [];
    if (items.length > 0) return items;
  }
  const discovered = await discoverFeedUrl(domain, config);
  if (discovered) {
    const xml = await tryGet(discovered, config);
    if (xml) return parseFeedSnippets(xml, domain);
  }
  return [];
}

function uniqueDomains(headlines: Headline[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of headlines) {
    const d = h.source.domain;
    if (d && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

/** Resolves the briefing excerpts for each market: tier-1 shared pool, then tier-2 probe
 * for niche stories the pool missed. Holds a per-run domain cache + wall-clock budget, so
 * create ONE per run and reuse it across every briefing. */
export interface SnippetResolver {
  forMarket(m: Market, headlines: Headline[]): Promise<MarketSnippet[]>;
}

export function makeSnippetResolver(pool: SnippetItem[], config: Config): SnippetResolver {
  const probeStart = Date.now();
  const domainCache = new Map<string, SnippetItem[]>(); // domain → its feed items (or [])
  return {
    async forMarket(m, headlines) {
      const want = wantTokens(m);
      const fromPool = matchSnippets(want, pool, MAX_PER_MARKET);
      if (fromPool.length > 0 || !config.snippetProbeEnabled) return fromPool;
      // Niche story: the shared section feeds don't cover it. Probe the publishers that
      // actually reported it (from this market's own Google headlines).
      const domains = uniqueDomains(headlines)
        .filter((d) => !POOL_DOMAINS.has(d))
        .slice(0, MAX_PROBE_DOMAINS);
      const probed: SnippetItem[] = [];
      for (const domain of domains) {
        if (!domainCache.has(domain)) {
          if (Date.now() - probeStart > PROBE_BUDGET_MS) break; // run budget spent → stop probing
          domainCache.set(domain, await probeDomain(domain, config));
        }
        probed.push(...(domainCache.get(domain) ?? []));
      }
      return matchSnippets(want, probed, MAX_PER_MARKET);
    },
  };
}
