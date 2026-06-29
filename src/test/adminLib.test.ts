import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// The admin lib talks to Supabase rpc; stub the client so we test the contract
// (rpc name + param mapping + result shaping) without a database.
vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from '../lib/supabase';
import * as admin from '../lib/admin';

const rpc = (supabase as unknown as { rpc: Mock }).rpc;

beforeEach(() => {
  rpc.mockReset();
});

describe('admin lib', () => {
  it('amIAdmin returns the boolean and calls is_admin', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await admin.amIAdmin()).toBe(true);
    expect(rpc).toHaveBeenCalledWith('is_admin', {});
  });

  it('listUsers maps params and splits the window total_count out of the rows', async () => {
    rpc.mockResolvedValue({ data: [{ user_id: 'u1', total_count: 7 }], error: null });
    const { rows, total } = await admin.listUsers({
      search: 'ann',
      sort: 'email',
      dir: 'asc',
      limit: 10,
      offset: 20,
    });
    expect(total).toBe(7);
    expect(rows[0]!.user_id).toBe('u1');
    expect(rpc).toHaveBeenCalledWith('admin_list_users', {
      p_search: 'ann',
      p_sort: 'email',
      p_dir: 'asc',
      p_limit: 10,
      p_offset: 20,
    });
  });

  it('paginate tolerates an empty result (total 0, no rows)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { rows, total } = await admin.listUsers();
    expect(total).toBe(0);
    expect(rows).toEqual([]);
  });

  it('defaults listUsers params (newest first, page 1)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await admin.listUsers();
    expect(rpc).toHaveBeenCalledWith('admin_list_users', {
      p_search: null,
      p_sort: 'created_at',
      p_dir: 'desc',
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('surfaces an rpc error as a thrown Error (e.g. forbidden)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    await expect(admin.amIAdmin()).rejects.toThrow('forbidden');
  });

  it('action wrappers pass the right rpc + args', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await admin.setUserBanned('u1', true);
    expect(rpc).toHaveBeenLastCalledWith('admin_set_user_banned', {
      p_user_id: 'u1',
      p_banned: true,
      p_until: null,
    });

    await admin.setCommentDeleted('c1', false, 'wrongful');
    expect(rpc).toHaveBeenLastCalledWith('admin_set_comment_deleted', {
      p_comment_id: 'c1',
      p_deleted: false,
      p_reason: 'wrongful',
    });

    await admin.grantAdmin('u2');
    expect(rpc).toHaveBeenLastCalledWith('admin_grant_admin', { p_user_id: 'u2' });

    await admin.deleteSubscriber('x@y.com');
    expect(rpc).toHaveBeenLastCalledWith('admin_delete_subscriber', { p_email: 'x@y.com' });
  });

  it('listSubscribers forwards the status filter', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await admin.listSubscribers({ status: 'unsubscribed' });
    expect(rpc).toHaveBeenCalledWith(
      'admin_list_subscribers',
      expect.objectContaining({ p_status: 'unsubscribed' }),
    );
  });
});
