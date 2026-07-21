/**
 * Evergreen, topical-authority pages that sit alongside the per-story briefings:
 *   - /learn/<slug>.html  — hand-authored explainers ("how prediction markets work")
 *   - /event/<slug>.html  — durable event hubs ("Fed rate decision odds") that embed
 *                            the live matching markets when any are trading
 *   - /learn.html         — the guides index
 *   - /mispriced.html     — the "Odds vs. Headlines" franchise: stories where the
 *                            market diverges from the coverage (only Crowdtells can build this)
 *
 * All reuse the shared static-page template from syndication.ts (pageHead /
 * siteHeader / siteFooter / PAGE_CSS), so they inherit the brand themes, fonts,
 * zero-JS payload, and mobile layout for free. Content lives in
 * scripts/lib/content/evergreen.ts (source of truth); this file only renders it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Feed, ImageRef, Market } from '../../src/lib/types';
import { topicSlug } from '../../src/lib/topicPath';
import { hasBriefing } from '../../src/lib/feed';
import { localizeImage } from '../../src/lib/imageUrl';
import { hydrateBriefing } from '../../src/lib/hydrate';
import {
  clip,
  crowdShort,
  fmtDate,
  pageHead,
  siteFooter,
  siteHeader,
  sourceName,
  storyUrl,
  xml,
} from './syndication';
import { EXPLAINERS, EVENTS, type EvergreenFaq, type EvergreenPage } from './content/evergreen';

// Defined locally rather than imported from syndication: syndication imports
// writeEvergreen from this module (a cycle), and this module reads SITE eagerly
// at init (authorLd, publisherLd, ALL_GUIDES). Importing it would hit syndication's
// SITE before initialization (TDZ). The imported helpers above are only *called*
// at render time, so the cycle is otherwise benign.
const SITE = 'https://crowdtells.com';

const explainerUrl = (slug: string) => `${SITE}/learn/${slug}`;
const eventUrl = (slug: string) => `${SITE}/event/${slug}`;

/** Conservative keyword/category matchers that bind a durable event hub to the
 * live markets currently trading on its topic. Kept strict to avoid surfacing an
 * unrelated market on an evergreen page. */
const EVENT_MATCH: Record<string, { keywords: string[]; categories?: string[] }> = {
  'fed-rate-decision-odds': {
    keywords: ['fed', 'fomc', 'federal reserve', 'interest rate', 'rate cut', 'rate hike'],
    categories: ['Economics', 'Finance'],
  },
  'us-presidential-election-2028-odds': {
    keywords: ['2028'],
    categories: ['Politics', 'World Elections', 'US Election'],
  },
  'us-recession-odds': { keywords: ['recession'], categories: ['Economics', 'Finance'] },
  'world-cup-2026-odds': { keywords: ['world cup'] },
  'super-bowl-odds': { keywords: ['super bowl'] },
  'nba-finals-odds': { keywords: ['nba'] },
  'bitcoin-price-odds': { keywords: ['bitcoin', 'btc'], categories: ['Crypto'] },
  'oscars-odds': { keywords: ['oscar', 'best picture', 'academy award'] },
  'midterm-elections-2026-odds': {
    keywords: [
      'midterm',
      'midterms',
      'balance of power',
      'control of congress',
      'control of the house',
      'control of the senate',
      'house majority',
      'senate majority',
    ],
    categories: ['Politics', 'US Election', 'World Elections'],
  },
  'government-shutdown-odds': {
    keywords: [
      'shutdown',
      'government shutdown',
      'continuing resolution',
      'funding lapse',
      'appropriations',
    ],
    categories: ['Politics', 'Economics'],
  },
  'premier-league-odds': {
    keywords: ['premier league', 'epl', 'relegation'],
    categories: ['Soccer', 'Sports'],
  },
  'ai-agi-odds': {
    keywords: [
      'artificial general intelligence',
      'superintelligence',
      'arc-agi',
      'openai',
      'anthropic',
      'deepmind',
    ],
    categories: ['Science and Technology'],
  },
  'champions-league-odds': {
    keywords: ['champions league', 'ucl', 'uefa champions league'],
    categories: ['Soccer', 'Sports'],
  },
  'presidential-approval-odds': {
    keywords: ['approval rating', 'presidential approval', 'job approval', 'net approval'],
    categories: ['Politics', 'US Election'],
  },
  'stock-market-crash-odds': {
    keywords: [
      'stock market',
      's&p 500',
      'sp 500',
      'nasdaq',
      'market crash',
      'correction',
      'bear market',
    ],
    categories: ['Finance', 'Economics'],
  },
  'next-fed-chair-odds': {
    keywords: ['fed chair', 'federal reserve chair', 'fed chairman'],
    categories: ['Economics', 'Finance', 'Politics'],
  },
  'inflation-odds': {
    keywords: ['inflation', 'cpi', 'consumer price index', 'pce'],
    categories: ['Economics', 'Finance'],
  },
};

