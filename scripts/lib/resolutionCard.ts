/**
 * "We called it" resolution share cards — growth bet #1.
 *
 * When a tracked market settles, we render a 1200x630 PNG that reports how the
 * crowd read the question BEFORE the result was known, then whether it happened —
 * the kind of honest, share-worthy "the crowd called it / misread it" card that
 * pulls people back to a briefing. The card copy is built here (pure → testable)
 * and rasterized with the same resvg + woff2 font stack the OG cards use
 * (loadOgFonts / renderOgPng from ogImage.ts), so the type matches the site.
 *
 * HONESTY RULE: `m.briefedOddsPct` is OVERWRITTEN to near-settlement odds when the
 * result article is written, so it is NOT a trustworthy "pre-settlement read" for a
 * resolved market. We instead prefer the most recent revision in `m.revisions[]`
 * whose `generatedAt` predates `m.resolvedAt` — the last read we published while the
 * outcome was still open. When no usable pre-settlement odds exist we frame WITHOUT
 * a number ("The crowd called it." / "The crowd misread this one."), never a
 * misleadingly-confident post-hoc percentage.
 */
import type { Market } from '../../src/lib/types';
import { formatPct } from '../../src/lib/format';

const W = 1200;
const H = 630;
const SERIF = 'Fraunces';
const SANS = 'Inter';
const DISPLAY = 'Source Serif 4'; // the masthead face, for the wordmark lockup

/** Escape text for safe interpolation into the SVG (mirrors ogImage.esc). */
function esc(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );
}

/** The pre-settlement read we trust for the card: the favored side + odds as they
 * stood the LAST time we published while the outcome was still open. */
export interface PreSettlementRead {
  favored: string;
  oddsPct: number;
}

/**
 * The most recent briefing read published BEFORE the market resolved, used as the
 * honest "what the crowd thought going in" number. We deliberately do NOT fall back
 * to `m.briefedOddsPct` / `m.oddsPct`: those are overwritten toward the settled
 * value when the result article is written, so on a resolved market they'd report a
 * post-hoc near-certainty as if it were the pre-call read. Returns null when no
 * revision predates the resolution (then the caller frames without a number).
 *
 * Pure → unit-testable.
 */
export function preSettlementRead(m: Market): PreSettlementRead | null {
  if (!m.resolvedAt) return null;
  const resolvedMs = Date.parse(m.resolvedAt);
  if (Number.isNaN(resolvedMs)) return null;

  let best: { ms: number; favored: string; oddsPct: number } | null = null;
  for (const rev of m.revisions ?? []) {
    const ms = Date.parse(rev.generatedAt);
    if (Number.isNaN(ms) || ms >= resolvedMs) continue; // only reads published BEFORE settlement
    if (!rev.favored || !Number.isFinite(rev.oddsPct)) continue;
    if (!best || ms > best.ms) best = { ms, favored: rev.favored, oddsPct: rev.oddsPct };
  }
  return best ? { favored: best.favored, oddsPct: best.oddsPct } : null;
}

/** The copy for a resolution card. */
export interface ResolutionCardCopy {
  /** Small eyebrow over the headline, e.g. "CROWD CALLED IT" / "POLITICS". */
  eyebrow: string;
  /** The story's headline (the question we read). */
  headline: string;
  /** The honest verdict line — "<n> <units> ago the crowd read <favored> at <X>%.
   *  It <happened|didn't>." (or the number-free framing). */
  verdict: string;
  /** The settled outcome, e.g. "Resolved Yes" / "Donald Trump". */
  outcome: string;
  /** Whether the crowd's favored side matched the result (drives the accent tint). */
  correct: boolean | null;
}

/** Humanize the gap between the pre-settlement read and resolution as "<n> <units>".
 * Pure. Returns '' when either timestamp is missing/unparseable (the caller then
 * drops the lead-in and just says "Going in, the crowd read …"). */
