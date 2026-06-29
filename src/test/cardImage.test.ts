import { describe, expect, it } from 'vitest';
import { pickCardImage } from '../lib/cardImage';
import { makeMarket } from './factory';
import type { ImageRef } from '../lib/types';

const ref = (over: Partial<ImageRef>): ImageRef => ({
  url: 'https://x/p.jpg',
  type: 'person',
  name: 'P',
  source: 'wikipedia',
  ...over,
});

describe('pickCardImage', () => {
  it('prefers the chosen person hero', () => {
    const hero = ref({ url: 'https://x/hero.jpg', orientation: 'portrait' });
    const m = makeMarket({
      hero,
      images: [ref({ url: 'https://x/flag.png', type: 'country', source: 'flag' })],
    });
    expect(pickCardImage(m)).toBe(hero);
  });

  it('falls back to the most-prominent subject image when there is no hero', () => {
    const flag = ref({ url: 'https://x/flag.png', type: 'country', source: 'flag' });
    const m = makeMarket({ hero: null, images: [flag, ref({ url: 'https://x/two.jpg' })] });
    expect(pickCardImage(m)).toBe(flag);
  });

  it('falls back to the platform thumbnail when nothing else resolved', () => {
    const m = makeMarket({ image: 'https://cdn.example/thumb.png', images: [] });
    const img = pickCardImage(m);
    expect(img?.url).toBe('https://cdn.example/thumb.png');
    expect(img?.source).toBe('polymarket');
  });

  it('returns null when the story has no usable picture', () => {
    expect(pickCardImage(makeMarket({ image: '', images: [] }))).toBeNull();
  });

  it('ignores a non-https platform thumbnail', () => {
    expect(pickCardImage(makeMarket({ image: 'http://insecure/x.png', images: [] }))).toBeNull();
  });
});
