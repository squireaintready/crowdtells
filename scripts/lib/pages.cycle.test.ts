// Imports syndication FIRST — the same order generate.ts loads it. syndication
// imports writeEvergreen from pages, and pages reads SITE eagerly at init, so a
// circular-import TDZ would throw here at module-load (failing this file), not in
// the cron. Under Vitest's per-file module isolation this reproduces the prod path.
import { masterSitemap } from './syndication';
import { writeEvergreen } from './pages';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeMarket } from '../../src/test/factory';
import type { Feed } from '../../src/lib/types';

describe('module init order (no circular-import TDZ)', () => {
  it('writeEvergreen runs when syndication is imported first (generate order)', () => {
    const feed: Feed = {
      generatedAt: '2026-06-17T00:00:00Z',
      version: 1,
      markets: [
        makeMarket({ id: 'a', synthesis: { consensus: [], disputed: [], perspectives: [] } }),
      ],
    };
    const dir = mkdtempSync(join(tmpdir(), 'ct-cycle-'));
    const entries = writeEvergreen(feed, dir, []);
    expect(entries.length).toBeGreaterThan(0);
    expect(masterSitemap(feed, [], entries)).toContain('/mispriced');
  });
});
