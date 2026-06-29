/**
 * Image enrichment — turn the model's `entities` into license-clean images.
 *
 * People / orgs / teams / topics → Wikipedia REST summary (Wikimedia Commons).
 * Countries → self-hosted flag SVG (/flags/{iso}.svg, no fetch) with a Wikipedia fallback.
 * Crypto tokens → a small verified CoinGecko logo map, else Wikipedia.
 *
 * Best-effort by design: every resolver swallows its own failures and returns
 * null, and `resolveEntityImages` never throws — a story always ships, with or
 * without pictures. Only Wikipedia lookups hit the network (a few per briefing).
 */
import { getJson } from './http';
import type { Entity, ImageRef } from '../../src/lib/types';

const UA = 'Crowdtells/1.0 (+https://crowdtells.com)';

/** Country name (lowercased) → ISO 3166-1 alpha-2, for flagcdn.com. */
const COUNTRY_ISO: Record<string, string> = {
  afghanistan: 'af', argentina: 'ar', australia: 'au', austria: 'at', belgium: 'be',
  brazil: 'br', canada: 'ca', chile: 'cl', china: 'cn', colombia: 'co', croatia: 'hr',
  denmark: 'dk', egypt: 'eg', england: 'gb-eng', ethiopia: 'et', finland: 'fi',
  france: 'fr', germany: 'de', greece: 'gr', greenland: 'gl', india: 'in',
  indonesia: 'id', iran: 'ir', iraq: 'iq', ireland: 'ie', israel: 'il', italy: 'it',
  japan: 'jp', jordan: 'jo', mexico: 'mx', morocco: 'ma', netherlands: 'nl',
  'new zealand': 'nz', nigeria: 'ng', norway: 'no', pakistan: 'pk', poland: 'pl',
  portugal: 'pt', qatar: 'qa', romania: 'ro', russia: 'ru', 'saudi arabia': 'sa',
  scotland: 'gb-sct', senegal: 'sn', 'south africa': 'za', 'south korea': 'kr',
  spain: 'es', sweden: 'se', switzerland: 'ch', taiwan: 'tw', turkey: 'tr',
  ukraine: 'ua', 'united kingdom': 'gb', uk: 'gb', 'united states': 'us',
  usa: 'us', us: 'us', uruguay: 'uy', venezuela: 've', wales: 'gb-wls',
};

/** Common crypto tokens → verified CoinGecko logo URLs (square). */
const TOKEN_IMG: Record<string, string> = {
  bitcoin: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
  btc: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
  ethereum: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
  eth: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
  solana: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756',
  sol: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756',
  ripple: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442',
  xrp: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442',
  dogecoin: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409',
  doge: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409',
  cardano: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090',
  ada: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090',
};

function orientationOf(w?: number, h?: number): ImageRef['orientation'] | undefined {
  if (!w || !h) return undefined;
  const r = w / h;
  if (r < 0.85) return 'portrait';
  if (r > 1.18) return 'landscape';
  return 'square';
}

interface WikiImage {
  source: string;
  width: number;
  height: number;
}
interface WikiSummary {
  type?: string;
  thumbnail?: WikiImage;
  originalimage?: WikiImage;
}

/** Resolve a name to its Wikipedia lead image (Wikimedia Commons). */
async function wikipedia(name: string, type: Entity['type']): Promise<ImageRef | null> {
  const title = encodeURIComponent(name.trim().replace(/\s+/g, '_'));
  let data: WikiSummary;
  try {
    data = await getJson<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, timeoutMs: 10000, retries: 2 },
    );
  } catch {
    return null;
  }
  if (data.type === 'disambiguation') return null;
  // Use ONLY the URLs the API hands back: its pre-rendered thumbnail (cached,
  // ~320px) or the full original. We must NOT request a custom width — Wikimedia
  // throttles/limits on-demand thumbnail sizes and answers 400, which would
  // silently break the image. The thumbnail is small but reliably served.
  //
  // The original is uncapped, so fall back to it ONLY when it's modestly sized and
  // static: a huge front-page PNG (100-180KB) or an animated GIF (decodes/animates on
  // the main thread) downloaded into a ≤150px figure is pure waste — drop those and
  // let the story fall back to its platform thumbnail. Since we can't safely downscale
  // (the 400 above), accept-or-skip is the only lever for the no-thumbnail case.
  const orig = data.originalimage;
  const origOk =
    !!orig && orig.width <= 1024 && orig.height <= 1024 && !/\.gif(?:$|\?)/i.test(orig.source);
  const pick = data.thumbnail ?? (origOk ? orig : undefined);
  if (!pick) return null;
  return {
    url: pick.source,
    type,
    name,
    source: 'wikipedia',
    credit: 'Wikimedia Commons',
    orientation: orientationOf(pick.width, pick.height),
    width: pick.width,
    height: pick.height,
  };
}

