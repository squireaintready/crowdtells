import { describe, expect, it } from 'vitest';
import {
  avatarInitial,
  clockJitterMin,
  formatClock,
  formatDeadline,
  formatMovement,
  formatPct,
  formatRelative,
  formatUsd,
} from '../lib/format';

describe('avatarInitial', () => {
  it('uses the first letter of the name’s first word, uppercased', () => {
    expect(avatarInitial('jane doe')).toBe('J');
    expect(avatarInitial('  amir')).toBe('A');
  });
  it('falls back when there is no usable name', () => {
    expect(avatarInitial(null, 'M')).toBe('M');
    expect(avatarInitial('', 'R')).toBe('R');
    expect(avatarInitial('   ', 'M')).toBe('M');
    expect(avatarInitial(undefined)).toBe('?');
  });
});

describe('formatUsd', () => {
  it('scales into compact units', () => {
    expect(formatUsd(2_415_457_275)).toBe('$2.4B');
    expect(formatUsd(84_969)).toBe('$85K');
    expect(formatUsd(7_270_990)).toBe('$7.3M');
    expect(formatUsd(540)).toBe('$540');
  });
  it('drops trailing .0 and rounds large magnitudes', () => {
    expect(formatUsd(2_000_000)).toBe('$2M');
    expect(formatUsd(310_000)).toBe('$310K');
  });
  it('guards non-positive / invalid', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(-5)).toBe('$0');
    expect(formatUsd(NaN)).toBe('$0');
  });
});

describe('formatPct', () => {
  it('rounds to whole percent', () => {
    expect(formatPct(14.65)).toBe('15%');
    expect(formatPct(68)).toBe('68%');
  });
  it('handles invalid', () => {
    expect(formatPct(NaN)).toBe('—');
  });
});

describe('formatMovement', () => {
  it('signs and fixes to one decimal', () => {
    expect(formatMovement(4.2)).toBe('+4.2');
    expect(formatMovement(-1)).toBe('-1.0');
    expect(formatMovement(0)).toBe('0.0');
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');
  it('formats future and past', () => {
    expect(formatRelative('2026-06-18T12:00:00Z', now)).toBe('in 3d');
    expect(formatRelative('2026-06-15T15:00:00Z', now)).toBe('in 3h');
    expect(formatRelative('2026-06-13T12:00:00Z', now)).toBe('2d ago');
  });
  it('handles edge / invalid', () => {
    expect(formatRelative('2026-06-15T12:00:30Z', now)).toBe('now');
    expect(formatRelative(null, now)).toBe('');
    expect(formatRelative('not-a-date', now)).toBe('');
  });
});

describe('formatDeadline', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');
  it('labels open and resolved', () => {
    expect(formatDeadline('2026-06-18T12:00:00Z', now)).toBe('Resolves in 3d');
    expect(formatDeadline('2026-06-14T12:00:00Z', now)).toBe('Resolved');
    expect(formatDeadline(null, now)).toBe('');
  });
});

describe('clockJitterMin', () => {
  it('is deterministic, in {-2,-1,1,2}, and never 0 (always shifts off the quarter)', () => {
    for (const seed of ['kalshi-KXSILVER', 'a', 'poly-123', 'another-story-id', '']) {
      const v = clockJitterMin(seed);
      expect([-2, -1, 1, 2]).toContain(v);
      expect(clockJitterMin(seed)).toBe(v); // stable for a given seed
    }
  });
  it('varies across seeds so same-tick stories do not all show the same minute', () => {
    const offsets = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(clockJitterMin));
    expect(offsets.size).toBeGreaterThan(1);
  });
});

describe('formatClock', () => {
  it('renders a 12-hour local time and applies the jitter (minute off the quarter mark)', () => {
    const s = formatClock('2026-06-19T13:30:00Z', 'kalshi-KXSILVER');
    expect(s).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/);
    // In a whole-hour timezone (CI runs UTC) the :30 input is pushed off the quarter marks.
    if (new Date('2026-06-19T13:30:00Z').getMinutes() === 30) {
      expect(s).not.toMatch(/:(00|15|30|45)\s/);
    }
  });
  it('is stable for a seed and empty on bad input', () => {
    expect(formatClock('2026-06-19T13:30:00Z', 'x')).toBe(formatClock('2026-06-19T13:30:00Z', 'x'));
    expect(formatClock('', 'x')).toBe('');
    expect(formatClock('not-a-date', 'x')).toBe('');
  });
});
