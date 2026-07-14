/**
 * The data contract shared by the generator (scripts/) and the web app (src/).
 * This is the single source of truth for the shape of `feed.json`.
 */

/** Another market on the board that shares a salient entity (a team, person, place…)
 * with this one but is a DIFFERENT question — surfaced as a quiet "related on the
 * board" link, NEVER merged into the story. The id is another published feed entry,
 * so it's openable in-app. Computed post-merge over the live feed. */
export interface RelatedMarket {
  /** id of the related market (also in the client feed → linkable). */
  id: string;
  /** Its editorial headline (hook) where it has one, else its raw title — the link label. */
  title: string;
  /** Its favored outcome's current probability, 0–100 (for a compact odds chip). */
  oddsPct: number;
  /** The entity the two share (a team/person/place), as it reads in the titles —
   * the "why related". '' when the link is by canonical alias with no shared word. */
  via: string;
}

/** A real news article retrieved for a market and cited in its briefing. */
export interface Source {
  /** Publisher domain, e.g. "reuters.com". */
  domain: string;
  /** Publisher origin (e.g. "https://reuters.com") — used for clean attribution and
   * the isBasedOn provenance (names the publisher, not Google). */
  url: string;
  /** Link to the actual ARTICLE — what a reader clicks to read the cited story. Google
   * News exposes only an opaque redirect to it (not the publisher's bare URL), so this
   * is set when it differs from `url`; clickable citations prefer `articleUrl ?? url`. */
  articleUrl?: string;
  /** Article headline, when available (used for citation tooltips). */
  title?: string;
  /** When the article was published (ISO), parsed from the feed's pubDate when valid.
   * Powers the TrendChart's coverage ticks ("when the news landed"). Absent for
   * sources from feeds without a date, or briefed before this field existed. */
  publishedAt?: string;
}

/** A single odds observation, used to draw the sparkline. */
export interface OddsPoint {
  /** ISO timestamp of the observation. */
  t: string;
  /** Probability of the favored outcome, 0–100. */
  p: number;
}

/**
 * 'active'   — currently in the live newsworthiness feed.
 * 'resolved' — settled on its platform; shown in the Past tab for a retention window.
 * 'archived' — briefed once, now out of the live feed, but kept as a permanent,
 *              indexable /s/ page (never in the client feed.json — search only).
 */
export type MarketStatus = 'active' | 'resolved' | 'archived';

/** Which prediction market the data came from. */
export type MarketSource = 'polymarket' | 'kalshi';

/**
 * The editorial desk a story is assigned, which drives BOTH the briefing prompt and
 * the render shape — the cure for "every article reads identically". One story gets
 * one format, chosen from its signals (news footprint, novelty, lifecycle):
 *   'feature'   — a major, well-covered developing story; the fullest treatment.
 *   'update'    — a story that genuinely ADVANCED since we last wrote; leads with what's
 *                 new, not a re-run of the evergreen background.
 *   'explainer' — a newly-surfaced story; background-led "what this is / why it matters".
 *   'result'    — a settled market; past-tense recap of how it actually resolved.
 *   'digest'    — routine, low-news, or recurring-prop markets (sports lines, the
 *                 Elon-tweet series, daily price props) folded into an "On the board"
 *                 row: the crowd's number with NO AI briefing, kept off the article
 *                 surface so the feed reads like a newsroom, not a betting catalog.
 */
export type StoryFormat = 'feature' | 'update' | 'explainer' | 'result' | 'digest';

/** The same question on the other platform — for cross-market divergence/arb. */
export interface AltMarket {
  source: MarketSource;
  favored: string;
  oddsPct: number;
  volume: number;
  marketUrl: string;
}

/**
 * A sub-market ABSORBED into a story as one of its sub-signals — a finer-grained or
 * adjacent question about the SAME real-world development (e.g. for the US-Iran story:
 * "Strait of Hormuz traffic returns to normal by July 31?"). Distinct from `peers` (the
 * literally-same question on another platform) and `related` (a DIFFERENT question
 * sharing only an entity): a sub-signal is another FACET of THIS story that the crowd is
 * pricing. Shown on the lead's article as "the crowd's read across the story" and folded
 * out of the feed as its own row. Numbers are render-time only (the model stays
 * number-blind); the briefing receives these as qualitative odds-band context. */