interface SitemapEntry {
  loc: string;
  priority: string;
  changefreq?: string;
  lastmod?: string;
}

const harden = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

const breadcrumb = (items: { name: string; url?: string }[]) =>
  harden({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: it.url } : {}),
    })),
  });

const faqLd = (faq: EvergreenFaq[]) =>
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

const faqHtml = (faq: EvergreenFaq[]) =>
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

// Evergreen bodies — and only these — may carry inline links written as
// `[label](https://…)`. The shared paragraphs() in syndication.ts stays
// escape-only because it also renders untrusted, LLM-written market briefings;
// this variant is used solely for hand-authored explainer/event content. Every
// character outside a well-formed https link is escaped exactly as paragraphs()
// would, so link-free bodies render byte-for-byte identically.
const EVERGREEN_LINK = /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
// `sponsored` marks outbound links rel="sponsored" (Google's requirement for
// paid/advertorial links); editorial pages stay dofollow (rel="noopener").
const evergreenInline = (p: string, sponsored = false): string => {
  const rel = sponsored ? 'sponsored noopener' : 'noopener';
  let out = '';
  let last = 0;
  for (const m of p.matchAll(EVERGREEN_LINK)) {
    const i = m.index ?? 0;
    out += xml(p.slice(last, i));
    out += `<a href="${xml(m[2])}" target="_blank" rel="${rel}">${xml(m[1])}</a>`;
    last = i + m[0].length;
  }
  return out + xml(p.slice(last));
};
const evergreenBody = (text: string, sponsored = false): string =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${evergreenInline(p, sponsored)}</p>`)
    .join('\n        ');

const sectionsHtml = (sections: EvergreenPage['sections'], sponsored = false) =>
  sections
    .map((s) => `<h2>${xml(s.heading)}</h2>\n        ${evergreenBody(s.body, sponsored)}`)
    .join('\n        ');

const authorLd = {
  '@type': 'Person',
  name: 'Samuel Jo',
  url: `${SITE}/about`,
  jobTitle: 'Editor',
};
const publisherLd = {
  '@type': 'Organization',
  '@id': `${SITE}/#org`,
  name: 'Crowdtells',
  url: `${SITE}/`,
  logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png`, width: 512, height: 512 },
};
// Stable first-publication date for the evergreen library (the explainer/event
// program launch), so Article schema carries datePublished alongside the
// per-run dateModified freshness signal. Bump only on a genuine re-authoring.
const PUBLISHED = '2026-06-17';

/** A combined list of every guide, for the "more guides" cross-link nav.
 * Sponsored advertorials are excluded so editorial pages never pass them a
 * dofollow "guide" link or list them as editorial content. */
const ALL_GUIDES = [
  ...EXPLAINERS.filter((g) => !g.sponsored).map((g) => ({
    slug: g.slug,
    h1: g.h1,
    url: explainerUrl(g.slug),
    section: g.section,
  })),
  ...EVENTS.map((g) => ({ slug: g.slug, h1: g.h1, url: eventUrl(g.slug), section: g.section })),
];

/** "More guides" links stay within the same topical cluster (markets vs NYC), so
 * cross-links reinforce topical authority instead of scattering it. */
const guidesNav = (currentSlug: string, section?: 'nyc') => {
  const others = ALL_GUIDES.filter((g) => g.slug !== currentSlug && g.section === section).slice(0, 6);
  return others.length
    ? `<nav class="guides" aria-label="More guides">More guides: ${others
        .map((g) => `<a href="${g.url}">${xml(g.h1)}</a>`)
        .join('')}</nav>`
    : '';
};

/** Link only to topic hubs that actually exist this run (≥2 briefed stories), so
 * an evergreen page never points at a 404. */
const topicsNav = (cats: string[] | undefined, hubSet: Set<string>) => {
  const valid = (cats ?? []).filter((c) => hubSet.has(c));
  return valid.length
    ? `<nav class="topics" aria-label="Related topics">Live coverage: ${valid
        .map((c) => `<a href="/topic/${topicSlug(c)}">${xml(c)}</a>`)
        .join('')}</nav>`
    : '';
};

/** A hub-style list of live markets (mirrors the topic-hub item markup). */
const marketListHtml = (markets: Market[]) =>
  markets
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

function matchMarkets(slug: string, feed: Feed): Market[] {
  const cfg = EVENT_MATCH[slug];
  if (!cfg) return [];
  const cats = cfg.categories ? new Set(cfg.categories.map((c) => c.toLowerCase())) : null;
  return feed.markets
    .filter((m) => m.status === 'active' && hasBriefing(m))
    .filter((m) => {
      const t = m.title.toLowerCase();
      if (!cfg.keywords.some((k) => t.includes(k))) return false;
      if (cats && !cats.has(m.category.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

const docShell = (head: string, body: string) => `<!doctype html>
<html lang="en">
  ${head}
  <body>
