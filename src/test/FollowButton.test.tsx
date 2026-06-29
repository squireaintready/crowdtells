import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { followUser, unfollowUser } = vi.hoisted(() => ({
  followUser: vi.fn(async () => {}),
  unfollowUser: vi.fn(async () => {}),
}));
vi.mock('../lib/socialGraph', () => ({ followUser, unfollowUser }));

import { FollowButton } from '../components/discussion/FollowButton';

describe('FollowButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('follows optimistically and writes through', async () => {
    const onChange = vi.fn();
    render(<FollowButton myId="me" targetId="them" following={false} onChange={onChange} />);
    const btn = screen.getByRole('button', { name: /follow/i });
    expect(btn).toHaveTextContent('+ Follow');
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith(true); // optimistic, immediate
    await waitFor(() => expect(followUser).toHaveBeenCalledWith('me', 'them'));
  });

  it('rolls back when the write fails', async () => {
    unfollowUser.mockRejectedValueOnce(new Error('nope'));
    const onChange = vi.fn();
    render(<FollowButton myId="me" targetId="them" following onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /unfollow|following/i }));
    expect(onChange).toHaveBeenNthCalledWith(1, false); // optimistic off
    await waitFor(() => expect(onChange).toHaveBeenNthCalledWith(2, true)); // rolled back on error
  });
});