export interface SubSignal {
  /** The absorbed market's id — so a deep-link to it can redirect to the story lead. */
  id: string;
  /** Its question/angle, e.g. "Israel withdraws from Lebanon by...?" (the facet label). */
  title: string;
  /** Which platform it trades on. */
  source: MarketSource;
  /** Favored outcome name. */
  favored: string;
  /** Favored probability now, 0–100 (compact chip). */
  oddsPct: number;
  /** 24h change in points, or null (shows momentum on the facet). */
  movement24h: number | null;
  /** Total traded volume in USD — orders the facets and weights the story's crowd read. */
  volume: number;
  /** Link to view/trade the facet on its platform. */
  marketUrl: string;
}

/** How a specific outlet frames or interprets the story differently. */
export interface Perspective {
  /** The outlet this view comes from, e.g. "Politico" or "reuters.com". */
  source: string;
  /** The outlet's distinct framing/emphasis/opinion. */
  view: string;
}

/** Cross-source breakdown of the coverage for a market's topic. */
export interface Synthesis {
  /** Facts (nearly) all sources agree on. */
  consensus: string[];
  /** Factual claims where sources diverge or contradict (empty when none). */
  disputed: string[];
  /** Differing framing/opinion across outlets. */
  perspectives: Perspective[];
}

/** The kind of real-world thing a story is about — drives image resolution. */
export type EntityType = 'person' | 'country' | 'org' | 'token' | 'team' | 'topic';

/** A named real-world entity the model identified in a story (e.g. a person or
 * country), used to fetch an illustrative image for the card/article. */
export interface Entity {
  type: EntityType;
  /** Canonical name, e.g. "Gavin Newsom", "France", "Bitcoin". */
  name: string;
}

/** A resolved, license-clean image for a story, with attribution. */
export interface ImageRef {
  /** Direct image URL (HTTPS). */
  url: string;
  /** What this image depicts — mirrors the entity it was resolved from. */
  type: EntityType;
  /** Human label / caption, e.g. "Gavin Newsom". */
  name: string;
  /** Where it came from (drives the credit line + caching). */
  source: 'wikipedia' | 'flag' | 'token' | 'logo' | 'polymarket';
  /** Attribution line to show with the image, e.g. "Wikimedia Commons". */
  credit?: string;
  /** Aspect class — 'portrait' images make the best vertical card hero. */
  orientation?: 'portrait' | 'landscape' | 'square';
  width?: number;
  height?: number;
}

/**
 * A frozen snapshot of a PAST briefing — how the story (and the crowd) read at an
 * earlier point, so a reader can expand the timeline to re-read what we said then
 * and trace how our take changed as the odds moved. `hook`/`dek` are token-free.
 * The editorial "read" fields (`analysis`/`take`/`marketRead`) are stored already
 * HYDRATED (market {tokens} substituted with the then-live values at snapshot
 * time, `{odds}` = this revision's own `oddsPct`), so they render as final prose
 * with no client-side context needed. All three are optional — absent on older
 * snapshots taken before bodies were retained.
 */
export interface BriefingRevision {
  /** When this version was published (ISO). */
  generatedAt: string;
  /** The favored outcome's probability when this version was written, 0–100. */
  oddsPct: number;
  /** The favored outcome then (can differ from now if the lead later flipped). */
  favored: string;
  /** Headline as it read then. */
  hook: string;
  /** Standfirst as it read then ('' for snapshots that predate deks). */
  dek: string;
  /** The news lead as it read then (final, hydrated text). Absent on older snapshots. */
  analysis?: string;
  /** Our editorial take as it read then (final, hydrated text). */
  take?: string;
  /** The Market Lens line as it read then (final, hydrated text). */
  marketRead?: string;
}

/**
 * A corroborated "Developing" news cluster — the same event reported by multiple
 * outlets in the last hour, surfaced in the global live strip and optionally
 * pinned to a related market. Honest naming: on a ~15-min static pipeline this is
 * "first corroborated read", not wire-speed alerting, so we never label it
 * "Breaking" / "Live" — only "Developing".
 */
