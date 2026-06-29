import { describe, expect, it } from 'vitest';
import { figureLayout } from '../lib/figureLayout';
import type { EntityType, ImageRef } from '../lib/types';
import { makeMarket } from './factory';

const m = makeMarket({});

/** A minimal resolved figure of a given entity type. `source`/`orientation`
 *  default to the common case but can be overridden to exercise the scorer. */
function fig(type: EntityType, over: Partial<ImageRef> = {}): ImageRef {
  const source: ImageRef['source'] =
    type === 'country' ? 'flag' : type === 'token' ? 'token' : 'wikipedia';
  return {
    url: `https://img/${type}/${over.name ?? Math.random()}`,
    type,
    name: type,
    source,
    orientation: 'landscape',
    ...over,
  };
}

const mode = (figs: ImageRef[]) => figureLayout(figs, m).mode;

describe('figureLayout', () => {
  it('SOLO for a single figure', () => {
    expect(mode([fig('token')])).toBe('solo'); // lone Bitcoin coin
    expect(mode([fig('country')])).toBe('solo'); // lone flag
    expect(mode([fig('org')])).toBe('solo'); // lone logo
  });

  it('VERSUS for a two-sided team or country matchup', () => {
    expect(mode([fig('team'), fig('team')])).toBe('versus'); // Giants vs Braves
    expect(mode([fig('country'), fig('country')])).toBe('versus'); // US vs Iran
  });

  it('VERSUS keeps a trailing league/topic mark (it gets demoted, not promoted)', () => {
    // Mariners / Orioles / MLB — the exact screenshot bug becomes a matchup.
    expect(mode([fig('team'), fig('team'), fig('org')])).toBe('versus');
    // Oil: US / Iran / OPEC org / topic.
    expect(mode([fig('country'), fig('country'), fig('org'), fig('topic')])).toBe('versus');
  });

  it('LINEUP for a field of 3+ same-kind peers (never a fake 2-up "vs")', () => {
    expect(mode([fig('team'), fig('team'), fig('team')])).toBe('lineup'); // LeBron next team
    expect(mode([fig('team'), fig('team'), fig('team'), fig('team'), fig('topic')])).toBe('lineup');
    expect(mode([fig('country'), fig('country'), fig('country')])).toBe('lineup');
  });

  it('PAIR for two non-competitive / mixed figures', () => {
    expect(mode([fig('person'), fig('person')])).toBe('pair'); // LA mayor finalists
    expect(mode([fig('org'), fig('token')])).toBe('pair');
    expect(mode([fig('team'), fig('org')])).toBe('pair'); // team vs org is NOT a matchup
    expect(mode([fig('team'), fig('country')])).toBe('pair'); // different competitive kinds
  });

  it('GALLERY (role) for a mixed 3+ set, with the most depictable subject as feature', () => {
    // Netflix: org logo + 3 show posters — a portrait poster should lead.
    const figs = [
      fig('org', { orientation: 'landscape' }), // 0 → logo, score 0
      fig('topic', { orientation: 'landscape' }), // 1 → photo, score 3
      fig('topic', { orientation: 'portrait' }), // 2 → photo+portrait, score 5
      fig('topic', { orientation: 'portrait' }), // 3 → score 5 (tie, earlier wins)
    ];
    const { mode: md, feature } = figureLayout(figs, m);
    expect(md).toBe('gallery');
    expect(feature).toBe(2); // first figure to reach the top score
  });

  it('GALLERY (flat) for a true peer set of all logos/flags (no clear lead)', () => {
    // "Largest company" — org×4 + a flag: nothing is feature-worthy → flat row.
    const { mode: md, feature } = figureLayout(
      [fig('org'), fig('org'), fig('org'), fig('country')],
      m,
    );
    expect(md).toBe('gallery');
    expect(feature).toBe(-1);
  });
});
