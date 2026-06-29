import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hydrateBriefing } from '../lib/hydrate';
import type { Feed, Market } from '../lib/types';
import { makeMarket } from './factory';

/**
 * Phase 1 fidelity proof for the Model B migration (tasks/modelb-migration.md).
 *
 * Model B mirrors ONLY the client feed (what public/feed.json already contains)
 * into a Supabase row whose payload is the Market object stored as JSONB; the SPA
 * reads it back as JSON over Realtime/PostgREST. Supabase serializing a JSONB
 * column back to the client is exactly a JSON round-trip, so this test asserts
 * that round-trip is LOSSLESS on REAL feed data — and, critically, that the
 * `{token}` placeholders and pre-hydrated revision prose survive untouched so the
 * render-time hydration and the "trace our read" timeline cannot drift.
 *
 * Server-side invariants (collision cache, briefedOddsPct/Favored, the full
 * archive, the floor guard) are deliberately NOT exercised here: they stay in
 * store.json and never reach Supabase, so they cannot be corrupted by the mirror.
 */

// What Supabase hands back to the client from a JSONB column: a JSON round-trip.
const throughJsonb = (m: Market): Market => JSON.parse(JSON.stringify(m)) as Market;

// vitest runs from the repo root, so the public feed is a stable relative path.
const feed = JSON.parse(readFileSync(resolve(process.cwd(), 'public/feed.json'), 'utf8')) as Feed;

describe('Model B: client feed survives the Supabase JSONB round-trip', () => {
  it('has real markets to test against', () => {
    expect(feed.markets.length).toBeGreaterThan(0);
  });

  it('round-trips every market with byte-for-byte fidelity', () => {
    for (const m of feed.markets) {
      expect(throughJsonb(m)).toEqual(m);
    }
  });

  it('preserves {token} placeholders so render-time hydration is unchanged', () => {
    const tokenized = feed.markets.filter((m) => m.analysis?.includes('{'));
    for (const m of tokenized) {
      const rt = throughJsonb(m);
      // Placeholders stay literal (hydration happens at render, not in storage).
      expect(rt.analysis).toContain('{');
      // And hydrating before vs after the round-trip yields identical prose.
      expect(hydrateBriefing(rt.analysis, rt)).toBe(hydrateBriefing(m.analysis, m));
    }
    // (The unconditional guarantee lives in the synthetic test below, so this
    // stays meaningful even if a given feed.json ships no tokenized prose.)
  });

  it('preserves pre-hydrated revision snapshots (the "trace our read" timeline)', () => {
    const withRevisions = feed.markets.filter(
      (m) => Array.isArray(m.revisions) && m.revisions.length > 0,
    );
    for (const m of withRevisions) {
      expect(throughJsonb(m).revisions).toEqual(m.revisions);
    }
  });

  // Data-independent proof: a synthetic market that ALWAYS carries {tokens} and
  // revisions, so the fidelity guarantee holds even when a live feed happens to
  // ship neither (current feed.json has 0 markets with revisions).
  it('round-trips a synthetic market with tokens AND revisions losslessly', () => {
    const m = makeMarket({
      id: 'polymarket:synthetic',
      analysis: 'The favorite sits at {odds}, up {move7d} on the week.',
      movement7d: 4,
      revisions: [
        { generatedAt: '2026-06-10T00:00:00Z', oddsPct: 41, hook: 'Race tightens', analysis: 'Was 41% a week ago.' },
        { generatedAt: '2026-06-05T00:00:00Z', oddsPct: 33, hook: 'Long shot', analysis: 'Started at 33%.' },
      ] as unknown as Market['revisions'],
    });
    const rt = throughJsonb(m);
    expect(rt).toEqual(m);
    expect(rt.analysis).toContain('{odds}');
    expect(hydrateBriefing(rt.analysis, rt)).toBe(hydrateBriefing(m.analysis, m));
    expect(rt.revisions).toEqual(m.revisions);
  });
});
