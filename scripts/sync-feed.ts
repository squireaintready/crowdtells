/**
 * Mirror the published client feed (public/feed.json) into Supabase so the SPA
 * can read it live and subscribe via Realtime. Meant to run as a post-deploy
 * pipeline step (like the data-branch persist), NEVER in the browser.
 *
 * Inert by design: does nothing unless FEED_SYNC_ENABLED=true (a dedicated switch
 * — SUPABASE_SERVICE_KEY can't be the gate because it already exists in prod for
 * the digest/confirm jobs). Off by default, so it is safe to wire into the
 * pipeline before flipping it on at cutover. A real sync failure is also non-fatal
 * — the static feed.json already deployed and remains the SPA's source of truth.
 */
import { adminCtxFromEnv } from './lib/admin';
import { config } from './lib/config';
import { loadClientFeed, syncFeed } from './lib/feedSync';

async function main(): Promise<void> {
  // The cutover switch. Off by default → fully inert, even though the service key
  // is already present in prod for other jobs.
  if (process.env.FEED_SYNC_ENABLED !== 'true') {
    console.log('feed sync disabled — set FEED_SYNC_ENABLED=true to enable.');
    return;
  }
  if (!process.env.SUPABASE_SERVICE_KEY?.trim()) {
    console.log('feed sync skipped — SUPABASE_SERVICE_KEY not set.');
    return;
  }
  const ctx = adminCtxFromEnv();
  const feed = loadClientFeed(config.feedPath);
  const { changed, total, pruned } = await syncFeed(ctx, feed);
  console.log(`feed sync: ${changed}/${total} markets changed${pruned ? `, pruned ${pruned} departed` : ''}.`);
}

main().catch((e) => {
  // Non-fatal at the PIPELINE level — the static feed already shipped and the CI
  // step is continue-on-error — but signal failure via a non-zero exit code so the
  // run can surface a warning + alert instead of letting the live Supabase mirror
  // go silently stale. (Intentional skips above return before this and exit 0.)
  console.error('feed sync failed (non-fatal):', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
