import { useId, useMemo, useRef, useState } from 'react';
import type { BriefingRevision, OddsPoint } from '../lib/types';
import {
  type CoverageMark,
  coverageMarks as buildCoverage,
  projectX,
  projectY,
  revisionMarks as buildRevisions,
  trendDomain,
  trendPoints,
} from '../lib/trend';
import { formatDateShort, formatPct } from '../lib/format';
import styles from './TrendChart.module.css';

interface Props {
  /** Crowd-belief observations (favored-outcome probability over time). */
  history: OddsPoint[];
  /** Past briefing snapshots — plotted as "our read changed" markers. */
  revisions?: BriefingRevision[];
  /** Cited-article publish times — plotted as coverage ticks on the baseline. */
  coverage?: CoverageMark[];
  /** The favored outcome name, for the accessible summary. */
  favored: string;
  /** What the belief line represents — "Crowd belief" (default) or e.g. "Reader calls". */
  seriesLabel?: string;
  /** Optional second belief line on the same axes — the OTHER crowd (e.g. the market's
   * read overlaid on the reader-calls line), so a viewer can compare what the money
   * said with what the people said over one timeline. Drawn muted + dashed. */
  overlay?: OddsPoint[];
  /** Legend label for the overlay line. */
  overlayLabel?: string;
}

