import { beforeEach, describe, expect, it, vi } from 'vitest';

// comments.ts imports `supabase` from ./supabase at module load; mock it so we
// can drive the .from().insert() chain and assert the call-annotation behavior.
const insert = vi.fn();
const from = vi.fn((_table: string) => ({ insert }));
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return { from: (table: string) => from(table) };
  },
}));

/** The row object passed to the nth insert() call. */
const insertedRow = (n: number) => insert.mock.calls[n]![0] as Record<string, unknown>;

import { postComment } from '../lib/comments';

beforeEach(() => {
  insert.mockReset();
  from.mockClear();
});

describe('postComment call annotation', () => {
  it('posts a plain comment with no call columns when no call is given', async () => {
    insert.mockResolvedValue({ error: null });
    await postComment('mkt-1', 'user-1', '  hi there  ');
    expect(from).toHaveBeenCalledWith('comments');
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insertedRow(0);
    expect(row).toMatchObject({ market_id: 'mkt-1', user_id: 'user-1', body: 'hi there', parent_id: null });
    expect(row).not.toHaveProperty('call_pick');
    expect(row).not.toHaveProperty('call_confidence');
  });

  it('includes call_pick/call_confidence when a call note is given', async () => {
    insert.mockResolvedValue({ error: null });
    await postComment('mkt-1', 'user-1', 'my read', null, { callPick: 'yes', callConfidence: 75 });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertedRow(0)).toMatchObject({
      body: 'my read',
      call_pick: 'yes',
      call_confidence: 75,
    });
  });

  it('fails soft: on a missing-column error it retries as a plain comment', async () => {
    insert
      .mockResolvedValueOnce({ error: { code: 'PGRST204', message: "column 'call_pick' not found" } })
      .mockResolvedValueOnce({ error: null });
    await postComment('mkt-1', 'user-1', 'my read', null, { callPick: 'no', callConfidence: 65 });
    expect(insert).toHaveBeenCalledTimes(2);
    // The retry inserts without the call columns.
    const retry = insertedRow(1);
    expect(retry).not.toHaveProperty('call_pick');
    expect(retry).not.toHaveProperty('call_confidence');
    expect(retry).toMatchObject({ body: 'my read' });
  });

  it('rethrows a genuine (non-missing-column) insert error without falling back', async () => {
    insert.mockResolvedValue({ error: { code: '23503', message: 'fk violation' } });
    await expect(
      postComment('mkt-1', 'user-1', 'my read', null, { callPick: 'yes', callConfidence: 85 }),
    ).rejects.toThrow('fk violation');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('validates the body before inserting (empty throws, no insert)', async () => {
    await expect(postComment('mkt-1', 'user-1', '   ')).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});