${body}
  </body>
</html>
`;

export function explainerPage(c: EvergreenPage, lastmod: string, hubSet: Set<string>): string {
  const url = explainerUrl(c.slug);
  const desc = clip(c.metaDescription || c.intro, 158);
  const articleLd = harden({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: c.h1,
    description: desc,
    url,
    mainEntityOfPage: url,
    inLanguage: 'en',
    isAccessibleForFree: true,
    datePublished: PUBLISHED,
    dateModified: lastmod,
    // A labeled advertorial is not the editor's reporting — attribute it to the
    // publisher org, never to the Person byline, so schema doesn't misrepresent.
    author: c.sponsored ? publisherLd : authorLd,
    publisher: publisherLd,
    image: [`${SITE}/og.png`],
  });
  const crumbLd = breadcrumb([
    { name: 'Crowdtells', url: `${SITE}/` },
    { name: 'Guides', url: `${SITE}/learn` },
    { name: c.h1 },
  ]);
  const head = pageHead({
    title: c.title,
    desc,
    canonical: url,
    ogType: 'article',
    jsonld: [articleLd, crumbLd, faqLd(c.faq)].filter(Boolean),
    author: c.sponsored ? 'RegWatch NYC (Sponsored)' : 'Samuel Jo',
  });
  const eyebrow = c.sponsored
    ? '<p class="eyebrow"><span class="flag-sponsored">Sponsored</span></p>'
    : '<p class="eyebrow"><a class="cat" href="/learn">Guide</a></p>';
  const disclosure = c.sponsored
    ? `\n        <p class="sponsor-note">Sponsored content, published in partnership with RegWatch NYC. It was produced for the advertiser and did not involve Crowdtells' newsroom.</p>`
    : '';
  const footerNote = c.sponsored
    ? 'Sponsored content from Crowdtells — produced for the advertiser, not newsroom reporting, and not legal or financial advice.'
    : 'Evergreen guide from Crowdtells — news, told through the crowd, not financial advice.';
  const body = `    ${siteHeader('<a href="/learn">← Guides</a>')}

    <main class="wrap">
      <article>
        ${eyebrow}
        <h1>${xml(c.h1)}</h1>
        <p class="lead">${xml(c.intro)}</p>${disclosure}
        ${sectionsHtml(c.sections, c.sponsored)}
        ${faqHtml(c.faq)}
        ${topicsNav(c.relatedTopics, hubSet)}
        <a class="cta" href="/">See the live news feed →</a>
        ${guidesNav(c.slug, c.section)}
      </article>
    </main>

    ${siteFooter(footerNote)}`;
  return docShell(head, body);
}

export function eventPage(
  c: EvergreenPage,
  live: Market[],
  lastmod: string,
  hubSet: Set<string>,
): string {
  const url = eventUrl(c.slug);
  const desc = clip(c.metaDescription || c.intro, 158);
  const articleLd = harden({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: c.h1,
    description: desc,
    url,
    mainEntityOfPage: url,
    inLanguage: 'en',
    isAccessibleForFree: true,
    datePublished: PUBLISHED,
    dateModified: lastmod,
    author: authorLd,
    publisher: publisherLd,
    image: [`${SITE}/og.png`],
  });
  const crumbLd = breadcrumb([
    { name: 'Crowdtells', url: `${SITE}/` },
    { name: 'Guides', url: `${SITE}/learn` },
    { name: c.h1 },
  ]);
  const jsonld = [articleLd, crumbLd, faqLd(c.faq)];
  if (live.length)
    jsonld.push(
      harden({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: live.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: storyUrl(s.id),
          name: s.hook || s.title,
        })),
      }),
    );
  const head = pageHead({
    title: c.title,
    desc,
    canonical: url,
    ogType: 'article',
    jsonld: jsonld.filter(Boolean),
    author: 'Samuel Jo',
  });
  const liveBlock = live.length
    ? `<h2>Live markets &amp; odds</h2>
        <ul class="hub-list">
        ${marketListHtml(live)}
        </ul>`
    : `<p class="live-empty">No live markets on this topic are trading right now — <a href="/">browse the live feed</a> for what the crowd is pricing today.</p>`;
  const body = `    ${siteHeader('<a href="/learn">← Guides</a>')}

    <main class="wrap">
      <article>
        <p class="eyebrow"><a class="cat" href="/learn">Event hub</a></p>
        <h1>${xml(c.h1)}</h1>
        <p class="lead">${xml(c.intro)}</p>
        ${liveBlock}
        ${sectionsHtml(c.sections)}
        ${faqHtml(c.faq)}
        ${topicsNav(c.relatedTopics, hubSet)}
        <a class="cta" href="/">See the live news feed →</a>
        ${guidesNav(c.slug, c.section)}
      </article>
    </main>

    ${siteFooter('Live odds embed automatically when markets are trading. Not financial advice.')}`;
  return docShell(head, body);
}

