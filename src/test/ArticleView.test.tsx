import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArticleView } from '../components/ArticleView';
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
  movement7d: 9,
  volume: 2_400_000,
  hook: 'Will the Fed blink first?',
  dek: 'A cut is on the table and the crowd is leaning in.',
  analysis: 'Pricing has swung toward a cut. The decisive input is CPI. Positioning is crowded.',
  background: 'The Fed has held rates since the last hike; CPI has cooled unevenly.',
  whatToWatch: 'The next CPI print and the dot plot at the coming meeting.',
  take: 'We think the market is a touch overconfident here.',
  alt: {
    source: 'polymarket',
    favored: 'Yes',
    oddsPct: 61,
    volume: 540_000,
    marketUrl: 'https://polymarket.com/event/fed',
  },
  synthesis: {
    consensus: ['Markets lean toward a cut.'],
    disputed: ['Whether services inflation is cooling fast enough.'],
    perspectives: [{ source: 'Reuters', view: 'Frames it as data-dependent.' }],
  },
  sources: [{ domain: 'reuters.com', url: 'https://reuters.com/x', title: 'Fed weighs cut' }],
  grounded: true,
  hero: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/800px-Chair.jpg',
    type: 'person',
    name: 'Jerome Powell',
    source: 'wikipedia',
    credit: 'Wikimedia Commons',
    orientation: 'portrait',
  },
  images: [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/800px-Chair.jpg',
      type: 'person',
      name: 'Jerome Powell',
      source: 'wikipedia',
      credit: 'Wikimedia Commons',
      orientation: 'portrait',
    },
    {
      url: 'https://flagcdn.com/w640/us.png',
      type: 'country',
      name: 'United States',
      source: 'flag',
      credit: 'flagcdn.com',
      orientation: 'landscape',
    },
  ],
});

