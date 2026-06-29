/**
 * Static first paint for the homepage. The app is a client-rendered SPA (empty
 * #root until JS runs), so the root URL — the most important one — ships no
 * crawlable content and paints blank. This injects a static summary of the top
 * stories into dist/index.html at build time from feed.json, reusing the app's
 * own ranking (selectStories) + hydration so the content matches what the SPA
 * renders.
 *
 * The fragment goes INSIDE #root: src/main.tsx uses createRoot().render() (not
 * hydrateRoot), so React discards #root's children on first commit — the static
 * content is replaced cleanly with no flash-hiding JS. It gives crawlers + a
 * fast first paint real content (and the homepage its first <h1>), with links
 * pointing at the indexable /s/ article pages so link equity flows there.
 *
 * Pure helpers here import only app-pure modules (no component, no supabase), so
 * this can never pull supabase-js into the browser bundle — it only rewrites the
 * already-built dist/index.html.
 */
import type { Feed, Market } from '../../src/lib/types';
import { hasBriefing, selectStories } from '../../src/lib/feed';
import { hydrateBriefing } from '../../src/lib/hydrate';
import { storyPath } from '../../src/lib/storyPath';
import { topicSlug } from '../../src/lib/topicPath';

const SITE = 'https://crowdtells.com';

function esc(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );
}

