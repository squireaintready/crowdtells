import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribe, DEFAULT_PREFS } from '../lib/newsletter';

// newsletter.ts reaches Supabase only via a dynamic import('./supabase') inside
// client(); mock that module so we can drive the RPC's { data, error } shape and
// assert how subscribe() maps it to a status.
const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return { rpc: (...a: unknown[]) => rpc(...a) };
  },
}));

beforeEach(() => rpc.mockReset());

describe('newsletter subscribe() status mapping', () => {
  it("maps the RPC's 'pending' to pending", async () => {
    rpc.mockResolvedValue({ data: 'pending', error: null });
    expect(await subscribe('a@b.com', DEFAULT_PREFS)).toBe('pending');
    expect(rpc).toHaveBeenCalledWith('subscribe', expect.objectContaining({ p_email: 'a@b.com' }));
  });

  it("maps the RPC's 'already' to already", async () => {
    rpc.mockResolvedValue({ data: 'already', error: null });
    expect(await subscribe('a@b.com', DEFAULT_PREFS)).toBe('already');
  });

  it('back-compat: a pre-migration void RPC (data null) maps to pending', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await subscribe('a@b.com', DEFAULT_PREFS)).toBe('pending');
  });

  it('an RPC error maps to error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await subscribe('a@b.com', DEFAULT_PREFS)).toBe('error');
  });
});
