/**
 * A coarse, hand-maintained editorial-lean map for the outlets we commonly
 * ingest. Used to show a left/center/right coverage distribution and a
 * "blindspot" flag (one side conspicuously absent), Ground-News style.
 *
 * This is a COARSE estimate for media-literacy context, not a precise rating,
 * and deliberately our own map (we don't redistribute proprietary scores).
 * Outlets not listed are treated as "unknown" and excluded from the split.
 */
export type Lean = 'left' | 'center' | 'right';

/**
 * Two-source rule: only present "what the coverage agrees on" once at least this many
 * distinct outlets informed the briefing — agreement from a single source isn't consensus.
 * Shared by the in-app Synthesis panel and the /s/ syndication page so the rule is one
 * source of truth across surfaces.
 */
export const MIN_CONSENSUS_SOURCES = 2;

const OUTLET_LEAN: Record<string, Lean> = {
  // left / lean-left
  'nytimes.com': 'left',
  'washingtonpost.com': 'left',
  'cnn.com': 'left',
  'msnbc.com': 'left',
  'nbcnews.com': 'left',
  'abcnews.go.com': 'left',
  'cbsnews.com': 'left',
  'theguardian.com': 'left',
  'vox.com': 'left',
  'huffpost.com': 'left',
  'theatlantic.com': 'left',
  'slate.com': 'left',
  'newyorker.com': 'left',
  'salon.com': 'left',
  'motherjones.com': 'left',
  'dailybeast.com': 'left',
  'politico.com': 'left',
  'npr.org': 'left',
  'time.com': 'left',
  'businessinsider.com': 'left',
  'buzzfeednews.com': 'left',
  'rollingstone.com': 'left',
  // center / wire
  'reuters.com': 'center',
  'apnews.com': 'center',
  'bbc.com': 'center',
  'bbc.co.uk': 'center',
  'thehill.com': 'center',
  'usatoday.com': 'center',
  'wsj.com': 'center',
  'bloomberg.com': 'center',
  'cnbc.com': 'center',
  'forbes.com': 'center',
  'marketwatch.com': 'center',
  'axios.com': 'center',
  'pbs.org': 'center',
  'newsweek.com': 'center',
  'realclearpolitics.com': 'center',
  'thedispatch.com': 'center',
  'semafor.com': 'center',
  // right / lean-right
  'foxnews.com': 'right',
  'foxbusiness.com': 'right',
  'nypost.com': 'right',
  'washingtonexaminer.com': 'right',
  'washingtontimes.com': 'right',
  'dailywire.com': 'right',
  'breitbart.com': 'right',
  'nationalreview.com': 'right',
  'theblaze.com': 'right',
  'dailymail.co.uk': 'right',
  'thefederalist.com': 'right',
  'justthenews.com': 'right',
  'newsmax.com': 'right',
  'theepochtimes.com': 'right',
  'telegraph.co.uk': 'right',
};

const norm = (domain: string): string => domain.replace(/^www\./, '').toLowerCase();

export function leanOf(domain: string): Lean | null {
  return OUTLET_LEAN[norm(domain)] ?? null;
}

/** Proper publication names for the outlets we commonly cite, so a citation chip
 * reads "Politico" / "The Hill", not "politico.com" — matching how Perspectives
 * names the same outlets. Unknown domains fall back to the bare host. */
const OUTLET_NAME: Record<string, string> = {
  'nytimes.com': 'The New York Times',
  'washingtonpost.com': 'The Washington Post',
  'cnn.com': 'CNN',
  'msnbc.com': 'MSNBC',
  'nbcnews.com': 'NBC News',
  'abcnews.go.com': 'ABC News',
  'cbsnews.com': 'CBS News',
  'theguardian.com': 'The Guardian',
  'vox.com': 'Vox',
  'huffpost.com': 'HuffPost',
  'theatlantic.com': 'The Atlantic',
  'slate.com': 'Slate',
  'newyorker.com': 'The New Yorker',
  'salon.com': 'Salon',
  'motherjones.com': 'Mother Jones',
  'dailybeast.com': 'The Daily Beast',
  'politico.com': 'Politico',
  'npr.org': 'NPR',
  'time.com': 'TIME',
  'businessinsider.com': 'Business Insider',
  'buzzfeednews.com': 'BuzzFeed News',
  'rollingstone.com': 'Rolling Stone',
  'reuters.com': 'Reuters',
  'apnews.com': 'AP',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'thehill.com': 'The Hill',
  'usatoday.com': 'USA Today',
  'wsj.com': 'The Wall Street Journal',
  'bloomberg.com': 'Bloomberg',
  'cnbc.com': 'CNBC',
  'forbes.com': 'Forbes',
  'marketwatch.com': 'MarketWatch',
  'axios.com': 'Axios',
  'pbs.org': 'PBS',
  'newsweek.com': 'Newsweek',
  'realclearpolitics.com': 'RealClearPolitics',
  'thedispatch.com': 'The Dispatch',
  'semafor.com': 'Semafor',
  'foxnews.com': 'Fox News',
  'foxbusiness.com': 'Fox Business',
  'nypost.com': 'New York Post',
  'washingtonexaminer.com': 'Washington Examiner',
  'washingtontimes.com': 'The Washington Times',
  'dailywire.com': 'The Daily Wire',
  'breitbart.com': 'Breitbart',
  'nationalreview.com': 'National Review',
  'theblaze.com': 'The Blaze',
  'dailymail.co.uk': 'Daily Mail',
  'thefederalist.com': 'The Federalist',
  'justthenews.com': 'Just the News',
  'newsmax.com': 'Newsmax',
  'theepochtimes.com': 'The Epoch Times',
  'telegraph.co.uk': 'The Telegraph',
  'espn.com': 'ESPN',
  'mlb.com': 'MLB',
  'nba.com': 'NBA',
  'theathletic.com': 'The Athletic',
  'cbssports.com': 'CBS Sports',
  'yahoo.com': 'Yahoo',
  'sports.yahoo.com': 'Yahoo Sports',
};