export interface BreakingItem {
  /** Representative headline (from the most-recent corroborating outlet). */
  title: string;
  /** Publisher domains covering it (corroboration), most-recent first. */
  outlets: string[];
  /** A representative article link. */
  url: string;
  /** Our topic bucket, e.g. "Politics". */
  topic: string;
  /** When this cluster first surfaced to us (ISO). */
  firstSeen: string;
  /** Freshest corroborating article in the cluster (ISO) — drives the "updated
   * Nm ago" age label. Optional for back-compat with feeds written before it. */
  lastSeen?: string;
  /** The id of the Crowdtells market/briefing this cluster was pinned to (set by
   * pinToMarkets when the cluster is clearly about a tracked story), so the global
   * Developing strip can deep-link a reader INTO our own briefing rather than only
   * out to the publisher. Absent when the cluster matched no tracked market. */
  marketId?: string;
}

/**
 * A real-world EVENT with a time — scheduled, live, or just-finished — relevant to
 * one of our topics. Surfaced in the "Events" tab of the live widget and, when it
 * maps to a tracked story, on that story's article. Complementary to BreakingItem
 * (which is corroborated news coverage): an EventItem is the thing happening, with
 * a clock on it. Best-effort and free-source-only by construction.
 */
export interface EventItem {
  /** Stable id (source-prefixed, e.g. "espn:401759812", "market:<id>", "econ:fomc-2026-06"). */
  id: string;
  /** Human title, e.g. "Lakers @ Celtics", "FOMC rate decision", "Hurricane warning". */
  title: string;
  /** Our topic bucket, e.g. "Sports", "Economics", "Climate". */
  topic: string;
  /** Coarse kind, drives the icon/treatment. */
  kind: 'sports' | 'esports' | 'economic' | 'weather' | 'world' | 'disaster';
  /** Lifecycle relative to now: not started / happening now / just finished. */
  status: 'scheduled' | 'live' | 'final';
  /** When the event starts/started (ISO) — the clock the UI counts down/up to. */
  startTime: string;
  /** When it ends/ended (ISO), when known. */
  endTime?: string;
  /** Short live/result detail, e.g. "Q3 · 88–84", "Final · 2–1", "resolves in 3d". */
  detail?: string;
  /** External link to follow the event (ESPN game page, etc.), when available. */
  url?: string;
  /** Which free source produced it (drives the colophon credit). */
  source:
    | 'espn'
    | 'econ'
    | 'nws'
    | 'wikipedia'
    | 'usgs'
    | 'gdacs'
    | 'reliefweb'
    | 'finnhub'
    | 'pandascore';
  /** The tracked market/briefing this event maps to (set by pinEventsToMarkets), so
   * the widget can deep-link into our briefing. Absent when it matched no story. */
  marketId?: string;
}

/** A prediction market enriched with a grounded news briefing. */
export interface Market {
  /** Stable id (Polymarket event id, or "kalshi:<event_ticker>"). */
  id: string;
  /** Which platform the data came from. */
  source: MarketSource;
  /** Event question/title. */
  title: string;
  /** Canonical URL to view/trade this market on its platform. */
  marketUrl: string;
  /** Event thumbnail URL (may be empty). */
  image: string;
  /** Primary category, e.g. "Politics", "Crypto", "Sports". */
  category: string;
  /** What the market resolves on — context for the briefing and readers. */
  description: string;

  /** Name of the currently favored outcome, e.g. "Yes" or "Donald Trump". */
  favored: string;
  /** Probability of the favored outcome, 0–100. */
  oddsPct: number;
  /** Same question on the other platform, when it trades on both. */
  alt: AltMarket | null;
  /** |this − alt| in points for the same outcome — the cross-market gap/arb. */
  divergence: number | null;
  /** Sibling markets corroborating the same real-world event — the same question on
   * the other platform and/or finer-grained contracts on the same story, collapsed
   * into this one story during the source merge. Powers a "tracked across N markets"
   * corroboration signal; `alt` remains the single cross-platform twin used for the
   * divergence gap. Absent/[] when this story stands alone. */
  peers?: AltMarket[];
  /** Other live markets that share a salient entity (a team, person, place…) but are
   * a DIFFERENT question — e.g. two teams from the same city. Surfaced as a quiet
   * "related on the board" link in the article (a noteworthy intersection), never
   * merged into this story. Absent/[] when none; every id is a published feed entry. */
  related?: RelatedMarket[];