export function guidesIndexPage(lastmod: string): string {
  const url = `${SITE}/learn`;
  const title = 'Prediction-market guides & event hubs';
  const desc = clip(
    'Plain-English guides to how prediction markets work, how Polymarket and Kalshi compare, how to read the odds, and durable hubs for the events the crowd trades.',
  );
  const list = (pages: EvergreenPage[], urlOf: (s: string) => string) =>
    pages
      .map(
        (p) => `<li class="hub-item">
          <h2><a href="${urlOf(p.slug)}">${xml(p.h1)}</a></h2>
          <p class="excerpt">${xml(clip(p.metaDescription || p.intro, 180))}</p>
        </li>`,
      )
      .join('\n        ');
  const collectionLd = harden({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Crowdtells Guides',
    description: desc,
    url,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'Crowdtells', url: `${SITE}/` },
    dateModified: lastmod,
  });
  const crumbLd = breadcrumb([{ name: 'Crowdtells', url: `${SITE}/` }, { name: 'Guides' }]);
  const head = pageHead({
    title,
    desc,
    canonical: url,
    ogType: 'website',
    jsonld: [collectionLd, crumbLd],
  });
  const body = `    ${siteHeader('<a href="/">← Live feed</a>')}

    <main class="wrap">
      <p class="eyebrow"><span class="cat">Guides</span></p>
      <h1>Prediction-market guides</h1>
      <p class="lead">How prediction markets work, how the platforms compare, how to read the odds — plus durable hubs for the events the crowd trades, with live odds embedded.</p>
      ${EXPLAINERS.some((e) => !e.sponsored && e.section !== 'nyc') ? `<h2>Explainers</h2>\n      <ul class="hub-list">\n        ${list(EXPLAINERS.filter((e) => !e.sponsored && e.section !== 'nyc'), explainerUrl.bind(null))}\n      </ul>` : ''}
      ${EVENTS.length ? `<h2>Event hubs</h2>\n      <ul class="hub-list">\n        ${list(EVENTS, eventUrl.bind(null))}\n      </ul>` : ''}
      ${EXPLAINERS.some((e) => e.section === 'nyc' && !e.sponsored) ? `<p class="lead">Covering New York City? See the <a href="/nyc">NYC property &amp; compliance hub</a>.</p>` : ''}
      <a class="cta" href="/mispriced">See where the crowd and the coverage disagree →</a>
    </main>

    ${siteFooter('Evergreen guides from Crowdtells — news, told through the crowd.')}`;
  return docShell(head, body);
}

/** Dedicated topical hub for the NYC property/compliance cluster: its own landing
 * page that concentrates internal links + topical authority, separate from the
 * prediction-markets /learn index. */
export function nycHubPage(lastmod: string): string {
  const url = `${SITE}/nyc`;
  const title = 'NYC property records, violations & compliance';
  const desc = clip(
    'Guides and data on the New York City building record — DOB and HPD violations, Local Law 97, facade (FISP) rules, permits, liens, and title — built from public sources.',
  );
  const pages = EXPLAINERS.filter((e) => e.section === 'nyc' && !e.sponsored);
  const items = pages
    .map(
      (p) => `<li class="hub-item">
          <h2><a href="${explainerUrl(p.slug)}">${xml(p.h1)}</a></h2>
          <p class="excerpt">${xml(clip(p.metaDescription || p.intro, 180))}</p>
        </li>`,
    )
    .join('\n        ');
  const collectionLd = harden({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'NYC property & compliance',
    description: desc,
    url,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'Crowdtells', url: `${SITE}/` },
    dateModified: lastmod,
  });
  const crumbLd = breadcrumb([{ name: 'Crowdtells', url: `${SITE}/` }, { name: 'NYC' }]);
  const head = pageHead({
    title,
    desc,
    canonical: url,
    ogType: 'website',
    jsonld: [collectionLd, crumbLd],
  });
  const body = `    ${siteHeader('<a href="/">← Live feed</a>')}

    <main class="wrap">
      <p class="eyebrow"><span class="cat">NYC</span></p>
      <h1>NYC property records, violations &amp; compliance</h1>
      <p class="lead">Plain-English guides and data on the New York City building record — violations, Local Law 97, facade inspections, permits, liens, and title — built from public records. Not legal advice.</p>
      <ul class="hub-list">
        ${items}
      </ul>
    </main>

    ${siteFooter('NYC coverage from Crowdtells — built from public records, not legal advice.')}`;
  return docShell(head, body);
}

