import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards against the "column only in create-table-if-not-exists" trap that broke
 * comment loading live: call_pick/call_confidence were declared inside
 * `create table if not exists public.comments (...)`, which NEVER adds columns to an
 * already-existing table — so re-running schema.sql didn't add them and every
 * comment-load SELECT 400'd with "column comments.call_pick does not exist". The fix
 * is an explicit idempotent `alter table ... add column if not exists`. This test
 * fails if that backfill is ever removed.
 */
describe('schema.sql column backfills', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');

  it('backfills the comments call-annotation columns via add-column-if-not-exists', () => {
    expect(sql).toMatch(
      /alter table public\.comments add column if not exists call_pick text/,
    );
    expect(sql).toMatch(
      /alter table public\.comments add column if not exists call_confidence int/,
    );
  });
});
