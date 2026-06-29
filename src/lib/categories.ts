/**
 * A tiny module cache of the live feed's categories, published by App once the
 * feed loads. On-demand surfaces (e.g. the lazy account menu's newsletter topic
 * picker) can read the category universe without prop-drilling it through the
 * header. Mirrors the module-state style used by the auth/saved/interests libs.
 */
let known: string[] = [];

export function setKnownCategories(categories: string[]): void {
  known = categories;
}

export function knownCategories(): string[] {
  return known;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical taxonomy. The source platforms emit ~45 raw tags for a feed of ~170
// markets — fine-grained sports labels ("Soccer", "MLB", "IEM Cologne", "U.S. Open
// 2026"), person/country names as categories ("Trump", "Brazil", "Iran"), and
// finance synonyms ("Financials"/"Economics"/"Business"). This collapses them to ~12
// stable buckets used EVERYWHERE — display, filters, /topic hubs, ranking diversity
// and leveling — so the chip rail is scannable and the leveling is statistically
// meaningful. Pure + dependency-light so both the pipeline (scripts/) and the client
// (src/) import it and always agree. Changed /topic slugs are 301'd via topicRedirects().
// ─────────────────────────────────────────────────────────────────────────────

// The competition/sports-betting family — the SINGLE source of truth for sports
// detection across the whole app (src + scripts/lib/category.ts's isSportsCategory
// delegates here, so there's no second list to drift). The sources almost never emit
// a literal "Sports"; they give the fine-grained tag, and titles ("Mets vs Phillies")
// are sniffed via the pattern. Esports is a subset, broken out into its own bucket.
const ESPORTS = new Set([
  'esports', 'games', 'gaming', 'iem', 'iem cologne', 'counter-strike', 'cs2', 'valorant', 'dota',
  'league of legends', 'lol', 'msi', 'worlds', 'overwatch', 'rocket league', 'call of duty',
  'apex legends', 'starcraft', 'pubg',
]);
const SPORTS_FAMILY = new Set([
  'sports', 'soccer', 'football', 'tennis', 'basketball', 'baseball', 'hockey', 'golf',
  'cricket', 'rugby', 'boxing', 'mma', 'ufc', 'nascar', 'f1', 'formula 1', 'cycling',
  'volleyball', 'handball', 'motorsport', 'wrestling', 'darts', 'snooker', 'mlb', 'nba',
  'nfl', 'nhl', 'wnba', 'ncaa', 'mls', 'epl', 'atp', 'wta', 'pga', 'masters',
  ...ESPORTS,
]);
const SPORTS_PATTERN =
  /\b(soccer|tennis|basketball|baseball|hockey|cricket|rugby|boxing|mma|ufc|nascar|formula|world cup|fifa|uefa|champions league|premier league|nba|nfl|mlb|nhl|wnba|ncaa|mls|atp|wta|esports|counter-strike|valorant|dota|league of legends|playoff|grand prix|wimbledon|golf|pga|masters|open 20\d\d)\b/;

/** Is this category OR free-text title part of the competition/sports-betting family?
 * The one sports predicate the whole app shares (ranking demotion, clustering guard,
 * breaking/social exclusion). Matches coarse labels, fine-grained tags, and titles. */
export function isSportsFamily(text: string | undefined | null): boolean {
  const c = (text ?? '').trim().toLowerCase();
  return c !== '' && (SPORTS_FAMILY.has(c) || SPORTS_PATTERN.test(c));
}

/** Raw (lowercased) category → canonical display bucket. Keys cover every category
 * seen in the live feed; the explicit sports keys also drive /topic redirects. */
const CANON: Record<string, string> = {
  // Politics
  politics: 'Politics', trump: 'Politics', 'world elections': 'Politics', elections: 'Politics',
  brazil: 'Politics', starmer: 'Politics', gop: 'Politics', president: 'Politics',
  primaries: 'Politics', primary: 'Politics', mayor: 'Politics', governor: 'Politics',
  senate: 'Politics', congress: 'Politics', parliament: 'Politics', 'prime minister': 'Politics',
  biden: 'Politics', harris: 'Politics', newsom: 'Politics', desantis: 'Politics',
  // Geopolitics (incl. the foreign country / region / leader tags the sources emit
  // as their own categories — all one international-affairs beat)
  geopolitics: 'Geopolitics', 'macro geopolitics': 'Geopolitics', 'foreign policy': 'Geopolitics',
  world: 'Geopolitics', 'strait of hormuz': 'Geopolitics', iran: 'Geopolitics',
  'iran ceasefire': 'Geopolitics', israel: 'Geopolitics', ukraine: 'Geopolitics',
  'middle east': 'Geopolitics', cuba: 'Geopolitics', ethiopia: 'Geopolitics',
  khamenei: 'Geopolitics', russia: 'Geopolitics', china: 'Geopolitics', gaza: 'Geopolitics',
  'north korea': 'Geopolitics', venezuela: 'Geopolitics', taiwan: 'Geopolitics',
  syria: 'Geopolitics', lebanon: 'Geopolitics', yemen: 'Geopolitics', putin: 'Geopolitics',
  netanyahu: 'Geopolitics', zelensky: 'Geopolitics', 'foreign affairs': 'Geopolitics',
  colombia: 'Geopolitics', ships: 'Geopolitics', mojtaba: 'Geopolitics',
  'trump-machado': 'Geopolitics', machado: 'Geopolitics', nato: 'Geopolitics',
  // Markets (finance + economy + business)
  markets: 'Markets', financials: 'Markets', economics: 'Markets', business: 'Markets',
  companies: 'Markets', fomc: 'Markets', 'economic policy': 'Markets', economy: 'Markets',
  weekly: 'Markets', fed: 'Markets', finance: 'Markets', ipos: 'Markets', ipo: 'Markets',
  'interest rates': 'Markets', inflation: 'Markets', earnings: 'Markets', stocks: 'Markets',
  // Commodities
  commodities: 'Commodities', oil: 'Commodities', gold: 'Commodities', silver: 'Commodities',
  'comex silver futures': 'Commodities', 'silver futures': 'Commodities', copper: 'Commodities',
  'natural gas': 'Commodities',
  // Crypto
  crypto: 'Crypto', bitcoin: 'Crypto', ethereum: 'Crypto', satoshi: 'Crypto', solana: 'Crypto',
  xrp: 'Crypto', dogecoin: 'Crypto', 'crypto prices': 'Crypto',
  // Sports (explicit live labels — long tail handled by SPORTS_PATTERN)
  sports: 'Sports', soccer: 'Sports', 'fifa world cup': 'Sports', 'world cup': 'Sports',
  mlb: 'Sports', nba: 'Sports', nfl: 'Sports', nhl: 'Sports', 'u.s. open 2026': 'Sports',
  'lebron james': 'Sports', tennis: 'Sports', golf: 'Sports',
  // Esports
  esports: 'Esports', games: 'Esports', 'iem cologne': 'Esports', lol: 'Esports', msi: 'Esports',
  // Climate
  'climate and weather': 'Climate and Weather', weather: 'Climate and Weather',
  climate: 'Climate and Weather',
  // Culture
  culture: 'Culture', mentions: 'Culture', 'tweet markets': 'Culture',
  // Entertainment
  entertainment: 'Entertainment', 'box office': 'Entertainment', netflix: 'Entertainment',
  movies: 'Entertainment', music: 'Entertainment', awards: 'Entertainment', oscars: 'Entertainment',
  grammys: 'Entertainment', emmys: 'Entertainment', 'rotten tomatoes': 'Entertainment',
  // Science & Technology
  'science and technology': 'Science and Technology', transit: 'Science and Technology',
  technology: 'Science and Technology', tech: 'Science and Technology', ai: 'Science and Technology',
  space: 'Science and Technology', science: 'Science and Technology', claude: 'Science and Technology',
  openai: 'Science and Technology', chatgpt: 'Science and Technology', nvidia: 'Science and Technology',
  'large language models': 'Science and Technology',
  // Health
  health: 'Health',
};

/**
 * Map a raw source category to its canonical display bucket (~12 total). Unknown
 * categories pass through unchanged (already cased upstream by normalizeCategory),
 * so a genuinely new beat is never mis-bucketed — only the known scatter is merged.
 */
export function canonicalCategory(category: string | undefined | null): string {
  const trimmed = (category ?? '').trim();
  const c = trimmed.toLowerCase();
  if (!c) return 'Markets';
  const mapped = CANON[c];
  if (mapped) return mapped;
  if (ESPORTS.has(c)) return 'Esports';
  if (isSportsFamily(c)) return 'Sports';
  return trimmed; // unknown → keep as-is (already cased upstream by normalizeCategory)
}

/**
 * Cloudflare `_redirects` lines (301) from every raw category whose /topic slug
 * changes under canonicalization → the canonical hub, so indexed URLs don't 404.
 * Derived from CANON (single source of truth), de-duplicated. Needs topicSlug.
 */
export function topicRedirects(slug: (c: string) => string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const [raw, canon] of Object.entries(CANON)) {
    const from = slug(raw);
    const to = slug(canon);
    if (from === to || seen.has(from)) continue;
    seen.add(from);
    lines.push(`/topic/${from} /topic/${to} 301`);
  }
  return lines.sort();
}
