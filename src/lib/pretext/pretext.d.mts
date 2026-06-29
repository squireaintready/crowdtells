/**
 * Type sidecar for the vendored Pretext engine (`pretext.mjs`), paired by basename
 * so TS (moduleResolution: bundler, no allowJs) resolves `./pretext.mjs` to these
 * types without compiling the minified source.
 *
 * The engine is a zero-dependency build copied verbatim from `lab/pretext/pretext.mjs`.
 * It measures real text geometry with the browser's own canvas metrics, so it is
 * BROWSER-ONLY — it throws "Text measurement requires OffscreenCanvas or a DOM canvas
 * context." when neither exists (jsdom, SSR). It is only ever reached via a dynamic
 * `import()` on the client, behind a try/catch, so that throw is the calm-fallback
 * path, never a hard error.
 *
 * Types are intentionally loose (this is an external engine) and cover only the
 * surface `engine.ts` calls.
 */

/** Opaque measured handle from `prepare()` — fed to `layout()`. */
export type Prepared = unknown;
/** Opaque segmented handle from `prepareWithSegments()` — enables the line APIs. */
export type Segments = unknown;

/** A position in the segmented text: which word-segment, which grapheme within it. */
export interface FlowState {
  segmentIndex: number;
  graphemeIndex: number;
}

/** One laid-out line: its text, pixel width, and the state at its start/end. */
export interface FlowLine {
  text: string;
  width: number;
  start: FlowState;
  end: FlowState;
}

/** A line in a full breakdown (`layoutWithLines`). */
export interface PlacedLine {
  text: string;
  width: number;
  start: FlowState;
  end: FlowState;
}

/** One-time text measurement. `font` is a CSS shorthand, e.g. "400 16px 'Source Serif 4'". */
export function prepare(text: string, font: string): Prepared;

/** Fast height/line-count for a measured handle at a given width. Sub-millisecond. */
export function layout(
  prepared: Prepared,
  maxWidth: number,
  lineHeight: number,
): { lineCount: number; height: number };

/** Like `prepare()` but returns a handle that enables the line-level APIs below. */
export function prepareWithSegments(text: string, font: string): Segments;

/** Full line-by-line breakdown of `segs` at a fixed width. */
export function layoutWithLines(
  segs: Segments,
  maxWidth: number,
  lineHeight: number,
): { lineCount: number; height: number; lines: PlacedLine[] };

/**
 * Iterator over lines. The signature is THREE args — `(segs, state, maxWidth)`.
 * Passing a DIFFERENT `maxWidth` per call is what lets prose flow around a shape.
 * Pass `{segmentIndex:0,graphemeIndex:0}` as the initial state; the next state is the
 * returned line's `.end`. Returns `null` when the text is exhausted.
 */
export function layoutNextLine(
  segs: Segments,
  state: FlowState,
  maxWidth: number,
): FlowLine | null;

/** Calls `cb` once per possible line break — for shrink-to-fit width search. */
export function walkLineRanges(
  segs: Segments,
  maxWidth: number,
  cb: (line: { width: number; start: FlowState; end: FlowState }) => void,
): void;

/** Clears the engine's internal measurement caches (e.g. when cycling fonts). */
export function clearCache(): void;
