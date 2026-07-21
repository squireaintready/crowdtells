/**
 * Emit syndication artifacts alongside feed.json: an RSS 2.0 feed, a Google
 * News sitemap, and a per-story article page (/s/<slug>.html) for each briefing.
 * All are static files served from the site root — the largest free organic-
 * distribution channel for a news product.
 *
 * The article pages are full, self-contained, INDEXABLE content (real briefing,
 * the numbers, cited-source links, structured data) — not redirect stubs. They
 * are what a search engine ranks and what a reader from search lands on; a
 * prominent CTA opens the live SPA for current odds and discussion.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Feed, Market, MarketSource, Source, Synthesis } from '../../src/lib/types';
import { storySlug } from '../../src/lib/storyPath';
import { topicSlug } from '../../src/lib/topicPath';
import { topicRedirects } from '../../src/lib/categories';
import { hydrateBriefing } from '../../src/lib/hydrate';
import { hasBriefing } from '../../src/lib/feed';
import { MIN_CONSENSUS_SOURCES } from '../../src/lib/sources';
import { safeHref } from '../../src/lib/url';
import { writeEvergreen } from './pages';
import { formatMovement, formatPct, formatUsd } from '../../src/lib/format';
import type { Config } from './config';

export const SITE = 'https://crowdtells.com';
const NEWS_WINDOW_MS = 48 * 3_600_000; // Google News sitemap = last 48h only

/** Display name for a platform. Mirrors the app: anything not Kalshi (including
 * a missing `source` on a pre-migration record) reads as Polymarket. */
export function sourceName(source: MarketSource | undefined): string {
  return source === 'kalshi' ? 'Kalshi' : 'Polymarket';
}

/** Canonical article-page URL for a story (mirrors src/lib/storyPath). */
export const storyUrl = (id: string) => `${SITE}/s/${storySlug(id)}`;
/** Canonical hub URL for a category (mirrors src/lib/topicPath). */
export const topicUrl = (category: string) => `${SITE}/topic/${topicSlug(category)}`;

/** HTML/XML-escape a value. Coerces null/undefined to '' so a single missing
 * field on a model/feed record can never crash a whole generate+deploy run. */
export function xml(s: string | null | undefined): string {
  return String(s ?? '').replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );
}

/** Collapse whitespace and clip to a tidy meta-description length on a word
 * boundary (search snippets/cards truncate ~160–200 chars anyway). */
export function clip(s: string, max = 200): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Absolute, locale-independent date for an indexed page, e.g. "June 16, 2026".
 * Static pages favor an explicit publish date over a "2h ago" that goes stale. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// Single-match sports/esports (e.g. "Austria vs Jordan") sit in saturated,
// one-day-shelf-life SERPs dominated by ESPN/CBS/oddschecker — we won't rank and
// they dilute the indexed corpus. Keep them live for users (still rendered + in
// the SPA), but out of the search index; durable futures hubs carry sports SEO.
// Gated on a clear sports category AND an unambiguous "vs"/"@" matchup, so a
// politics race like "Trump vs Newsom" is never affected.
const SPORTS_CATEGORY =
  /\b(sports?|soccer|football|baseball|basketball|hockey|tennis|golf|mma|ufc|boxing|cricket|rugby|e-?sports?|nba|nfl|mlb|nhl|wnba|ncaa|fifa|uefa|formula\s?1|f1|motogp|olympics?|iem|valorant|dota|cs2|counter-strike|league of legends|atp|wta)\b/i;
const MATCHUP = /\bvs\.?\b|\sv\.\s|\s@\s/i;
function singleMatchSports(m: Market): boolean {
  return SPORTS_CATEGORY.test(m.category) && MATCHUP.test(m.title);
}

/** A briefing that belongs in the search index: a real cross-source briefing that
 * is NOT a saturated single-match sports page. (Such pages still render + serve
 * the SPA; they're just noindexed and kept out of the sitemaps/RSS.) Exported so
 * the pipeline can count brand-new indexable pages and deploy them promptly. */
export function indexable(m: Market): boolean {
  return hasBriefing(m) && !singleMatchSports(m);
}

/** One embeddable market: the minimal projection the /embed.js widget needs.
 * Deliberately tiny — third-party sites load this, not the 2.6MB feed.json. */
export interface EmbedMarket {
  id: string;
  slug: string;
  title: string;
  category: string;
  favored: string;
  oddsPct: number;
  source: MarketSource;
  /** Cross-platform gap in points (Polymarket vs Kalshi for the same outcome), if any. */
  divergence?: number;
  /** 'ahead' | 'contested' | 'aligned' — the crowd-vs-coverage read, if briefed. */
  crowdVsCoverage?: string;
}

/** Compact, CDN-cacheable feed for the embeddable widget. ~15–25KB vs feed.json's
 * 2.6MB: only active, briefed, indexable stories, stripped to display fields. */
export function embedFeed(feed: Feed): { generatedAt: string; markets: EmbedMarket[] } {
  const markets = feed.markets
    .filter((m) => m.status === 'active' && indexable(m))
    .sort((a, b) => b.score - a.score)
    .map((m) => {
      const e: EmbedMarket = {
        id: m.id,
        slug: storySlug(m.id),
        title: m.hook || m.title,
        category: m.category,
        favored: m.favored,
        oddsPct: Math.round(m.oddsPct),
        source: m.source,
      };
      if (typeof m.divergence === 'number' && m.divergence >= 1)
        e.divergence = Math.round(m.divergence);
      if (m.crowdVsCoverage) e.crowdVsCoverage = m.crowdVsCoverage;
      return e;
    });
  return { generatedAt: feed.generatedAt, markets };
}

