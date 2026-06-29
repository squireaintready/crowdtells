import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sources } from '../components/Sources';
import type { Source } from '../lib/types';

const src = (domain: string, i = 0): Source => ({
  domain,
  url: `https://${domain}/article-${i}`,
});

describe('Sources', () => {
  it('strips the TLD from an unknown-outlet chip but keeps the full host in the tooltip + href', () => {
    render(<Sources sources={[src('litefinance.org')]} />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('litefinance'); // visible chip = registrable name only
    expect(link).not.toHaveTextContent('litefinance.org'); // no .org on the chip
    expect(link).toHaveAttribute('title', 'litefinance.org'); // full host preserved in tooltip
    expect(link).toHaveAttribute('href', 'https://litefinance.org/article-0'); // full URL untouched
  });

  it('leaves curated proper outlet names alone', () => {
    render(<Sources sources={[src('reuters.com')]} />);
    expect(screen.getByRole('link')).toHaveTextContent('Reuters');
  });

  it('keeps every cited source in the DOM (provenance / SEO)', () => {
    const seven = Array.from({ length: 7 }, (_, i) => src(`outlet${i}.com`, i));
    render(<Sources sources={seven} />);
    // Every citation stays in the DOM on the single row. jsdom reports no layout, so the
    // marquee measures "fits" and never mounts the aria-hidden duplicate track — exactly
    // 7 links, no clones. The auto-scroll itself is exercised in the browser.
    expect(screen.getAllByRole('link')).toHaveLength(7);
  });

  it('renders nothing when there are no sources', () => {
    const { container } = render(<Sources sources={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
