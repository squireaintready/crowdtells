import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEntityImages } from './images';

/** Minimal Response stand-in for the http helper (request → res.json/ok/status). */
const res = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const wikiSummary = (over: Record<string, unknown> = {}) => ({
  type: 'standard',
  thumbnail: {
    source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Foo.jpg/330px-Foo.jpg',
    width: 330,
    height: 440,
  },
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('resolveEntityImages', () => {
  it('resolves a country to a flag with no network call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('network must not be hit for a known country');
      }),
    );
    const { images, hero } = await resolveEntityImages([{ type: 'country', name: 'France' }]);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ source: 'flag', orientation: 'landscape' });
    expect(images[0]!.url).toBe('/flags/fr.svg'); // self-hosted, not third-party flagcdn
    expect(hero).toBeNull(); // a landscape flag is never the full-bleed hero
  });

  it('resolves a known token to a logo with no network call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('network must not be hit for a known token');
      }),
    );
    const { images, hero } = await resolveEntityImages([{ type: 'token', name: 'Bitcoin' }]);
    expect(images[0]).toMatchObject({ source: 'token', orientation: 'square' });
    expect(images[0]!.url).toContain('bitcoin.png');
    expect(hero).toBeNull();
  });

  it('resolves a person to the API thumbnail (served as-is) and makes it the hero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, wikiSummary())));
    const { images, hero } = await resolveEntityImages([{ type: 'person', name: 'Gavin Newsom' }]);
    expect(images[0]).toMatchObject({
      source: 'wikipedia',
      orientation: 'portrait',
      credit: 'Wikimedia Commons',
    });
    // Uses the URL the API returned verbatim — never a custom width (Wikimedia
    // throttles/limits on-demand sizes and 400s, which would break the image).
    expect(images[0]!.url).toBe(wikiSummary().thumbnail.source);
    expect(images[0]!.url).toContain('/330px-');
    expect(hero).toEqual(images[0]); // portrait person → hero
  });

  it('falls back to the full original when no thumbnail is offered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        res(200, {
          type: 'standard',
          originalimage: { source: 'https://upload.wikimedia.org/x/orig.jpg', width: 600, height: 800 },
        }),
      ),
    );
    const { images } = await resolveEntityImages([{ type: 'person', name: 'Someone' }]);
    expect(images[0]!.url).toBe('https://upload.wikimedia.org/x/orig.jpg');
    expect(images[0]!.orientation).toBe('portrait');
  });

  it('drops a huge original (no thumbnail) so a 150KB front-page image never loads into a small slot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        res(200, {
          type: 'standard',
          originalimage: { source: 'https://upload.wikimedia.org/x/huge.png', width: 1600, height: 2200 },
        }),
      ),
    );
    // No thumbnail offered + the original is too large to use → nothing (the story
    // falls back to its platform thumbnail elsewhere). We can't downscale (Wikimedia
    // 400s on custom widths), so accept-or-skip is the only safe lever.
    const { images } = await resolveEntityImages([{ type: 'person', name: 'Bigpic' }]);
    expect(images).toEqual([]);
  });

  it('drops an animated GIF original (decodes/animates on the main thread) even when small', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        res(200, {
          type: 'standard',
          originalimage: { source: 'https://upload.wikimedia.org/x/molecule.gif', width: 400, height: 400 },
        }),
      ),
    );
    const { images } = await resolveEntityImages([{ type: 'topic', name: 'Molecule' }]);
    expect(images).toEqual([]);
  });

  it('prefers a person portrait as hero over a flag listed first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, wikiSummary())));
    const { hero } = await resolveEntityImages([
      { type: 'country', name: 'France' },
      { type: 'person', name: 'Emmanuel Macron' },
    ]);
    expect(hero).toMatchObject({ type: 'person', orientation: 'portrait' });
  });

  it('never makes a non-person image the hero (e.g. a topic/manga cover)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, wikiSummary())));
    const { images, hero } = await resolveEntityImages([{ type: 'topic', name: 'One Piece' }]);
    expect(images[0]).toMatchObject({ type: 'topic', orientation: 'portrait' });
    expect(hero).toBeNull(); // a portrait that isn't a person stays a figure
  });

  it('keeps the platform thumbnail as a last-resort figure, never the hero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(404, {})));
    const { images, hero } = await resolveEntityImages([], 'https://cdn.example.com/art.jpg');
    expect(images).toEqual([
      { url: 'https://cdn.example.com/art.jpg', type: 'topic', name: '', source: 'polymarket' },
    ]);
    expect(hero).toBeNull();
  });

  it('never throws and returns nothing when a lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(404, {})));
    const out = await resolveEntityImages([{ type: 'person', name: 'Nobody Here' }]);
    expect(out).toEqual({ images: [], hero: null });
  });

  it('skips Wikipedia disambiguation pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, { type: 'disambiguation' })));
    const out = await resolveEntityImages([{ type: 'person', name: 'Mercury' }]);
    expect(out.images).toEqual([]);
  });
});
