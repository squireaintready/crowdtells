import { describe, expect, it } from 'vitest';
import { headMeta, searchToState, stateToSearch, type UrlState } from '../lib/urlState';

const base: UrlState = {
  section: 'top',
  query: '',
  category: null,
  expandedId: null,
  admin: false,
  overlay: null,
};
const O = 'https://crowdtells.com';

describe('stateToSearch', () => {
  it('emits nothing for the default/home state', () => {
    expect(stateToSearch(base)).toBe('');
  });

  it('omits the default section but serializes others', () => {
    expect(stateToSearch({ ...base, section: 'latest' })).toBe('sec=latest');
    expect(stateToSearch({ ...base, section: 'saved' })).toBe('sec=saved');
    expect(stateToSearch({ ...base, section: 'wall' })).toBe('sec=wall');
  });

  it('serializes the search query under the `q` key (SearchAction contract)', () => {
    expect(stateToSearch({ ...base, query: 'fed cut' })).toBe('q=fed+cut');
  });

  it('serializes a category verbatim (not a slug)', () => {
    expect(stateToSearch({ ...base, category: 'Economics' })).toBe('c=Economics');
  });

  it('serializes an expanded story id, encoding colons', () => {
    expect(stateToSearch({ ...base, expandedId: 'kalshi:KXFED-26' })).toBe('s=kalshi%3AKXFED-26');
  });

  it('combines fields in a stable order', () => {
    expect(
      stateToSearch({ section: 'movers', query: 'gold', category: 'Crypto', expandedId: '351730', admin: false, overlay: null }),
    ).toBe('sec=movers&q=gold&c=Crypto&s=351730');
  });

  it('serializes the admin takeover as admin=1, appended last', () => {
    expect(stateToSearch({ ...base, admin: true })).toBe('admin=1');
    expect(
      stateToSearch({ section: 'movers', query: 'gold', category: 'Crypto', expandedId: '351730', admin: true, overlay: null }),
    ).toBe('sec=movers&q=gold&c=Crypto&s=351730&admin=1');
  });

  it('serializes a modal overlay as o=<name>, appended after admin', () => {
    expect(stateToSearch({ ...base, overlay: 'account' })).toBe('o=account');
    expect(stateToSearch({ ...base, overlay: 'personalize' })).toBe('o=personalize');
    // Appended last so existing (non-overlay) states — admin included — are byte-identical.
    expect(stateToSearch({ ...base, section: 'movers', overlay: 'account' })).toBe('sec=movers&o=account');
  });
});

describe('searchToState', () => {
  it('round-trips every fixture', () => {
    const fixtures: UrlState[] = [
      base,
      { ...base, section: 'latest' },
      { ...base, section: 'saved' },
      { ...base, section: 'wall' },
      { ...base, query: 'fed cut' },
      { ...base, category: 'Economics' },
      { ...base, expandedId: 'kalshi:KXFED-26' },
      { ...base, admin: true },
      { ...base, overlay: 'account' },
      { ...base, overlay: 'personalize' },
      { section: 'movers', query: 'gold', category: 'Crypto', expandedId: '351730', admin: false, overlay: null },
    ];
    for (const f of fixtures) {
      expect(searchToState(stateToSearch(f))).toEqual(f);
    }
  });

  it('falls back to the default section for an unknown value', () => {
    expect(searchToState('sec=bogus').section).toBe('top');
  });

  it('drops a category that fails the existence check', () => {
    expect(searchToState('c=Ghost', { categoryExists: () => false }).category).toBeNull();
    expect(
      searchToState('c=Economics', { categoryExists: (c) => c === 'Economics' }).category,
    ).toBe('Economics');
  });

  it('accepts any category when no validator is given', () => {
    expect(searchToState('c=Anything').category).toBe('Anything');
  });

  it('tolerates a leading ? and missing params', () => {
    expect(searchToState('?q=hi')).toEqual({ ...base, query: 'hi' });
    expect(searchToState('')).toEqual(base);
  });

  it('parses the admin takeover flag', () => {
    expect(searchToState('admin=1').admin).toBe(true);
    expect(searchToState('').admin).toBe(false);
    expect(searchToState('sec=latest').admin).toBe(false);
  });

  it('parses a known overlay and drops an unknown one', () => {
    expect(searchToState('o=account').overlay).toBe('account');
    expect(searchToState('o=personalize').overlay).toBe('personalize');
    expect(searchToState('o=bogus').overlay).toBeNull();
    expect(searchToState('').overlay).toBeNull();
  });
});

describe('headMeta', () => {
  it('canonicals an open story to its static /s/ twin (kills ?s= duplicates)', () => {
    const m = headMeta(
      { query: '', category: null, expandedId: 'kalshi:KXFED-26' },
      { origin: O, story: { path: '/s/kalshi-KXFED-26', title: 'Fed weighs a cut' } },
    );
    expect(m.canonical).toBe(`${O}/s/kalshi-KXFED-26`);
    expect(m.title).toBe('Fed weighs a cut — Crowdtells');
    expect(m.robots).toContain('index');
  });

  it('noindexes search-result views and canonicals them home', () => {
    const m = headMeta({ query: 'gold', category: null, expandedId: null }, { origin: O });
    expect(m.robots).toBe('noindex, follow');
    expect(m.canonical).toBe(`${O}/`);
    expect(m.title).toContain('gold');
  });

  it('canonicals a category view to its /topic hub', () => {
    const m = headMeta(
      { query: '', category: 'Economics', expandedId: null },
      { origin: O, topicPath: '/topic/economics' },
    );
    expect(m.canonical).toBe(`${O}/topic/economics`);
    expect(m.robots).toContain('index');
  });

  it('an open story wins over an active search filter', () => {
    const m = headMeta(
      { query: 'fed', category: null, expandedId: 'x' },
      { origin: O, story: { path: '/s/x', title: 'Story' } },
    );
    expect(m.canonical).toBe(`${O}/s/x`);
    expect(m.robots).toContain('index');
  });

  it('defaults to the indexable homepage', () => {
    const m = headMeta(base, { origin: O });
    expect(m.canonical).toBe(`${O}/`);
    expect(m.title).toBe('Crowdtells — A living record of what the crowd believes');
    expect(m.robots).toContain('index');
  });

  it('syncs an open story’s description + article social card (matches the /s/ twin)', () => {
    const m = headMeta(
      { query: '', category: null, expandedId: 's1' },
      {
        origin: O,
        story: {
          path: '/s/s1',
          title: 'Fed weighs a cut',
          description: 'The crowd has swung toward a cut.',
          image: `${O}/og/s1.png`,
        },
      },
    );
    expect(m.ogType).toBe('article');
    expect(m.description).toBe('The crowd has swung toward a cut.');
    expect(m.image).toBe(`${O}/og/s1.png`);
  });

  it('restores the homepage description + card (website) on the feed view', () => {
    const m = headMeta(base, { origin: O });
    expect(m.ogType).toBe('website');
    expect(m.description).toContain('keeps a living record of how opinion moves over time');
    expect(m.image).toBe(`${O}/og.png`);
  });
});
