/**
 * Per-story Open Graph cards (1200x630 PNG), generated in the cron so a shared
 * link previews the actual story instead of the generic site card.
 *
 * Rasterized offline with @resvg/resvg-js (prebuilt N-API binary — works on the
 * Actions ubuntu runner with zero apt/system deps). resvg needs real TTF data
 * and can't read woff2, so we decompress the site's own committed woff2 fonts
 * (public/fonts/*.woff2) to TTF once per run with wawoff2 — the OG type then
 * matches the site exactly, and nothing extra is committed.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'wawoff2';
import type { Feed, Market } from '../../src/lib/types';
import { storySlug } from '../../src/lib/storyPath';
import { formatPct } from '../../src/lib/format';
import type { Config } from './config';

const W = 1200;
const H = 630;
const SERIF = 'Fraunces';
const SANS = 'Inter';
const DISPLAY = 'Source Serif 4'; // the masthead face, for the wordmark lockup

/** Escape text for safe interpolation into the SVG. */
function esc(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );
}

/** A subtle, news-first crowd cue — the favored side + odds only, no dollar
 *  volume (kept quiet now the cards lead with the story, not the bet). Empty
 *  when there's no clear side to show. */
function crowdHint(m: Market): string {
  const fav = (m.favored ?? '').trim();
  if (!fav || m.oddsPct == null) return '';
  const yn = fav.toLowerCase() === 'yes' || fav.toLowerCase() === 'no';
  const pos = yn
    ? `${formatPct(m.oddsPct)} ${fav.toLowerCase()}`
    : `${fav} ${formatPct(m.oddsPct)}`.trim();
  return `Crowd: ${pos}`;
}

/** Greedy word-wrap into at most `maxLines` lines near `maxChars` each,
 * appending an ellipsis when the headline is clipped. resvg does not wrap
 * <text>, so the lines are pre-computed here. */
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
  if (cur && lines.length < maxLines) {
    lines.push(cur);
    cur = '';
  }
  if (cur) {
    // ran out of lines with words left → ellipsize the last line
    const last = (lines[maxLines - 1] ?? '').replace(/[\s.,;:·-]+$/, '');
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** The per-story OG card as an SVG string (1200x630). News-first on the Forest
 *  theme: a category eyebrow, the headline, a one-line news standfirst (the dek),
 *  and a quiet crowd cue. Pure — fonts are applied at render time. */
export function ogSvg(m: Market): string {
  const dek = (m.dek ?? '').trim();
  const headLines = wrapLines(m.hook || m.title || '', 22, 3);
  const dekLines = dek ? wrapLines(dek, 42, 2) : [];
  const HLH = 84;
  const DLH = 46;
  // Center the headline block; nudge it up when a standfirst follows so the dek
  // has room (baselines, mirroring the original centered layout).
  const headCenter = dekLines.length ? 264 : 312;
  const headFirst = headCenter - ((headLines.length - 1) * HLH) / 2;
  const headline = headLines
    .map(
      (ln, i) =>
        `<text x="80" y="${Math.round(headFirst + i * HLH)}" font-family="${SERIF}" font-size="70" font-weight="600" fill="#eaf1ea">${esc(ln)}</text>`,
    )
    .join('\n  ');
  const dekFirst = headFirst + (headLines.length - 1) * HLH + 78;
  const standfirst = dekLines
    .map(
      (ln, i) =>
        `<text x="80" y="${Math.round(dekFirst + i * DLH)}" font-family="${SERIF}" font-size="34" fill="#aebdb2">${esc(ln)}</text>`,
    )
    .join('\n  ');
  const eyebrow = esc((m.category ?? '').toUpperCase());
  const crowd = crowdHint(m);
  const crowdEl = crowd
    ? `<text x="80" y="552" font-family="${SANS}" font-size="27" font-weight="600" letter-spacing="0.3" fill="#cf9d63">${esc(crowd)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2f25"/><stop offset="1" stop-color="#0c1410"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="80" y="120" font-family="${SANS}" font-size="29" font-weight="600" letter-spacing="3" fill="#cf9d63">${eyebrow}</text>
  ${headline}
  ${standfirst}
  ${crowdEl}
  <text x="1120" y="556" text-anchor="end" font-family="${DISPLAY}" font-size="30" font-weight="600" letter-spacing="3" fill="#eaf1ea">CROWDTELLS</text>
</svg>`;
}

let cachedFonts: string[] | null = null;

/** Decompress the site's woff2 fonts to TTF (once per process) and return the
 * file paths for resvg. */
export async function loadOgFonts(publicDir: string): Promise<string[]> {
  if (cachedFonts) return cachedFonts;
  const dir = join(tmpdir(), 'crowdtells-og-fonts');
  mkdirSync(dir, { recursive: true });
  const out: string[] = [];
  for (const [family, file] of [
    [SERIF, 'fraunces-latin.woff2'],
    [SANS, 'inter-latin.woff2'],
    [DISPLAY, 'source-serif-4-latin.woff2'],
  ] as const) {
    const ttf = Buffer.from(await decompress(readFileSync(join(publicDir, 'fonts', file))));
    const path = join(dir, `${family}.ttf`);
    writeFileSync(path, ttf);
    out.push(path);
  }
  cachedFonts = out;
  return out;
}

/** Rasterize an OG SVG to a PNG buffer with only the supplied fonts loaded. */
export function renderOgPng(svg: string, fontFiles: string[]): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles,
      serifFamily: SERIF,
      sansSerifFamily: SANS,
      defaultFontFamily: SERIF,
    },
  });
  return Buffer.from(resvg.render().asPng());
}

/** Render an OG card for every briefed story into public/og/<slug>.png and
 * return the set of slugs successfully rendered (so syndication only points at
 * images that actually exist; a single failure falls back to /og.png). */
export async function writeOgImages(feed: Feed, config: Config): Promise<Set<string>> {
  const publicDir = dirname(config.feedPath);
  const ogDir = join(publicDir, 'og');
  mkdirSync(ogDir, { recursive: true });
  // OG cards are an enhancement: if the fonts can't be decompressed (corrupt
  // woff2, missing file, OOM), skip them all and let syndication fall back to
  // /og.png — never let this abort the run before writeSyndication.
  let fonts: string[];
  try {
    fonts = await loadOgFonts(publicDir);
  } catch (err) {
    console.warn(
      `  ! OG fonts unavailable — skipping per-story cards (falling back to /og.png): ${err instanceof Error ? err.message : err}`,
    );
    return new Set();
  }
  const done = new Set<string>();
  for (const m of feed.markets) {
    if (!m.generatedAt) continue;
    const slug = storySlug(m.id);
    try {
      writeFileSync(join(ogDir, `${slug}.png`), renderOgPng(ogSvg(m), fonts));
      done.add(slug);
    } catch (err) {
      console.warn(`  ! OG image failed for ${m.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return done;
}
