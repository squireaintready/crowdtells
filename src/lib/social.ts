/**
 * Lightweight, dependency-free social helpers for the main bundle. Anything that
 * touches Supabase lives in the lazy-loaded discussion chunk instead.
 */
import { storyPath } from './storyPath';

const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/** Whether comments/likes are configured (a Supabase project is wired up). */
export const commentsEnabled = supabaseConfigured;

/**
 * Whether the email newsletter signup is live. Needs Supabase AND an explicit
 * opt-in flag, so the form stays hidden until the subscribers table + digest
 * sender are set up — flip VITE_NEWSLETTER_ENABLED=true once DNS/key/SQL are done.
 */
export const newsletterEnabled =
  supabaseConfigured && import.meta.env.VITE_NEWSLETTER_ENABLED === 'true';

/**
 * Whether the live Supabase Realtime feed read is on (Model B). Needs Supabase
 * AND an explicit opt-in, so first paint stays on the static feed.json until the
 * feed_markets/feed_meta tables are populated — flip VITE_REALTIME_FEED=true at
 * cutover. See tasks/modelb-migration.md.
 */
export const realtimeFeedEnabled =
  supabaseConfigured && import.meta.env.VITE_REALTIME_FEED === 'true';

/**
 * A shareable permalink to a story — its /s/<slug> share page, so the link
 * previews the actual story (its per-story OG card) when pasted into social apps.
 * Kept clean (no marker) because it's also that story's SEO canonical.
 */
export function storyUrl(marketId: string): string {
  return `${window.location.origin}${storyPath(marketId)}`;
}

/**
 * Share a story via the native share sheet, falling back to clipboard copy.
 * The shared URL carries a `#app` marker: the /s/ page previews the story to
 * crawlers (which never see the hash) but bounces a human who taps it straight
 * into the live SPA article — so a tapped share opens the app, not the static
 * SEO page. See scripts/lib/syndication.ts (the hash-gated bounce).
 */
export async function shareStory(title: string, marketId: string): Promise<'shared' | 'copied'> {
  const url = `${storyUrl(marketId)}#app`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `Crowdtells — ${title}`, url });
      return 'shared';
    } catch {
      // user cancelled or share failed → fall through to copy
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