  /** STORY LAYER. The stable id of the story this market belongs to — a hash of the
   * story's salient tokens, NOT a market id, so the story (and its living-record odds
   * curve) survives the lead market being re-elected when one facet resolves. Set on the
   * lead AND on every absorbed sub-market (which all share the lead's storyId). Absent on
   * a market that stands alone (a degenerate single-market story keeps its own id). */
  storyId?: string;
  /** True on the ONE market that LEADS its story (the broadest, longest-dated facet) —
   * the only facet briefed and ranked. Absorbed sub-markets have isStoryLead falsy and
   * are suppressed from the feed; their facet lives in the lead's `subSignals`. */
  isStoryLead?: boolean;
  /** On a lead: the absorbed sub-markets of this story as qualitative facets — the
   * crowd's read across every angle of the development (see SubSignal). Rendered as a
   * panel on the article and passed to the briefing as odds-band context. Absent/[] on a
   * single-market story. */
  subSignals?: SubSignal[];
  /** The editorial desk assigned to this story (see StoryFormat) — drives the briefing
   * prompt shape and the render. Absent on records briefed before formats existed
   * (rendered as a legacy full briefing). */
  format?: StoryFormat;
  /**
   * 24h change in the favored outcome's probability, in percentage points.
   * Positive = the favored outcome strengthened. `null` when unknown.
   */
  movement24h: number | null;
  /** 7-day change in the favored outcome's probability, in points (or null). */
  movement7d: number | null;
  /** Recent odds observations (oldest → newest), capped for size. */
  oddsHistory: OddsPoint[];
  /** Durable daily crowd-belief series: one frozen point per UTC day (the first
   * reading of each day), capped at ~2 years. Unlike oddsHistory (a ~24h high-res
   * window that's continuously trimmed), this is the long-arc record behind the
   * opinion timeline — "what the crowd believed, and when" — over weeks and months.
   * Absent on records that predate the field; accrues from first sight onward. */
  oddsDaily?: OddsPoint[];

  /** Total traded volume in USD. */
  volume: number;
  /** Trailing 24h volume in USD. */
  volume24h: number;
  /** Resting liquidity in USD. */
  liquidity: number;
  /** Open interest in USD. */
  openInterest: number;
  /** Source-platform comment count (Polymarket); 0 when unavailable. Feeds
   * ranking only — NOT shown as Crowdtells engagement. */
  comments: number;

  /** Persisted newsworthiness score (see scripts/lib/ranking.ts). The default
   * "Top"/"For You" ordering is computed from this, not re-derived client-side. */
  score: number;
  /** Newsworthiness evidence: the count of DISTINCT corroborating outlet domains that
   * covered this story in the ranking window — the PRIMARY axis of the news-led ranker
   * (volume is only a damp-only gate). 0 when no real coverage corroborates it (a market
   * trading on money alone). Persisted for ranking transparency + the digest gate. */
  newsFootprint?: number;
  /** When this story most recently held a LED feed slot (ISO) — drives a fast-decaying
   * recency dip so which open stories lead rotates day to day instead of the same few
   * standing markets. Absent until it first leads; server-only (stripped from client). */
  lastLedAt?: string;
  /** When this story's CURRENT continuous run in the live feed began (ISO) — the tenure
   * clock behind ranking's evergreen-fatigue decay (a calm, uncovered story that has
   * held a slot for days sinks so the front page rotates). Resets when a story drops
   * out and later returns; server-only (stripped from client). */
  firstLedAt?: string;

  /** When the market opened (ISO), or null. */
  startDate: string | null;
  /** Market resolution date (ISO), or null if unbounded. */
  endDate: string | null;
  status: MarketStatus;

  /** Punchy <=12-word headline produced by the model. */
  hook: string;
  /** Grounded briefing, ~70 words (routine) to ~180 (major). May contain
   * {odds}/{move7d}/{volume}/{gap}/{altOdds} tokens hydrated at render. */
  analysis: string;
  /** Crowdtells' own editorial read / fact-check (opinion). '' if none. */
  take: string;
  /** The Market Lens: one line on how the crowd's money relates to the
   * coverage — ahead of it, more/less confident, or aligned. '' if none. */
  marketRead: string;
  /** Structured market-vs-press signal: 'ahead' (market more confident than /
   * its favorite unsupported by the coverage), 'contested' (coverage actively
   * disputes the favorite), 'aligned' (they agree), or '' if unclear. */
  crowdVsCoverage: 'ahead' | 'contested' | 'aligned' | '';
  /** Cross-source breakdown (consensus / disputed / perspectives), or null. */
  synthesis: Synthesis | null;

