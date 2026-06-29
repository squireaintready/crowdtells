/**
 * The Calibration Desk — pure gamification math, shared by the web app and the
 * pipeline scorer (scripts/lib/scoring.ts). NO Supabase import: this is the single,
 * unit-tested source of truth for how a reader's "Call" is scored and how trust /
 * streaks progress. The SQL in supabase/schema.sql mirrors the streak + tier rules
 * (kept deliberately tiny there); the genuinely numeric scoring lives ONLY here.
 *
 * Design stance (anti-casino): we score with a proper rule (Brier) — rewarding being
 * right AND honest about confidence — never naive +1/-1 points, which reward
 * overconfidence and luck. Everything is non-cashable and personal-best framed.
 */

/** A reader's call on whether the market's favored outcome will actually happen. */
export type Pick = 'yes' | 'no';

/** Earned-trust ladder. Power follows CURRENT activity (90-day rolling, decays). */
export type Tier = 'reader' | 'contributor' | 'steward';

/**
 * The confidence ladder. Deliberately excludes 50 (a non-prediction) and 100
 * (degenerate Brier / impossible to be perfectly certain) — the two values every
 * serious forecasting platform forbids. Maps a 5-step slider to honest odds.
 */
export const CONFIDENCE_STEPS = [55, 65, 75, 85, 95] as const;
export type Confidence = (typeof CONFIDENCE_STEPS)[number];

/** Sample gates: no luck-free claims until enough has resolved (JRSS-style). */
export const MIN_CALLS_FOR_VERDICT = 20;

