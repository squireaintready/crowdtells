import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoadMore } from '../components/LoadMore';

afterEach(cleanup);

describe('LoadMore (feed pager)', () => {
  it('labels the next batch (capped at the remaining count) and the total left', () => {
    render(<LoadMore remaining={30} step={12} onMore={vi.fn()} />);
    const btn = screen.getByRole('button');
    // Reveals a full step when plenty remain…
    expect(btn).toHaveTextContent('Load 12 more stories');
    expect(btn).toHaveTextContent('30 remaining');
  });

  it('never offers to load more than remains, and pluralizes the tail', () => {
    render(<LoadMore remaining={1} step={12} onMore={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('Load 1 more story');
    expect(btn).toHaveTextContent('1 remaining');
  });

  it('clicking requests the next page', () => {
    const onMore = vi.fn();
    render(<LoadMore remaining={5} step={12} onMore={onMore} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('auto-loads when the sentinel intersects the viewport', () => {
    // jsdom has no IntersectionObserver; provide a controllable stub that lets the
    // test fire an intersection, proving the auto-load (infinite-scroll) path.
    let trigger: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          trigger = cb;
        }
        observe = observe;
        disconnect = disconnect;
        unobserve = vi.fn();
        takeRecords = vi.fn();
      },
    );
    const onMore = vi.fn();
    render(<LoadMore remaining={5} step={12} onMore={onMore} />);
    expect(observe).toHaveBeenCalledTimes(1);

    // A non-intersecting tick (scrolled away) must NOT load…
    trigger?.([{ isIntersecting: false }]);
    expect(onMore).not.toHaveBeenCalled();
    // …intersecting does.
    trigger?.([{ isIntersecting: true }]);
    expect(onMore).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('suppresses auto-load while the button holds keyboard focus', () => {
    // Same IO stub, but simulate the button being keyboard-focused (the browser
    // scrolls a tabbed-to sentinel into view) — auto-load must NOT fire; the
    // reader presses Enter/Space deliberately instead.
    let trigger: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          trigger = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
        takeRecords = vi.fn();
      },
    );
    const onMore = vi.fn();
    render(<LoadMore remaining={5} step={12} onMore={onMore} />);
    const btn = screen.getByRole('button');
    // Force keyboard-focus semantics (jsdom can't evaluate :focus-visible itself).
    btn.matches = ((sel: string) => sel === ':focus-visible') as typeof btn.matches;

    trigger?.([{ isIntersecting: true }]);
    expect(onMore).not.toHaveBeenCalled();

    // Once it's no longer keyboard-focused, scrolling it into view loads again.
    btn.matches = (() => false) as typeof btn.matches;
    trigger?.([{ isIntersecting: true }]);
    expect(onMore).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