export function mispricedPage(feed: Feed, lastmod: string): string {
  const url = `${SITE}/mispriced`;
  const title = 'Mispriced: where the odds and the headlines disagree';
  const desc = clip(
    'The stories where prediction-market money diverges from how the press is covering it — the crowd running ahead of the reporting, or the coverage disputing what traders believe.',
  );
  const picks = feed.markets
    .filter(
      (m) =>
        m.status === 'active' &&
        hasBriefing(m) &&
        (m.crowdVsCoverage === 'ahead' || m.crowdVsCoverage === 'contested'),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  const collectionLd = harden({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Mispriced — Crowdtells',
    description: desc,
    url,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'Crowdtells', url: `${SITE}/` },
    dateModified: lastmod,
    ...(picks.length
      ? {
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: picks.map((s, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: storyUrl(s.id),
              name: s.hook || s.title,
            })),
          },
        }
      : {}),
  });
  const crumbLd = breadcrumb([{ name: 'Crowdtells', url: `${SITE}/` }, { name: 'Mispriced' }]);
  const head = pageHead({
    title,
    desc,
    canonical: url,
    ogType: 'website',
    jsonld: [collectionLd, crumbLd],
  });
  const listBlock = picks.length
    ? `<ul class="hub-list">
        ${marketListHtml(picks)}
      </ul>`
    : `<p class="live-empty">Right now the crowd and the coverage are broadly aligned across the live feed. Check back — divergences appear when money moves ahead of the headlines.</p>`;
  const body = `    ${siteHeader('<a href="/">← Live feed</a>')}

    <main class="wrap">
      <p class="eyebrow"><span class="cat">Mispriced</span></p>
      <h1>Odds vs. headlines</h1>
      <p class="lead">Prediction markets and the press don't always agree. These are the live stories where the money runs ahead of the reporting, or the coverage disputes what traders believe — the gap is the signal.</p>
      <p>Every story below pairs the crowd's price on Polymarket or Kalshi with a cross-source read of the coverage. "Crowd ahead of press" means traders are more confident than the reporting; "coverage disputes this" means outlets are pushing back on the favored outcome. It updates as the odds and the headlines move.</p>
      ${listBlock}
      <a class="cta" href="/">See the full live feed →</a>
    </main>

    ${siteFooter('Mispriced is updated continuously from the live feed. Not financial advice.')}`;
  return docShell(head, body);
}

// ─────────────────────────────────────────────────────────────────────────────
// /accuracy — the public track record. The append-only resolution log is the one
// asset a news aggregator can't fake: every settled market grades whether the
// crowd's favored side actually won, and (where we briefed it) how confident the
// odds were when we published. This page makes that moat visible to crawlers,
// answer engines, and first-time readers. Honest by construction — sports resolve
// near-certain and inflate a raw hit-rate, so we also break it down by confidence
// bucket (calibration) and by category.
// ─────────────────────────────────────────────────────────────────────────────

export interface CalibrationBucket {
  /** Inclusive low / exclusive high edge of the briefed-confidence band, in %. */
  lo: number;
  hi: number;
  /** Band midpoint — what perfect calibration would predict. */
  predicted: number;
  /** Share that actually resolved in the favored side's favor, or null if empty. */
  actual: number | null;
  n: number;
}

export interface AccuracyStats {
  /** Resolutions with a known crowd-call verdict (calledCorrectly !== null). */
  scored: number;
  hits: number;
  hitRate: number | null;
  /** Resolutions that also carry the odds we briefed (the calibration sample). */
  calibratedN: number;
  buckets: CalibrationBucket[];
  byCategory: { category: string; n: number; hits: number; rate: number }[];
}

/** Aggregate the settled feed into the public accuracy record. Pure. */
export function accuracyStats(markets: Market[]): AccuracyStats {
  const resolved = markets.filter(
    (m) => m.resolvedOutcome != null && typeof m.calledCorrectly === 'boolean',
  );
  const scored = resolved.length;
  const hits = resolved.filter((m) => m.calledCorrectly === true).length;

  // Calibration: bucket by the odds we FIRST published (firstBriefedOddsPct —
  // immutable, never reset by the result rewrite), so the curve reflects our
  // initial honest read, not the near-settlement price. Stories briefed before
  // that field existed are simply absent from the calibration sample.
  const edges = [50, 60, 70, 80, 90, 100];
  const calib = resolved.filter((m) => typeof m.firstBriefedOddsPct === 'number');
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const inBand = calib.filter((m) => {
      const p = m.firstBriefedOddsPct!;
      // top band is inclusive of 100 so a 100% first-briefed odds lands somewhere
      return p >= lo && (hi === 100 ? p <= hi : p < hi);
    });
    const n = inBand.length;
    buckets.push({
      lo,
      hi,
      predicted: (lo + hi) / 2,
      actual: n ? inBand.filter((m) => m.calledCorrectly === true).length / n : null,
      n,
    });
  }

  const catMap = new Map<string, { n: number; hits: number }>();
  for (const m of resolved) {
    const c = m.category || 'Other';
    const e = catMap.get(c) ?? { n: 0, hits: 0 };
    e.n++;
    if (m.calledCorrectly === true) e.hits++;
    catMap.set(c, e);
  }
  const byCategory = [...catMap.entries()]
    .map(([category, e]) => ({ category, n: e.n, hits: e.hits, rate: e.hits / e.n }))
    .sort((a, b) => b.n - a.n);

  return {
    scored,
    hits,
    hitRate: scored ? hits / scored : null,
    calibratedN: calib.length,
    buckets,
    byCategory,
  };
}

