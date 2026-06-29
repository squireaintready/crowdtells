/** Small fetch wrapper: timeouts, retry with exponential backoff, JSON/text helpers. */

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const DEFAULT_RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

// Per-run fetch-failure tally by host, for the pipeline's Operations summary (source-fetch
// health). A request that exhausts its retries and THROWS is counted once, keyed by hostname.
// (HTTP error statuses that the caller handles — e.g. an LLM 429 — are NOT failures here.)
const fetchErrors = new Map<string, number>();
/** Clear the fetch-failure tally — call once at the start of a pipeline run. */
export function resetFetchErrors(): void {
  fetchErrors.clear();
}
/** Snapshot fetch failures by host, busiest first — for the Operations summary. */
export function getFetchErrors(): { source: string; count: number }[] {
  return [...fetchErrors.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}
function noteFetchError(url: string): void {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* unparseable URL → key by the raw string */
  }
  fetchErrors.set(host, (fetchErrors.get(host) ?? 0) + 1);
}

export interface RequestOptions extends RequestInit {
  /** Per-attempt timeout in ms (default 20000). */
  timeoutMs?: number;
  /** Max attempts including the first (default 4). */
  retries?: number;
  /** Base backoff in ms, doubled each retry (default 1000). */
  backoffMs?: number;
  /** Override which statuses trigger an internal retry (default 408/429/5xx). */
  retryStatuses?: number[];
}

/** Fetch with timeout + retry on transient failures. Throws on final failure. */
export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const { timeoutMs = 20000, retries = 4, backoffMs = 1000, retryStatuses, ...init } = opts;
  const retryable = retryStatuses ? new Set(retryStatuses) : DEFAULT_RETRYABLE;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (retryable.has(res.status) && attempt < retries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoffMs * 2 ** (attempt - 1);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(backoffMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  noteFetchError(url);
  throw lastErr instanceof Error ? lastErr : new Error(`Request failed: ${url}`);
}

export async function getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, opts);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

export async function getText(url: string, opts: RequestOptions = {}): Promise<string> {
  const res = await request(url, opts);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return await res.text();
}
