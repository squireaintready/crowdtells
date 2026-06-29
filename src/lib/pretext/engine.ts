/**
 * Pretext toolkit — typed wrappers over the vendored Pretext engine.
 *
 * Ported from `lab/pretext/lib.js` (same API), TypeScript-typed loosely. This is
 * the FOUNDATION of the "aggressive" reading style: the engine measures real text
 * geometry in the browser, so prose can be flowed around an arbitrary shape (the
 * crowd's confidence curve) line by line.
 *
 * BROWSER-ONLY. `pretext.mjs` needs OffscreenCanvas or a DOM canvas context and
 * throws without one (jsdom, SSR). This module is therefore only ever reached via
 * a dynamic `import()` on the client, behind a try/catch — so that throw is the
 * calm-fallback path, never a hard failure. Calm readers never load this chunk.
 */
import {
  prepare,
  prepareWithSegments,
  layout,
  layoutWithLines,
  layoutNextLine,
  walkLineRanges,
  clearCache,
  type FlowState,
} from './pretext.mjs';

export {
  prepare,
  prepareWithSegments,
  layout,
  layoutWithLines,
  layoutNextLine,
  walkLineRanges,
  clearCache,
};
export type { FlowState };
// Pure (no-canvas) helper, re-exported for toolkit parity. Callers that only need
// interpolation should import it from './lerp' directly to stay off the engine.
export { lerpSeries } from './lerp';

/** Effectively-infinite width, for measuring a single unconstrained line. */
const BIG = 1_000_000;

/**
 * Load every brand face/weight we measure with, then await the font set. A
 * Pretext measurement only matches the rendered glyphs if the SAME css-font
 * string is used AND the face is loaded first — so call this once before any
 * measurement. Resolves (never rejects) so a flaky font load can't break flow.
 *
 * Memoized: an article mounts several Pretext instances at once (AggressiveLead +
 * the justified dek + FitText numbers + the masthead wordmark), and each re-fires on
 * resize/story-nav. Without memoization every one issued its own 7 `fonts.load()`
 * calls + `fonts.ready` await — redundant async churn. Now all callers share one
 * promise, so the loads happen exactly once per page.
 */
let fontsReady: Promise<void> | null = null;
export function readyFonts(): Promise<void> {
  return (fontsReady ??= (async () => {
    const probes = [
      "400 16px 'Source Serif 4'",
      "600 16px 'Source Serif 4'",
      "300 16px 'Source Serif 4'",
      "400 18px 'Source Serif 4'",
      "400 14px 'Inter Variable'",
      "340 120px 'Fraunces Variable'",
      "380 48px 'Fraunces Variable'",
    ];
    try {
      await Promise.all(probes.map((f) => document.fonts.load(f)));
    } catch {
      /* older engines / no variable-font support — fall through to fonts.ready */
    }
    await document.fonts.ready;
  })());
}

/** Pixel width of `text` laid out on a single unconstrained line, in css-font `font`. */
export function measureWidth(text: string, font: string): number {
  const segs = prepareWithSegments(text, font);
  const { lines } = layoutWithLines(segs, BIG, 10);
  return lines.length ? lines[0]!.width : 0;
}

/**
 * Font-size (px) that makes `text` fill ~`target` px on ONE line, in `family` at
 * `weight`. Width is ~linear in size, so measure at a reference size and scale,
 * then refine once to absorb hinting drift. Exact-fit display type — impossible
 * to eyeball in CSS.
 */
export function fitFontSize(
  text: string,
  {
    family,
    weight = 400,
    target,
    min = 8,
    max = 600,
  }: { family: string; weight?: number; target: number; min?: number; max?: number },
): number {
  const ref = 100;
  const w0 = measureWidth(text, `${weight} ${ref}px ${family}`);
  if (!w0) return min;
  let size = ref * (target / w0);
  const w1 = measureWidth(text, `${weight} ${size}px ${family}`);
  if (w1) size *= target / w1;
  return Math.max(min, Math.min(max, size));
}