const pctStr = (x: number) => `${Math.round(x * 100)}%`;

const usableImg = (u?: string): boolean => !!u && (/^https:\/\//.test(u) || u.startsWith('/'));

/** The subject image to show beside a resolution: the person-photo hero if any,
 * else the first usable figure (logo/flag/portrait), flag-localized to self-host. */
function resolutionThumb(m: Market): ImageRef | null {
  const hero = m.hero ? localizeImage(m.hero) : null;
  if (hero && usableImg(hero.url)) return hero;
  for (const ref of m.images ?? []) {
    const r = localizeImage(ref);
    if (usableImg(r.url)) return r;
  }
  return null;
}

export function accuracyPage(feed: Feed, lastmod: string): string {
  const url = `${SITE}/accuracy`;
  const s = accuracyStats(feed.markets);
  const title = 'Our track record: how often the crowd calls it';
  const desc = clip(
    s.scored
      ? `Crowdtells keeps score on itself. Across ${s.scored} settled prediction markets, the crowd's favored side won ${s.hitRate != null ? pctStr(s.hitRate) : '—'} of the time. See the calibration by confidence and category.`
      : "Crowdtells keeps score on itself: every settled market grades whether the crowd's favored side actually won. The record builds as markets resolve.",
  );

  // Recent resolutions, freshest first, with what we read vs. what happened.
  const recent = feed.markets
    .filter((m) => m.resolvedOutcome != null && typeof m.calledCorrectly === 'boolean')
    .sort((a, b) => Date.parse(b.resolvedAt ?? '') - Date.parse(a.resolvedAt ?? ''))
    .slice(0, 24);

  const collectionLd = harden({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Accuracy — Crowdtells',
    description: desc,
    url,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'Crowdtells', url: `${SITE}/` },
    dateModified: lastmod,
    ...(s.scored
      ? {
          mainEntity: {
            '@type': 'Dataset',
            name: 'Crowdtells resolution track record',
            description: `${s.scored} settled prediction markets graded against the crowd's favored outcome.`,
            variableMeasured: [
              {
                '@type': 'PropertyValue',
                name: 'Crowd hit rate',
                value: s.hitRate != null ? pctStr(s.hitRate) : 'n/a',
              },
              { '@type': 'PropertyValue', name: 'Resolutions scored', value: s.scored },
            ],
          },
        }
      : {}),
  });
  const crumbLd = breadcrumb([{ name: 'Crowdtells', url: `${SITE}/` }, { name: 'Accuracy' }]);
  const head = pageHead({
    title,
    desc,
    canonical: url,
    ogType: 'website',
    jsonld: [collectionLd, crumbLd],
  });

  const headlineBlock = s.scored
    ? `<p class="big-stat"><span class="tnum">${s.hitRate != null ? pctStr(s.hitRate) : '—'}</span></p>
      <p class="lead">Across <strong>${s.scored}</strong> settled prediction markets, the crowd's favored side won <strong>${s.hits}</strong> times — ${s.hitRate != null ? pctStr(s.hitRate) : '—'}. We log every resolution, hits and misses alike; nothing is retracted.</p>`
    : `<p class="lead">No markets have settled into the record yet. As tracked markets resolve, each one is graded here against the crowd's favored outcome — automatically, and permanently.</p>`;

  // Calibration curve — now honest: keyed on firstBriefedOddsPct (the immutable
  // first read, never reset by the result rewrite). Only rendered once enough
  // resolutions carry that field (it accrues from stories briefed after the field
  // shipped), so we never show a thin or misleading curve.
  const calBuckets = s.buckets.filter((b) => b.n > 0);
  const calibrationBlock =
    s.calibratedN >= 12 && calBuckets.length
      ? `<h2>Calibration: when we said it, did it happen?</h2>
      <p>Grouped by the odds we first published (${s.calibratedN} graded). A well-calibrated read means outcomes we put around 70% on happen about 70% of the time.</p>
      <table class="cal-table">
        <thead><tr><th>We first read</th><th>It happened</th><th>Sample</th></tr></thead>
        <tbody>
          ${calBuckets
            .map(
              (b) =>
                `<tr><td>${b.lo}–${b.hi}%</td><td class="tnum">${b.actual != null ? pctStr(b.actual) : '—'}</td><td class="muted">${b.n}</td></tr>`,
            )
            .join('\n          ')}
        </tbody>
      </table>`
      : '';

  const categoryBlock = s.byCategory.length
    ? `<h2>By category</h2>
      <p>Hit rate isn't uniform — sports resolve near-certain, politics and economics are harder. The honest breakdown:</p>
      <ul class="bars">
        ${s.byCategory
          .map(
            (c) =>
              `<li class="bar-row"><span class="bar-label">${xml(c.category)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round(c.rate * 100)}%"></span></span><span class="bar-val"><b class="tnum">${pctStr(c.rate)}</b> <span class="muted">· ${c.n}</span></span></li>`,
          )
          .join('\n        ')}
      </ul>`
    : '';

  const recentBlock = recent.length
    ? `<h2>Recent resolutions</h2>
      <ul class="res-list">
        ${recent
          .map((m) => {
            const called = m.calledCorrectly === true;
            // Prefer the immutable first read; fall back to the (possibly
            // result-overwritten) briefedOddsPct, then to a number-free line.
            const firstOdds = m.firstBriefedOddsPct ?? m.briefedOddsPct;
            const read =
              typeof firstOdds === 'number'
                ? `We read ${xml(m.firstBriefedFavored || m.briefedFavored || m.favored)} at ${Math.round(firstOdds)}%`
                : `Crowd favored ${xml(m.favored)}`;
            const verdict = called ? '✓ called it' : '✗ missed';
            const titleHtml = hasBriefing(m)
              ? `<a href="${storyUrl(m.id)}">${xml(m.hook || m.title)}</a>`
              : xml(m.hook || m.title);
            const thumb = resolutionThumb(m);
            const thumbHtml = thumb
              ? `<img class="rthumb" src="${xml(thumb.url)}" alt="" loading="lazy" decoding="async" width="52" height="52" />`
              : `<span class="rthumb rthumb-blank ${called ? 'hit' : 'miss'}" aria-hidden="true">${called ? '✓' : '✗'}</span>`;
            return `<li class="res-item">
          ${thumbHtml}
          <div class="res-body">
            <h3>${titleHtml}</h3>
            <p class="meta"><span>${read} → <strong>${xml(m.resolvedOutcome ?? '')}</strong></span><span aria-hidden="true">·</span><span class="${called ? 'hit' : 'miss'}">${verdict}</span><span aria-hidden="true">·</span><span>${xml(fmtDate(m.resolvedAt))}</span></p>
          </div>
        </li>`;
          })
          .join('\n        ')}
      </ul>`
    : '';

  const body = `    ${siteHeader('<a href="/">← Live feed</a>')}

    <main class="wrap">
      <p class="eyebrow"><span class="cat">Accuracy</span></p>
      <h1>We keep score on ourselves</h1>
      ${headlineBlock}
      <p>Most news never grades itself. Crowdtells reads prediction markets as a signal of what matters — so we can do the honest thing and check, every time a market settles, whether the crowd's favored side actually won. This page is that ledger. It updates automatically as markets resolve.</p>
      ${calibrationBlock}
      ${categoryBlock}
      ${recentBlock}
      <a class="cta" href="/">See the live feed →</a>
    </main>

    ${siteFooter('The accuracy record is built automatically from settled markets and is append-only — resolutions are never removed. Not financial advice.')}`;
  return docShell(head, body);
}

// ─────────────────────────────────────────────────────────────────────────────
// /embed — docs + live demo for the third-party widget (public/embed.js). A
// publisher lands here, copies one snippet, and ships a live "Crowd vs. Coverage"
// card that links back. This is the only page that intentionally loads a script
// (the widget itself, so the demo is real); everything else stays zero-JS.
// ─────────────────────────────────────────────────────────────────────────────
export function embedDocsPage(lastmod: string): string {
  const url = `${SITE}/embed`;
  const title = 'Embed Crowdtells: a live Crowd-vs-Coverage card for your site';
  const desc = clip(
    'Drop one line of HTML to show a live prediction-market odds card — the crowd’s read plus cross-platform divergence — on any blog, Substack, or newsroom page. Free, ~3KB, no dependencies.',
  );
  const snippet = `<div data-crowdtells="top"></div>
