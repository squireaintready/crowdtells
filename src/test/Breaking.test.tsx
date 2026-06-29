import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BreakingPin, EventsPin, DevelopingWidget } from '../components/Breaking';
import type { BreakingItem, EventItem } from '../lib/types';

const item = (title: string, over: Partial<BreakingItem> = {}): BreakingItem => ({
  title,
  outlets: ['reuters.com', 'bbc.com'],
  url: 'https://reuters.com/x',
  topic: 'Economics',
  firstSeen: '2026-06-17T11:30:00.000Z',
  ...over,
});

const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'espn:1',
  title: 'Lakers at Celtics',
  topic: 'Sports',
  kind: 'sports',
  status: 'live',
  startTime: '2026-06-17T23:00:00.000Z',
  source: 'espn',
  ...over,
});

describe('BreakingPin', () => {
  it('renders developing coverage with a flag and outlet count', () => {
    render(<BreakingPin items={[item('Fed holds rates steady')]} />);
    expect(screen.getByText('Developing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fed holds rates steady' })).toHaveAttribute(
      'href',
      'https://reuters.com/x',
    );
    expect(screen.getByText(/2 outlets/)).toBeInTheDocument();
  });

  it('renders nothing when there is no pinned coverage', () => {
    const { container } = render(<BreakingPin items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('EventsPin', () => {
  it('renders related events with a flag and a Live chip', () => {
    render(<EventsPin items={[event({ detail: 'Q3 · 88–84' })]} />);
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText('Lakers at Celtics')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText(/Q3/)).toBeInTheDocument();
  });

  it('renders nothing when there are no events', () => {
    const { container } = render(<EventsPin items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DevelopingWidget', () => {
  // The minimize choice persists in localStorage; reset it between cases.
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('starts minimized, opens from the tab to show news as outbound links, then minimizes', () => {
    render(<DevelopingWidget news={[item('Fed holds rates steady'), item('Hurricane nears the coast')]} />);
    // Starts minimized to a slim labeled tab with a count — the panel never covers the
    // feed on load (desktop or phone).
    expect(screen.queryByLabelText('Live wire')).not.toBeInTheDocument();
    const tab = screen.getByRole('button', { name: /open live wire/i });
    expect(tab).toHaveTextContent('2');

    // Open from the tab → the panel + headlines (outbound links) appear.
    fireEvent.click(tab);
    expect(screen.getByLabelText('Live wire')).toBeInTheDocument();
    expect(screen.getByText('Fed holds rates steady').closest('a')).toHaveAttribute(
      'href',
      'https://reuters.com/x',
    );
    expect(screen.getByText('Hurricane nears the coast')).toBeInTheDocument();
    expect(screen.getAllByText(/2 outlets/).length).toBeGreaterThan(0);

    // Minimize → back to the tab.
    fireEvent.click(screen.getByRole('button', { name: /minimize live wire/i }));
    expect(screen.queryByText('Fed holds rates steady')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open live wire/i })).toBeInTheDocument();
  });

  it('switches between All / News / Events tabs', () => {
    render(
      <DevelopingWidget
        news={[item('Fed holds rates steady')]}
        events={[event({ title: 'Lakers at Celtics' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open live wire/i }));
    // "All" (default) shows both channels.
    expect(screen.getByText('Fed holds rates steady')).toBeInTheDocument();
    expect(screen.getByText('Lakers at Celtics')).toBeInTheDocument();

    // Events tab → only events.
    fireEvent.click(screen.getByRole('button', { name: /events/i }));
    expect(screen.getByText('Lakers at Celtics')).toBeInTheDocument();
    expect(screen.queryByText('Fed holds rates steady')).not.toBeInTheDocument();

    // News tab → only news.
    fireEvent.click(screen.getByRole('button', { name: /news/i }));
    expect(screen.getByText('Fed holds rates steady')).toBeInTheDocument();
    expect(screen.queryByText('Lakers at Celtics')).not.toBeInTheDocument();
  });

  it('filters categories via the gear: hide a topic, then show the empty state when all are hidden', () => {
    render(
      <DevelopingWidget
        news={[item('Fed holds rates steady', { topic: 'Economics' })]}
        events={[event({ title: 'Lakers at Celtics', topic: 'Sports' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open live wire/i }));
    // Open the category filter.
    fireEvent.click(screen.getByRole('button', { name: /filter categories/i }));
    // Both category chips are present and "on" by default.
    const econ = screen.getByRole('button', { name: 'Economics', pressed: true });
    const sports = screen.getByRole('button', { name: 'Sports', pressed: true });
    // Hide Economics → its news row disappears, the event remains.
    fireEvent.click(econ);
    expect(screen.queryByText('Fed holds rates steady')).not.toBeInTheDocument();
    expect(screen.getByText('Lakers at Celtics')).toBeInTheDocument();
    // Hide Sports too → nothing matches, but the widget stays with an empty-state hint.
    fireEvent.click(sports);
    expect(screen.getByText(/no matching updates/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Live wire')).toBeInTheDocument(); // not vanished
  });

  it('opens our briefing in-app when a row maps to a tracked market', () => {
    const onOpenStory = vi.fn();
    render(
      <DevelopingWidget
        news={[item('Fed holds rates steady', { marketId: 'fed' })]}
        onOpenStory={onOpenStory}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open live wire/i }));
    // The mapped row is an in-app button, not an outbound anchor.
    const btn = screen.getByRole('button', { name: /our briefing/i });
    fireEvent.click(btn);
    expect(onOpenStory).toHaveBeenCalledWith('fed');
  });

  it('always starts minimized, ignoring any legacy persisted-open flag', () => {
    localStorage.setItem('crowdtell-developing-min', '0'); // legacy "was open" — must not auto-open
    render(<DevelopingWidget news={[item('Fed holds rates steady')]} />);
    expect(screen.queryByText('Fed holds rates steady')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open live wire/i })).toBeInTheDocument();
  });

  it('starts minimized on desktop too, never covering the feed unprompted', () => {
    // Desktop (matchMedia undefined in jsdom → not a phone): still starts minimized.
    render(<DevelopingWidget news={[item('Fed holds rates steady')]} />);
    expect(screen.queryByLabelText('Live wire')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open live wire/i })).toBeInTheDocument();
  });

  it('caps a heavily-syndicated outlet count to "20+ outlets"', () => {
    const big = item('Massively covered story', {
      outlets: Array.from({ length: 76 }, (_, i) => `outlet${i}.com`),
      url: 'https://outlet0.com/x',
      topic: 'World',
    });
    render(<DevelopingWidget news={[big]} />);
    fireEvent.click(screen.getByRole('button', { name: /open live wire/i }));
    expect(screen.getByText(/20\+ outlets/)).toBeInTheDocument();
    expect(screen.queryByText(/76 outlets/)).not.toBeInTheDocument();
  });

  it('reveals (data-revealed) a beat after mount, not on first paint', () => {
    vi.useFakeTimers();
    try {
      render(<DevelopingWidget news={[item('Fed holds rates steady')]} />);
      const widget = screen.getByRole('button', { name: /open live wire/i }).closest('div');
      expect(widget).not.toHaveAttribute('data-revealed'); // hidden on first paint
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(widget).toHaveAttribute('data-revealed', 'true'); // glided in after the delay
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-minimizes on desktop after a stretch of inactivity; activity resets the clock', () => {
    vi.useFakeTimers();
    try {
      render(<DevelopingWidget news={[item('Fed holds rates steady')]} />);
      fireEvent.click(screen.getByRole('button', { name: /open live wire/i }));
      const panel = screen.getByLabelText('Live wire');
      expect(panel).toBeInTheDocument();

      // Activity just before the timeout restarts the countdown → still open.
      act(() => {
        vi.advanceTimersByTime(12_000);
      });
      act(() => {
        panel.dispatchEvent(new Event('pointermove', { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(12_000);
      });
      expect(screen.getByLabelText('Live wire')).toBeInTheDocument();

      // A full idle stretch then tucks it back into the tab.
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
      expect(screen.queryByLabelText('Live wire')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open live wire/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('light-dismiss: a click outside the open panel minimizes it; a click inside does not (desktop)', () => {
    vi.useFakeTimers();
    try {
      render(<DevelopingWidget news={[item('Fed holds rates steady')]} />); // desktop → minimized
      fireEvent.click(screen.getByRole('button', { name: /open live wire/i }));
      act(() => {
        vi.advanceTimersByTime(5); // flush the deferred outside-click listener attach
      });
      const panel = screen.getByLabelText('Live wire');
      expect(panel).toBeInTheDocument(); // open

      // A pointer-down INSIDE the panel keeps it open (interacting, not dismissing).
      act(() => {
        panel.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      expect(screen.getByLabelText('Live wire')).toBeInTheDocument();

      // A pointer-down OUTSIDE dismisses it back to the tab.
      act(() => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      expect(screen.queryByLabelText('Live wire')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open live wire/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders nothing when there is nothing live', () => {
    const { container } = render(<DevelopingWidget news={[]} events={[]} />);
    expect(container.firstChild).toBeNull();
  });

  describe('live-update preview (minimized)', () => {
    // The widget always starts minimized, so the preview path is the default.
    const news = (title: string, url: string): BreakingItem => item(title, { url });

    it('baselines the first batch silently, then previews a NEW arrival', () => {
      const { rerender } = render(<DevelopingWidget news={[news('Initial story', 'https://r.com/a')]} />);
      // First (baseline) batch must NOT toast.
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      // A genuinely-new item arrives on the live feed.
      rerender(
        <DevelopingWidget
          news={[news('Initial story', 'https://r.com/a'), news('Breaking new development', 'https://r.com/b')]}
        />,
      );
      const toast = screen.getByRole('status');
      expect(toast).toHaveTextContent('Breaking new development');
      expect(toast).not.toHaveTextContent('Initial story');
    });

    it('counts multiple new arrivals with a "+N more" hint and opens the wire on tap', () => {
      const { rerender } = render(<DevelopingWidget news={[news('Seed', 'https://r.com/seed')]} />);
      rerender(
        <DevelopingWidget
          news={[news('Seed', 'https://r.com/seed'), news('New A', 'https://r.com/a'), news('New B', 'https://r.com/b')]}
        />,
      );
      expect(screen.getByText(/\+1 more/)).toBeInTheDocument(); // two new, one shown + 1 more
      // Tapping the preview opens the wire (the panel appears).
      fireEvent.click(screen.getByText('New A'));
      expect(screen.getByLabelText('Live wire')).toBeInTheDocument();
    });

    it('dismisses the preview without opening the wire', () => {
      const { rerender } = render(<DevelopingWidget news={[news('Seed', 'https://r.com/seed')]} />);
      rerender(
        <DevelopingWidget news={[news('Seed', 'https://r.com/seed'), news('New one', 'https://r.com/n')]} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /dismiss preview/i }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Live wire')).not.toBeInTheDocument(); // still minimized
    });

    it('does NOT preview when the wire is already open', () => {
      const { rerender } = render(<DevelopingWidget news={[news('Seed', 'https://r.com/seed')]} />);
      fireEvent.click(screen.getByRole('button', { name: /open live wire/i })); // open it
      rerender(
        <DevelopingWidget news={[news('Seed', 'https://r.com/seed'), news('New open', 'https://r.com/o')]} />,
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument(); // visible in the list already
    });
  });
});
