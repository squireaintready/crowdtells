import { useEffect, useId, useRef, useState } from 'react';
import { useIntensity } from '../../hooks/useIntensity';
import { formatPct } from '../../lib/format';
import type { OddsPoint } from '../../lib/types';
import styles from './AggressiveLead.module.css';

interface Props {
  /** The lead/teaser prose (already hydrated). Always the real, crawlable text. */
  text: string;
  /** The durable belief arc, oldest → newest. Drawn as a real left→right chart. */
  series: OddsPoint[];
  /** Calm class for the prose paragraph, so calm mode renders EXACTLY the shipped
   *  look (the caller passes its own prose class). */
  proseClassName: string;
  /** Optional coverage dates (ISO strings) → brass ticks on the time axis. */
  coverageDates?: string[];
  /** Compact sizing for a feed card (smaller, shorter chart strip). */
  compact?: boolean;
  /** Optional class on the shell — e.g. a column constraint so a card's figure stays
   *  clear of the image band. */
  className?: string;
}

const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Belief series run dense (often 70–96 points), which renders as a jittery sawtooth.
// Evenly down-sample to a clean editorial resolution — always keeping the first and
// last point so the span and the "now" value are exact. Honest (no interpolation /
// fake smoothing), just fewer samples.
const MAX_POINTS = 56;
function resampleSeries(s: OddsPoint[]): OddsPoint[] {
  if (s.length <= MAX_POINTS) return s;
  const step = (s.length - 1) / (MAX_POINTS - 1);
  const out: OddsPoint[] = [];
  for (let i = 0; i < MAX_POINTS; i++) out.push(s[Math.round(i * step)]!);
  out[out.length - 1] = s[s.length - 1]!; // pin the latest reading exactly
  return out;
}