/** Display name for a cited outlet's domain — a proper publication name when we
 * know it, otherwise the bare host (a valid, if plain, citation). */
export function outletName(domain: string): string {
  return OUTLET_NAME[norm(domain)] ?? norm(domain);
}

// ccTLDs that take a second-level label (so "bbc.co.uk" keeps "bbc", not "co").
const TWO_PART_TLD = /\.(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/i;

/**
 * Prettifier for a citation label: drops a leading "www.", a trailing TLD (incl.
 * one ccTLD second level like .co.uk), and any subdomain, keeping the registrable
 * name ("litefinance.org" → "litefinance", "news.bbc.co.uk" → "bbc"). Curated
 * proper names (which carry a space, e.g. "USA Today", or have no dot) pass
 * through untouched.
 */
function prettyOutlet(label: string): string {
  if (/\s/.test(label) || !label.includes('.')) return label;
  const host = label.replace(/^www\./, '');
  const stripped = TWO_PART_TLD.test(host)
    ? host.replace(TWO_PART_TLD, '')
    : host.replace(/\.[a-z]{2,}$/i, '');
  const parts = stripped.split('.').filter(Boolean);
  return parts[parts.length - 1] || label;
}

/** The single visible-label formatter shared by the article Sources chips and the
 * feed card byline: a proper publication name when we know it, else the bare host
 * with its TLD stripped. The full host stays available via outletName for tooltips
 * and hrefs. */
export function outletDisplay(domain: string): string {
  return prettyOutlet(outletName(domain));
}

export interface Distribution {
  left: number;
  center: number;
  right: number;
  known: number;
  /** The side conspicuously absent when there's a clear imbalance, else null. */
  blindspot: Lean | null;
}

// Normalized lookup key so a model-written outlet label matches regardless of form:
// "The Guardian", "theguardian.com", "Guardian" all collapse to "guardian".
const leanLabelKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '');

// Precomputed: every form we might see for a known outlet → its lean (domain, proper
// name, and display label all map to the same lean).
const LEAN_BY_LABEL: Record<string, Lean> = (() => {
  const m: Record<string, Lean> = {};
  for (const [domain, lean] of Object.entries(OUTLET_LEAN)) {
    m[leanLabelKey(domain)] = lean;
    m[leanLabelKey(outletName(domain))] = lean;
    m[leanLabelKey(outletDisplay(domain))] = lean;
  }
  return m;
})();

/**
 * Coarse lean for an outlet however it's named — a Perspectives "source" is whatever the
 * model wrote (a proper name like "Politico" or a domain like "politico.com"). Returns
 * null for any outlet we don't recognize, so the UI shows nothing rather than guess.
 */
export function leanForOutlet(source: string): Lean | null {
  return LEAN_BY_LABEL[leanLabelKey(source)] ?? null;
}

/** Left/center/right split across the outlets whose lean we know. */
export function coverageDistribution(domains: string[]): Distribution {
  let left = 0;
  let center = 0;
  let right = 0;
  for (const d of domains) {
    const lean = leanOf(d);
    if (lean === 'left') left++;
    else if (lean === 'center') center++;
    else if (lean === 'right') right++;
  }
  const known = left + center + right;
  // Blindspot only when we have enough signal and one wing is entirely missing.
  let blindspot: Lean | null = null;
  if (known >= 3) {
    if (left === 0 && right > 0) blindspot = 'left';
    else if (right === 0 && left > 0) blindspot = 'right';
  }
  return { left, center, right, known, blindspot };
}
