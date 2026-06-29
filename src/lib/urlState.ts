/**
 * The single source of truth for mapping the app's view state to/from the URL
 * querystring, so in-app views are shareable + bookmarkable and the browser
 * Back button works. Pure (no `window`) so it is unit-testable and the App can
 * drive all history writes from one place.
 *
 * Canonical params (only emitted when non-default, in a fixed order):
 *   sec=<section>   omitted when section is the default 'top'
 *   q=<query>       omitted when the search box is empty (matches the WebSite
 *                   SearchAction urlTemplate "/?q={search_term_string}")
 *   c=<category>    the exact category string, NOT the topic slug
 *   s=<marketId>    the expanded/deep-linked story
 *   o=<overlay>     a modal sheet (account / personalize) — an in-session history
 *                   entry so Back closes it; never honored as a landing deep link.
 */
import { SECTIONS, type Section } from './feed';

/** The modal sheet currently open over the feed, mirrored into the URL so the
 * browser/OS Back gesture closes it (like ?admin) instead of leaving the site. */
export type Overlay = 'account' | 'personalize';

export interface UrlState {
  section: Section;
  query: string;
  category: string | null;
  expandedId: string | null;
  /** The admin console takeover (?admin). Orthogonal to the feed view above. */
  admin: boolean;
  /** A back-dismissible modal sheet (?o=). Orthogonal to the feed view; never a
   * landing deep link (stripped on first mount — see App's overlay-strip effect). */
  overlay: Overlay | null;
}

const OVERLAYS: readonly Overlay[] = ['account', 'personalize'];

/** Serialize view state to a querystring WITHOUT the leading '?'. The default
 * (home) state returns '' so the homepage URL stays clean. */
export function stateToSearch(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.section !== 'top') p.set('sec', s.section);
  if (s.query) p.set('q', s.query);
  if (s.category) p.set('c', s.category);
  if (s.expandedId) p.set('s', s.expandedId);
  // Appended last so a non-admin state serializes exactly as before.
  if (s.admin) p.set('admin', '1');
  if (s.overlay) p.set('o', s.overlay);
  return p.toString();
}

/** Parse a querystring back into view state. `categoryExists` validates `c=`
 * against the live feed (a stale/unknown category is dropped); when omitted, any
 * category is accepted. Unknown sections fall back to the default 'top'. */
export function searchToState(
  search: string,
  opts: { categoryExists?: (c: string) => boolean } = {},
): UrlState {
  const p = new URLSearchParams(search);
  const secRaw = p.get('sec');
  const matched = SECTIONS.find((s) => s.key === secRaw);
  const cRaw = p.get('c');
  const oRaw = p.get('o');
  return {
    section: matched ? matched.key : 'top',
    query: p.get('q') ?? '',
    category: cRaw && (opts.categoryExists?.(cRaw) ?? true) ? cRaw : null,
    expandedId: p.get('s'),
    admin: p.has('admin'),
    overlay: OVERLAYS.find((o) => o === oRaw) ?? null,
  };
}

const INDEXABLE = 'index, follow, max-image-preview:large, max-snippet:-1';

// The homepage description + social card, mirrored from index.html so navigating
// the SPA back to the feed restores the shell's own <head>, never a stale story's.
const HOME_DESC =
  "A news platform built on the crowd's read. Prediction markets flag the story; Crowdtells briefs it from many outlets and keeps a living record of how opinion moves over time.";
const HOME_IMAGE = '/og.png';

export interface HeadMeta {
  title: string;
  canonical: string;
  robots: string;
  description: string;
  ogType: 'website' | 'article';
  /** Absolute (origin-qualified) social-card URL. */
  image: string;
}

/**
 * The <head> a given SPA view should present, so shared ?s=/?c=/?q= links aren't
 * crawled as duplicate homepages AND a JS-rendering crawler (Googlebot) sees the
 * same title/description/social card as the static /s/ twin. An opened story
 * canonicals to its static /s/ twin (the page built to be indexed); a category to
 * its /topic hub; search results are noindexed (low-value, infinite space);
 * everything else points at the homepage. Pure — the caller passes the resolved
 * paths, the story's description/card, and the origin.
 */
export function headMeta(
  s: Pick<UrlState, 'query' | 'category' | 'expandedId'>,
  ctx: {
    origin: string;
    story?: { path: string; title: string; description?: string; image?: string } | null;
    topicPath?: string | null;
  },
): HeadMeta {
  const homeImage = `${ctx.origin}${HOME_IMAGE}`;
  if (s.expandedId && ctx.story) {
    return {
      title: `${ctx.story.title} — Crowdtells`,
      canonical: ctx.origin + ctx.story.path,
      robots: INDEXABLE,
      description: ctx.story.description || HOME_DESC,
      ogType: 'article',
      image: ctx.story.image || homeImage,
    };
  }
  if (s.query) {
    return {
      title: `“${s.query}” — Crowdtells search`,
      canonical: `${ctx.origin}/`,
      robots: 'noindex, follow',
      description: `Search Crowdtells for “${s.query}”.`,
      ogType: 'website',
      image: homeImage,
    };
  }
  if (s.category && ctx.topicPath) {
    return {
      title: `${s.category} news & prediction markets — Crowdtells`,
      canonical: ctx.origin + ctx.topicPath,
      robots: INDEXABLE,
      description: `The ${s.category} stories the crowd is watching most — briefed by Crowdtells from real, cross-source reporting.`,
      ogType: 'website',
      image: homeImage,
    };
  }
  return {
    title: 'Crowdtells — A living record of what the crowd believes',
    canonical: `${ctx.origin}/`,
    robots: INDEXABLE,
    description: HOME_DESC,
    ogType: 'website',
    image: homeImage,
  };
}
