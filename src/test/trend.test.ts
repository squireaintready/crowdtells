import { describe, expect, it } from 'vitest';
import type { OddsPoint } from '../lib/types';
import {
  beliefAt,
  beliefSeries,
  coverageMarks,
  projectX,
  projectY,
  revisionMarks,
  trendDomain,
  trendPoints,
} from '../lib/trend';

const at = (iso: string, p: number): OddsPoint => ({ t: iso, p });
const D = (n: number) => new Date(Date.parse('2026-06-10T00:00:00Z') + n * 86_400_000).toISOString();

describe('beliefSeries — durable opinion-timeline arc', () => {
  it('splices the recent high-res window onto the long daily arc', () => {
    const daily = [at(D(0), 30), at(D(1), 40), at(D(2), 55)]; // long arc (one/day)
    const recent = [at(D(2), 58), at(D(2), 60)]; // recent high-res (same last day)
    // Daily points strictly before the first recent point are kept; the rest is recent.
    expect(beliefSeries(daily, recent)).toEqual([at(D(0), 30), at(D(1), 40), ...recent]);
  });

  it('falls back to whichever series exists', () => {
    expect(beliefSeries(undefined, [at(D(0), 50)])).toEqual([at(D(0), 50)]);
    expect(beliefSeries([], [at(D(0), 50)])).toEqual([at(D(0), 50)]);
    expect(beliefSeries([at(D(0), 50)], [])).toEqual([at(D(0), 50)]);
  });
});

describe('trendDomain', () => {
  it('spans the series time range and pads the probability band to tens', () => {
    const dom = trendDomain([at(D(0), 62), at(D(2), 71), at(D(4), 66)]);
    expect(dom.t0).toBe(Date.parse(D(0)));
    expect(dom.t1).toBe(Date.parse(D(4)));
    expect(dom.lo).toBeLessThanOrEqual(58); // padded below the min (62)
    expect(dom.hi).toBeGreaterThanOrEqual(75); // padded above the max (71)
    expect(dom.lo).toBeGreaterThanOrEqual(0);
    expect(dom.hi).toBeLessThanOrEqual(100);
  });

  it('guarantees a readable minimum band even for a near-flat series', () => {
    const dom = trendDomain([at(D(0), 90), at(D(1), 91)]);
    expect(dom.hi - dom.lo).toBeGreaterThanOrEqual(24);
  });

  it('includes extra marker times so coverage/revision marks never fall off-chart', () => {
    const dom = trendDomain([at(D(1), 50), at(D(2), 50)], [Date.parse(D(0)), Date.parse(D(5))]);
    expect(dom.t0).toBe(Date.parse(D(0)));
    expect(dom.t1).toBe(Date.parse(D(5)));
  });

  it('pads a single-time (degenerate) series so it still has width', () => {
    const dom = trendDomain([at(D(2), 40)]);
    expect(dom.t1).toBeGreaterThan(dom.t0);
  });
});

describe('projectX / projectY', () => {
  const dom = { t0: 0, t1: 100, lo: 0, hi: 100 };
  it('maps time and probability into [0,1], inverting y (top = high)', () => {
    expect(projectX(0, dom)).toBe(0);
    expect(projectX(100, dom)).toBe(1);
    expect(projectX(50, dom)).toBe(0.5);
    expect(projectY(100, dom)).toBe(0); // high prob → top
    expect(projectY(0, dom)).toBe(1); // low prob → bottom
  });
  it('clamps out-of-domain values', () => {
    expect(projectX(-50, dom)).toBe(0);
    expect(projectX(150, dom)).toBe(1);
    expect(projectY(140, dom)).toBe(0);
  });
});

describe('trendPoints', () => {
  it('parses, drops invalid, and sorts by time', () => {
    const pts = trendPoints([at(D(2), 60), at('not-a-date', 50), at(D(0), 40)]);
    expect(pts.map((p) => p.p)).toEqual([40, 60]); // invalid dropped, time-sorted
  });
});

describe('beliefAt', () => {
  it('returns the belief at or just before a time (step-hold)', () => {
    const pts = trendPoints([at(D(0), 40), at(D(2), 60), at(D(4), 80)]);
    expect(beliefAt(pts, Date.parse(D(3)))).toBe(60); // between D2 and D4 → holds D2
    expect(beliefAt(pts, Date.parse(D(0)))).toBe(40);
    expect(beliefAt(pts, Date.parse(D(-5)))).toBe(40); // before first → first
  });
});

describe('revisionMarks', () => {
  it('anchors each revision onto the belief line and sorts by time', () => {
    const pts = trendPoints([at(D(0), 40), at(D(3), 70)]);
    const marks = revisionMarks(
      [
        { generatedAt: D(2), oddsPct: 55, hook: 'second read' },
        { generatedAt: D(1), oddsPct: 45, hook: 'first read' },
      ],
      pts,
    );
    expect(marks.map((m) => m.hook)).toEqual(['first read', 'second read']);
    expect(marks[0]!.p).toBe(40); // D(1) holds the D(0) belief
  });
  it('is empty for no revisions', () => {
    expect(revisionMarks(undefined, [])).toEqual([]);
  });
});

describe('coverageMarks', () => {
  it('parses, sorts, and drops undated entries', () => {
    const marks = coverageMarks([
      { t: D(3), outlet: 'b.com' },
      { t: 'bad', outlet: 'x.com' },
      { t: D(1), outlet: 'a.com' },
    ]);
    expect(marks.map((m) => m.outlet)).toEqual(['a.com', 'b.com']);
  });

  it('collapses exact-timestamp duplicates (syndicated re-publishes)', () => {
    const marks = coverageMarks([
      { t: D(2), outlet: 'wire.com' },
      { t: D(2), outlet: 'reprint.com' }, // same minute → one tick
      { t: D(4), outlet: 'later.com' },
    ]);
    expect(marks.map((m) => m.tMs)).toEqual([Date.parse(D(2)), Date.parse(D(4))]);
  });
});