describe('ArticleView', () => {
  it('renders the headline, dek, lead, sections, take, differences, numbers and pricing', () => {
    render(<ArticleView market={market} onBack={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Will the Fed blink first?' })).toBeInTheDocument();
    expect(screen.getByText('A cut is on the table and the crowd is leaning in.')).toBeInTheDocument();
    expect(screen.getByText(/decisive input is CPI/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Background' })).toBeInTheDocument();
    expect(screen.getByText(/held rates since the last hike/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What to watch' })).toBeInTheDocument();
    expect(screen.getByText('Our take')).toBeInTheDocument();
    expect(screen.getByText(/touch overconfident/i)).toBeInTheDocument();
    expect(screen.getByText('Where sources disagree')).toBeInTheDocument();
    expect(screen.getByText('What the market shows')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /kalshi/i })).toHaveAttribute(
      'href',
      'https://kalshi.com/markets/KXFED',
    );
    expect(screen.getByRole('link', { name: /polymarket/i })).toHaveAttribute(
      'href',
      'https://polymarket.com/event/fed',
    );
  });

  it('renders the hero portrait and entity figures with credit (hero not duplicated)', () => {
    render(<ArticleView market={market} onBack={() => {}} />);
    // Hero uses the person portrait...
    expect(screen.getByRole('img', { name: 'Jerome Powell' })).toBeInTheDocument();
    // ...and the flag appears as a supporting figure (the hero is filtered out).
    expect(screen.getByRole('img', { name: 'United States' })).toBeInTheDocument();
    expect(screen.getByText(/flagcdn\.com/)).toBeInTheDocument();
    // Powell appears once (hero), not repeated as a figure.
    expect(screen.getAllByRole('img', { name: 'Jerome Powell' })).toHaveLength(1);
  });

  it('hydrates {odds} tokens in the lead', () => {
    const m = makeMarket({
      id: 'tok',
      oddsPct: 73,
      hook: 'Token story',
      analysis: 'The crowd puts the chance at {odds} as the vote nears.',
    });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(
      screen.getByText(/The crowd puts the chance at 73% as the vote nears\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\{odds\}/)).not.toBeInTheDocument();
  });

  it('calls onBack from the back control', () => {
    const onBack = vi.fn();
    render(<ArticleView market={market} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /all stories/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('traces the read over time when there are revisions (newest-first, with then-odds)', () => {
    const m = makeMarket({
      id: 'rev',
      hook: 'Newsom consolidates as the field narrows',
      favored: 'Gavin Newsom',
      oddsPct: 31,
      generatedAt: '2026-06-16T00:00:00Z',
      revisions: [
        {
          generatedAt: '2026-06-09T00:00:00Z',
          oddsPct: 24,
          favored: 'Gavin Newsom',
          hook: 'Newsom leads but the field stays open',
          dek: 'Buttigieg is closing as undecideds grow.',
        },
        {
          generatedAt: '2026-06-01T00:00:00Z',
          oddsPct: 18,
          favored: 'Gavin Newsom',
          hook: 'A wide-open race, no clear front-runner',
          dek: '',
        },
      ],
    });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(screen.getByText(/Updated 2× as the odds moved/i)).toBeInTheDocument();
    expect(screen.getByText('Newsom leads but the field stays open')).toBeInTheDocument();
    expect(screen.getByText('A wide-open race, no clear front-runner')).toBeInTheDocument();
    expect(screen.getByText('Buttigieg is closing as undecideds grow.')).toBeInTheDocument();
    // the then-odds for the oldest version (the real, labeled odds row — distinct
    // from the aggressive decorative "ghost" numeral, which is aria-hidden and may
    // also render "18%" behind the step).
    expect(screen.getByText('Gavin Newsom 18%')).toBeInTheDocument();
  });

  it('expands a revision to re-read the prior body with a headline diff', () => {
    const m = makeMarket({
      id: 'revx',
      hook: 'Newsom consolidates as the field narrows',
      favored: 'Gavin Newsom',
      oddsPct: 31,
      analysis: 'The nomination is his to lose.',
      revisions: [
        {
          generatedAt: '2026-06-09T00:00:00Z',
          oddsPct: 24,
          favored: 'Gavin Newsom',
          hook: 'Newsom leads but the field stays open',
          dek: 'Buttigieg is closing as undecideds grow.',
          analysis: 'Back then the race looked wide as several Democrats jockeyed for position.',
          take: 'We thought the polling overstated his lead.',
        },
      ],
    });
    render(<ArticleView market={m} onBack={() => {}} />);
    // The expand affordance + the retained prior body are present...
    expect(screen.getByText('Read this version')).toBeInTheDocument();
    expect(screen.getByText(/the race looked wide/i)).toBeInTheDocument();
    expect(screen.getByText('Our take then')).toBeInTheDocument();
    expect(screen.getByText(/polling overstated his lead/i)).toBeInTheDocument();
    // ...and the headline diff calls out how our read changed.
    expect(screen.getByText('How the headline changed')).toBeInTheDocument();
  });

  it('keeps body-less (legacy) revisions as non-expandable rows', () => {
    const m = makeMarket({
      id: 'revlegacy',
      hook: 'Now headline',
      revisions: [
        {
          generatedAt: '2026-06-01T00:00:00Z',
          oddsPct: 40,
          favored: 'Yes',
          hook: 'Older headline, no body retained',
          dek: '',
        },
      ],
    });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(screen.getByText('Older headline, no body retained')).toBeInTheDocument();
    expect(screen.queryByText('Read this version')).not.toBeInTheDocument();
  });

  it('shows a resolved verdict node in the timeline', () => {
    const m = makeMarket({
      id: 'revr',
      status: 'resolved',
      favored: 'No',
      resolvedOutcome: 'No',
      calledCorrectly: true,
      hook: 'Final read',
      revisions: [
        {
          generatedAt: '2026-06-01T00:00:00Z',
          oddsPct: 60,
          favored: 'Yes',
          hook: 'Early optimism it would happen',
          dek: '',
        },
      ],
    });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(screen.getByText(/Resolved No/)).toBeInTheDocument();
  });

  it('renders no timeline when there are no revisions', () => {
    render(<ArticleView market={market} onBack={() => {}} />);
    expect(screen.queryByText(/trace our read/i)).not.toBeInTheDocument();
  });

  it('renders the precedent section from high-confidence facts, labeled as AI context', () => {
    const m = makeMarket({
      id: 'prec',
      precedents: [
        'No sitting governor has won the nomination since 1972',
        'The two teams last met in the 2022 final',
      ],
    });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(screen.getByRole('heading', { name: 'The precedent' })).toBeInTheDocument();
    expect(screen.getByText(/No sitting governor/)).toBeInTheDocument();
    expect(screen.getByText(/Context compiled by Crowdtells/)).toBeInTheDocument();
  });

  it('omits the precedent section when there are no facts', () => {
    render(<ArticleView market={market} onBack={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'The precedent' })).not.toBeInTheDocument();
  });

  it('states an honest "Awaiting result" when the window closed but no outcome is captured', () => {
    // The exact confusion we fixed: a past end date used to read "Resolved" over
    // present-tense preview prose. Now it says the window closed and we await the result.
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const m = makeMarket({ id: 'aw', status: 'active', endDate: past, resolvedOutcome: null });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(screen.getByText(/awaiting result/i)).toBeInTheDocument();
  });

  it('surfaces an absolute resolution date for an open market', () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const m = makeMarket({ id: 'up', status: 'active', endDate: future, resolvedOutcome: null });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(screen.getByText(/^Resolves /)).toBeInTheDocument();
  });

  it('always shows the market chart, even with a single odds observation', () => {
    const m = makeMarket({ id: 'sp', oddsHistory: [{ t: '2026-06-15T00:00:00Z', p: 51 }] });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(screen.getByRole('img', { name: /crowd belief/i })).toBeInTheDocument();
  });

  it('tucks resolution criteria into a collapsed disclosure, not a prominent line', () => {
    const m = makeMarket({
      id: 'res',
      description: 'If the highest temperature at LAX is between 69-70°, the market resolves to Yes.',
    });
    render(<ArticleView market={m} onBack={() => {}} />);
    // The legalistic "How it resolves:" prefix is gone...
    expect(screen.queryByText(/How it resolves:/i)).not.toBeInTheDocument();
    // ...replaced by an opt-in "Resolution criteria" disclosure that still carries the text.
    expect(screen.getByText('Resolution criteria')).toBeInTheDocument();
    expect(screen.getByText(/highest temperature at LAX/i)).toBeInTheDocument();
  });

  it('places a team/org logo as a figure, never as the hero', () => {
    const m = makeMarket({
      id: 'logo',
      hook: 'Rockies face Cubs',
      favored: 'Colorado Rockies',
      oddsPct: 79,
      hero: null,
      images: [
        {
          url: 'https://upload.wikimedia.org/wikipedia/en/x/braves.png',
          type: 'team',
          name: 'Atlanta Braves',
          source: 'wikipedia',
          orientation: 'landscape',
          credit: 'Wikimedia Commons',
        },
      ],
    });
    render(<ArticleView market={m} onBack={() => {}} />);
    expect(screen.getByRole('img', { name: 'Atlanta Braves' })).toBeInTheDocument();
  });
});
