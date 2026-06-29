/**
 * Crowdtells — gated resolution-card auto-poster (growth bet #1).
 *
 * Reads the published feed (the same stable `feed.json` the digest/breaking sender
 * read), finds the handful of tracked markets that JUST settled since the last run,
 * renders a "we called it" share card for each, and posts it to every configured
 * social platform (Bluesky + Mastodon). Each resolution is claimed in a durable
 * Supabase ledger BEFORE posting (claim_social_post — the same atomic at-most-once
 * pattern as breaking alerts), so a card posts exactly once even though this rides
 * every pulse run.
 *
 * INERT BY DESIGN: the whole thing is a no-op unless SOCIAL_POST_ENABLED=true AND at
 * least one platform's credentials are present. With the flag off / no secrets it
 * logs and exits 0 — the pipeline behaves exactly as today. `--dry-run` renders +
 * logs the cards without claiming or posting (and needs no creds). Best-effort: any
 * failure is caught and never blocks the deploy.
 */
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Feed, Market } from '../src/lib/types';
import { storySlug } from '../src/lib/storyPath';
import { config } from './lib/config';
import { isSportsCategory } from './lib/category';
import { isUnprovisionedError } from './send-confirmations';
import { adminCtxFromEnv, type AdminCtx } from './lib/admin';
import { buildResolutionCard, resolutionSvg, type ResolutionCardCopy } from './lib/resolutionCard';
import { loadOgFonts, renderOgPng } from './lib/ogImage';
import {
  postToBluesky,
  postToMastodon,
  type BlueskyCreds,
  type MastodonCreds,
} from './lib/socialPost';

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

// Only post a genuinely share-worthy settlement — mirrors the breaking-alert bar so
// the feed and the social account stay editorially consistent.
const RESOLVE_LOOKBACK_HOURS = 48; // recent settlements only (no backlog flood)
const RESOLVE_MIN_VOLUME = 5_000_000; // …that carried serious money (drops novelty/props)
const MAX_POSTS_PER_RUN = 3; // throttle: never blast more than a few per run

/** A settled market worth a resolution card (pure, rankable). */
export interface Resolution {
  marketId: string;
  /** Stable dedup key — claimed once in the ledger, then never re-posted. */
  eventKey: string;
  /** Higher = more share-worthy; used to pick the top few per run. */
  priority: number;
  market: Market;
}

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

/** Whether we wrote a briefing for this market (the bar for "worth posting"). */
function isBriefed(m: Market): boolean {
  return !!m.generatedAt && !!m.hook;
}

/** Hours between an ISO timestamp and now; Infinity if absent/unparseable. */
function hoursSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : (nowMs - t) / 3_600_000;
}

/**
 * A resolution outcome that is just a number / range / measurement ("200-219",
 * "$52,000", "70°") signals a quantity-novelty market, not "did X happen" news — we
 * don't post those. Mirrors send-breaking's isNoveltyOutcome (kept local so the two
 * senders stay decoupled). A real categorical outcome always carries a word.
 */
function isNoveltyOutcome(outcome: string): boolean {
  const letters = outcome.replace(/\b(?:to|and|or)\b/gi, '').replace(/[^a-z]/gi, '');
  return letters.length < 2;
}

/** Routine sports/competition outcomes aren't card-worthy (the feed demotes the
 * sports family); checking the hook too catches mislabeled categories. */
function isRoutineSports(m: Market): boolean {
  return isSportsCategory(m.category) || isSportsCategory(m.hook || '');
}

/**
 * Detect the card-worthy resolutions in the feed, ranked best-first. Pure →
 * unit-testable. A market qualifies when it just SETTLED (briefed, high-volume,
 * categorical outcome, non-sports) within the lookback window. The downstream claim
 * dedupes across runs; this keeps a single run clean (and the dry-run honest).
 */
