import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StoryCard } from '../components/StoryCard';
import { makeMarket } from './factory';

const market = makeMarket({
  id: 'a',
  source: 'kalshi',
  title: 'Will the Fed cut rates?',
  marketUrl: 'https://kalshi.com/markets/KXFED',
  category: 'Economics',
  favored: 'Yes',
  oddsPct: 68,
  divergence: 7,
  movement24h: 4.2,
  movement7d: 9,
  volume: 2_400_000,
  comments: 1840,
  hook: 'Will the Fed blink first?',
  analysis: 'Pricing has swung toward a cut. The decisive input is CPI. Positioning is crowded.',
  alt: {
    source: 'polymarket',
    favored: 'Yes',
    oddsPct: 61,
    volume: 540_000,
    marketUrl: 'https://polymarket.com/event/fed',
  },
  sources: [{ domain: 'reuters.com', url: 'https://reuters.com/x', title: 'Fed weighs cut' }],
  grounded: true,
});

describe('StoryCard (preview)', () => {
  it('leads with the headline, the source badge, and a Read article action', () => {
    render(<StoryCard market={market} onOpen={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Will the Fed blink first?' })).toBeInTheDocument();
    expect(screen.getByText('Kalshi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read article/i })).toBeInTheDocument();
  });

  it('opens via the Read article button', () => {
    const onOpen = vi.fn();
    render(<StoryCard market={market} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /read article/i }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('opens when the card body is clicked', () => {
    const onOpen = vi.fn();
    render(<StoryCard market={market} onOpen={onOpen} />);
    fireEvent.click(screen.getByText(/decisive input is CPI/i));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('shows the money in play and the crowd read (interest signals)', () => {
    render(<StoryCard market={market} onOpen={() => {}} />);
    expect(screen.getByText(/in play/i)).toBeInTheDocument();
    expect(screen.getByText(/Crowd estimate:/)).toBeInTheDocument();
  });

  it('prefers the dek as the teaser when present', () => {
    const m = makeMarket({
      id: 'dek',
      hook: 'Dek story',
      dek: 'A crisp one-line standfirst for the card.',
      analysis: 'The longer lead that should NOT be the teaser when a dek exists.',
    });
    render(<StoryCard market={m} onOpen={() => {}} />);
    expect(screen.getByText('A crisp one-line standfirst for the card.')).toBeInTheDocument();
    expect(screen.queryByText(/should NOT be the teaser/)).not.toBeInTheDocument();
  });

  it('hydrates {odds} tokens in the teaser from the live value', () => {
    const m = makeMarket({
      id: 'tok',
      oddsPct: 73,
      hook: 'Token story',
      dek: '',
      analysis: 'The crowd puts the chance at {odds} as the vote nears.',
    });
    render(<StoryCard market={m} onOpen={() => {}} />);
    expect(
      screen.getByText(/The crowd puts the chance at 73% as the vote nears\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\{odds\}/)).not.toBeInTheDocument();
  });

  it('shows a resolution recap on a resolved story (did the crowd call it)', () => {
    const hit = makeMarket({
      id: 'r1',
      status: 'resolved',
      favored: 'Yes',
      resolvedOutcome: 'Yes',
      calledCorrectly: true,
      hook: 'Did it happen?',
    });
    const { rerender } = render(<StoryCard market={hit} onOpen={() => {}} />);
    expect(screen.getByText(/the market called it/i)).toBeInTheDocument();

    const miss = makeMarket({
      id: 'r2',
      status: 'resolved',
      favored: 'Nikola Jokić',
      resolvedOutcome: 'Shai Gilgeous-Alexander',
      calledCorrectly: false,
      hook: 'Who won MVP?',
    });
    rerender(<StoryCard market={miss} onOpen={() => {}} />);
    expect(screen.getByText(/the market missed this/i)).toBeInTheDocument();
  });

  it('shows the market-vs-press flag only when ahead or contested', () => {
    const { rerender } = render(
      <StoryCard
        market={makeMarket({ id: 'cvc', crowdVsCoverage: 'contested', hook: 'X' })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText('Coverage disputes this')).toBeInTheDocument();

    rerender(
      <StoryCard
        market={makeMarket({ id: 'cvc', crowdVsCoverage: 'ahead', hook: 'X' })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText('Crowd ahead of press')).toBeInTheDocument();

    rerender(
      <StoryCard
        market={makeMarket({ id: 'cvc', crowdVsCoverage: 'aligned', hook: 'X' })}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByText(/ahead of press|disputes this/i)).not.toBeInTheDocument();
  });

  it('renders cited outlets as links in the byline', () => {
    render(<StoryCard market={market} onOpen={() => {}} />);
    const link = screen.getByRole('link', { name: 'Reuters' });
    expect(link).toHaveAttribute('href', 'https://reuters.com/x');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('flags cross-market divergence as an interest signal', () => {
    render(<StoryCard market={market} onOpen={() => {}} />);
    expect(screen.getByText(/7pt gap vs Polymarket/i)).toBeInTheDocument();
  });

  it('renders a background hero element when the story has one', () => {
    const m = makeMarket({
      id: 'hero',
      hook: 'Hero story',
      hero: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/800px-Foo.jpg',
        type: 'person',
        name: 'Jane Doe',
        source: 'wikipedia',
        orientation: 'portrait',
      },
    });
    const { container } = render(<StoryCard market={m} onOpen={() => {}} />);
    const hero = container.querySelector('[aria-hidden="true"][style*="background-image"]');
    expect(hero).not.toBeNull();
    // A person portrait fills the band (cover) — it must NOT be the right-anchored
    // contained emblem used for flags/logos/thumbnails.
    expect(hero?.getAttribute('style')).not.toContain('right center');
  });

  it('shows the subject image (flag/landmark/logo) when there is no person hero', () => {
    const m = makeMarket({
      id: 'country',
      hook: 'Country story',
      hero: null,
      images: [
        {
          url: '/flags/fr.svg', // self-hosted (feed.ts normalizes any legacy flagcdn URL to this)
          type: 'country',
          name: 'France',
          source: 'flag',
          orientation: 'landscape',
        },
      ],
    });
    const { container } = render(<StoryCard market={m} onOpen={() => {}} />);
    const hero = container.querySelector('[aria-hidden="true"][style*="background-image"]');
    expect(hero?.getAttribute('style')).toContain('/flags/fr.svg');
    // A flag is a contained, right-anchored emblem (not stretched cover).
    expect(hero?.getAttribute('style')).toContain('right center');
  });

  it('falls back to the platform thumbnail so every briefed card has a picture', () => {
    const m = makeMarket({ id: 'thumb', hook: 'Thumb story', image: 'https://cdn.example/thumb.png' });
    const { container } = render(<StoryCard market={m} onOpen={() => {}} />);
    const hero = container.querySelector('[aria-hidden="true"][style*="background-image"]');
    expect(hero?.getAttribute('style')).toContain('thumb.png');
    // The platform thumbnail is a mark, not a scene → contained, not cover-cropped (#3).
    expect(hero?.getAttribute('style')).toContain('right center');
  });

  it('fills a briefed card that has no resolvable image with a category spine', () => {
    const m = makeMarket({ id: 'spine', hook: 'No pic here', category: 'Weather' });
    const { container } = render(<StoryCard market={m} onOpen={() => {}} />);
    // No hero band…
    expect(container.querySelector('[style*="background-image"]')).toBeNull();
    // …but the section appears twice: the eyebrow kicker AND the decorative spine.
    expect(screen.getAllByText('Weather')).toHaveLength(2);
  });

  it('shows no spine on a not-yet-briefed (pending) story', () => {
    const m = makeMarket({ id: 'pending', category: 'Weather', generatedAt: '' });
    render(<StoryCard market={m} onOpen={() => {}} />);
    expect(screen.getByText(/briefing incoming/i)).toBeInTheDocument();
    expect(screen.getAllByText('Weather')).toHaveLength(1); // eyebrow only
  });

  describe('drag-to-reveal swipe (hero cards)', () => {
    const heroMarket = makeMarket({
      id: 'swipe',
      hook: 'Swipe story',
      analysis: 'A body line so the card has a teaser to tap.',
      hero: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/Foo.jpg',
        type: 'person',
        name: 'Jane Doe',
        source: 'wikipedia',
        orientation: 'portrait',
      },
    });

    // jsdom has no PointerEvent, so testing-library's pointer helpers drop
    // clientX/Y. A MouseEvent carries the coordinates and React still routes it
    // to the matching onPointer* handler by event type.
    const pointer = (
      el: Element,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      x: number,
      y: number,
    ) =>
      fireEvent(
        el,
        new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }),
      );

    it('opens the article on a full leftward swipe', () => {
      const onOpen = vi.fn();
      render(<StoryCard market={heroMarket} onOpen={onOpen} />);
      const card = screen.getByRole('article');
      pointer(card, 'pointerdown', 200, 100);
      pointer(card, 'pointermove', 130, 100);
      pointer(card, 'pointerup', 130, 100);
      expect(onOpen).toHaveBeenCalledWith('swipe');
    });

    it('does not open when the gesture is a vertical scroll', () => {
      const onOpen = vi.fn();
      render(<StoryCard market={heroMarket} onOpen={onOpen} />);
      const card = screen.getByRole('article');
      pointer(card, 'pointerdown', 200, 100);
      pointer(card, 'pointermove', 200, 30);
      pointer(card, 'pointerup', 200, 30);
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('still opens a hero card on a plain tap', () => {
      const onOpen = vi.fn();
      render(<StoryCard market={heroMarket} onOpen={onOpen} />);
      const card = screen.getByRole('article');
      pointer(card, 'pointerdown', 200, 100);
      pointer(card, 'pointerup', 200, 100);
      fireEvent.click(card);
      expect(onOpen).toHaveBeenCalledWith('swipe');
    });

    // jsdom reports no geometry, so pin a real rect to exercise the image-zone
    // hit test (tap the picture → reveal gesture, not a nav).
    const mockRect = (left: number, width: number) =>
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        left,
        right: left + width,
        width,
        top: 0,
        bottom: 300,
        height: 300,
        x: left,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

    it('does not open when the tap lands on the image band', () => {
      const onOpen = vi.fn();
      const rect = mockRect(0, 400);
      render(<StoryCard market={heroMarket} onOpen={onOpen} />);
      const card = screen.getByRole('article');
      // A tap on the bare band (target is the article, not a text node) in the
      // right of the card → the picture, suppressed.
      fireEvent.click(card, { clientX: 360, clientY: 50 });
      expect(onOpen).not.toHaveBeenCalled();
      rect.mockRestore();
    });

    it('still opens when the tap lands on the text column', () => {
      const onOpen = vi.fn();
      const rect = mockRect(0, 400);
      render(<StoryCard market={heroMarket} onOpen={onOpen} />);
      const card = screen.getByRole('article');
      fireEvent.click(card, { clientX: 40, clientY: 50 }); // left column → opens
      expect(onOpen).toHaveBeenCalledWith('swipe');
      rect.mockRestore();
    });

    it('opens when a text element is tapped even over the image band', () => {
      const onOpen = vi.fn();
      const rect = mockRect(0, 400);
      render(<StoryCard market={heroMarket} onOpen={onOpen} />);
      // The headline (a text node) is the click target, not the article, so even
      // at a far-right x the tap reads as "on the text" and opens.
      const headline = screen.getByRole('heading', { name: 'Swipe story' });
      fireEvent.click(headline, { clientX: 380, clientY: 50 });
      expect(onOpen).toHaveBeenCalledWith('swipe');
      rect.mockRestore();
    });

    it('settles the band back to rest when a tap interrupts the scroll-in entrance', () => {
      // The entrance only runs when IntersectionObserver exists (jsdom has none),
      // and the recede is a rAF tween. Stub both deterministically so we can
      // interrupt the recede and prove it never strands the band wider than rest.
      const origIO = globalThis.IntersectionObserver;
      const origRAF = globalThis.requestAnimationFrame;
      const origCAF = globalThis.cancelAnimationFrame;
      const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000); // fixed tween start
      const ioCbs: IntersectionObserverCallback[] = [];
      const rafQueue = new Map<number, FrameRequestCallback>();
      let rafId = 0;
      globalThis.IntersectionObserver = class {
        constructor(cb: IntersectionObserverCallback) {
          ioCbs.push(cb);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      } as unknown as typeof IntersectionObserver;
      globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        const id = ++rafId;
        rafQueue.set(id, cb);
        return id;
      }) as typeof requestAnimationFrame;
      globalThis.cancelAnimationFrame = ((id: number) => {
        rafQueue.delete(id);
      }) as typeof cancelAnimationFrame;
      const flushRaf = (t: number) => {
        const cbs = [...rafQueue.values()];
        rafQueue.clear();
        cbs.forEach((cb) => cb(t));
      };
      const rect = mockRect(0, 400);
      try {
        render(<StoryCard market={heroMarket} onOpen={() => {}} />);
        const card = screen.getByRole('article');
        // On mount the entrance pre-sets the curtain fully open…
        expect(card.style.getPropertyValue('--reveal')).toBe('1.000');
        // …and scrolling into view schedules the recede to rest.
        const [intersect] = ioCbs;
        if (!intersect) throw new Error('IntersectionObserver was not constructed');
        intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        // A tap on the image band mid-recede (down + up, no drag) must NOT abort it.
        pointer(card, 'pointerdown', 360, 50);
        pointer(card, 'pointerup', 360, 50);
        // Advancing the tween settles at the resting reveal — never stranded at 1.000.
        flushRaf(1000 + 620);
        expect(card.style.getPropertyValue('--reveal')).toBe('0.420');
      } finally {
        rect.mockRestore();
        nowSpy.mockRestore();
        globalThis.IntersectionObserver = origIO;
        globalThis.requestAnimationFrame = origRAF;
        globalThis.cancelAnimationFrame = origCAF;
      }
    });

    it('lets an image tap open the article under reduced motion (no dead zone)', () => {
      const onOpen = vi.fn();
      const rect = mockRect(0, 400);
      const origMM = globalThis.matchMedia;
      globalThis.matchMedia = ((q: string) => ({
        matches: /reduce/.test(q),
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof globalThis.matchMedia;
      try {
        render(<StoryCard market={heroMarket} onOpen={onOpen} />);
        const card = screen.getByRole('article');
        // The gesture is off under reduced motion, so the picture must not also
        // swallow the tap — it falls through and opens like any other tap.
        fireEvent.click(card, { clientX: 360, clientY: 50 });
        expect(onOpen).toHaveBeenCalledWith('swipe');
      } finally {
        globalThis.matchMedia = origMM;
        rect.mockRestore();
      }
    });
  });
});

describe('StoryCard (digest "on the board" row)', () => {
  // A digest is NEVER briefed (generatedAt null) — it must render as a board row,
  // not the "Briefing incoming" pending placeholder.
  const digest = makeMarket({
    id: 'd1',
    format: 'digest',
    title: 'Highest temperature in LA on June 24?',
    hook: '', // digests have no hook
    generatedAt: null,
    favored: '88-89°F',
    oddsPct: 42,
    category: 'Weather',
    source: 'polymarket',
    marketUrl: 'https://polymarket.com/event/la-high-temp',
    subSignals: [
      { id: 's1', title: '90°F or higher?', source: 'polymarket', favored: 'No', oddsPct: 61, movement24h: 3, volume: 12000, marketUrl: '' },
      { id: 's2', title: '85°F or higher?', source: 'polymarket', favored: 'Yes', oddsPct: 88, movement24h: -2, volume: 9000, marketUrl: '' },
    ],
  });

  it('renders an "On the board" row with the title and crowd read, not "Briefing incoming"', () => {
    render(<StoryCard market={digest} onOpen={() => {}} />);
    expect(screen.getByText('On the board')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Highest temperature in LA on June 24?' }),
    ).toBeInTheDocument();
    // The favored outcome + its probability inline.
    expect(screen.getByText('88-89°F')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    // A digest is never briefed — the pending placeholder must NOT appear.
    expect(screen.queryByText(/briefing incoming/i)).not.toBeInTheDocument();
  });

  it('links the whole row out to the platform (new tab, safe rel) and never opens the article', () => {
    const onOpen = vi.fn();
    render(<StoryCard market={digest} onOpen={onOpen} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://polymarket.com/event/la-high-temp');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The board row is a link-out; it must not invoke the in-app article opener.
    fireEvent.click(screen.getByText('Highest temperature in LA on June 24?'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows the other lines on the series as small facet chips', () => {
    render(<StoryCard market={digest} onOpen={() => {}} />);
    // Each facet chip carries its favored outcome + odds, with the full question as a label.
    expect(screen.getByTitle('90°F or higher?')).toBeInTheDocument();
    expect(screen.getByTitle('85°F or higher?')).toBeInTheDocument();
    expect(screen.getByText('61%')).toBeInTheDocument();
  });
});