  /** One-sentence standfirst/dek under the headline (article view + preview).
   * Optional: absent on pre-article records, '' when the model gives none. */
  dek?: string;
  /** Article section: the background/context a reader needs to follow the story.
   * May contain {tokens} (hydrated at render). '' / absent when thin. */
  background?: string;
  /** Article section: what to watch next — catalysts, dates, decision points.
   * May contain {tokens}. '' / absent when thin. */
  whatToWatch?: string;
  /** Factual precedents / notable data points about the story — historical
   * parallels, base rates, records, or prior occurrences, each stated as fact
   * (e.g. "No sitting governor has won the nomination since 1972"). Only the
   * model's HIGH-confidence items are kept (low-confidence dropped at
   * generation); compiled from public record, labeled as AI context at render.
   * Absent/[] when none. */
  precedents?: string[];
  /** Real-world entities the model identified (people, countries, tokens…),
   * ranked by prominence — the source list for image resolution. */
  entities?: Entity[];
  /** Resolved, license-clean images for the story (may be several). */
  images?: ImageRef[];
  /** The chosen lead image — a portrait when one exists — used as the card
   * background hero and the article's lead figure. null/absent when none. */
  hero?: ImageRef | null;

  /** Past briefing snapshots, newest first (capped) — the story's evolving read
   * over time. Absent until the briefing is first rewritten on a real shift. */
  revisions?: BriefingRevision[];
  /** Internal: the favored odds when the CURRENT briefing was written, so a later
   * rewrite snapshots the outgoing version with the correct then-value. */
  briefedOddsPct?: number;
  /** Internal: the favored outcome when the current briefing was written. */
  briefedFavored?: string;
  /** Internal: the favored odds when this story was FIRST briefed — stamped once
   * and never overwritten (unlike briefedOddsPct, which the result rewrite resets
   * to near-settlement). This is the honest "what we initially read" basis for the
   * /accuracy calibration curve. Absent on stories briefed before this field existed. */
  firstBriefedOddsPct?: number;
  /** Internal: the favored outcome at first briefing (frozen with firstBriefedOddsPct). */
  firstBriefedFavored?: string;
  /** Cited sources backing the briefing (empty if generation was ungrounded). */
  sources: Source[];
  /** Durable UNION of every source seen across this story's life (earliest
   * publishedAt preserved, capped) — as opposed to `sources`, which is only the
   * CURRENT briefing's citations. Powers the opinion timeline's coverage ticks so
   * regenerating a briefing never resets "when the news landed." Absent on records
   * briefed before this field existed (the timeline falls back to `sources`). */
  coverage?: Source[];
  /** Whether the briefing was grounded in live web search. */
  grounded: boolean;

  /** When the briefing was generated (ISO), or null if not yet generated. */
  generatedAt: string | null;
  /** When we last re-evaluated this story for a rewrite (odds swing / new
   * coverage) — even when nothing changed and no new briefing was written. Lets
   * the pipeline spread cheap news re-checks across runs so a calm story costs
   * one periodic RSS fetch, not a Groq call. Absent on records that predate
   * change-driven regeneration. */
  checkedAt?: string;
  /** When the market's odds/volume were last refreshed (ISO). */
  updatedAt: string;

  /**
   * Resolution recap (populated once a tracked market actually settles on its
   * platform — see scripts/lib/resolution.ts). The winning outcome's name, e.g.
   * "Yes" or "Donald Trump". null while still active or not yet captured.
   */
  resolvedOutcome: string | null;
  /** Whether the market's favored side matched the actual outcome — i.e. did the
   * crowd call it. null until `resolvedOutcome` is known. */
  calledCorrectly: boolean | null;
  /** When we recorded the resolution (ISO), or null. */
  resolvedAt: string | null;
  /** When we published the final RESULT article for this settled market (ISO).
   * Absent until written; gates the one-time past-tense result rewrite so a
   * resolved story is re-briefed exactly once, not every run. */
  resultAt?: string;
  /** Corroborated developing-news cluster(s) pinned to this story (0–2), so a
   * reader sees fresh related coverage with a "Developing" flag. */
  breaking?: BreakingItem[];
  /** Scheduled/live/just-finished real-world event(s) mapped to this story (0–3) —
   * e.g. the game, the Fed decision, the resolution date — so the article can show
   * "what's happening and when". Rebuilt fresh each run (never stale). */
  events?: EventItem[];
}