/** A placed line from `flowAround`: its text, measured width, the per-line max
 *  width it was given, the y of its top, and its index. */
export interface FlowedLine {
  text: string;
  width: number;
  avail: number;
  y: number;
  i: number;
}

/**
 * Flow `text` down a column where each line's max width is `widthAt(yMid, lineIndex)`.
 * The engine guarantees every returned line fits its per-line width, so the ragged
 * right edge traces whatever shape `widthAt` describes. Returns placed lines + total
 * height. `minWidth` floors the per-line width so a line is never illegibly narrow.
 */
export function flowAround(
  text: string,
  font: string,
  {
    lineHeight,
    widthAt,
    minWidth = 24,
    maxLines = 600,
  }: {
    lineHeight: number;
    widthAt: (yMid: number, lineIndex: number) => number;
    minWidth?: number;
    maxLines?: number;
  },
): { lines: FlowedLine[]; height: number; lineCount: number } {
  const segs = prepareWithSegments(text, font);
  let state: FlowState = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;
  const lines: FlowedLine[] = [];
  for (let i = 0; i < maxLines; i++) {
    const avail = Math.max(minWidth, widthAt(y + lineHeight * 0.5, i));
    const line = layoutNextLine(segs, state, avail);
    if (!line) break;
    lines.push({ text: line.text, width: line.width, avail, y, i });
    const next = line.end;
    // No-progress guard: if the cursor didn't advance, stop (avoids an infinite loop
    // on a word wider than the available width).
    if (
      next.segmentIndex === state.segmentIndex &&
      next.graphemeIndex === state.graphemeIndex
    ) {
      break;
    }
    state = next;
    y += lineHeight;
  }
  return { lines, height: lines.length * lineHeight, lineCount: lines.length };
}

/** Quick estimate of how many lines `text` takes at width `w` — used to size the
 *  belief profile before the real flow runs. */
export function estimateLineCount(
  text: string,
  font: string,
  w: number,
  lineHeight: number,
): number {
  return layout(prepare(text, font), w, lineHeight).lineCount;
}

/**
 * Metric justification: every line but the last fills `width` exactly by adding
 * word-spacing. CSS `text-align: justify` can't give the per-line numbers — Pretext
 * measures each line so we distribute the slack ourselves.
 */
export function justifyParagraph(
  text: string,
  font: string,
  {
    width,
    lineHeight,
    justifyLast = false,
  }: { width: number; lineHeight: number; justifyLast?: boolean },
): { text: string; width: number; wordSpacing: number; y: number; isLast: boolean }[] {
  const segs = prepareWithSegments(text, font);
  const { lines } = layoutWithLines(segs, width, lineHeight);
  return lines.map((ln, i) => {
    const spaces = (ln.text.match(/ /g) || []).length;
    const isLast = i === lines.length - 1;
    const slack = width - ln.width;
    const wordSpacing =
      spaces > 0 && (!isLast || justifyLast) && slack > 0 ? slack / spaces : 0;
    return {
      text: ln.text.replace(/\s+$/, ''),
      width: ln.width,
      wordSpacing,
      y: i * lineHeight,
      isLast,
    };
  });
}

/**
 * Tightest width that still wraps `text` into the same number of lines it has at
 * `maxWidth` — the chat-bubble shrinkwrap (a tile hugs its text, no ragged gutter).
 */
export function shrinkwrap(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
): { width: number; height: number; lineCount: number } {
  const h = prepare(text, font);
  const target = layout(h, maxWidth, lineHeight).lineCount;
  let lo = 8;
  let hi = maxWidth;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (layout(h, mid, lineHeight).lineCount <= target) hi = mid;
    else lo = mid;
  }
  const fin = layout(h, hi, lineHeight);
  return { width: Math.ceil(hi), height: fin.height, lineCount: fin.lineCount };
}

/** Read a themed CSS custom property off :root (so JS-drawn SVG follows the active theme). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