// viewBox geometry (unitless; the SVG scales to its container width).
const W = 320;
const H = 144;
const PAD = { l: 6, r: 6, t: 12, b: 30 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

const px = (fx: number) => PAD.l + fx * PLOT_W;
const py = (fy: number) => PAD.t + fy * PLOT_H;

/** Month/day for the x-axis ticks (no year — the chart spans days, not years). */
function tick(tMs: number): string {
  return new Date(tMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The article's hero data graphic: the crowd's belief in the favored outcome over
 * time, with markers for every time OUR read changed and (when known) for when the
 * cited coverage was published — so a reader can see crowd sentiment and the news
 * cycle on one timeline. Interactive (mouse + touch) with a scrubbing crosshair that
 * pointer-captures the drag so an ancestor scroller can't steal it mid-gesture. Screen
 * readers get a rich summary via role="img" + aria-label (the scrub is a pointer-only
 * affordance). Pure SVG with HTML-rendered labels (legible at any scale, no upscaling).
 */
export function TrendChart({
  history,
  revisions,
  coverage,
  favored,
  seriesLabel = 'Crowd belief',
  overlay,
  overlayLabel = 'Market',
}: Props) {
  const gradId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverFx, setHoverFx] = useState<number | null>(null);

  const model = useMemo(() => {
    const points = trendPoints(history);
    const over = overlay ? trendPoints(overlay) : [];
    const revs = buildRevisions(revisions, points);
    const cov = buildCoverage(coverage);
    // Domain spans BOTH belief lines (plus the marks) so neither overlay nor primary clips.
    const dom = trendDomain([...history, ...(overlay ?? [])], [
      ...revs.map((r) => r.tMs),
      ...cov.map((c) => c.tMs),
    ]);
    return { points, over, revs, cov, dom };
  }, [history, overlay, revisions, coverage]);

  const { points, over, revs, cov, dom } = model;
  if (points.length === 0) return null;

  // A lone observation draws as a flat level line across the (padded) domain.
  const series = points.length === 1 ? [points[0]!, points[0]!] : points;
  const xy = series.map((d, i) => {
    const fx = points.length === 1 ? i : projectX(d.tMs, dom);
    return [px(fx), py(projectY(d.p, dom))] as const;
  });
  const linePts = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPts = `${px(0)},${py(1)} ${linePts} ${px(1)},${py(1)}`;

  // The overlay (the other crowd) projected on the same domain — no area, no head dot.
  const overlaySeries = over.length === 1 ? [over[0]!, over[0]!] : over;
  const overlayPts = overlaySeries
    .map((d, i) => {
      const fx = over.length === 1 ? i : projectX(d.tMs, dom);
      return `${px(fx).toFixed(1)},${py(projectY(d.p, dom)).toFixed(1)}`;
    })
    .join(' ');

  const first = series[0]!.p;
  const last = series[series.length - 1]!.p;
  const dir = last > first + 0.5 ? 'up' : last < first - 0.5 ? 'down' : 'flat';

  // 50% reference line, only when it sits inside the drawn band.
  const showMid = dom.lo < 50 && dom.hi > 50;
  const midY = py(projectY(50, dom));

  // Each point's x-fraction, computed ONCE (single-point series sit at 0.5) so the
  // nearest-point search uses one consistent formula for every candidate — and so the
  // readout reuses the same fraction instead of re-projecting.
  const fxs = series.map((d) => (points.length === 1 ? 0.5 : projectX(d.tMs, dom)));
  const hoverIdx =
    hoverFx == null
      ? -1
      : fxs.reduce((bi, fx, i) => (Math.abs(fx - hoverFx) < Math.abs(fxs[bi]! - hoverFx) ? i : bi), 0);
  const hover = hoverIdx >= 0 ? series[hoverIdx]! : null;
  const hoverX = hover ? px(fxs[hoverIdx]!) : 0;
  const hoverY = hover ? py(projectY(hover.p, dom)) : 0;

  const move = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    // Map client x → plot x-fraction (account for the L/R padding inside the viewBox).
    const vx = ((clientX - r.left) / r.width) * W;
    setHoverFx(Math.max(0, Math.min(1, (vx - PAD.l) / PLOT_W)));
  };

  const lineColor = dir === 'up' ? 'var(--up)' : dir === 'down' ? 'var(--down)' : 'var(--accent)';
  const span = `${tick(dom.t0)} – ${tick(dom.t1)}`;
  const summary =
    `${seriesLabel} in "${favored}" from ${formatPct(first)} to ${formatPct(last)} ` +
    `(${span})` +
    (over.length
      ? `; ${overlayLabel.toLowerCase()} from ${formatPct(over[0]!.p)} to ${formatPct(over[over.length - 1]!.p)}`
      : '') +
    (revs.length ? `, with ${revs.length} read update${revs.length === 1 ? '' : 's'}` : '') +
    (cov.length ? ` and ${cov.length} cited article${cov.length === 1 ? '' : 's'}` : '') +
    '.';

  return (
    <figure className={styles.wrap}>
      <div
        className={styles.plot}
        ref={wrapRef}
        onPointerMove={(e) => move(e.clientX)}
        onPointerDown={(e) => {
          // Capture the drag so a horizontal scrub keeps firing pointermove even if an
          // ancestor scroller would otherwise claim the gesture mid-way (touch).
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          move(e.clientX);
        }}
        onPointerUp={(e) => (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)}
        onPointerCancel={() => setHoverFx(null)}
        onPointerLeave={() => setHoverFx(null)}
        style={{ touchAction: 'pan-y' }}
      >
        <svg
          className={styles.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={summary}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {showMid && (
            <line
              className={styles.mid}
              x1={px(0)}
              y1={midY}
              x2={px(1)}
              y2={midY}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {dir !== 'flat' && <polygon points={areaPts} fill={`url(#${gradId})`} />}
          {overlayPts && (
            <polyline
              points={overlayPts}
              fill="none"
              stroke="var(--text-mute)"
              strokeWidth="1.4"
              strokeDasharray="3 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polyline
            points={linePts}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Coverage ticks on the baseline — when the cited articles were published. */}
          {cov.map((c, i) => {
            const x = px(projectX(c.tMs, dom));
            return (
              <line
                key={`c${i}`}
                className={styles.cov}
                x1={x}
                y1={py(1) + 3}
                x2={x}
                y2={py(1) + 9}
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${c.outlet} · ${formatDateShort(c.t)}${c.title ? ` — ${c.title}` : ''}`}</title>
              </line>
            );
          })}

          {/* "Our read changed" markers anchored on the belief line. */}
          {revs.map((r, i) => {
            const x = px(projectX(r.tMs, dom));
            const y = py(projectY(r.p, dom));
            return (
              <g key={`r${i}`} className={styles.rev}>
                <circle cx={x} cy={y} r="3.2" vectorEffect="non-scaling-stroke" />
                <title>{`Our read changed · ${formatDateShort(
                  new Date(r.tMs).toISOString(),
                )} · ${formatPct(r.p)} — ${r.hook}`}</title>
              </g>
            );
          })}

          {/* Latest point. */}
          <circle
            className={styles.head}
            cx={xy[xy.length - 1]![0]}
            cy={xy[xy.length - 1]![1]}
            r="3"
            fill={lineColor}
          />

          {hover && (
            <g aria-hidden="true">
              <line
                className={styles.cross}
                x1={hoverX}
                y1={py(0)}
                x2={hoverX}
                y2={py(1)}
                vectorEffect="non-scaling-stroke"
              />
              <circle className={styles.crossDot} cx={hoverX} cy={hoverY} r="3.4" fill={lineColor} />
            </g>
          )}
        </svg>

        {/* HTML labels — kept out of the SVG so they never upscale past legibility. */}
        <span className={`${styles.yLab} ${styles.yHi} tnum`}>{formatPct(dom.hi)}</span>
        <span className={`${styles.yLab} ${styles.yLo} tnum`}>{formatPct(dom.lo)}</span>

        {hover && (
          <div
            className={styles.tip}
            // Clamp the pill's center so it never clips off either edge of the plot.
            style={{ left: `${Math.min(86, Math.max(14, (hoverX / W) * 100))}%` }}
            aria-hidden="true"
          >
            <b className="tnum">{formatPct(hover.p)}</b>
            <span className={styles.tipDate}>{formatDateShort(new Date(hover.tMs).toISOString())}</span>
          </div>
        )}
      </div>

      <div className={styles.xAxis}>
        {tick(dom.t0) === tick(dom.t1) ? (
          // Sub-day domain — three identical dates read as a bug; show one centered.
          <span className={styles.xSingle}>{tick(dom.t0)}</span>
        ) : (
          <>
            <span>{tick(dom.t0)}</span>
            <span>{tick(dom.t0 + (dom.t1 - dom.t0) / 2)}</span>
            <span>{tick(dom.t1)}</span>
          </>
        )}
      </div>

      <figcaption className={styles.legend}>
        <span className={styles.lgBelief}>{seriesLabel}</span>
        {over.length > 0 && <span className={styles.lgOverlay}>{overlayLabel}</span>}
        {revs.length > 0 && <span className={styles.lgRev}>Our read changed</span>}
        {cov.length > 0 && <span className={styles.lgCov}>Coverage</span>}
      </figcaption>
    </figure>
  );
}
