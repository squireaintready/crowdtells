import { describe, expect, it } from 'vitest';
import { localizeImage } from '../lib/imageUrl';
import type { ImageRef } from '../lib/types';

const ref = (over: Partial<ImageRef>): ImageRef => ({
  url: '',
  type: 'country',
  name: 'X',
  source: 'flag',
  ...over,
});

describe('localizeImage', () => {
  it('rewrites a legacy flagcdn flag to the self-hosted svg and drops the stale credit', () => {
    const out = localizeImage(ref({ url: 'https://flagcdn.com/w640/us.png', credit: 'flagcdn.com' }));
    expect(out.url).toBe('/flags/us.svg');
    expect(out.credit).toBeUndefined();
  });

  it('handles subdivision codes (gb-eng)', () => {
    expect(localizeImage(ref({ url: 'https://flagcdn.com/w320/gb-eng.png' })).url).toBe(
      '/flags/gb-eng.svg',
    );
  });

  it('leaves a Wikipedia photo untouched (same object)', () => {
    const r = ref({
      url: 'https://upload.wikimedia.org/x/Foo.jpg',
      type: 'person',
      source: 'wikipedia',
      credit: 'Wikimedia Commons',
    });
    expect(localizeImage(r)).toBe(r);
  });

  it('leaves an already self-hosted flag untouched', () => {
    const r = ref({ url: '/flags/fr.svg' });
    expect(localizeImage(r)).toBe(r);
  });
});