/** The published feed consumed by the web app (public/feed.json). */
export interface Feed {
  /** When this feed snapshot was produced (ISO). */
  generatedAt: string;
  /** Schema version, to allow safe evolution. */
  version: 1;
  markets: Market[];
  /** Global "Developing" strip — corroborated breaking clusters across all topics,
   * newest first. Absent/[] when nothing fresh is corroborated. */
  breaking?: BreakingItem[];
  /** Global "Events" strip — scheduled/live/just-finished events across all topics,
   * ordered live → soonest upcoming → most-recent past. Absent/[] when none. */
  events?: EventItem[];
  /** SERVER-ONLY: the LLM collision-tier decision cache (sorted pair-id → same?),
   * persisted inside store.json so borderline verdicts are stable across runs.
   * Stripped from the client feed.json (never shipped to the browser). */
  collisionDecisions?: Record<string, boolean>;
}

/** Per-provider×model LLM usage, accumulated over ONE pipeline run. Lets the admin
 * Operations console show where briefings actually ran, the tokens spent, and when a
 * provider hit its limits. Shared so the pipeline writes the exact shape the SPA reads. */
export interface LlmModelUsage {
  /** "gemini" | "groq" | "nvidia". */
  provider: string;
  /** e.g. "gemini-2.5-flash". */
  model: string;
  /** Calls attempted on this slot. */
  requests: number;
  /** Calls that returned a usable answer (transport-level 2xx). */
  ok: number;
  /** 429s — rate limit or exhausted daily/free-tier quota. */
  rateLimited: number;
  /** 503s — provider overloaded ("high demand"). */
  overloaded: number;
  /** Other failures (4xx/5xx, network, unreadable body). */
  failed: number;
  /** Total tokens billed (prompt + completion + any hidden thinking), from `usage`. */
  tokens: number;
  /** Sum of per-call latencies (ms); divide by `requests` for an average. */
  latencyMsTotal: number;
}

/** A compact end-of-run snapshot the pipeline writes to Supabase (`pipeline_runs`)
 * for the admin Operations console. All counts are for the single run. */
export interface PipelineRunSummary {
  /** ISO timestamp the run finished. */
  at: string;
  /** Wall-clock duration of the run (ms). */
  durationMs: number;
  /** Briefings written / skipped / refreshed-from-news / settled-result articles. */
  generated: number;
  skipped: number;
  refreshed: number;
  results: number;
  /** New permanent /s/ pages created this run. */
  newPages: number;
  /** Feed state after the run. */
  active: number;
  resolved: number;
  briefed: number;
  /** Candidate funnel — markets pulled vs. stories formed. */
  candidates: number;
  stories: number;
  /** Per-provider×model LLM usage for the run. */
  llm: LlmModelUsage[];
  /** The provider that LED the briefing pool this run (e.g. "nvidia"), so the console can label
   * run health by the ACTUAL primary briefer instead of hardcoding one. '' when no LLM key. */
  primaryProvider: string;
  /** True when the primary briefer was configured + tried but produced ZERO successful calls —
   * i.e. every briefing fell back to a lower-priority provider. The proactive alert signal. */
  primaryDown: boolean;
  /** Per provider:model count of BRIEFINGS actually served this run (classifier calls excluded),
   * so the console can show who wrote the articles and how many fell back off the primary
   * briefer. Rides in `detail`; no promoted column. */
  briefingsServed: { provider: string; model: string; count: number }[];
  /** Source-fetch health — feeds/outlets that errored, aggregated by source. */
  sourceErrors: { source: string; count: number }[];
  /** Short git commit the pipeline ran from (GITHUB_SHA), '' when unknown. */
  commit: string;
  /** The Actions run id, for a deep link from the console. '' when local. */
  runId: string;
}