<script src="${SITE}/embed.js" async></script>`;
  const byId = `<div data-crowdtells="<market-id>"></div>`;
  const byCat = `<div data-crowdtells="top" data-category="Politics"></div>`;

  const howToLd = harden({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description: desc,
    url,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'Crowdtells', url: `${SITE}/` },
    dateModified: lastmod,
    author: { '@id': `${SITE}/#org` },
    publisher: { '@id': `${SITE}/#org` },
  });
  const crumbLd = breadcrumb([{ name: 'Crowdtells', url: `${SITE}/` }, { name: 'Embed' }]);
  const head = pageHead({
    title,
    desc,
    canonical: url,
    ogType: 'website',
    jsonld: [howToLd, crumbLd],
  });

  const body = `    ${siteHeader('<a href="/">← Live feed</a>')}

    <main class="wrap">
      <p class="eyebrow"><span class="cat">Embed</span></p>
      <h1>Put live market signal on your page</h1>
      <p class="lead">One line of HTML renders a live card: what the crowd is pricing, where the platforms diverge, and a link to the full briefing. Free, ~3KB, zero dependencies — it loads a tiny feed, not the whole site.</p>

      <h2>Quick start</h2>
      <p>Paste this where you want the card. It shows the top story right now and updates itself:</p>
      <pre class="code"><code>${xml(snippet)}</code></pre>

      <h2>Live preview</h2>
      <p>This is the real widget, running on this page:</p>
      <div class="embed-demo"><div data-crowdtells="top"></div></div>

      <h2>Options</h2>
      <table class="cal-table">
        <thead><tr><th>Attribute</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>data-crowdtells="top"</code></td><td>The highest-ranked story right now (default).</td></tr>
          <tr><td><code>data-crowdtells="&lt;id&gt;"</code></td><td>A specific market by id (from any story’s share link).</td></tr>
          <tr><td><code>data-category="Politics"</code></td><td>Pin the top story in a category (pairs with the above).</td></tr>
        </tbody>
      </table>
      <p>Pin a specific market:</p>
      <pre class="code"><code>${xml(byId)}</code></pre>
      <p>Or a category’s top story:</p>
      <pre class="code"><code>${xml(byCat)}</code></pre>

      <h2>How it works</h2>
      <p>The widget fetches a small JSON feed (a few KB, served from our CDN), renders into a Shadow DOM so it can’t clash with your site’s styles, adapts to light or dark automatically, and links each card back to the full briefing. No tracking scripts, no iframes, no cost. If a market has settled and aged out, the card gracefully falls back to a link to the live feed.</p>
      <p>Want a different layout, a category strip, or a server-side option? <a href="/about">Get in touch</a> — and see <a href="/accuracy">our track record</a> for why the signal is worth showing.</p>

      <a class="cta" href="/">See the live feed →</a>
    </main>

    ${siteFooter('The embed reads a public, slim feed and is free to use. Attribution (the “Crowdtells” mark + link) keeps it free.')}
    <script src="/embed.js" async></script>`;
  return docShell(head, body);
}

