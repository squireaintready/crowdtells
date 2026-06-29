import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BriefingRevision, OddsPoint } from '../lib/types';
import { TrendChart } from '../components/TrendChart';

const D = (n: number) => new Date(Date.parse('2026-06-10T00:00:00Z') + n * 86_400_000).toISOString();
const pt = (n: number, p: number): OddsPoint => ({ t: D(n), p });

describe('TrendChart', () => {
  it('renders nothing when there is no usable history', () => {
    const { container } = render(<TrendChart history={[]} favored="Yes" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws the belief line and an accessible summary', () => {
    const { container } = render(
      <TrendChart history={[pt(0, 40), pt(2, 58), pt(4, 66)]} favored="Yes" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-label')).toMatch(/Crowd belief in "Yes" from 40% to 66%/);
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('plots a marker per revision and per dated source', () => {
    const revisions: BriefingRevision[] = [
      { generatedAt: D(1), oddsPct: 45, favored: 'Yes', hook: 'early read', dek: '' },
      { generatedAt: D(3), oddsPct: 60, favored: 'Yes', hook: 'later read', dek: '' },
    ];
    const { container } = render(
      <TrendChart
        history={[pt(0, 40), pt(4, 66)]}
        revisions={revisions}
        coverage={[
          { t: D(1), outlet: 'reuters.com', title: 'A' },
          { t: D(2), outlet: 'ap.org' },
        ]}
        favored="Yes"
      />,
    );
    // 2 revision groups + 2 coverage ticks present.
    expect(container.querySelectorAll('g title').length).toBe(2);
    expect(container.querySelectorAll('line title').length).toBe(2);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toMatch(
      /2 read updates and 2 cited articles/,
    );
  });

  it('renders a single observation as a flat line without crashing', () => {
    const { container } = render(<TrendChart history={[pt(2, 80)]} favored="Yes" />);
    expect(container.querySelector('polyline')).not.toBeNull();
  });
});
