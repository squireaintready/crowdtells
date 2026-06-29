import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Synthesis } from '../components/Synthesis';

describe('Synthesis perspectives outlet label', () => {
  it('normalizes a domain-looking source, passing curated names through unchanged', () => {
    render(
      <Synthesis
        marketId="m"
        data={{
          consensus: [],
          disputed: [],
          perspectives: [
            { source: 'reuters.com', view: 'Frames it as a done deal.' },
            { source: 'Politico', view: 'Calls the race wide open.' },
          ],
        }}
      />,
    );
    expect(screen.getByText('Reuters')).toBeTruthy(); // reuters.com → Reuters (no "REUTERS.COM")
    expect(screen.queryByText('reuters.com')).toBeNull();
    expect(screen.getByText('Politico')).toBeTruthy(); // curated proper name untouched
  });

  it('shows a subtle lean indicator only for outlets whose lean we recognize', () => {
    render(
      <Synthesis
        marketId="m"
        data={{
          consensus: [],
          disputed: [],
          perspectives: [
            { source: 'reuters.com', view: 'Plays it straight.' }, // center → dot
            { source: 'Some Local Blog', view: 'Adds local color.' }, // unknown → no dot
          ],
        }}
      />,
    );
    expect(screen.getByLabelText('Center-leaning')).toBeTruthy();
    expect(screen.queryByLabelText('Left-leaning')).toBeNull();
    expect(screen.queryByLabelText('Right-leaning')).toBeNull();
  });
});

describe('Synthesis consensus (two-source rule)', () => {
  const data = {
    consensus: ['Both sides agree a vote is scheduled this week.'],
    disputed: [],
    perspectives: [],
  };

  it('surfaces "what the coverage agrees on" when >= 2 sources back it', () => {
    render(<Synthesis marketId="m" data={data} sourceCount={3} />);
    expect(screen.getByText('What the coverage agrees on')).toBeTruthy();
    expect(screen.getByText(/vote is scheduled/)).toBeTruthy();
  });

  it('hides consensus when fewer than 2 outlets informed it', () => {
    const { container } = render(<Synthesis marketId="m" data={data} sourceCount={1} />);
    expect(screen.queryByText('What the coverage agrees on')).toBeNull();
    expect(container.firstChild).toBeNull(); // nothing else to show → renders nothing
  });
});
