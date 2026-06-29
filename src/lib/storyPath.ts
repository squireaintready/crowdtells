/**
 * The per-story share page lives at /s/<slug>.html — a full, indexable article
 * page that also carries that story's Open Graph/Twitter meta, so a shared link
 * previews the actual story (not the generic homepage) and the page ranks in
 * search. A *shared* link appends a `#app` marker (see src/lib/social.ts) that
 * makes the page bounce a human straight into the SPA at /?s=<id>; search and
 * organic visits (no hash) get the full static page.
 *
 * This module is intentionally pure — no `window`, no `import.meta.env` — so the
 * Node generator (scripts/) and the browser client (src/) can both import it and
 * always agree on the URL. Keep it dependency-free.
 */

/** Filesystem- and URL-safe slug for a market id (ids may contain ':'). */
export function storySlug(marketId: string): string {
  return marketId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Root-relative path to a market's share page. */
export function storyPath(marketId: string): string {
  return `/s/${storySlug(marketId)}`;
}
