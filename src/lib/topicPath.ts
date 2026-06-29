/**
 * Category hub pages live at /topic/<slug>.html — indexable landing pages that
 * list every story in a category, the section-level entry point for search
 * traffic ("<topic> prediction markets") and the middle of the internal link
 * graph (Home → Topic → Article).
 *
 * Pure — no `window`, no `import.meta.env` — so the Node generator (scripts/)
 * and the browser client (src/) import it and always agree on the URL. Keep it
 * dependency-free.
 */

/** URL-safe slug for a category, e.g. "World Affairs" → "world-affairs". */
export function topicSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Root-relative path to a category's hub page. */
export function topicPath(category: string): string {
  return `/topic/${topicSlug(category)}`;
}
