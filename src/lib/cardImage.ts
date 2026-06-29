import type { ImageRef, Market } from './types';

/**
 * The picture shown in a story card's right-side band. Every briefed story is
 * about *something* — a person, a country, a commodity — so we always have an
 * image to show:
 *
 *   1. the chosen person `hero` (the best vertical "curtain"), else
 *   2. the most-prominent resolved subject — `images` is ranked by prominence,
 *      so `images[0]` is a flag / logo / landmark / scene of whatever it's about,
 *      else
 *   3. the platform's own thumbnail (kept https-only).
 *
 * Returns null only when a story truly has no usable picture (e.g. a not-yet
 * briefed skeleton with an empty platform image), in which case the card simply
 * renders without a band.
 */
export function pickCardImage(m: Market): ImageRef | null {
  if (m.hero) return m.hero;
  const subject = m.images?.[0];
  if (subject) return subject;
  if (m.image && /^https:\/\//.test(m.image)) {
    return { url: m.image, type: 'topic', name: '', source: 'polymarket' };
  }
  return null;
}
