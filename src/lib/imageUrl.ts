import type { ImageRef, Market } from './types';

/** Matches a legacy third-party flagcdn URL, capturing the ISO code (incl.
 * subdivisions like gb-eng). New briefings already ship /flags URLs. */
const LEGACY_FLAGCDN = /^https?:\/\/flagcdn\.com\/w\d+\/([a-z]{2}(?:-[a-z]{3})?)\.png$/i;

/**
 * Repair a stored ImageRef whose flag points at the third-party flagcdn.com host,
 * rewriting it to our self-hosted /flags/{iso}.svg (and dropping the now-stale
 * credit). Flags are vendored under public/flags/ and served same-origin, so they
 * never break when a reader's network, region, or a privacy blocker drops
 * flagcdn.com. The pipeline already emits /flags URLs for new records
 * (scripts/lib/images.ts); this fixes pre-existing briefings at load time.
 * Anything that isn't a flagcdn flag passes through untouched.
 */
export function localizeImage(ref: ImageRef): ImageRef {
  const iso = ref.url ? ref.url.match(LEGACY_FLAGCDN)?.[1] : undefined;
  if (!iso) return ref;
  return { ...ref, url: `/flags/${iso.toLowerCase()}.svg`, credit: undefined };
}

/** Apply the flag-URL repair across a market's images (hero + images), so BOTH
 * the static loadFeed path and the live Realtime path render self-hosted flags
 * identically. Returns a new market; a no-op on markets without flag images. */
export function localizeMarket(m: Market): Market {
  return {
    ...m,
    hero: m.hero ? localizeImage(m.hero) : m.hero,
    images: m.images ? m.images.map(localizeImage) : m.images,
  };
}
