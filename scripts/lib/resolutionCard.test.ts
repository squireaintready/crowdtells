import { describe, expect, it } from 'vitest';
import type { BriefingRevision, Market } from '../../src/lib/types';
import {
  buildResolutionCard,
  humanizeAgo,
  preSettlementRead,
  resolutionSvg,
} from './resolutionCard';

const RESOLVED = '2026-06-18T12:00:00Z';
const before = (h: number) => new Date(Date.parse(RESOLVED) - h * 3_600_000).toISOString();
const after = (h: number) => new Date(Date.parse(RESOLVED) + h * 3_600_000).toISOString();

function rev(over: Partial<BriefingRevision>): BriefingRevision {
  return { generatedAt: before(24), oddsPct: 60, favored: 'Yes', hook: 'h', dek: '', ...over };
}

function market(over: Partial<Market>): Market {
  return {
    id: 'm', source: 'polymarket', title: 'T', marketUrl: 'https://polymarket.com/event/s',
    image: '', category: 'Politics', description: '', favored: 'Yes', oddsPct: 99, alt: null,
    divergence: null, movement24h: 2, movement7d: 5, oddsHistory: [], volume: 1e7, volume24h: 1e5,
    liquidity: 1e4, openInterest: 1e4, comments: 0, score: 1, startDate: null,
    endDate: '2026-06-18T00:00:00Z', status: 'resolved', hook: 'Senate passes the bill', analysis: 'a',
    take: '', marketRead: '', crowdVsCoverage: '', synthesis: null, sources: [], grounded: true,
    generatedAt: before(48), updatedAt: RESOLVED, resolvedOutcome: 'Yes', calledCorrectly: true,
    resolvedAt: RESOLVED, briefedOddsPct: 98, briefedFavored: 'Yes', ...over,
  };
}

describe('preSettlementRead — honest pre-call odds (NOT briefedOddsPct)', () => {
  it('returns the most recent revision published BEFORE resolution', () => {
    const m = market({
      revisions: [rev({ generatedAt: before(40), oddsPct: 55, favored: 'Yes' }), rev({ generatedAt: before(6), oddsPct: 62, favored: 'Yes' })],
    });
    expect(preSettlementRead(m)).toEqual({ favored: 'Yes', oddsPct: 62 });
  });

  it('ignores a revision generated AT/AFTER resolution (the overwritten settled read)', () => {
    const m = market({
      revisions: [rev({ generatedAt: before(6), oddsPct: 62 }), rev({ generatedAt: after(1), oddsPct: 99 })],
    });
    // The post-settlement 99% revision is excluded → the pre-call 62% wins.
    expect(preSettlementRead(m)).toEqual({ favored: 'Yes', oddsPct: 62 });
  });

  it('does NOT fall back to briefedOddsPct (overwritten near settlement) — returns null with no usable revision', () => {
    const m = market({ briefedOddsPct: 98, revisions: [] });
    expect(preSettlementRead(m)).toBeNull();
  });

  it('returns null when there is no resolvedAt', () => {
    expect(preSettlementRead(market({ resolvedAt: null, revisions: [rev({})] }))).toBeNull();
  });

  it('skips a revision with a non-finite oddsPct or empty favored', () => {
    const m = market({
      revisions: [rev({ generatedAt: before(5), oddsPct: NaN }), rev({ generatedAt: before(10), oddsPct: 71, favored: 'No' })],
    });
    expect(preSettlementRead(m)).toEqual({ favored: 'No', oddsPct: 71 });
  });
});

describe('humanizeAgo', () => {
  it('renders minutes, hours, and days with singular/plural units', () => {
    expect(humanizeAgo(before(0.5), RESOLVED)).toBe('30 minutes');
    expect(humanizeAgo(before(1 / 60), RESOLVED)).toBe('1 minute');
    expect(humanizeAgo(before(3), RESOLVED)).toBe('3 hours');
    expect(humanizeAgo(before(72), RESOLVED)).toBe('3 days');
  });

  it('returns "" when a timestamp is missing or inverted', () => {
    expect(humanizeAgo(undefined, RESOLVED)).toBe('');
    expect(humanizeAgo(after(1), RESOLVED)).toBe(''); // to <= from
  });
});

describe('buildResolutionCard — copy', () => {
  it('frames a correct call WITH the honest pre-call odds and "It happened."', () => {
    const m = market({ calledCorrectly: true, revisions: [rev({ generatedAt: before(6), oddsPct: 62, favored: 'Yes' })] });
    const card = buildResolutionCard(m);
    expect(card.eyebrow).toBe('The crowd called it');
    expect(card.verdict).toBe('6 hours ago the crowd read yes at 62%. It happened.');
    expect(card.outcome).toBe('Resolved Yes');
    expect(card.headline).toBe('Senate passes the bill');
    expect(card.correct).toBe(true);
  });

  it('frames a wrong call with "It didn\'t." and a misread eyebrow', () => {
    const m = market({
      calledCorrectly: false, resolvedOutcome: 'No',
      revisions: [rev({ generatedAt: before(12), oddsPct: 70, favored: 'Yes' })],
    });
    const card = buildResolutionCard(m);
    expect(card.eyebrow).toBe('The crowd misread this');
    expect(card.verdict).toBe('12 hours ago the crowd read yes at 70%. It didn\'t.');
  });

  it('renders a NAMED favored side (not Yes/No) with the percentage', () => {
    const m = market({
      hook: 'Who wins the nomination', favored: 'Gavin Newsom',
      revisions: [rev({ generatedAt: before(5), oddsPct: 44, favored: 'Gavin Newsom' })],
    });
    const card = buildResolutionCard(m);
    expect(card.verdict).toBe('5 hours ago the crowd read Gavin Newsom at 44%. It happened.');
  });

  it('falls back to a NUMBER-FREE frame when no pre-settlement read exists (honesty rule)', () => {
    const correct = buildResolutionCard(market({ calledCorrectly: true, revisions: [] }));
    expect(correct.verdict).toBe('The crowd called it.');
    const wrong = buildResolutionCard(market({ calledCorrectly: false, revisions: [] }));
    expect(wrong.verdict).toBe('The crowd misread this one.');
  });

  it('drops the "<n> ago" lead-in when the gap can\'t be measured', () => {
    // A revision with an unparseable generatedAt still has odds, but humanizeAgo → ''.
    const m = market({ revisions: [rev({ generatedAt: 'not-a-date', oddsPct: 50 })] });
    // unparseable generatedAt is excluded by preSettlementRead → number-free frame.
    expect(buildResolutionCard(m).verdict).toBe('The crowd called it.');
  });
});

describe('resolutionSvg — render is pure + escapes', () => {
  it('produces a 1200x630 SVG, tints by verdict, and escapes the headline', () => {
    const card = buildResolutionCard(market({ hook: 'A <b> & "q"', calledCorrectly: true, revisions: [rev({ generatedAt: before(6), oddsPct: 62 })] }));
    const svg = resolutionSvg(card);
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('#7fb98a'); // green "called it" accent
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;q&quot;');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('CROWDTELLS');
  });

  it('uses the wine accent for a misread card', () => {
    const card = buildResolutionCard(market({ calledCorrectly: false, revisions: [] }));
    expect(resolutionSvg(card)).toContain('#d28b8b');
  });
});
