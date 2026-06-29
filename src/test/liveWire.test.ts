import { describe, expect, it } from 'vitest';
import type { EventItem } from '../lib/types';
import { liveWireCount } from '../lib/liveWire';

const NOW = Date.parse('2026-06-22T12:00:00Z');
const ev = (status: EventItem['status'], startTime: string): EventItem => ({
  id: Math.random().toString(36),
  title: 't',
  topic: 'World',
  kind: 'world',
  status,
  startTime,
  source: 'wikipedia',
});

describe('liveWireCount', () => {
  it('counts all developing news plus live and imminent events', () => {
    const events = [
      ev('live', '2026-06-22T11:00:00Z'), // live → counts
      ev('scheduled', '2026-06-23T00:00:00Z'), // ~12h out → imminent, counts
      ev('scheduled', '2026-06-29T00:00:00Z'), // a week out → excluded
      ev('final', '2026-06-22T08:00:00Z'), // just-finished context → excluded
    ];
    expect(liveWireCount(5, events, NOW)).toBe(5 + 2);
  });

  it('is just the developing-news count when no events are live/imminent', () => {
    expect(liveWireCount(3, [ev('final', '2026-06-22T08:00:00Z')], NOW)).toBe(3);
  });

  it('is zero-safe with no news and no live events', () => {
    expect(liveWireCount(0, [ev('scheduled', '2026-07-30T00:00:00Z')], NOW)).toBe(0);
  });

  it('ignores events with an unparseable start time', () => {
    expect(liveWireCount(1, [ev('scheduled', 'not-a-date')], NOW)).toBe(1);
  });
});