/** Normalize an outcome name for comparison — mirrors scripts/lib/resolution.ts. */
export function normalizeOutcome(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The probability a reader's call assigns to the TARGET outcome actually
 * happening. "Yes, it happens" at 75% → 0.75; "No, it doesn't" at 75% → 0.25.
 * So the stated belief is one number on [0.05, 0.95], never 0/0.5/1.
 */
export function impliedProb(pick: Pick, confidence: number): number {
  const c = confidence / 100;
  return pick === 'yes' ? c : 1 - c;
}

/** Brier score for a single binary call: (p − outcome)², in [0, 1]. Lower = better. */
export function brierScore(prob: number, won: boolean): number {
  const o = won ? 1 : 0;
  return (prob - o) * (prob - o);
}

/** Did the reader's call point the right way (their side beat 50/50)? */
export function calledCorrectly(prob: number, won: boolean): boolean {
  return prob >= 0.5 === won;
}

/** Median of a non-empty list; average of the two middles for even counts. */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * Peer score: a reader's Brier minus the median Brier on the SAME market. This
 * cancels question difficulty — calling a 99% lock earns ≈nothing; only beating
 * the crowd counts. Negative = sharper than the room.
 */
export function peerScore(brier: number, marketMedianBrier: number): number {
  return brier - marketMedianBrier;
}

/**
 * Crowdtell's OWN read, scored by the identical rule, so we can publish platform
 * calibration ("our reads are calibrated") — a credibility claim no news
 * aggregator makes. Uses the odds when we last briefed (our actual published read),
 * not the near-certain settlement-time odds.
 */
export function ourBrier(briefedOddsPct: number, briefedFavored: string, resolvedOutcome: string): number {
  const prob = briefedOddsPct / 100;
  const won = normalizeOutcome(resolvedOutcome) === normalizeOutcome(briefedFavored);
  return brierScore(prob, won);
}

/**
 * A friendly 0–100 calibration rating from a mean Brier. Brier 0 (perfect) → 100,
 * 0.25 (a coin flip) → 50, 0.5 (perfectly wrong) → 0. The fun number on top of the
 * rigorous math. Clamped.
 */
export function calibrationRating(meanBrier: number): number {
  return Math.max(0, Math.min(100, Math.round(100 * (1 - 2 * meanBrier))));
}

/** Plain-language verdict, sample-gated so a cold start reads as "building", not noise. */
export function calibrationVerdict(meanBrier: number, n: number): string {
  if (n < MIN_CALLS_FOR_VERDICT) return 'Building your record';
  if (meanBrier <= 0.12) return 'Sharp — well-calibrated';
  if (meanBrier <= 0.2) return 'Well-calibrated';
  if (meanBrier <= 0.28) return 'Roughly calibrated';
  return 'Overconfident — ease up on the highs';
}

// ───────────────────────── reading streak ─────────────────────────

export interface StreakState {
  current: number;
  longest: number;
  /** Last day a read counted, as 'YYYY-MM-DD' (UTC), or null if never. */
  lastDate: string | null;
}

/** Whole-day gap between two 'YYYY-MM-DD' dates (b − a), in UTC. */
export function dayGap(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

/**
 * Advance a gentle reading streak. A FREE automatic freeze covers a single missed
 * day (gap ≤ 2 keeps the run going), so a busy reader isn't punished — the humane
 * opposite of monetized loss-aversion. Two+ missed days resets to 1. Idempotent
 * within a day. The SQL touch_read() mirrors this exact rule.
 */
export function nextStreak(prev: StreakState, today: string): StreakState {
  if (!prev.lastDate) return { current: 1, longest: Math.max(1, prev.longest), lastDate: today };
  const gap = dayGap(prev.lastDate, today);
  if (gap <= 0) return { ...prev, lastDate: today }; // same day (or clock skew) — no double count
  const current = gap <= 2 ? prev.current + 1 : 1; // gap 2 = the free grace day
  return { current, longest: Math.max(prev.longest, current), lastDate: today };
}

// ───────────────────────── trust ladder ─────────────────────────

/** Inputs to tier assignment — all counted over a rolling 90-day window. */
export interface TrustCounts {
  briefingsRead: number;
  callsMade: number;
  resolvedCalls: number;
  commentsPosted: number;
  /** Mean peer score over resolved calls (negative = beats the crowd). */
  avgPeer: number;
  /** Days since the reader was last active (read/called/commented). */
  daysSinceActive: number;
}

export const TIER_RULES = {
  contributor: { briefingsRead: 5, contributions: 3 },
  steward: { resolvedCalls: 10, commentsPosted: 10, maxAvgPeer: 0, maxDaysInactive: 14 },
} as const;

/**
 * Earned tier from a blend of CONSUMPTION (reading) and VALIDATED contribution
 * (calibrated calls, comments) — never raw post-count. Steward additionally
 * requires demonstrated calibration (beats the crowd over a real sample) AND
 * current activity, so the trusted tier decays when someone goes quiet. The SQL
 * recompute_trust() mirrors this rule exactly.
 */
export function tierFor(c: TrustCounts): Tier {
  const isContributor =
    c.briefingsRead >= TIER_RULES.contributor.briefingsRead &&
    c.callsMade + c.commentsPosted >= TIER_RULES.contributor.contributions;
  const isSteward =
    isContributor &&
    c.resolvedCalls >= TIER_RULES.steward.resolvedCalls &&
    c.commentsPosted >= TIER_RULES.steward.commentsPosted &&
    c.avgPeer <= TIER_RULES.steward.maxAvgPeer &&
    c.daysSinceActive <= TIER_RULES.steward.maxDaysInactive;
  if (isSteward) return 'steward';
  if (isContributor) return 'contributor';
  return 'reader';
}

export const TIERS: Record<Tier, { label: string; blurb: string }> = {
  reader: { label: 'Reader', blurb: 'Reading, voting, and weighing in.' },
  contributor: {
    label: 'Contributor',
    blurb: 'A regular who reads and makes calls — can write context on disputed claims.',
  },
  steward: {
    label: 'Steward',
    blurb: 'A proven, calibrated regular who helps keep the discussion honest.',
  },
};

/** Report categories. The rule-breaking set is the ONLY thing a Steward flag can
 * auto-hide (and only on a brand-new account) — disagreement never auto-hides. */
export const RULE_BREAKING_CATEGORIES = ['spam', 'abuse', 'rules'] as const;
export type ReportCategory = (typeof RULE_BREAKING_CATEGORIES)[number] | 'other';

// ───────────────────────── badges ─────────────────────────

export interface BadgeMeta {
  label: string;
  blurb: string;
  /** A single-glyph mark (no icon font); rendered in the chip. */
  mark: string;
}

/** Recognition badges. Non-fungible, earned by being right over time / showing up.
 * This holds DISPLAY metadata only — the AWARD thresholds live in
 * supabase/schema.sql (recompute_trust for first_call/calibrated/sharp/called_it/
 * contributor/steward; touch_read for on_a_roll). 'calibrated' mirrors
 * MIN_CALLS_FOR_VERDICT above; keep both in sync if a threshold changes. */
export const BADGES: Record<string, BadgeMeta> = {
  first_call: { label: 'First call', blurb: 'Made your first prediction.', mark: '◆' },
  called_it: {
    label: 'Called it',
    blurb: 'Nailed a high-confidence call the crowd was unsure about.',
    mark: '✓',
  },
  calibrated: {
    label: 'Calibrated',
    blurb: `Well-calibrated across ${MIN_CALLS_FOR_VERDICT}+ resolved calls.`,
    mark: '◎',
  },
  sharp: { label: 'Sharp', blurb: 'Beats the crowd over a real sample of calls.', mark: '★' },
  sharp_ii: {
    label: 'Sharper',
    blurb: 'Beat the crowd across 15+ resolved calls — a sustained edge, not a hot streak.',
    mark: '✦',
  },
  sharp_iii: {
    label: 'Sharpest',
    blurb: 'Beat the crowd across 35+ resolved calls. Top-tier calibration over a long sample.',
    mark: '✶',
  },
  on_a_roll: { label: 'On a roll', blurb: 'A 7-day reading streak.', mark: '▲' },
  devoted: { label: 'Devoted', blurb: 'Kept a 30-day reading streak.', mark: '❉' },
  stalwart: { label: 'Stalwart', blurb: 'Kept a 100-day reading streak.', mark: '✺' },
  corrected_the_record: {
    label: 'Corrected the record',
    blurb: 'Wrote context on a disputed claim that readers across viewpoints found helpful.',
    mark: '✚',
  },
  fact_checker: {
    label: 'Fact-checker',
    blurb: 'Weighed in on what the coverage agrees and disputes — landing with the consensus.',
    mark: '⊕',
  },
  bridge_builder: {
    label: 'Common ground',
    blurb: 'Your reads keep landing where readers across viewpoints agree, not just your side.',
    mark: '⋈',
  },
  contributor: { label: 'Contributor', blurb: 'Reached the Contributor tier.', mark: '◈' },
  steward: { label: 'Steward', blurb: 'Reached the Steward tier.', mark: '⬢' },
  founding_reader: {
    label: 'Founding reader',
    blurb: 'Here from Crowdtells’ founding weeks — a charter reader.',
    mark: '❖',
  },
};

/** The signals the hub already holds (from my_trust) that drive a still-to-earn badge's progress. */
export interface BadgeSignals {
  resolvedCalls: number;
  currentStreak: number;
  alignedVotes: number;
  helpfulNotes: number;
}

/**
 * Progress toward a still-to-earn badge, for the hub gallery — `{have, need}` or null. Only badges
 * whose award is a single monotonic COUNT get a bar; the rest stay a static how-to because a count
 * would mislead: sharp/sharp_ii/sharp_iii also need a crowd-beating edge, bridge_builder a hit
 * ratio, contributor/steward are tier-gated (shown by the ladder), and founding_reader is a one-off
 * tenure flag. The thresholds MIRROR the award logic in supabase/schema.sql (recompute_trust +
 * touch_read) — keep the two in sync.
 */
export function badgeProgress(id: string, s: BadgeSignals): { have: number; need: number } | null {
  switch (id) {
    case 'calibrated':
      return { have: s.resolvedCalls, need: MIN_CALLS_FOR_VERDICT };
    case 'on_a_roll':
      return { have: s.currentStreak, need: 7 };
    case 'devoted':
      return { have: s.currentStreak, need: 30 };
    case 'stalwart':
      return { have: s.currentStreak, need: 100 };
    case 'fact_checker':
      return { have: s.alignedVotes, need: 15 };
    case 'corrected_the_record':
      return { have: s.helpfulNotes, need: 1 };
    default:
      return null;
  }
}

/** Max length of a community note (short, sourced context — not an essay). */
export const NOTE_MAX = 600;

// ───────────────────────── standing (the visible ladder) ─────────────────────────

/**
 * STANDING — one private, visible progression that unifies the Calibration Desk's signals
 * into a level + newsroom title. Earned by accuracy + cross-viewpoint helpfulness, never raw
 * volume; never a public leaderboard (opt-in profile only). The 7 levels sit in three bands
 * that match the trust tiers: the TIER sets the band (the capability gate, unchanged), and
 * `merit` positions WITHIN it. Clamping up keeps level ≥ what your tier implies; clamping at
 * the band ceiling means raw merit can't outrun an un-earned tier — the un-farmable property
 * that keeps Standing meaning trust, not activity.
 *
 * meritScore + levelFor here are the canonical, unit-tested SPEC. `recompute_trust` in
 * supabase/schema.sql MIRRORS them to store merit + level (read by both the owner's panel and
 * the opt-in public profile, so the two never disagree). Keep the SQL in sync — the
 * gamify.test.ts fixtures pin the expected numbers a change must not silently break.
 */

/** Inputs to merit — counted over the same rolling 90-day window as the trust tier. */
export interface MeritSignals {
  briefingsRead: number;
  callsMade: number;
  resolvedCalls: number;
  /** Mean peer score over resolved calls (negative = sharper than the room). */
  avgPeer: number;
  commentsPosted: number;
  /** Community notes that reached cross-viewpoint 'helpful' status. */
  helpfulNotes: number;
}

/**
 * Merit weights. Accuracy (resolved calls + beating the crowd) and helpfulness (bridged
 * notes) dominate; consumption (reads) and conversation (comments) are CAPPED so volume alone
 * can't climb the ladder — the anti-Goodhart core. Reading is the on-ramp (never zero) but
 * tops out fast.
 */
export const MERIT_WEIGHTS = {
  readEach: 1,
  readCap: 25,
  callEach: 3,
  resolvedEach: 6,
  /** Per unit of (−avgPeer) edge × resolved calls — rewards being right AND sharper. */
  edgeEach: 80,
  commentEach: 2,
  commentCap: 20,
  noteEach: 30,
} as const;

/** A reader's merit: a non-cashable, decaying score (the 90-day window rolls). Pure + clamped. */
export function meritScore(s: MeritSignals): number {
  const w = MERIT_WEIGHTS;
  const reads = Math.min(Math.max(0, s.briefingsRead), w.readCap) * w.readEach;
  const calls = Math.max(0, s.callsMade) * w.callEach;
  const resolved = Math.max(0, s.resolvedCalls) * w.resolvedEach;
  const edge = Math.max(0, -s.avgPeer) * Math.max(0, s.resolvedCalls) * w.edgeEach;
  const comments = Math.min(Math.max(0, s.commentsPosted), w.commentCap) * w.commentEach;
  const notes = Math.max(0, s.helpfulNotes) * w.noteEach;
  return Math.round(reads + calls + resolved + edge + comments + notes);
}

export interface LevelMeta {
  /** 1..7. */
  level: number;
  title: string;
  /** The trust band this level belongs to (so level and tier never disagree). */
  tier: Tier;
  /** Absolute merit needed to reach this level (monotonic across all 7). */
  meritFloor: number;
  /** A capability/standing unlocked here — only set where a real gate exists. */
  unlock?: string;
}

/** The standing ladder — newsroom titles extending the reader→contributor→steward tiers. */
export const LEVELS: readonly LevelMeta[] = [
  {
    level: 1,
    title: 'Reader',
    tier: 'reader',
    meritFloor: 0,
    unlock: 'Read, save, react — and weigh in on every claim',
  },
  { level: 2, title: 'Regular', tier: 'reader', meritFloor: 25 },
  {
    level: 3,
    title: 'Caller',
    tier: 'reader',
    meritFloor: 70,
    unlock: 'Your calls build a scored calibration record',
  },
  {
    level: 4,
    title: 'Contributor',
    tier: 'contributor',
    meritFloor: 120,
    unlock: 'Add sourced context to disputed claims',
  },
  { level: 5, title: 'Correspondent', tier: 'contributor', meritFloor: 230 },
  {
    level: 6,
    title: 'Steward',
    tier: 'steward',
    meritFloor: 380,
    unlock: 'Help curate and keep the thread honest',
  },
  { level: 7, title: 'Editor-at-large', tier: 'steward', meritFloor: 650, unlock: 'By invitation' },
] as const;

/** Each tier's contiguous span of levels — the band merit is clamped into. */
const BANDS: Record<Tier, { floor: number; ceil: number }> = {
  reader: { floor: 1, ceil: 3 },
  contributor: { floor: 4, ceil: 5 },
  steward: { floor: 6, ceil: 7 },
};

/**
 * The level for a (tier, merit): merit picks the raw level, then it's clamped into the tier's
 * band. Clamping UP keeps a fresh Contributor at ≥ level 4 even with little merit; clamping at
 * the ceiling means raw merit can't exceed your band until the tier itself is earned.
 */
export function levelFor(tier: Tier, merit: number): LevelMeta {
  const band = BANDS[tier];
  let raw = 1;
  for (const L of LEVELS) if (merit >= L.meritFloor) raw = L.level;
  const n = Math.min(Math.max(raw, band.floor), band.ceil);
  return LEVELS[n - 1]!;
}

export interface LevelProgress {
  current: LevelMeta;
  /** The next level, or null at the top. */
  next: LevelMeta | null;
  /** 0..1 toward the next level by merit (1 when maxed or tier-gated). */
  progress: number;
  /** Merit remaining to the next level (0 when tier-gated or maxed). */
  meritToGo: number;
  /** The next level needs a TIER promotion (earned via the tier rules), not just merit. */
  gatedByTier: boolean;
}

/** Resolve a reader's place on the ladder + how far to the next rung — for the panel UI. */
export function levelProgress(tier: Tier, merit: number): LevelProgress {
  const current = levelFor(tier, merit);
  const band = BANDS[tier];
  if (current.level >= LEVELS.length) {
    return { current, next: null, progress: 1, meritToGo: 0, gatedByTier: false };
  }
  const next = LEVELS[current.level]!; // level is 1-based, so this is the next rung
  if (current.level >= band.ceil) {
    // At the band ceiling — the next rung lives in a higher tier, earned by promotion.
    return { current, next, progress: 1, meritToGo: 0, gatedByTier: true };
  }
  const span = Math.max(1, next.meritFloor - current.meritFloor);
  const into = Math.max(0, merit - current.meritFloor);
  return {
    current,
    next,
    progress: Math.max(0, Math.min(1, into / span)),
    meritToGo: Math.max(0, next.meritFloor - merit),
    gatedByTier: false,
  };
}

/** Plain-language "how to reach the next tier", shown when a level is tier-gated. Mirrors
 * TIER_RULES (and recompute_trust); null at the top tier. */
export function nextTierHint(tier: Tier): string | null {
  if (tier === 'reader')
    return 'Read 5 briefings and make 3 calls or comments to reach Contributor.';
  if (tier === 'contributor')
    return 'Land 10 resolved calls that beat the crowd, and stay active, to reach Steward.';
  return null;
}