export function detectResolutions(feed: Feed, nowMs: number, limit = Infinity): Resolution[] {
  const out: Resolution[] = [];
  for (const m of feed.markets) {
    if (m.status !== 'resolved') continue;
    if (!m.resolvedOutcome || isNoveltyOutcome(m.resolvedOutcome)) continue;
    if (!isBriefed(m)) continue;
    if (isRoutineSports(m)) continue;
    if (m.volume < RESOLVE_MIN_VOLUME) continue;
    if (hoursSince(m.resolvedAt, nowMs) > RESOLVE_LOOKBACK_HOURS) continue;
    out.push({
      marketId: m.id,
      eventKey: `social:${m.id}`,
      priority: (m.calledCorrectly === true ? 1_000 : 0) + (m.score || 0) + m.volume / 1e9,
      market: m,
    });
  }
  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

/** The post text for a resolution card — the verdict + a quiet read-more nudge. The
 * orchestrator appends the link per-platform. Pure. */
export function buildPostText(card: ResolutionCardCopy): string {
  const head = card.headline ? `${card.headline}\n\n` : '';
  return `${head}${card.verdict}\n\nHow the crowd read it →`;
}

/**
 * Atomically claim a resolution for posting via the claim_social_post RPC. Returns
 * true exactly once per event_key (first caller), false on every later call — so a
 * card posts once and only once. We claim BEFORE posting, so an overlapping/retried
 * run can't double-post.
 */
async function claimPost(ctx: AdminCtx, ev: Resolution): Promise<boolean> {
  const res = await fetch(`${ctx.url}/rest/v1/rpc/claim_social_post`, {
    method: 'POST',
    headers: {
      apikey: ctx.key,
      Authorization: `Bearer ${ctx.key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_event_key: ev.eventKey, p_market_id: ev.marketId }),
  });
  if (!res.ok) throw new Error(`claim_social_post failed: ${res.status} ${await res.text()}`);
  return (await res.json()) === true;
}

/** Read the platform creds from config; null when a platform isn't configured. */
function blueskyCreds(): BlueskyCreds | null {
  return config.blueskyHandle && config.blueskyAppPassword
    ? { handle: config.blueskyHandle, appPassword: config.blueskyAppPassword, service: config.blueskyService }
    : null;
}
function mastodonCreds(): MastodonCreds | null {
  return config.mastodonInstance && config.mastodonToken
    ? { instance: config.mastodonInstance, token: config.mastodonToken }
    : null;
}

async function main(): Promise<void> {
  const siteUrl = env('SITE_URL', 'https://crowdtells.com').replace(/\/$/, '');
  console.log(`Crowdtells resolution cards${DRY_RUN ? ' (dry-run)' : ''}`);

  const bsky = blueskyCreds();
  const masto = mastodonCreds();

  // GATE: inert unless the flag is on AND at least one platform is configured.
  // (A dry-run still renders so the owner can preview the cards before going live.)
  if (!DRY_RUN && (!config.socialPostEnabled || (!bsky && !masto))) {
    console.log(
      'Social posting disabled (need SOCIAL_POST_ENABLED=true + Bluesky and/or Mastodon creds) — skipping.',
    );
    return;
  }

  const feed = (await (await fetch(`${siteUrl}/feed.json`)).json()) as Feed;
  const resolutions = detectResolutions(feed, Date.now());
  console.log(`Card-worthy resolutions this run: ${resolutions.length}`);
  for (const r of resolutions) {
    const card = buildResolutionCard(r.market);
    console.log(`  • ${card.headline} — ${card.verdict}`);
  }
  if (resolutions.length === 0) {
    console.log('Nothing newly resolved — nothing to post.');
    return;
  }

  // Fonts for the PNG (decompressed once). A font failure isn't fatal — we post
  // text-only (the platforms still render their own link card from /s/).
  let fonts: string[] = [];
  try {
    fonts = await loadOgFonts('public');
  } catch (err) {
    console.warn(`  ! OG fonts unavailable — posting text-only: ${err instanceof Error ? err.message : err}`);
  }
  const cardDir = mkdtempSync(join(tmpdir(), 'crowdtells-social-'));

  if (DRY_RUN) {
    // Render the cards to a temp dir for preview; never claim or post.
    for (const r of resolutions.slice(0, MAX_POSTS_PER_RUN)) {
      const card = buildResolutionCard(r.market);
      if (fonts.length) {
        try {
          const path = join(cardDir, `${storySlug(r.marketId)}.png`);
          writeFileSync(path, renderOgPng(resolutionSvg(card), fonts));
          console.log(`  ↳ rendered ${path}`);
        } catch (err) {
          console.warn(`  ! render failed for ${r.marketId}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    console.log('Dry-run: not claiming or posting.');
    return;
  }

  // Live: we need the service key to claim (at-most-once). Without it, skip cleanly.
  let ctx: AdminCtx;
  try {
    ctx = adminCtxFromEnv();
  } catch {
    console.log('No Supabase service key — cannot dedup posts; skipping (set SUPABASE_SERVICE_KEY).');
    return;
  }

  let posted = 0;
  for (const r of resolutions) {
    if (posted >= MAX_POSTS_PER_RUN) break;

    // Claim BEFORE posting so an overlapping run can't double-post (at-most-once).
    let isNew: boolean;
    try {
      isNew = await claimPost(ctx, r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Missing dedup table/RPC → schema not migrated; skip the whole run cleanly.
      if (isUnprovisionedError(message)) {
        console.log('social_posts not migrated (run supabase/schema.sql) — skipping.');
        return;
      }
      throw err;
    }
    if (!isNew) {
      console.log(`  – already posted: ${r.eventKey}`);
      continue;
    }
    posted += 1;

    const card = buildResolutionCard(r.market);
    const link = `${siteUrl}/s/${storySlug(r.marketId)}`;
    const text = buildPostText(card);
    let imgPath: string | undefined;
    if (fonts.length) {
      try {
        imgPath = join(cardDir, `${storySlug(r.marketId)}.png`);
        writeFileSync(imgPath, renderOgPng(resolutionSvg(card), fonts));
      } catch (err) {
        console.warn(`  ! render failed for ${r.marketId}: ${err instanceof Error ? err.message : err}`);
        imgPath = undefined;
      }
    }

    const bskyRes = await postToBluesky(text, link, bsky, {
      imgPath,
      title: card.headline || 'Crowdtells',
      description: card.verdict,
    });
    if (bskyRes.ok) console.log(`  ✓ Bluesky: ${bskyRes.id}`);
    else if (!bskyRes.skipped) console.error(`  ✗ Bluesky: ${bskyRes.error}`);

    const mastoRes = await postToMastodon(text, link, masto, {
      imgPath,
      altText: card.headline || card.verdict,
    });
    if (mastoRes.ok) console.log(`  ✓ Mastodon: ${mastoRes.id}`);
    else if (!mastoRes.skipped) console.error(`  ✗ Mastodon: ${mastoRes.error}`);
  }
  console.log(`Done. Posted ${posted} resolution card(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    // Non-fatal: a social-post failure must never block the pulse run.
    console.error('Social post error (non-fatal):', err instanceof Error ? err.message : err);
  });
}