function clip(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function crowdShort(m: Market): string {
  const fav = (m.favored ?? '').trim();
  const yn = fav.toLowerCase() === 'yes' || fav.toLowerCase() === 'no';
  const pct = `${Math.round(m.oddsPct)}%`;
  return yn ? `Crowd: ${pct} ${fav.toLowerCase()}` : `Crowd: ${fav} ${pct}`.trim();
}

// Scoped to .ssg-home so it can't bleed into the app, and themed via the
// [data-theme] the inline pre-paint script already sets, so first paint matches.
const PRERENDER_CSS = `.ssg-home{max-width:728px;margin:0 auto;padding:34px 22px;font:17px/1.7 Georgia,"Times New Roman",serif;color:#1a1813}
.ssg-home .ssg-title{font-family:Georgia,"Times New Roman",serif;font-weight:600;font-size:clamp(1.95rem,1.2rem + 3.4vw,3rem);line-height:1.08;letter-spacing:-.018em;text-wrap:balance;margin:0 0 12px}
.ssg-home .ssg-lead{color:#54504a;margin:0 0 26px;font-size:clamp(1.12rem,1.04rem + .4vw,1.24rem);line-height:1.5;text-wrap:pretty}
.ssg-home .ssg-item{border-top:1px solid #e7e2d8;padding:20px 0}
.ssg-home .ssg-eyebrow{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.13em;color:#6f695e;margin:0 0 7px}
.ssg-home h2{font-family:Georgia,"Times New Roman",serif;font-weight:600;font-size:clamp(1.22rem,1.1rem + .5vw,1.38rem);line-height:1.18;letter-spacing:-.01em;margin:0 0 7px}
.ssg-home h2 a{color:inherit;text-decoration:none}
.ssg-home .ssg-crowd{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:.78rem;font-weight:600;letter-spacing:.02em;color:#27496d;margin:0 0 6px}
.ssg-home .ssg-ex{color:#54504a;margin:0;line-height:1.55}
.ssg-home .ssg-h2{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.13em;margin:34px 0 12px;color:#6f695e}
.ssg-home .ssg-topics a{display:inline-block;margin:0 14px 8px 0;color:#27496d;text-decoration:none;font-size:.92rem;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
html[data-theme=bordeaux] body{background:#090406}
html[data-theme=bordeaux] .ssg-home{color:#f4ece9}
html[data-theme=bordeaux] .ssg-home .ssg-lead,html[data-theme=bordeaux] .ssg-home .ssg-ex{color:#c7b9b6}
html[data-theme=bordeaux] .ssg-home .ssg-item{border-color:#381b21}
html[data-theme=bordeaux] .ssg-home .ssg-crowd,html[data-theme=bordeaux] .ssg-home .ssg-topics a{color:#d6a35b}
html[data-theme=forest] body{background:#0c1410}
html[data-theme=forest] .ssg-home{color:#eaf1ea}
html[data-theme=forest] .ssg-home .ssg-lead,html[data-theme=forest] .ssg-home .ssg-ex{color:#aebdb2}
html[data-theme=forest] .ssg-home .ssg-item{border-color:#27392e}
html[data-theme=forest] .ssg-home .ssg-crowd,html[data-theme=forest] .ssg-home .ssg-topics a{color:#cf9d63}`;

const INTRO = `<h1 class="ssg-title">Crowdtells — a living record of what the crowd believes</h1><p class="ssg-lead">The crowd tells it first. Crowdtells is a news platform that uses prediction markets as an assignment desk to surface what matters, briefs each story with real, cross-source reporting, and keeps a record of how the crowd's read moves over time.</p>`;

/** Build the head fragment (scoped CSS + ItemList JSON-LD) and the #root
 * fragment (top stories) for the homepage. */
export function homeSummaryHtml(feed: Feed, n = 10): { head: string; root: string } {
  const top = selectStories(feed.markets, { section: 'top', query: '', category: null })
    .filter(hasBriefing)
    .slice(0, n);

  if (!top.length) {
    // Never ship a contentless root — at least the product intro + an <h1>.
    return {
      head: `<style>${PRERENDER_CSS}</style>`,
      root: `<div class="ssg-home">${INTRO}</div>`,
    };
  }

  const items = top
    .map((m) => {
      const src = m.source === 'kalshi' ? 'Kalshi' : 'Polymarket';
      const excerpt = clip(hydrateBriefing(m.analysis, m) || m.hook || m.title);
      return `<article class="ssg-item"><p class="ssg-eyebrow">${esc(m.category)} · ${esc(src)}</p><h2><a href="${storyPath(m.id)}">${esc(m.hook || m.title)}</a></h2><p class="ssg-crowd">${esc(crowdShort(m))}</p><p class="ssg-ex">${esc(excerpt)}</p></article>`;
    })
    .join('');

  // Browse-by-topic links → the same Home→Topic→Article hierarchy crawlers get,
  // surfaced on the static homepage (the SPA footer's topic row is client-only).
  // Only categories with enough briefed stories to have a hub (mirrors HUB_MIN).
  const byCat = new Map<string, number>();
  for (const m of feed.markets) {
    if (m.status !== 'active' || !hasBriefing(m) || !m.category) continue;
    byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1);
  }
  const hubCats = [...byCat.entries()]
    .filter(([, n]) => n >= 2)
    .map(([c]) => c)
    .sort((a, b) => a.localeCompare(b));
  const topics = hubCats.length
    ? `<h2 class="ssg-h2">Browse by topic</h2><nav class="ssg-topics">${hubCats
        .map((c) => `<a href="/topic/${topicSlug(c)}">${esc(c)}</a>`)
        .join('')}</nav>`
    : '';

  // Evergreen guides + the Mispriced franchise — surfaced on the most-crawled URL
  // so link equity flows to them (these are static pages that always exist).
  const guides = `<h2 class="ssg-h2">Guides</h2><nav class="ssg-topics"><a href="/learn">All guides</a><a href="/learn/how-prediction-markets-work">How prediction markets work</a><a href="/learn/kalshi-vs-polymarket">Kalshi vs Polymarket</a><a href="/mispriced">Mispriced: odds vs headlines</a></nav>`;

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: top.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}${storyPath(m.id)}`,
      name: m.hook || m.title,
    })),
  }).replace(/</g, '\\u003c');

  return {
    head: `<style>${PRERENDER_CSS}</style><script type="application/ld+json">${ld}</script>`,
    root: `<div class="ssg-home">${INTRO}<h2 class="ssg-h2">Top stories right now</h2>${items}${topics}${guides}</div>`,
  };
}

/** Inject (idempotently) the homepage summary into a built index.html: a head
 * block before </head> and a #root block React replaces on mount. Re-running
 * strips the prior injection first, so it's safe on an already-processed file. */
export function injectHomeSummary(html: string, feed: Feed): string {
  const stripped = html
    .replace(/<!--SSG:HEAD-->[\s\S]*?<!--\/SSG:HEAD-->/g, '')
    .replace(
      /<div id="root"><!--SSG:HOME-->[\s\S]*?<!--\/SSG:HOME--><\/div>/g,
      '<div id="root"></div>',
    );
  const { head, root } = homeSummaryHtml(feed);
  return stripped
    .replace('</head>', `<!--SSG:HEAD-->${head}<!--/SSG:HEAD--></head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root"><!--SSG:HOME-->${root}<!--/SSG:HOME--></div>`,
    );
}
