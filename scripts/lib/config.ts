/** Runtime configuration for the generator, sourced from env with safe defaults. */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() !== '' ? raw.trim() : fallback;
}

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

/** Split a comma/space/newline-separated key list into a clean array. */
export function parseKeyList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  /** Skip all AI calls; shape markets + news only (for local validation). */
  dryRun,

  // --- LLM providers (both free-tier, OpenAI-compatible). The pipeline POOLS them:
  // Gemini leads, Groq follows as fallback + extra free capacity. A call that hits one
  // provider's per-key/per-model limit falls straight through to the next slot, so total
  // throughput is the SUM of both free tiers, not a single provider's cap. See buildSlots. ---

  /** Gemini (Google AI Studio) key(s) — the preferred briefing provider. Comma/space/
   * newline-separated to rotate per-key limits. Empty → Gemini just isn't in the pool. */
  geminiKeys: parseKeyList(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY),
  geminiBase: str('GEMINI_BASE', 'https://generativelanguage.googleapis.com/v1beta/openai'),
  /** Gemini model pool. Defaults to the models a free-tier key actually serves (the 2.0
   * line returns limit:0): 2.5-flash leads on quality, flash-lite adds cheap RPD/RPM. */
  geminiModels: parseKeyList(process.env.GEMINI_MODELS).length
    ? parseKeyList(process.env.GEMINI_MODELS)
    : ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  /** Gemini "thinking" budget, via the OpenAI-compat reasoning_effort knob. Default 'none'
   * — our briefing/classify prompts are already fully prescribed, so thinking mostly burns
   * output tokens + latency (and the per-model free-tier TPM/RPD we care about). Set
   * low|medium|high to trade speed for rigor, or '' to leave the model's dynamic default on.
   * Ignored for Groq (no such knob; sending it can trip its param validation). */
  geminiReasoningEffort: str('GEMINI_REASONING_EFFORT', 'none'),

  /** Groq (OpenAI-compatible) key(s) — the fallback provider. Rotates keys × models on limits. */
  groqKeys: parseKeyList(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY),
  groqBase: str('GROQ_BASE', 'https://api.groq.com/openai/v1'),
  /** Model pool — free-tier limits are per-model, so cycling them adds capacity. */
  groqModels: parseKeyList(process.env.GROQ_MODELS).length
    ? parseKeyList(process.env.GROQ_MODELS)
    : [
        'llama-3.3-70b-versatile',
        'openai/gpt-oss-120b',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        // qwen/qwen3-32b removed: Groq decommissions it 2026-07-17. Its recommended
        // replacement — openai/gpt-oss-120b, a bigger/stronger model — is already in this
        // pool, so the rotation loses nothing. (runBriefing also drops any 404'd model
        // mid-run, so this was graceful regardless; removing it just avoids the wasted call.)
      ],

  /** Polymarket candidates kept from the top volume page before ranking. Raised
   * 80→100 to keep ALL of page 1's newsworthy standing markets (measured: ranks
   * 0-100 are ~98 standing markets, every one ≥$25k/24h) instead of dropping ~18. */
  polymarketLimit: num('POLYMARKET_LIMIT', 100),
  /** Extra Polymarket candidates fetched from the SECOND volume page (ranks ~100-200),
   * which are overwhelmingly real standing markets (elections, World Cup, majors) that
   * a single top-100 fetch silently drops. Pure discovery headroom for new stories;
   * the ranker still decides which earn a feed slot. (Newest-by-startDate was rejected:
   * Polymarket's newest events are almost all ephemeral intraday price ladders.)
   * 30→60: ranks 100-200 are ~93 standing markets, all ≥$25k/24h — keep most of them
   * for the ranker + category diversity, not a third. (Newsworthy runs out ~rank 230,
   * so a third page isn't worth the noise.) */
  polymarketDiscoveryLimit: num('POLYMARKET_DISCOVERY_LIMIT', 60),
  /** Overall safety cap on Kalshi candidates passed to ranking (0 disables Kalshi). */
  kalshiLimit: num('KALSHI_LIMIT', 80),
  /** Top candidates kept PER category from Kalshi, so every category gets fair
   * representation (comprehensive coverage) before ranking's diversity pass. */
  kalshiPerCategory: num('KALSHI_PER_CATEGORY', 3),
  /** Max pages (200 events each) to page through Kalshi's open-events feed. The
   * feed is NOT volume-sorted, so we paginate and globally sort by real volume;
   * this caps the worst case (~20-40 pages covers all open events). */
  kalshiMaxPages: num('KALSHI_MAX_PAGES', 40),
  /** Final markets kept in the LIVE feed after newsworthiness ranking. (Briefed
   * stories that later fall out of this window are archived, not deleted.) Widened
   * 60→72 to give fresher/smaller markets room to live without displacing the big
   * evergreen markets that otherwise saturate a tighter window. */
  feedSize: num('FEED_SIZE', 72),
  /** Drop markets with less than this total volume (USD). */
  minVolume: num('MIN_VOLUME', 10_000),
  /** MMR diversity penalty per repeated category during selection (0 = off). */
  diversity: num('DIVERSITY', 0.15),
  /** MMR penalty per already-picked market of the SAME source, so one platform
   * can't flood the feed (Polymarket vastly out-lists Kalshi). 0 = off. */
  sourceDiversity: num('SOURCE_DIVERSITY', 0.04),
  /** Soft selection bonus for Kalshi (the under-scaled source), in score units. */
  kalshiBoost: num('KALSHI_BOOST', 0.1),
  /** Max briefings to generate per run (key×model rotation gives plenty of room). */
  generateLimit: num('GENERATE_LIMIT', 20),
  /** Distinct outlets to retrieve per market for cross-source synthesis. */
  newsPerMarket: num('NEWS_PER_MARKET', 8),
  /** Feed real publisher-RSS summary prose into each briefing prompt (the snippet
   * layer), so bodies are grounded in reporting, not just headlines. Best-effort and
   * free-tier-safe; set SNIPPETS_ENABLED=0 to disable (briefings fall back to
   * title-only). */
  snippetsEnabled: !['0', 'false', 'off'].includes(str('SNIPPETS_ENABLED', '1').toLowerCase()),
  /** Tier-2 of the snippet layer: for a niche story the shared section feeds miss, probe
   * the native feeds of the publishers actually covering it (a few extra fetches, hard
   * wall-clock-capped). Set SNIPPET_PROBE_ENABLED=0 to keep only the zero-extra-fetch
   * shared pool if Actions minutes get tight. */
  snippetProbeEnabled: !['0', 'false', 'off'].includes(
    str('SNIPPET_PROBE_ENABLED', '1').toLowerCase(),
  ),
  /** Max borderline cross-platform pairs the LLM collision tier adjudicates per
   * run (bounds Groq cost + false-merge surface). Decisions are cached, so this
   * mostly bites only when genuinely new borderline pairs appear. */
  collisionAdjudicateMax: num('COLLISION_ADJUDICATE_MAX', 8),

  /** Pause between Groq calls (ms) to stay under free-tier RPM. */
  requestDelayMs: num('REQUEST_DELAY_MS', 1200),
  /** Cap on stored odds observations per market (sparkline window). */
  historyMax: num('HISTORY_MAX', 96),
  /** Cap on the durable daily crowd-belief series (one point per UTC day) — the
   * long-arc record behind the opinion timeline. 730 ≈ 2 years per market. */
  oddsDailyMax: num('ODDS_DAILY_MAX', 730),
  /** Max newly-discovered markets to backfill real price history for per run, so
   * the first-run spike (everything new) drains over a few runs; the rest start
   * on a flat baseline and accrue history as usual. */
  seedLimit: num('SEED_LIMIT', 24),
  /** Keep resolved markets in the "Past" tab for this many days. */
  resolvedRetainDays: num('RESOLVED_RETAIN_DAYS', 14),
  /** How long after a market's end date we keep trying to capture its real
   * outcome — even once it has aged from 'resolved' to 'archived'. Platform
   * settlement often lags the end date (sometimes past resolvedRetainDays), so
   * without this the scoreboard silently under-counts late-settling markets.
   * Beyond this horizon an unsettled market is treated as indeterminate. */
  resolveCaptureDays: num('RESOLVE_CAPTURE_DAYS', 60),
  /** Cap on resolution lookups per run (oldest-ended first), so a backlog after
   * a long outage drains over several runs instead of spiking one run's API use. */
  resolveCaptureMax: num('RESOLVE_CAPTURE_MAX', 50),
  /** Keep a briefed story's permanent /s/ page (status 'archived') for this many
   * days after it was written, so the indexable library compounds without the
   * durable store growing forever. 365→1095 (3yr): an aged-out story's /s/ page
   * 404s on the next full deploy, so this is effectively the "permanent URL" horizon
   * — push it out years. Still bounded (the store is re-rendered + force-pushed every
   * run, ~6.6KB/story); literal-forever wants incremental deploys, a later change. */
  archiveRetainDays: num('ARCHIVE_RETAIN_DAYS', 1095),
  /** Hard cap on archived pages retained in the store, newest-briefed first, so
   * store.json stays a bounded size for the 30-min force-push. 800→3000 (~3-5yr of
   * runway at the current rate; ~20MB store, ~3k /s/ renders/run — well under the
   * Cloudflare 20k-files/deployment ceiling and the Actions-minute budget). */
  archiveMax: num('ARCHIVE_MAX', 3000),

  /** Hard cap on the global Events strip size (the panel scrolls). Sized to fit a
   * diverse mix across the kinds: world, disasters, financial, esports, sports, weather. */
  eventsMax: num('EVENTS_MAX', 30),
  /** ReliefWeb (UN OCHA) global-disasters source — DORMANT until an approved appname
   * is set. ReliefWeb gates its API on a registered appname (request one at
   * https://apidoc.reliefweb.int/parameters#appname); without it the source is
   * skipped, so USGS + Wikipedia carry global coverage in the meantime. */
  reliefwebAppname: str('RELIEFWEB_APPNAME', ''),
  /** Finnhub financial calendar (earnings + IPOs) — DORMANT until a free API key is
   * set. Free key at https://finnhub.io/register; powers the financial/markets events
   * (Financials, Companies, Markets, Economics categories). Skipped when unset. */
  finnhubApiKey: str('FINNHUB_API_KEY', ''),
  /** PandaScore esports schedule — DORMANT until a free token is set. Free token at
   * https://pandascore.co (Esports/Games/IEM categories: CS, Dota, LoL, Valorant…).
   * ESPN has no esports feed, so this is how esports events surface. Skipped when unset. */
  pandascoreToken: str('PANDASCORE_TOKEN', ''),

  storePath: str('STORE_PATH', '.data/store.json'),
  feedPath: str('FEED_PATH', 'public/feed.json'),

  userAgent: str('USER_AGENT', 'Crowdtells/1.0 (+https://crowdtells.com)'),

  /** Growth bet #1 — gated resolution-card auto-post to Bluesky + Mastodon. The
   * whole sender (scripts/send-social.ts) is INERT unless this flag is true AND at
   * least one platform's creds below are present, so the pipeline behaves exactly
   * as today until the owner opts in (mirrors BREAKING_ALERTS_ENABLED / FEED_SYNC). */
  socialPostEnabled: ['1', 'true', 'on'].includes(str('SOCIAL_POST_ENABLED', '').toLowerCase()),
  /** Retention loop — gated comment reply-notification emails. The sender
   * (scripts/send-replies.ts) is INERT unless this flag is true AND Mailgun +
   * Supabase creds are present, so the pipeline behaves exactly as today until the
   * owner opts in (mirrors BREAKING_ALERTS_ENABLED / SOCIAL_POST_ENABLED). */
  replyNotifyEnabled: ['1', 'true', 'on'].includes(str('REPLY_NOTIFY_ENABLED', '').toLowerCase()),
  /** Bluesky handle, e.g. "crowdtells.bsky.social". Empty → Bluesky skipped. */
  blueskyHandle: str('BLUESKY_HANDLE', ''),
  /** Bluesky APP password (NOT the account password). Empty → Bluesky skipped. */
  blueskyAppPassword: str('BLUESKY_APP_PASSWORD', ''),
  /** Bluesky service host (PDS), defaults to the public AppView. */
  blueskyService: str('BLUESKY_SERVICE', 'https://bsky.social'),
  /** Mastodon instance origin, e.g. "https://mastodon.social". Empty → Mastodon skipped. */
  mastodonInstance: str('MASTODON_INSTANCE', ''),
  /** Mastodon access token with write:statuses (+ write:media). Empty → Mastodon skipped. */
  mastodonToken: str('MASTODON_TOKEN', ''),
} as const;

export type Config = typeof config;

/** True when at least one LLM provider (Gemini or Groq) has a key, so the pipeline can
 * brief. Both speak the same OpenAI-compatible API; every AI step gates on this. */
export function llmConfigured(): boolean {
  return config.geminiKeys.length > 0 || config.groqKeys.length > 0;
}