export function humanizeAgo(fromIso: string | undefined, toIso: string | null | undefined): string {
  if (!fromIso || !toIso) return '';
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return '';
  const mins = Math.round((to - from) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} ${mins === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Build the resolution-card copy for a settled market (pure → unit-testable).
 *
 * Uses `preSettlementRead(m)` for the honest pre-call odds. With a usable read it
 * says "<n> <units> ago the crowd read <favored> at <X>%. It <happened|didn't>.";
 * without one it frames number-free ("The crowd called it." / "The crowd misread
 * this one."). The lead-in "<n> <units> ago" is dropped when we can't measure the
 * gap (then: "Going in, the crowd read <favored> at <X>%.").
 */
export function buildResolutionCard(m: Market): ResolutionCardCopy {
  const outcome = (m.resolvedOutcome ?? '').trim();
  const correct = m.calledCorrectly;
  const read = preSettlementRead(m);

  const eyebrow =
    correct === true ? 'The crowd called it' : correct === false ? 'The crowd misread this' : 'Resolved';

  let verdict: string;
  if (read) {
    const fav = read.favored.trim();
    const yn = fav.toLowerCase() === 'yes' || fav.toLowerCase() === 'no';
    const pos = yn ? `${fav.toLowerCase()} at ${formatPct(read.oddsPct)}` : `${fav} at ${formatPct(read.oddsPct)}`;
    const ago = humanizeAgo(latestRevisionAt(m), m.resolvedAt);
    const leadIn = ago ? `${ago} ago` : 'Going in';
    // "It happened." reads naturally for a Yes-favored call; for a named/No side we
    // report whether that side prevailed instead.
    const tail =
      correct === true ? 'It happened.' : correct === false ? "It didn't." : `Resolved ${outcome || '—'}.`;
    verdict = `${leadIn} the crowd read ${pos}. ${tail}`;
  } else {
    verdict =
      correct === true
        ? 'The crowd called it.'
        : correct === false
          ? 'The crowd misread this one.'
          : 'The crowd had read this one.';
  }

  return {
    eyebrow,
    headline: (m.hook || m.title || '').trim(),
    verdict,
    outcome: outcome ? `Resolved ${outcome}` : 'Resolved',
    correct,
  };
}

/** The generatedAt of the read we actually used (the freshest pre-settlement
 * revision), so the "<n> <units> ago" gap is measured from the right moment. */
function latestRevisionAt(m: Market): string | undefined {
  if (!m.resolvedAt) return undefined;
  const resolvedMs = Date.parse(m.resolvedAt);
  if (Number.isNaN(resolvedMs)) return undefined;
  let bestMs = -Infinity;
  let bestAt: string | undefined;
  for (const rev of m.revisions ?? []) {
    const ms = Date.parse(rev.generatedAt);
    if (Number.isNaN(ms) || ms >= resolvedMs) continue;
    if (!rev.favored || !Number.isFinite(rev.oddsPct)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      bestAt = rev.generatedAt;
    }
  }
  return bestAt;
}

/** Greedy word-wrap into at most `maxLines` lines near `maxChars` each, ellipsizing
 * a clipped final line. resvg does not wrap <text>, so we pre-compute the lines.
 * (Mirrors ogImage.wrapLines; kept local so the card module is self-contained.) */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (lines.length >= maxLines) break;
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= maxChars || !cur) cur = cand;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  else if (cur) {
    const last = (lines[maxLines - 1] ?? '').replace(/[\s.,;:·-]+$/, '');
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** The resolution card as an SVG string (1200x630). Forest theme, matching the OG
 * cards: a verdict eyebrow, the headline, the honest pre-call line, the outcome, and
 * the CROWDTELLS wordmark. A green accent when the crowd called it, wine when it
 * misread, brass when unknown. Pure — fonts are applied at render time. */
export function resolutionSvg(card: ResolutionCardCopy): string {
  const accent =
    card.correct === true ? '#7fb98a' : card.correct === false ? '#d28b8b' : '#cf9d63';
  const headLines = wrapLines(card.headline, 24, 2);
  const verdictLines = wrapLines(card.verdict, 50, 3);

  const HLH = 78;
  const headFirst = 230;
  const headline = headLines
    .map(
      (ln, i) =>
        `<text x="80" y="${headFirst + i * HLH}" font-family="${SERIF}" font-size="64" font-weight="600" fill="#eaf1ea">${esc(ln)}</text>`,
    )
    .join('\n  ');

  const VLH = 42;
  const verdictFirst = headFirst + headLines.length * HLH + 18;
  const verdict = verdictLines
    .map(
      (ln, i) =>
        `<text x="80" y="${verdictFirst + i * VLH}" font-family="${SERIF}" font-size="31" fill="#aebdb2">${esc(ln)}</text>`,
    )
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2f25"/><stop offset="1" stop-color="#0c1410"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="80" y="96" width="56" height="5" rx="2.5" fill="${accent}"/>
  <text x="80" y="148" font-family="${SANS}" font-size="29" font-weight="600" letter-spacing="3" fill="${accent}">${esc(card.eyebrow.toUpperCase())}</text>
  ${headline}
  ${verdict}
  <text x="80" y="556" font-family="${SANS}" font-size="27" font-weight="600" letter-spacing="0.3" fill="${accent}">${esc(card.outcome)}</text>
  <text x="1120" y="556" text-anchor="end" font-family="${DISPLAY}" font-size="30" font-weight="600" letter-spacing="3" fill="#eaf1ea">CROWDTELLS</text>
</svg>`;
}