/** Short axis date, e.g. "Jun 1". Client-only (called inside the layout effect). */
function shortDate(t: string | undefined): string {
  if (!t) return '';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface BeliefView {
  W: number;
  H: number; // height of the chart strip
  padL: number;
  baseY: number;
  plotW: number;
  area: string;
  line: string;
  dots: { x: number; y: number; now: boolean }[];
  ticks: number[];
  dateL: string;
  dateR: string;
  finalPct: string;
  finalX: number;
  finalY: number;
  accent: string;
  muted: string;
  surface: string;
}

interface BuildInputs {
  text: string;
  series: OddsPoint[];
  coverageDates?: string[];
  compact?: boolean;
}

/** The lazily-imported Pretext toolkit (typed from the module itself). */
type Engine = typeof import('../../lib/pretext/engine');

/**
 * Build the belief chart strip that sits BELOW the lead text — the lead reads as the
 * prose on top, resting on its odds curve.
 *
 * It's a real time-series: TIME runs left→right on the x-axis, probability bottom→top
 * on the y-axis (a sideways time-axis reads as a broken chart — never do that). A slim
 * fixed-height strip: the area-fill + curve, the "now" reading at the last point, and
 * the date span on the baseline. No y-axis labels — the curve + final % + dates carry
 * it, and a clean strip reads better under the text than a gridded box.
 */
function buildBeliefView(w: number, engine: Engine, cfg: BuildInputs): BeliefView | null {
  const series = resampleSeries(cfg.series);
  const n = series.length;
  if (n < 2) return null;

  const accent = engine.token('--accent') || '#cf9d63';
  const muted = engine.token('--text-mute') || '#8a9b8f';
  const surface = engine.token('--bg') || '#0c1410';

  const padL = cfg.compact ? 4 : 6;
  const padR = cfg.compact ? 12 : 16;
  const padT = cfg.compact ? 12 : 16; // headroom so the curve peak doesn't kiss the text
  const padB = cfg.compact ? 20 : 24; // room for the date axis
  // A slim strip — tall enough to read the curve's shape, short enough that it stays a
  // supporting visual beneath the lead, not a hero box.
  const H = Math.round(cfg.compact ? clampN(w * 0.3, 92, 124) : clampN(w * 0.24, 120, 168));

  const plotW = w - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;
  const xOf = (i: number) => padL + (n <= 1 ? 0 : i / (n - 1)) * plotW;
  const yOf = (p: number) => padT + (1 - clampN(p, 0, 100) / 100) * plotH;

  let area = `M${xOf(0).toFixed(1)},${baseY.toFixed(1)} `;
  let line = '';
  series.forEach((p, i) => {
    const x = xOf(i).toFixed(1);
    const y = yOf(p.p).toFixed(1);
    area += `L${x},${y} `;
    line += `${i ? 'L' : 'M'}${x},${y} `;
  });
  area += `L${xOf(n - 1).toFixed(1)},${baseY.toFixed(1)} Z`;
  // Only the endpoints get a dot — the start of the record and "now" — so the line
  // reads clean instead of a string of beads. (The line itself traces every sample.)
  const dots = [
    { x: xOf(0), y: yOf(series[0]!.p), now: false },
    { x: xOf(n - 1), y: yOf(series[n - 1]!.p), now: true },
  ];
  const t0 = +new Date(series[0]!.t);
  const t1 = +new Date(series[n - 1]!.t);
  const ticks = (cfg.coverageDates ?? []).map((cd) => {
    const f = t1 === t0 ? 1 : clampN((+new Date(cd) - t0) / (t1 - t0), 0, 1);
    return padL + f * plotW;
  });

  return {
    W: w,
    H,
    padL,
    baseY,
    plotW,
    area,
    line,
    dots,
    ticks,
    dateL: shortDate(series[0]!.t),
    dateR: shortDate(series[n - 1]!.t),
    finalPct: formatPct(series[n - 1]!.p),
    finalX: xOf(n - 1),
    finalY: yOf(series[n - 1]!.p),
    accent,
    muted,
    surface,
  };
}

/**
 * The aggressive belief lead — the briefing prose on top, with a real horizontal
 * odds-over-time chart strip set beneath it (the text sits on top of its belief
 * curve). Progressive enhancement, end to end:
 *
 *  - Calm reader / SSR / jsdom / no-JS / crawler → just the real `text` as the shipped
 *    prose paragraph. No engine, no chart.
 *  - Aggressive reader, client, engine loaded → the SAME real prose paragraph, plus the
 *    chart strip below it. The prose is always a real <p>, so selection + a11y + SEO
 *    are identical to calm; the chart is a pure, aria-hidden enhancement.
 */
export function AggressiveLead({
  text,
  series,
  proseClassName,
  coverageDates,
  compact,
  className,
}: Props) {
  const { intensity } = useIntensity();
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<BeliefView | null>(null);
  const gradId = useId().replace(/:/g, '');

  // Latest inputs in a ref so the resize-stable effect re-reads them without
  // re-subscribing the observer on every render.
  const inputs = useRef<BuildInputs>({ text, series, coverageDates, compact });
  inputs.current = { text, series, coverageDates, compact };
  // A stable signature so the effect re-runs on a real input change (new story), not on
  // every render (series is a fresh array each time). Width changes (incl. the mobile
  // breakpoint) are handled by the ResizeObserver, so they need not be in the sig.
  const sig = `${series.length}:${series[0]?.p ?? ''}:${series.at(-1)?.p ?? ''}:${series.at(-1)?.t ?? ''}:${compact ? 'c' : 'a'}`;

  useEffect(() => {
    if (intensity !== 'aggressive' || series.length < 3) {
      setView(null);
      return;
    }
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let lastW = -1;

    const run = async () => {
      const host = hostRef.current;
      if (!host || cancelled) return;
      if (Math.round(host.clientWidth) < 200) return;
      try {
        const engine = await import('../../lib/pretext/engine');
        if (cancelled) return;
        await engine.readyFonts();
        if (cancelled) return;
        const host2 = hostRef.current;
        if (!host2) return;
        const w = Math.round(host2.clientWidth);
        if (w < 200) return;
        lastW = w;
        const v = buildBeliefView(w, engine, inputs.current);
        if (!cancelled) setView(v);
      } catch {
        if (!cancelled) setView(null); // jsdom / no canvas / measurement error → calm
      }
    };

    void run();

    if (typeof ResizeObserver !== 'undefined' && hostRef.current) {
      observer = new ResizeObserver(() => {
        const w = Math.round(hostRef.current?.clientWidth ?? 0);
        if (Math.abs(w - lastW) < 2) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => void run(), 140);
      });
      observer.observe(hostRef.current);
    }

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intensity, sig]);

  return (
    <div ref={hostRef} className={`${styles.lead}${className ? ` ${className}` : ''}`}>
      {/* The real prose — always rendered, identical to calm (crawlable, selectable). */}
      <p className={proseClassName}>{text}</p>
      {/* Aggressive enhancement: the belief curve as a slim strip beneath the text. */}
      {view && (
        <div className={styles.figure} style={{ height: `${view.H}px` }}>
          <svg
            className={styles.chart}
            viewBox={`0 0 ${view.W} ${view.H}`}
            width={view.W}
            height={view.H}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={view.accent} stopOpacity="0.26" />
                <stop offset="1" stopColor={view.accent} stopOpacity="0.04" />
              </linearGradient>
            </defs>
            <path d={view.area} fill={`url(#${gradId})`} />
            <path
              d={view.line}
              fill="none"
              stroke={view.accent}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* time axis baseline */}
            <line
              x1={view.padL}
              y1={view.baseY}
              x2={view.padL + view.plotW}
              y2={view.baseY}
              stroke={view.muted}
              strokeWidth="1"
              strokeOpacity="0.5"
            />
            {view.ticks.map((x, k) => (
              <line
                key={k}
                x1={x}
                y1={view.baseY - 3}
                x2={x}
                y2={view.baseY + 4}
                stroke={view.accent}
                strokeWidth="1.2"
                strokeOpacity="0.7"
              />
            ))}
            {view.dots.map((d, k) => (
              <g key={k}>
                <circle cx={d.x} cy={d.y} r={d.now ? 5 : 3.4} fill={view.surface} />
                <circle cx={d.x} cy={d.y} r={d.now ? 3.3 : 2.1} fill={view.accent} />
              </g>
            ))}
            <text x={view.padL} y={view.baseY + 17} textAnchor="start" className={styles.axis} fill={view.muted}>
              {view.dateL}
            </text>
            <text
              x={view.padL + view.plotW}
              y={view.baseY + 17}
              textAnchor="end"
              className={styles.axis}
              fill={view.muted}
            >
              {view.dateR}
            </text>
            <text
              x={view.finalX - 4}
              y={view.finalY - 7}
              textAnchor="end"
              className={styles.axisStrong}
              fill={view.accent}
            >
              {view.finalPct}
            </text>
          </svg>
        </div>
      )}
    </div>
  );
}
