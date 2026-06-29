import { describe, expect, it } from 'vitest';
import { classifyKind } from './classify';

describe('classifyKind', () => {
  it('flags Polymarket recurring/intraday ladders via their tags', () => {
    expect(
      classifyKind({ title: 'What price will Bitcoin hit?', tags: ['Crypto', 'Recurring', 'Hit Price'], startDate: null, endDate: null }),
    ).toBe('ephemeral');
    expect(classifyKind({ title: 'Foo', tags: ['Daily'], startDate: null, endDate: null })).toBe('ephemeral');
  });

  it('does NOT treat the broad "Hide From New" tag as ephemeral', () => {
    // Polymarket puts "Hide From New" on legit futures like "World Cup Winner".
    expect(
      classifyKind({
        title: 'World Cup Winner',
        tags: ['Soccer', 'Hide From New', 'Tournament Futures'],
        startDate: '2025-07-02T00:00:00Z',
        endDate: '2026-07-20T00:00:00Z',
      }),
    ).toBe('standing');
  });

  it('flags Kalshi daily crypto via the intraday clock time in the title', () => {
    // No tags, opens a week early (169h lifespan), but resolves "at 5pm EDT".
    expect(
      classifyKind({
        title: 'BTC price on Jun 19, 2026 at 5pm EDT?',
        startDate: '2026-06-12T20:00:00Z',
        endDate: '2026-06-19T21:00:00Z',
      }),
    ).toBe('ephemeral');
  });

  it('flags a market that opens and resolves within a day', () => {
    expect(
      classifyKind({ title: 'Anything', startDate: '2026-06-16T08:00:00Z', endDate: '2026-06-16T23:00:00Z' }),
    ).toBe('ephemeral');
  });

  it('keeps substantive standing questions', () => {
    expect(
      classifyKind({ title: 'Will the Fed cut rates in September?', tags: ['FOMC', 'Economy'], startDate: '2026-06-01T00:00:00Z', endDate: '2026-09-18T00:00:00Z' }),
    ).toBe('standing');
    expect(
      classifyKind({ title: 'What is the maximum price Bitcoin reaches in 2026?', startDate: '2026-01-01T00:00:00Z', endDate: '2026-12-31T00:00:00Z' }),
    ).toBe('standing');
  });
});