/** Render every evergreen page next to the feed and return their sitemap entries.
 * `hubSet` lists the categories that have a /topic hub this run, so cross-links
 * never 404. The Mispriced + guides-index pages are always written (durable URLs
 * carried by their evergreen content even when no live markets match). */
export function writeEvergreen(
  feed: Feed,
  dir: string,
  hubCategories: string[] = [],
): SitemapEntry[] {
  const lastmod = feed.generatedAt;
  const hubSet = new Set(hubCategories);
  const entries: SitemapEntry[] = [];

  if (EXPLAINERS.length) {
    const learnDir = join(dir, 'learn');
    mkdirSync(learnDir, { recursive: true });
    for (const c of EXPLAINERS) {
      writeFileSync(join(learnDir, `${c.slug}.html`), explainerPage(c, lastmod, hubSet));
      entries.push({ loc: explainerUrl(c.slug), priority: '0.6', changefreq: 'monthly', lastmod });
    }
  }

  if (EVENTS.length) {
    const eventDir = join(dir, 'event');
    mkdirSync(eventDir, { recursive: true });
    for (const c of EVENTS) {
      const live = matchMarkets(c.slug, feed);
      writeFileSync(join(eventDir, `${c.slug}.html`), eventPage(c, live, lastmod, hubSet));
      entries.push({ loc: eventUrl(c.slug), priority: '0.6', changefreq: 'daily', lastmod });
    }
  }

  if (EXPLAINERS.length || EVENTS.length) {
    writeFileSync(join(dir, 'learn.html'), guidesIndexPage(lastmod));
    entries.push({ loc: `${SITE}/learn`, priority: '0.6', changefreq: 'weekly', lastmod });
  }

  if (EXPLAINERS.some((e) => e.section === 'nyc' && !e.sponsored)) {
    writeFileSync(join(dir, 'nyc.html'), nycHubPage(lastmod));
    entries.push({ loc: `${SITE}/nyc`, priority: '0.7', changefreq: 'weekly', lastmod });
  }

  writeFileSync(join(dir, 'mispriced.html'), mispricedPage(feed, lastmod));
  entries.push({ loc: `${SITE}/mispriced`, priority: '0.6', changefreq: 'hourly', lastmod });

  writeFileSync(join(dir, 'accuracy.html'), accuracyPage(feed, lastmod));
  entries.push({ loc: `${SITE}/accuracy`, priority: '0.7', changefreq: 'daily', lastmod });

  writeFileSync(join(dir, 'embed.html'), embedDocsPage(lastmod));
  entries.push({ loc: `${SITE}/embed`, priority: '0.5', changefreq: 'monthly', lastmod });

  return entries;
}