/** A country flag, self-hosted at /flags/{iso}.svg (deterministic, no network).
 * We vendor the flags (public/flags/, sourced from flagcdn) and serve them from
 * our own domain so a flag never breaks when a reader's network, region, or a
 * privacy blocker drops the third-party flagcdn.com host. */
function flag(name: string): ImageRef | null {
  const iso = COUNTRY_ISO[name.trim().toLowerCase()];
  if (!iso) return null;
  return {
    url: `/flags/${iso}.svg`,
    type: 'country',
    name,
    source: 'flag',
    orientation: 'landscape',
    width: 640,
    height: 480,
  };
}

/** A crypto token logo from the verified map (no network call). */
function token(name: string): ImageRef | null {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = TOKEN_IMG[key];
  if (!url) return null;
  // CoinGecko "large" logos are square; set dims so the browser reserves space (no CLS).
  return {
    url,
    type: 'token',
    name,
    source: 'token',
    credit: 'CoinGecko',
    orientation: 'square',
    width: 256,
    height: 256,
  };
}

async function resolveOneUncached(e: Entity): Promise<ImageRef | null> {
  try {
    if (e.type === 'country') return flag(e.name) ?? (await wikipedia(e.name, 'country'));
    if (e.type === 'token') return token(e.name) ?? (await wikipedia(e.name, 'token'));
    return await wikipedia(e.name, e.type);
  } catch {
    return null;
  }
}

// Per-run memo: the same entity ("Trump", "Bitcoin") recurs across many briefings
// in a single pipeline run, and each lookup is a real Wikipedia round-trip. Cache
// the resolved ref (or null) by type+name so we pay each network call at most once
// per run. Cleared implicitly when the process exits — no cross-run staleness.
const resolveCache = new Map<string, Promise<ImageRef | null>>();

function resolveOne(e: Entity): Promise<ImageRef | null> {
  const key = `${e.type}:${e.name.trim().toLowerCase()}`;
  let hit = resolveCache.get(key);
  if (!hit) {
    hit = resolveOneUncached(e);
    resolveCache.set(key, hit);
  }
  return hit;
}

const isHttps = (u: string) => /^https:\/\//.test(u);
// A usable entity image is an HTTPS URL or one of our own self-hosted assets
// (e.g. /flags/{iso}.svg), which are same-origin and always safe to embed.
const isUsable = (u: string) => isHttps(u) || u.startsWith('/flags/');

/**
 * Resolve a story's entities to images and pick a lead. A portrait person makes
 * the best card hero (the vertical "curtain" treatment); flags/logos enrich the
 * article but never become the full-bleed hero. `fallbackImage` (the platform's
 * own thumbnail) is kept as a last-resort article figure, never the hero.
 */
export async function resolveEntityImages(
  entities: Entity[],
  fallbackImage?: string,
): Promise<{ images: ImageRef[]; hero: ImageRef | null }> {
  const images: ImageRef[] = [];
  const seen = new Set<string>();
  // Resolve the (up to 6) entities concurrently — each is an independent network
  // lookup — then walk them in order so the hero-selection priority is unchanged.
  const refs = await Promise.all(entities.slice(0, 6).map(resolveOne));
  for (const ref of refs) {
    if (ref && isUsable(ref.url) && !seen.has(ref.url)) {
      seen.add(ref.url);
      images.push(ref);
    }
  }
  if (fallbackImage && isHttps(fallbackImage) && !seen.has(fallbackImage)) {
    images.push({ url: fallbackImage, type: 'topic', name: '', source: 'polymarket' });
  }

  // The card "curtain" hero is a real PERSON photo only — logos, flags, coins and
  // topic art look wrong stretched behind text, so they only ever become article
  // figures (where each type gets its own placement). A landscape person shot
  // would crop badly as a vertical band, so require a KNOWN portrait/square (an
  // unknown orientation is rejected too — never gamble on a possible landscape).
  const hero =
    images.find(
      (i) => i.type === 'person' && (i.orientation === 'portrait' || i.orientation === 'square'),
    ) ?? null;

  return { images, hero };
}