function rss(feed: Feed): string {
  const items = feed.markets
    .filter((m) => m.status === 'active' && indexable(m))
    .slice(0, 30)
    .map(
      (m) => `    <item>
      <title>${xml(m.hook || m.title)}</title>
      <link>${storyUrl(m.id)}</link>
      <guid isPermaLink="true">${storyUrl(m.id)}</guid>
      <category>${xml(m.category)}</category>
      <pubDate>${new Date(m.generatedAt as string).toUTCString()}</pubDate>
      <description>${xml(hydrateBriefing(m.analysis, m) || m.hook || m.title)}</description>
    </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <title>Crowdtells</title>
    <link>${SITE}/</link>
    <description>A living record of what the crowd believes — news, told through the crowd. The crowd tells it first.</description>
    <language>en</language>
    <lastBuildDate>${new Date(feed.generatedAt).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function newsSitemap(feed: Feed, nowMs: number, ogSlugs: ReadonlySet<string>): string {
  const urls = feed.markets
    .filter(
      (m) =>
        m.status === 'active' &&
        indexable(m) &&
        nowMs - Date.parse(m.generatedAt as string) < NEWS_WINDOW_MS,
    )
    .map((m) => {
      const slug = storySlug(m.id);
      const img = ogSlugs.has(slug) ? `${SITE}/og/${slug}.png` : `${SITE}/og.png`;
      // news:keywords/genres/access are deprecated & ignored by Google — omit them.
      return `  <url>
    <loc>${storyUrl(m.id)}</loc>
    <news:news>
      <news:publication><news:name>Crowdtells</news:name><news:language>en</news:language></news:publication>
      <news:publication_date>${new Date(m.generatedAt as string).toISOString()}</news:publication_date>
      <news:title>${xml(m.hook || m.title)}</news:title>
    </news:news>
    <image:image><image:loc>${img}</image:loc></image:image>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;
}

// ── Article-page building blocks ──────────────────────────────────────────────

/** Split a briefing into paragraphs on blank lines (the model occasionally
 * writes two), falling back to a single paragraph. */
export function paragraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${xml(p)}</p>`)
    .join('\n        ');
}

/** The crowd's current position, in plain words (mirrors the app's crowdRead). */
function standfirst(m: Market): string {
  const platform = sourceName(m.source);
  const fav = m.favored ?? '';
  const isYesNo = fav.toLowerCase() === 'yes' || fav.toLowerCase() === 'no';
  const pos = isYesNo
    ? `${formatPct(m.oddsPct)} ${fav.toLowerCase()}`
    : `${fav} at ${formatPct(m.oddsPct)}`.trim();
  return `${platform} prices this ${pos}.`;
}

function recapBlock(m: Market): string {
  if (m.status !== 'resolved' || !m.resolvedOutcome) return '';
  const hit = m.calledCorrectly;
  const verdict = hit ? 'The market called it' : 'The market missed this';
  return `<p class="recap ${hit ? 'hit' : 'miss'}"><b>${hit ? '✓' : '✗'} ${verdict}</b> — resolved <b>${xml(
    m.resolvedOutcome,
  )}</b>.</p>`;
}

function synthBlock(s: Synthesis | null, sourceCount: number): string {
  if (!s) return '';
  const list = (items: string[]) => items.map((i) => `<li>${xml(i)}</li>`).join('\n          ');
  const out: string[] = [];
  // Two-source rule (shared with the in-app Synthesis panel): don't call a single
  // source's claim "what the coverage agrees on", even on the indexed /s/ page.
  if (s.consensus.length && sourceCount >= MIN_CONSENSUS_SOURCES)
    out.push(
      `<h3>What the coverage agrees on</h3>\n        <ul>\n          ${list(s.consensus)}\n        </ul>`,
    );
  if (s.disputed.length)
    out.push(
      `<h3>Where sources diverge</h3>\n        <ul>\n          ${list(s.disputed)}\n        </ul>`,
    );
  if (s.perspectives.length) {
    const rows = s.perspectives
      .map((p) => `<li><b>${xml(p.source)}:</b> ${xml(p.view)}</li>`)
      .join('\n          ');
    out.push(`<h3>How outlets frame it</h3>\n        <ul>\n          ${rows}\n        </ul>`);
  }
  return out.length
    ? `<section class="synthesis">\n        ${out.join('\n        ')}\n      </section>`
    : '';
}

function numbersBlock(m: Market): string {
  const rows: string[] = [];
  const move = (label: string, n: number | null) =>
    n != null
      ? `<span><span class="k">${label}</span> <b class="${n >= 0 ? 'up' : 'down'}">${formatMovement(
          n,
        )} pts</b></span>`
      : '';
  const moves = [move('24h', m.movement24h), move('7d', m.movement7d)]
    .filter(Boolean)
    .join('\n          ');

  const figs: string[] = [];
  if (m.volume > 0) figs.push(`<b>${formatUsd(m.volume)}</b> traded`);
  if (m.volume24h > 0) figs.push(`<b>${formatUsd(m.volume24h)}</b> in the last day`);
  if (m.liquidity > 0) figs.push(`<b>${formatUsd(m.liquidity)}</b> resting liquidity`);
  if (m.openInterest > 0) figs.push(`<b>${formatUsd(m.openInterest)}</b> open interest`);

  // Pricing provenance — the live market(s) this briefing reads.
  const priceLinks: string[] = [];
  const primary = safeHref(m.marketUrl);
  const primaryLabel = `${sourceName(m.source)} ${formatPct(m.oddsPct)}`;
  priceLinks.push(
    primary
      ? `<a href="${xml(primary)}" target="_blank" rel="noopener nofollow">${primaryLabel}</a>`
      : `<span>${primaryLabel}</span>`,
  );
  if (m.alt) {
    const altHref = safeHref(m.alt.marketUrl);
    const altLabel = `${sourceName(m.alt.source)} ${formatPct(m.alt.oddsPct)}`;
    priceLinks.push(
      altHref
        ? `<a href="${xml(altHref)}" target="_blank" rel="noopener nofollow">${altLabel}</a>`
        : `<span>${altLabel}</span>`,
    );
  }
  if (m.divergence != null && m.divergence >= 1)
    priceLinks.push(`<span class="gap">${Math.round(m.divergence)}pt gap</span>`);

  rows.push(`<p class="crowd"><b>${xml(standfirst(m))}</b></p>`);
  if (moves) rows.push(`<p class="moves">\n          ${moves}\n        </p>`);
  if (figs.length) rows.push(`<p class="figs">${figs.join(' · ')}</p>`);
  if (m.description) rows.push(`<p class="resolves">Resolves on: ${xml(m.description)}</p>`);
  rows.push(`<p class="pricing"><span class="k">Pricing</span> ${priceLinks.join(' ')}</p>`);

  return `<section class="numbers">
        <h2>The numbers behind this</h2>
        ${rows.join('\n        ')}
      </section>`;
}

function sourcesBlock(sources: Source[]): string {
  const items = sources
    .map((s) => {
      // Link to the actual article (`url` stays the publisher origin for isBasedOn).
      const href = safeHref(s.articleUrl ?? s.url);
      const label = xml(s.title || s.domain);
      return href
        ? `<li><a href="${xml(href)}" target="_blank" rel="noopener nofollow">${label}</a> <span class="dom">${xml(
            s.domain,
          )}</span></li>`
        : `<li>${label} <span class="dom">${xml(s.domain)}</span></li>`;
    })
    .join('\n          ');
  if (!items) return '';
  return `<section class="sources">
        <h2>Sources</h2>
        <ul>
          ${items}
        </ul>
      </section>`;
}

function relatedBlock(related: Market[], category: string): string {
  if (!related.length) return '';
  const items = related
    .map(
      (r) =>
        `<li><a href="${storyUrl(r.id)}">${xml(r.hook || r.title)}</a> <span class="cat">${xml(
          r.category,
        )}</span></li>`,
    )
    .join('\n          ');
  return `<section class="related">
        <h2>More in ${xml(category)}</h2>
        <ul>
          ${items}
        </ul>
        <p class="more"><a href="/topic/${topicSlug(category)}">View all ${xml(category)} markets →</a></p>
      </section>`;
}

// Self-contained stylesheet for the static pages. Colors/type mirror the app's
// design tokens (src/styles/tokens.css) exactly, with the brand fonts
// self-hosted (font-display:swap) so a reader from search sees the same product.
const PAGE_CSS = `@font-face{font-family:'Source Serif 4';font-style:normal;font-display:swap;font-weight:200 900;src:url(/fonts/source-serif-4-latin.woff2) format('woff2-variations')}
@font-face{font-family:'Fraunces Variable';font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/fraunces-latin.woff2) format('woff2-variations')}
@font-face{font-family:'Inter Variable';font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-latin.woff2) format('woff2-variations')}
:root{--bg:#fbfaf7;--surface:#fff;--surface-2:#f4f1ea;--border:#e7e2d8;--border-strong:#d6cfc1;--ink:#1a1813;--dim:#54504a;--mute:#6f695e;--accent:#27496d;--accent-strong:#1b3650;--on-accent:#fbfaf7;--up:#1f7a4d;--down:#b23a2e;--display:'Source Serif 4',Georgia,'Times New Roman',serif;--serif:'Fraunces Variable',Georgia,'Times New Roman',serif;--sans:'Inter Variable',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;--prose:var(--sans)}
[data-theme='bordeaux']{color-scheme:dark;--bg:#090406;--surface:#160a0c;--surface-2:#1d0f12;--border:#381b21;--border-strong:#4c2530;--ink:#f4ece9;--dim:#c7b9b6;--mute:#968985;--accent:#d6a35b;--accent-strong:#e9bd80;--on-accent:#291106;--up:#56c395;--down:#de846c}
[data-theme='forest']{color-scheme:dark;--bg:#0c1410;--surface:#111c16;--surface-2:#16241c;--border:#27392e;--border-strong:#365044;--ink:#eaf1ea;--dim:#aebdb2;--mute:#8a9b8f;--accent:#cf9d63;--accent-strong:#e0b585;--on-accent:#1b1206;--up:#5fc78d;--down:#e8917f}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 var(--prose);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--accent)}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
.wrap{max-width:728px;margin:0 auto;padding:0 22px}
.site{border-bottom:1px solid var(--border)}
.site .wrap{display:flex;align-items:center;gap:10px;padding:15px 22px}
.brand{font-family:var(--display);font-weight:600;text-transform:uppercase;letter-spacing:.055em;color:var(--ink);text-decoration:none;font-size:1.2rem}
.site nav{margin-left:auto;font-family:var(--sans);font-size:.86rem}
.site nav a{color:var(--dim);text-decoration:none}
.site nav a:hover{color:var(--accent)}
main{padding:36px 0 8px}
.eyebrow{font-family:var(--sans);font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--mute);margin:0 0 14px;display:flex;flex-wrap:wrap;gap:6px 11px;align-items:center}
.eyebrow .cat{color:var(--accent);font-weight:700;text-decoration:none}
.eyebrow a.cat:hover{text-decoration:underline}
.eyebrow>span[aria-hidden]{color:var(--border-strong);font-weight:400}
.eyebrow .byline,.eyebrow .byline a{font-weight:600}
.eyebrow .flag{text-transform:none;letter-spacing:.01em;border:1px solid var(--border-strong);border-radius:999px;padding:2px 10px;color:var(--dim);font-weight:600}
.eyebrow .flag-sponsored{text-transform:uppercase;letter-spacing:.08em;font-weight:700;background:var(--accent);color:var(--on-accent);border-radius:999px;padding:3px 11px}
.sponsor-note{font-family:var(--sans);font-size:.82rem;line-height:1.5;color:var(--dim);border:1px solid var(--border-strong);border-radius:10px;padding:10px 14px;margin:0 0 22px}
h1{font-family:var(--serif);font-weight:440;font-size:clamp(1.95rem,1.2rem + 3.4vw,3rem);line-height:1.08;letter-spacing:-.018em;text-wrap:balance;margin:0 0 18px}
.lead{font-family:var(--prose);font-size:clamp(1.18rem,1.08rem + .5vw,1.3rem);line-height:1.52;color:var(--dim);text-wrap:pretty;margin:0 0 26px}
article{font-size:1.06rem}
article p{margin:0 0 19px}
.recap{border-radius:8px;padding:12px 15px;font-size:.97rem;margin:0 0 20px}
.recap.hit{background:color-mix(in srgb,var(--up) 13%,transparent)}
.recap.miss{background:color-mix(in srgb,var(--down) 13%,transparent)}
.lens,.take{position:relative;overflow:hidden;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin:8px 0 28px}
.lens{color:var(--dim);display:flex;gap:20px;align-items:center}
.lens::before,.take::before{content:'';position:absolute;top:0;left:14%;right:14%;height:2px;background:linear-gradient(to right,transparent,var(--accent),transparent)}
.lens .k,.take .k{display:block;font-family:var(--sans);font-size:.66rem;text-transform:uppercase;letter-spacing:.14em;color:var(--mute);font-weight:700;margin-bottom:5px}
.lens .fig{flex:0 0 auto;font-family:var(--serif);font-weight:300;font-size:clamp(2.7rem,2rem + 3vw,4rem);line-height:.85;letter-spacing:-.03em;color:var(--accent);font-variant-numeric:tabular-nums}
.lens .read{min-width:0;flex:1}
.lens .read p{margin:0;font-size:1rem;line-height:1.5}
h2{font-family:var(--serif);font-weight:560;font-size:clamp(1.32rem,1.2rem + .55vw,1.5rem);line-height:1.18;letter-spacing:-.012em;margin:38px 0 13px}
h3{font-family:var(--sans);font-weight:650;font-size:.92rem;letter-spacing:.005em;margin:20px 0 6px}
.synthesis ul,.sources ul,.related ul{margin:0 0 8px;padding-left:20px}
.synthesis li,.sources li,.related li{margin:0 0 7px;line-height:1.55}
.numbers{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 22px;margin:30px 0}
.numbers h2{margin-top:0;font-size:1.18rem}
.numbers p{margin:0 0 10px;font-size:.95rem;font-family:var(--sans)}
.numbers p:last-child{margin-bottom:0}
.numbers .crowd{font-family:var(--prose)}
.numbers .crowd b{font-size:1.06rem}
.numbers .figs{color:var(--dim)}
.k{font-family:var(--sans);font-size:.66rem;text-transform:uppercase;letter-spacing:.12em;color:var(--mute);font-weight:700;margin-right:7px}
.moves{display:flex;gap:22px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.up{color:var(--up)}.down{color:var(--down)}
.gap{color:var(--mute);font-size:.85rem}
.pricing a{margin-right:13px}
.sources .dom,.related .cat{font-family:var(--sans);color:var(--mute);font-size:.8rem}
.disclosure{font-family:var(--sans);font-size:.82rem;line-height:1.55;color:var(--mute);border-top:1px solid var(--border);padding-top:14px;margin:26px 0 0}
.related .more{margin:12px 0 0;font-family:var(--sans);font-size:.9rem;font-weight:600}
.cta{display:inline-block;font-family:var(--sans);background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:700;border-radius:999px;padding:13px 26px;margin:8px 0 32px}
.cta:hover{background:var(--accent-strong)}
footer{border-top:1px solid var(--border);font-family:var(--sans);color:var(--mute);font-size:.85rem;line-height:1.55;padding:26px 0 48px;margin-top:36px}
footer a{color:var(--dim)}
footer .wrap>*{display:block;margin-bottom:7px}
.hub-list{list-style:none;margin:10px 0 0;padding:0}
.hub-item{border-top:1px solid var(--border);padding:22px 0}
.hub-item:first-child{border-top:0}
.hub-item h2{font-size:clamp(1.22rem,1.1rem + .5vw,1.38rem);line-height:1.18;margin:0 0 7px}
.hub-item h2 a{color:var(--ink);text-decoration:none}
.hub-item h2 a:hover{color:var(--accent)}
.hub-item .meta{font-family:var(--sans);font-size:.72rem;font-weight:600;color:var(--mute);text-transform:uppercase;letter-spacing:.1em;margin:0 0 8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.hub-item .meta>span[aria-hidden]{color:var(--border-strong)}
.hub-item .excerpt{margin:0;color:var(--dim);font-size:1.02rem;line-height:1.55}
.topics,.guides{font-family:var(--sans);margin:8px 0 0;font-size:.92rem;line-height:1.6}
.topics a,.guides a{display:inline-block;margin:0 14px 8px 0;color:var(--accent);text-decoration:none}
.topics a:hover,.guides a:hover{text-decoration:underline}
.answer{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin:0 0 26px}
.answer .q{font-family:var(--serif);font-weight:560;font-size:1.14rem;line-height:1.3;margin:0 0 7px}
.answer .a{margin:0;color:var(--dim);font-size:1.04rem;line-height:1.55}
.answer .a b{color:var(--ink)}
.byline a{color:var(--dim);text-decoration:none}
.byline a:hover{color:var(--accent);text-decoration:underline}
.faq{margin:34px 0 0}
.faq-item{border-top:1px solid var(--border);padding:16px 0}
.faq-q{font-family:var(--sans);font-size:1rem;font-weight:650;margin:0 0 6px}
.faq-a{margin:0;color:var(--dim);line-height:1.6}
.precedents{margin:0 0 8px;padding-left:20px;color:var(--dim)}
.precedents li{margin:0 0 7px;line-height:1.55}
.precedent-note{font-family:var(--sans);font-size:.8rem;color:var(--mute);margin:10px 0 22px}
.developing{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:15px 17px;margin:0 0 24px}
.dev-flag{display:inline-flex;align-items:center;gap:6px;font-family:var(--sans);font-size:.64rem;font-weight:750;letter-spacing:.12em;text-transform:uppercase;color:var(--down)}
.dev-flag::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--down)}
.developing ul{margin:9px 0 0;padding-left:18px}
.developing li{margin:0 0 7px;font-size:.95rem;line-height:1.5}
.dev-meta{font-family:var(--sans);color:var(--mute);font-size:.78rem}
.prose p{margin:0 0 19px}
.live-empty{color:var(--mute);font-style:italic}
.big-stat{font-family:var(--serif);font-size:clamp(3.4rem,2.4rem + 4vw,4.6rem);line-height:.92;font-weight:300;letter-spacing:-.03em;color:var(--accent);font-variant-numeric:tabular-nums;margin:10px 0 14px}
.tnum{font-variant-numeric:tabular-nums}
.cal-table{width:100%;border-collapse:collapse;margin:10px 0 30px;font-size:1rem}
.cal-table th{text-align:left;font-family:var(--sans);font-weight:700;font-size:.74rem;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);border-bottom:1px solid var(--border-strong);padding:9px 11px}
.cal-table td{padding:10px 11px;border-bottom:1px solid var(--border)}
.cal-table .muted{color:var(--mute)}
.cal-table tr:last-child td{border-bottom:none}
.hub-item .hit,.res-item .hit{color:var(--accent);font-weight:600}
.hub-item .miss,.res-item .miss{color:var(--mute)}
.res-list{list-style:none;margin:10px 0 0;padding:0}
.res-item{display:flex;gap:14px;align-items:flex-start;padding:16px 0;border-bottom:1px solid var(--border)}
.res-item:last-child{border-bottom:none}
.res-item h3{font-family:var(--serif);font-weight:560;margin:0 0 5px;font-size:1.08rem;line-height:1.25}
.res-item .meta{margin:0;font-family:var(--sans);font-size:.84rem;color:var(--mute);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.res-item .meta>span[aria-hidden]{color:var(--border-strong)}
.res-body{min-width:0;flex:1}
.rthumb{width:52px;height:52px;flex:0 0 52px;border-radius:10px;object-fit:cover;background:var(--surface-2);border:1px solid var(--border)}
.rthumb-blank{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.4rem}
.rthumb-blank.hit{color:var(--accent)}.rthumb-blank.miss{color:var(--mute)}
.bars{list-style:none;margin:10px 0 28px;padding:0}
.bar-row{display:flex;align-items:center;gap:12px;padding:8px 0}
.bar-label{flex:0 0 34%;font-family:var(--sans);font-size:.92rem}
.bar-track{flex:1;height:9px;border-radius:999px;background:var(--surface-2);overflow:hidden}
.bar-fill{display:block;height:100%;background:var(--accent);border-radius:999px}
.bar-val{flex:0 0 auto;font-family:var(--sans);font-size:.88rem;white-space:nowrap}
@media(max-width:560px){.bar-label{flex-basis:40%}}
.code{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;overflow-x:auto;font-size:.9rem;line-height:1.5;margin:0 0 18px}
.code code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink)}
.cal-table code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86rem}
.embed-demo{margin:0 0 22px}
@media(max-width:560px){.wrap{padding:0 17px}main{padding:28px 0 8px}.lens{gap:15px}.lens .fig{font-size:2.7rem}}
.theme-btn{margin-left:14px;flex:0 0 auto;background:none;border:1px solid var(--border-strong);border-radius:999px;width:30px;height:30px;color:var(--dim);font-size:.95rem;line-height:1;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center}
.theme-btn:hover{color:var(--accent);border-color:var(--accent)}
.brand{position:relative;padding-bottom:4px}
.brand::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--accent);opacity:.9}
.spread{max-width:728px;margin:0 auto;padding:0 22px}
.spine{min-width:0}
.rail{min-width:0;font-family:var(--sans)}
.rail-mod{margin:0 0 26px}
.rail-mod:last-child{margin-bottom:0}
.rail-h{font-family:var(--sans);font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--mute);margin:0 0 12px}
.rail-note{font-size:.88rem;line-height:1.5;color:var(--dim);margin:0}
.toc{list-style:none;margin:0;padding:0;font-size:.92rem;line-height:1.35}
.toc a{display:block;color:var(--dim);text-decoration:none;border-left:2px solid var(--border);padding:5px 0 5px 12px}
.toc a:hover{color:var(--accent);border-left-color:var(--accent)}
.keyfacts{list-style:none;margin:0;padding:0}
.keyfacts li{padding:12px 0;border-top:1px solid var(--border)}
.keyfacts li:first-child{border-top:0;padding-top:0}
.keyfacts .kf-v{display:block;font-family:var(--serif);font-weight:360;font-size:1.55rem;line-height:1.02;letter-spacing:-.02em;color:var(--accent);font-variant-numeric:tabular-nums}
.keyfacts .kf-l{display:block;font-family:var(--sans);font-size:.8rem;line-height:1.35;color:var(--mute);margin-top:4px}
.lookup{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:15px 16px}
.lookup p{margin:0 0 11px;font-size:.88rem;line-height:1.45;color:var(--dim)}
.lookup form{display:flex;flex-direction:column;gap:8px;margin:0}
.lookup input{width:100%;font-family:var(--sans);font-size:.92rem;padding:9px 11px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface);color:var(--ink)}
.lookup input::placeholder{color:var(--mute)}
.lookup button{font-family:var(--sans);font-weight:700;font-size:.9rem;background:var(--accent);color:var(--on-accent);border:0;border-radius:7px;padding:10px;cursor:pointer}
.lookup button:hover{background:var(--accent-strong)}
.lookup .credit{margin:10px 0 0;font-size:.74rem;color:var(--mute)}
.lookup .credit a{color:var(--mute)}
.rail-rel{list-style:none;margin:0;padding:0;font-size:.92rem;line-height:1.4}
.rail-rel li{padding:9px 0;border-top:1px solid var(--border)}
.rail-rel li:first-child{border-top:0;padding-top:0}
.rail-rel a{color:var(--ink);text-decoration:none}
.rail-rel a:hover{color:var(--accent)}
@media(min-width:1080px){.spread{max-width:1120px;display:grid;grid-template-columns:minmax(0,1fr) minmax(19rem,21rem);column-gap:clamp(2.2rem,4vw,3.6rem);align-items:start}.rail{position:sticky;top:26px;border-left:1px solid var(--border);padding-left:clamp(1.6rem,2vw,2.2rem)}}
@media(max-width:1079px){.rail{margin:38px 0 0;border-top:1px solid var(--border-strong);padding-top:26px}.toc-mod{display:none}}
@media(max-width:560px){.spread{padding:0 17px}}`;

/** Shared <head> for the static pages — identical icons, fonts, theme-color,
 * robots, OG/Twitter, and structured data across article and hub pages. */
export function pageHead(o: {
  title: string;
  desc: string;
  canonical: string;
  ogType: 'article' | 'website';
  jsonld: string[];
  extraMeta?: string;
  /** Per-page social card; falls back to the generic site card. */
  image?: string;
  /** Thin/un-briefed pages: keep the URL live but out of the search index. */
  noindex?: boolean;
  /** Byline author (a Person) — defaults to the Crowdtells organization. */
  author?: string;
  /** Inline <head> script — story pages pass the hash-gated share→app bounce. */
  headScript?: string;
}): string {
  const img = o.image ?? `${SITE}/og.png`;
  const ld = o.jsonld.map((s) => `<script type="application/ld+json">${s}</script>`).join('\n    ');
  return `<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="preload" href="/fonts/source-serif-4-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="alternate" type="application/rss+xml" title="Crowdtells" href="/feed.xml" />
    <meta name="theme-color" content="#fbfaf7" />
    <script>
      (function () {
        var THEMES = ['light', 'bordeaux', 'forest'];
        var BG = { light: '#fbfaf7', bordeaux: '#090406', forest: '#0c1410' };
        function apply(t) {
          document.documentElement.setAttribute('data-theme', t);
          var m = document.querySelector('meta[name=theme-color]');
          if (m && BG[t]) m.setAttribute('content', BG[t]);
        }
        var t;
        try {
          t = localStorage.getItem('crowdtell-theme');
          if (t === 'dark' || t === 'oxblood') t = 'bordeaux';
        } catch (e) {}
        if (THEMES.indexOf(t) < 0) t = 'light'; // default matches the app (light), not OS
        apply(t);
        document.addEventListener('click', function (e) {
          var b = e.target && e.target.closest && e.target.closest('.theme-btn');
          if (!b) return;
          var cur = document.documentElement.getAttribute('data-theme') || 'light';
          var next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
          apply(next);
          try { localStorage.setItem('crowdtell-theme', next); } catch (e) {}
        });
      })();
    </script>
    ${o.headScript ?? ''}
    <title>${xml(o.title)} — Crowdtells</title>
    <meta name="description" content="${xml(o.desc)}" />
    <meta name="robots" content="${
      o.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'
    }" />
    <meta name="author" content="${xml(o.author ?? 'Crowdtells')}" />
    <link rel="canonical" href="${o.canonical}" />
    <meta property="og:type" content="${o.ogType}" />
    <meta property="og:site_name" content="Crowdtells" />
    <meta property="og:title" content="${xml(o.title)}" />
    <meta property="og:description" content="${xml(o.desc)}" />
    <meta property="og:url" content="${o.canonical}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="en_US" />
    ${o.extraMeta ?? ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${xml(o.title)}" />
    <meta name="twitter:description" content="${xml(o.desc)}" />
    <meta name="twitter:image" content="${img}" />
    ${ld}
    <style>${PAGE_CSS}</style>
  </head>`;
}

/** Site header + footer, shared by every static page type. */
export const siteHeader = (nav: string) => `<header class="site">
      <div class="wrap">
        <a class="brand" href="/">Crowdtells</a>
        <nav aria-label="Primary">${nav}</nav>
        <button type="button" class="theme-btn" aria-label="Switch color theme" title="Switch theme">◐</button>
      </div>
    </header>`;
export const siteFooter = (note: string) => `<footer>
      <div class="wrap">
        <span><a href="/">Crowdtells</a> — news, ranked by what the world is watching. Markets via Polymarket &amp; Kalshi.</span>
        <span>${note}</span>
        <span><a href="/accuracy">Track record</a> · <a href="/learn">Guides</a> · <a href="/nyc">NYC</a> · <a href="/mispriced">Mispriced</a> · <a href="/embed">Embed</a> · <a href="/learn/how-prediction-markets-work">How prediction markets work</a></span>
        <span><a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/feed.xml">RSS</a></span>
      </div>
    </footer>`;

/**
 * A full, indexable article page: the hydrated briefing, the numbers behind it,
 * cited-source links, structured data, and internal links — plus a CTA into the
 * live SPA. Self-canonical so it doesn't compete with the app root.
 */
export function storyPage(m: Market, related: Market[] = [], ogImageUrl?: string): string {
  const url = storyUrl(m.id);
  const title = m.hook || m.title;
  const analysis = hydrateBriefing(m.analysis, m);
  const background = hydrateBriefing(m.background ?? '', m);
  const whatToWatch = hydrateBriefing(m.whatToWatch ?? '', m);
  const take = hydrateBriefing(m.take, m);
  const lens = hydrateBriefing(m.marketRead, m);
  const desc = clip(analysis || m.hook || m.title);
  const app = `/?s=${encodeURIComponent(m.id)}`;
  const catHref = `/topic/${topicSlug(m.category)}`;
  const published = fmtDate(m.generatedAt);
  const img = ogImageUrl ?? `${SITE}/og.png`;

  // Indexable body = every original prose section the page renders, so the
  // structured articleBody/wordCount reflect real depth, not just the lead.
  const precedentText = (m.precedents ?? []).join(' ');
  const bodyText = [analysis, background, precedentText, whatToWatch].filter(Boolean).join('\n\n');
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
  // JSON-LD: stringify (handles quoting) then neutralize any `<` so a value can
  // never break out of the <script> element.
  const harden = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
  const articleLd = harden({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description: desc,
    image: { '@type': 'ImageObject', url: img, width: 1200, height: 630 },
    datePublished: m.generatedAt ?? undefined,
    dateModified: m.updatedAt ?? m.generatedAt ?? undefined,
    articleSection: m.category,
    articleBody: bodyText || undefined,
    wordCount: wordCount || undefined,
    keywords: [m.category, 'prediction markets', m.favored].filter(Boolean).join(', '),
    inLanguage: 'en',
    isAccessibleForFree: true,
    url,
    mainEntityOfPage: url,
    // The original reporting this briefing is based on. Typed CreativeWork (not
    // NewsArticle) — these are provenance references, not articles we publish, so
    // they shouldn't be validated for the image/author an Article expects.
    isBasedOn: m.sources.length
      ? m.sources.slice(0, 6).map((s) => ({
          '@type': 'CreativeWork',
          url: s.url,
          ...(s.title ? { name: s.title } : {}),
          publisher: { '@type': 'Organization', name: s.domain },
        }))
      : undefined,
    // A named human editor (accountable for oversight) — the E-E-A-T signal
    // Google weights for news; the AI authorship stays disclosed on-page.
    author: { '@type': 'Person', name: 'Samuel Jo', url: `${SITE}/about`, jobTitle: 'Editor' },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'Crowdtells',
      url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png`, width: 512, height: 512 },
    },
  });
  const breadcrumbLd = harden({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Crowdtells', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: m.category, item: topicUrl(m.category) },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  });

  const cvcVerdict =
    m.crowdVsCoverage === 'ahead'
      ? 'The market is more confident than the current reporting.'
      : m.crowdVsCoverage === 'contested'
        ? 'The coverage disputes this.'
        : m.crowdVsCoverage === 'aligned'
          ? 'The reporting broadly agrees.'
          : '';

  // Page-specific FAQ (real briefings only) — powers the answer box, the
  // FAQPage rich result, and AI-answer-engine (AI Overviews / ChatGPT) citation.
  // Every Q&A is also rendered visibly below, so the structured data matches the
  // page (Google's FAQ policy). Answers are derived from real per-story fields,
  // never boilerplate repeated verbatim across pages.
  const faq: { q: string; a: string }[] = [];
  if (hasBriefing(m)) {
    faq.push({ q: m.title, a: [standfirst(m), cvcVerdict].filter(Boolean).join(' ') });
    const syn = m.synthesis;
    if (syn && syn.consensus.length && m.sources.length >= MIN_CONSENSUS_SOURCES)
      faq.push({ q: 'What do the sources agree on?', a: syn.consensus.join(' ') });
    if (syn && syn.disputed.length)
      faq.push({ q: 'Where do the sources disagree?', a: syn.disputed.join(' ') });
    if (m.description)
      faq.push({
        q: 'When does this market resolve?',
        a: `This market resolves on: ${m.description}`,
      });
    faq.push({
      q: 'How are these odds set?',
      a: 'Prediction-market odds are prices set by people trading real money on the outcome, so the price reads as the crowd’s implied probability — not a guarantee or financial advice.',
    });
  }
  const faqLd =
    faq.length >= 2
      ? harden({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        })
      : '';
  const faqSection =
    faq.length >= 2
      ? `<section class="faq">
        <h2>Frequently asked questions</h2>
        ${faq
          .map(
            (f) =>
              `<div class="faq-item"><h3 class="faq-q">${xml(f.q)}</h3><p class="faq-a">${xml(f.a)}</p></div>`,
          )
          .join('\n        ')}
      </section>`
      : '';

  const flags: string[] = [];
  if (m.crowdVsCoverage === 'ahead') flags.push('Crowd ahead of press');
  if (m.crowdVsCoverage === 'contested') flags.push('Coverage disputes this');

  const extraMeta = [
    `<meta property="article:section" content="${xml(m.category)}" />`,
    `<meta property="article:author" content="Samuel Jo" />`,
    m.generatedAt
      ? `<meta property="article:published_time" content="${xml(m.generatedAt)}" />`
      : '',
    m.updatedAt ? `<meta property="article:modified_time" content="${xml(m.updatedAt)}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  const head = pageHead({
    title,
    desc,
    canonical: url,
    ogType: 'article',
    jsonld: [articleLd, breadcrumbLd, faqLd].filter(Boolean),
    extraMeta,
    image: img,
    noindex: !indexable(m),
    author: hasBriefing(m) ? 'Samuel Jo' : undefined,
    // Share links carry #app (see src/lib/social.ts); bounce a human who taps one
    // straight into the live SPA article. Crawlers/organic (no hash) never fire it,
    // so the page stays a full, indexable SEO landing page.
    headScript: `<script>if(location.hash==='#app')location.replace(${JSON.stringify(app)})</script>`,
  });

  return `<!doctype html>
<html lang="en">
  ${head}
  <body>
    ${siteHeader(`<a href="${catHref}">${xml(m.category)}</a>`)}

    <main class="wrap">
      <article>
        <p class="eyebrow">
          <a class="cat" href="${catHref}">${xml(m.category)}</a>
          <span aria-hidden="true">·</span>
          <span>${xml(sourceName(m.source))}</span>
          ${published ? `<span aria-hidden="true">·</span><span>${xml(published)}</span>` : ''}
          ${hasBriefing(m) ? `<span aria-hidden="true">·</span><span class="byline">Edited by <a href="/about">Samuel Jo</a></span>` : ''}
          ${flags.map((f) => `<span class="flag">${xml(f)}</span>`).join('\n          ')}
        </p>
        <h1>${xml(title)}</h1>
        ${recapBlock(m)}
        ${
          hasBriefing(m)
            ? `<section class="answer" aria-label="The short answer">
          <p class="q">${xml(m.title)}</p>
          <p class="a"><b>${xml(standfirst(m))}</b>${cvcVerdict ? ` ${xml(cvcVerdict)}` : ''}</p>
        </section>`
            : `<p class="lead">${xml(standfirst(m))}</p>`
        }
        ${analysis ? paragraphs(analysis) : ''}
        ${
          m.breaking && m.breaking.length
            ? `<aside class="developing"><span class="dev-flag">Developing</span><ul>${m.breaking
                .map((bk) => {
                  const href = safeHref(bk.url);
                  const head = href
                    ? `<a href="${xml(href)}" target="_blank" rel="noopener nofollow">${xml(bk.title)}</a>`
                    : xml(bk.title);
                  return `<li>${head} <span class="dev-meta">${bk.outlets.length} outlet${bk.outlets.length === 1 ? '' : 's'}</span></li>`;
                })
                .join('')}</ul></aside>`
            : ''
        }
        ${
          lens
            ? `<aside class="lens"><span class="fig" aria-hidden="true">${xml(formatPct(m.oddsPct))}</span><span class="read"><span class="k">Market lens</span><p>${xml(lens)}</p></span></aside>`
            : ''
        }
        ${background ? `<h2>Background</h2>\n        ${paragraphs(background)}` : ''}
        ${
          m.precedents && m.precedents.length
            ? `<h2>The precedent</h2>\n        <ul class="precedents">${m.precedents
                .map((f) => `<li>${xml(f)}</li>`)
                .join('')}</ul>\n        <p class="precedent-note">Context compiled by Crowdtells from the public record — verify before relying on it.</p>`
            : ''
        }
        ${synthBlock(m.synthesis, m.sources.length)}
        ${take ? `<aside class="take"><span class="k">Our take</span><p>${xml(take)}</p></aside>` : ''}
        ${whatToWatch ? `<h2>What to watch</h2>\n        ${paragraphs(whatToWatch)}` : ''}
        ${numbersBlock(m)}
        <a class="cta" href="${xml(app)}">See live odds &amp; discussion →</a>
        ${sourcesBlock(m.sources)}
        ${faqSection}
        <p class="disclosure">AI-written briefing grounded in ${m.sources.length || 'cited'} source${m.sources.length === 1 ? '' : 's'} and the live market, edited by <a href="/about">Samuel Jo</a>. Odds are crowd probabilities, not advice — <a href="/about">how this works</a>.</p>
        ${relatedBlock(related, m.category)}
      </article>
    </main>

    ${siteFooter(
      `Odds and figures as of ${published || 'the latest run'}; open the live feed for current prices.`,
    )}
  </body>
</html>
`;
}

/** The crowd's headline position in a few words, e.g. "68% yes" / "Trump 54%". */
export function crowdShort(m: Market): string {
  const fav = m.favored ?? '';
  const isYesNo = fav.toLowerCase() === 'yes' || fav.toLowerCase() === 'no';
  return isYesNo
    ? `${formatPct(m.oddsPct)} ${fav.toLowerCase()}`
    : `${fav} ${formatPct(m.oddsPct)}`.trim();
}

/**
 * A category hub: an indexable landing page that lists every live story in a
 * category with a real briefing excerpt (substantial content, not a thin link
 * list), the section-level target for "<topic> prediction markets" searches and
 * the middle of the internal link graph (Home → Topic → Article).
 */
export function topicPage(
  category: string,
  stories: Market[],
  otherCategories: string[] = [],
): string {
  const url = topicUrl(category);
  const n = stories.length;
  const noun = n === 1 ? 'market' : 'markets';
  // Hub freshness = the newest briefing it lists, so Search sees a stable URL updating.
  const lastmod = stories
    .map((s) => s.updatedAt)
    .filter(Boolean)
    .sort()
    .slice(-1)[0];
  const title = `${category} news & prediction markets`;
  const desc = clip(
    `The ${category} stories the market is watching now. Crowdtells reads Polymarket and Kalshi to surface which ${category} questions matter, then briefs each with real, cross-source reporting — the latest moves and where the money runs ahead of the coverage.`,
  );
  const lead = `The ${category} stories the crowd is watching most. Crowdtells reads ${n} live ${category} ${noun} on Polymarket and Kalshi as a signal of what matters, then briefs each one with real, cross-source reporting — what's moving now, and where the odds run ahead of the headlines.`;

  const items = stories
    .map((s) => {
      const meta = [
        fmtDate(s.generatedAt),
        sourceName(s.source),
        crowdShort(s),
        s.sources.length ? `${s.sources.length} sources` : '',
      ].filter(Boolean);
      const excerpt = clip(hydrateBriefing(s.analysis, s) || s.hook || s.title, 180);
      return `<li class="hub-item">
          <h2><a href="${storyUrl(s.id)}">${xml(s.hook || s.title)}</a></h2>
          <p class="meta">${meta.map((x) => `<span>${xml(x)}</span>`).join('<span aria-hidden="true">·</span>')}</p>
          <p class="excerpt">${xml(excerpt)}</p>
        </li>`;
    })
    .join('\n        ');

  const topics = otherCategories.length
    ? `<nav class="topics" aria-label="Other topics">Browse other topics: ${otherCategories
        .map((c) => `<a href="/topic/${topicSlug(c)}">${xml(c)}</a>`)
        .join('')}</nav>`
    : '';

  const harden = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
  const collectionLd = harden({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${category} — Crowdtells`,
    description: desc,
    url,
    inLanguage: 'en',
    dateModified: lastmod,
    isPartOf: { '@type': 'WebSite', name: 'Crowdtells', url: `${SITE}/` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: stories.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: storyUrl(s.id),
        name: s.hook || s.title,
      })),
    },
  });
  const breadcrumbLd = harden({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Crowdtells', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: category, item: url },
    ],
  });

  // Answer box + data-driven FAQ (AEO / FAQ rich result). Every answer is derived
  // from the live data this hub already shows, so the structured data can't drift
  // from the visible page (Google's FAQ policy) or go stale as boilerplate would.
  const top = stories[0];
  const answerBox = top
    ? `<section class="answer" aria-label="The short answer">
        <p class="q">What are people predicting in ${xml(category)} right now?</p>
        <p class="a">The biggest ${xml(category)} story the crowd is watching is <b>${xml(top.hook || top.title)}</b> — ${xml(standfirst(top))} Crowdtells tracks ${n} live ${xml(category)} ${noun} on Polymarket and Kalshi.</p>
      </section>`
    : '';
  const faq: { q: string; a: string }[] = [];
  if (top) {
    faq.push({
      q: `What are the top ${category} prediction markets right now?`,
      a: stories
        .slice(0, 3)
        .map((s) => `${s.hook || s.title} (${crowdShort(s)})`)
        .join('; '),
    });
    faq.push({ q: `What is the crowd pricing in ${category} right now?`, a: standfirst(top) });
    faq.push({
      q: `Where do ${category} prediction markets trade?`,
      a: `Crowdtells tracks ${category} markets on Polymarket and Kalshi — the two largest prediction-market platforms — and briefs each with cross-source reporting. The odds are crowd-implied probabilities, not financial advice.`,
    });
  }
  const faqLd =
    faq.length >= 2
      ? harden({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        })
      : '';
  const faqSection =
    faq.length >= 2
      ? `<section class="faq">
        <h2>Frequently asked questions</h2>
        ${faq
          .map(
            (f) =>
              `<div class="faq-item"><h3 class="faq-q">${xml(f.q)}</h3><p class="faq-a">${xml(f.a)}</p></div>`,
          )
          .join('\n        ')}
      </section>`
      : '';

  const head = pageHead({
    title,
    desc,
    canonical: url,
    ogType: 'website',
    jsonld: [collectionLd, breadcrumbLd, faqLd].filter(Boolean),
  });

  return `<!doctype html>
<html lang="en">
  ${head}
  <body>
    ${siteHeader('<a href="/">← Live feed</a>')}

    <main class="wrap">
      <p class="eyebrow"><span class="cat">Topic</span></p>
      <h1>${xml(category)}</h1>
      <p class="lead">${xml(lead)}</p>
      ${answerBox}
      <ul class="hub-list">
        ${items}
      </ul>
      <a class="cta" href="/?c=${encodeURIComponent(category)}">See the live ${xml(category)} feed →</a>
      ${faqSection}
      ${topics}
    </main>

    ${siteFooter('Live news coverage, refreshed continuously. Open the feed for current odds.')}
  </body>
</html>
`;
}

/** The master sitemap: home, every category hub, every briefed article page,
 * and the static legal pages. (sitemap-news.xml covers the rolling 48h window.) */
export function masterSitemap(
  feed: Feed,
  hubCategories: string[],
  extraUrls: { loc: string; priority: string; changefreq?: string; lastmod?: string }[] = [],
): string {
  const entry = (loc: string, priority: string, lastmod?: string, changefreq = 'hourly') =>
    `  <url>\n    <loc>${loc}</loc>${
      lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
    }\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

  // Hub freshness = the newest briefing the hub lists, so Search sees the hubs
  // updating even though their URL is stable.
  const hubLastmod = new Map<string, string>();
  for (const m of feed.markets) {
    if (m.status !== 'active' || !hasBriefing(m)) continue;
    const cur = hubLastmod.get(m.category);
    if (!cur || Date.parse(m.updatedAt) > Date.parse(cur)) hubLastmod.set(m.category, m.updatedAt);
  }

  const urls: string[] = [entry(`${SITE}/`, '1.0', feed.generatedAt)];
  for (const c of hubCategories) urls.push(entry(topicUrl(c), '0.8', hubLastmod.get(c)));
  for (const m of feed.markets) {
    if (!indexable(m)) continue;
    urls.push(entry(storyUrl(m.id), m.status === 'active' ? '0.7' : '0.5', m.updatedAt));
  }
  for (const u of extraUrls)
    urls.push(entry(u.loc, u.priority, u.lastmod, u.changefreq ?? 'weekly'));
  urls.push(entry(`${SITE}/about`, '0.4', undefined, 'monthly'));
  urls.push(entry(`${SITE}/privacy`, '0.3', undefined, 'yearly'));
  urls.push(entry(`${SITE}/terms`, '0.3', undefined, 'yearly'));

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

/** Up to `n` other briefed stories in the same category, most newsworthy first,
 * for the in-page internal-link block. */
function relatedFor(m: Market, byCategory: Map<string, Market[]>, n = 4): Market[] {
  return (byCategory.get(m.category) ?? []).filter((r) => r.id !== m.id).slice(0, n);
}

/** Write the syndication + SEO surface next to the published feed: feed.xml
 * (RSS), sitemap-news.xml (rolling 48h), the master sitemap.xml, /topic/<slug>
 * category hubs, and /s/<slug>.html article pages for every briefed story.
 * `ogSlugs` is the set of story slugs that got a per-story OG image (rendered
 * upstream); those pages point og:image at /og/<slug>.png, the rest at /og.png. */
export function writeSyndication(
  feed: Feed,
  config: Config,
  nowMs: number,
  ogSlugs: ReadonlySet<string> = new Set(),
): void {
  const dir = dirname(config.feedPath);
  writeFileSync(join(dir, 'feed.xml'), rss(feed));
  writeFileSync(join(dir, 'sitemap-news.xml'), newsSitemap(feed, nowMs, ogSlugs));
  // Slim embed feed for the third-party /embed.js widget (CDN-cacheable, tiny).
  writeFileSync(join(dir, 'embed.json'), JSON.stringify(embedFeed(feed)));
  // 301 the pre-canonicalization /topic slugs (e.g. /topic/soccer → /topic/sports) so
  // indexed category-hub URLs never 404 after the taxonomy collapse. Derived from the
  // canonical map, so it stays in sync automatically.
  writeFileSync(join(dir, '_redirects'), `${topicRedirects(topicSlug).join('\n')}\n`);

  // Index briefed active stories by category (most newsworthy first) — powers
  // both the in-article "More on Crowdtells" links and the category hubs.
  const byCategory = new Map<string, Market[]>();
  for (const m of [...feed.markets].sort((a, b) => b.score - a.score)) {
    if (m.status !== 'active' || !hasBriefing(m)) continue;
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }

  // Category hubs — only for categories with enough stories to be a substantial
  // page (no thin one-item hubs). Alphabetical for a stable cross-link nav.
  const HUB_MIN = 2;
  const hubCategories = [...byCategory.entries()]
    .filter(([, list]) => list.length >= HUB_MIN)
    .map(([c]) => c)
    .sort((a, b) => a.localeCompare(b));

  const topicDir = join(dir, 'topic');
  mkdirSync(topicDir, { recursive: true });
  const seenTopics = new Map<string, string>();
  for (const c of hubCategories) {
    const slug = topicSlug(c);
    const prev = seenTopics.get(slug);
    if (prev && prev !== c)
      console.warn(`  ! topic slug collision: "${prev}" & "${c}" → ${slug}.html`);
    seenTopics.set(slug, c);
    const others = hubCategories.filter((x) => x !== c);
    writeFileSync(join(topicDir, `${slug}.html`), topicPage(c, byCategory.get(c) ?? [], others));
  }

  // Evergreen guides, durable event hubs, and the Mispriced franchise — written
  // through the shared template; returns their sitemap entries for the master map.
  const extraUrls = writeEvergreen(feed, dir, hubCategories);

  writeFileSync(join(dir, 'sitemap.xml'), masterSitemap(feed, hubCategories, extraUrls));

  // Article pages for every briefed story (active or resolved).
  const pagesDir = join(dir, 's');
  mkdirSync(pagesDir, { recursive: true });
  const seenSlugs = new Map<string, string>();
  for (const m of feed.markets) {
    if (!m.generatedAt) continue; // only stories with a real briefing
    const slug = storySlug(m.id);
    const prev = seenSlugs.get(slug);
    if (prev && prev !== m.id) {
      // Two distinct ids slugged the same — the later write would clobber the
      // earlier story's article page. Surface it loudly rather than fail silently.
      console.warn(`  ! article slug collision: "${prev}" & "${m.id}" → ${slug}.html`);
    }
    seenSlugs.set(slug, m.id);
    const ogUrl = ogSlugs.has(slug) ? `${SITE}/og/${slug}.png` : undefined;
    writeFileSync(join(pagesDir, `${slug}.html`), storyPage(m, relatedFor(m, byCategory), ogUrl));
  }
}
