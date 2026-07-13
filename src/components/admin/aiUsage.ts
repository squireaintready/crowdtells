/**
 * Pure data layer for the admin AI-usage console: it flattens pipeline runs into a
 * per-run × per-model ledger and rolls that up by model / provider / grand total. Kept
 * free of React so it stays fast-refresh clean and fully unit-testable in isolation
 * (see aiUsageView.test). The SPA reads `pipeline_runs.detail.llm`; nothing here writes.
 */
import type { PipelineRunRow, SortDir } from '../../lib/admin';

// ───────── time windows ─────────
export type UsageWindow = 'all' | '24h' | '7d' | '30d';
const WINDOW_MS: Record<Exclude<UsageWindow, 'all'>, number> = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};
export const WINDOW_LABEL: Record<UsageWindow, string> = {
  all: 'all time',
  '24h': 'last 24h',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
};

// ───────── the ledger's unit: one run × one model ─────────
export interface UsageEntry {
  /** Stable row key (run × provider × model). */
  key: string;
  /** The run's finish time (ISO) — the "when". */
  at: string;
  provider: string;
  model: string;
  requests: number;
  ok: number;
  rateLimited: number;
  overloaded: number;
  failed: number;
  tokens: number;
  latencyMsTotal: number;
  /** Run context — the "who/what": what the run produced + how to find its log. */
  generated: number | null;
  results: number | null;
  commit: string | null;
  runId: string | null;
}

/**
 * Flatten pipeline runs into per-run × per-model usage rows, optionally filtered by
 * provider, model, and a trailing time window. `nowMs` is injected (not read from the
 * clock) so the window arithmetic is deterministic + unit-testable.
 */
export function flattenUsage(
  rows: PipelineRunRow[],
  opts: { provider?: string; model?: string; window?: UsageWindow; nowMs: number },
): UsageEntry[] {
  const { provider = 'all', model = 'all', window = 'all', nowMs } = opts;
  const cutoff = window === 'all' ? -Infinity : nowMs - WINDOW_MS[window];
  const out: UsageEntry[] = [];
  for (const r of rows) {
    if (Date.parse(r.run_at) < cutoff) continue;
    for (const u of r.detail?.llm ?? []) {
      if (provider !== 'all' && u.provider !== provider) continue;
      if (model !== 'all' && u.model !== model) continue;
      out.push({
        key: `${r.id}:${u.provider}:${u.model}`,
        at: r.run_at,
        provider: u.provider,
        model: u.model,
        requests: u.requests,
        ok: u.ok,
        rateLimited: u.rateLimited,
        overloaded: u.overloaded,
        failed: u.failed,
        tokens: u.tokens,
        latencyMsTotal: u.latencyMsTotal,
        generated: r.generated,
        results: r.results,
        commit: r.commit_sha,
        runId: r.run_id,
      });
    }
  }
  return out;
}

// ───────── aggregation ─────────
export interface UsageAgg {
  provider: string;
  /** '' for a provider-level rollup. */
  model: string;
  requests: number;
  ok: number;
  rateLimited: number;
  overloaded: number;
  failed: number;
  tokens: number;
  latencyMsTotal: number;
}

function addInto(a: UsageAgg, e: UsageEntry): void {
  a.requests += e.requests;
  a.ok += e.ok;
  a.rateLimited += e.rateLimited;
  a.overloaded += e.overloaded;
  a.failed += e.failed;
  a.tokens += e.tokens;
  a.latencyMsTotal += e.latencyMsTotal;
}

/** Roll ledger entries up by provider×model (`by:'model'`) or by provider (`by:'provider'`),
 *  sorted by tokens spent (desc), then calls. */
export function aggregateUsage(entries: UsageEntry[], by: 'model' | 'provider'): UsageAgg[] {
  const map = new Map<string, UsageAgg>();
  for (const e of entries) {
    const k = by === 'provider' ? e.provider : `${e.provider}:${e.model}`;
    let a = map.get(k);
    if (!a) {
      a = {
        provider: e.provider,
        model: by === 'provider' ? '' : e.model,
        requests: 0,
        ok: 0,
        rateLimited: 0,
        overloaded: 0,
        failed: 0,
        tokens: 0,
        latencyMsTotal: 0,
      };
      map.set(k, a);
    }
    addInto(a, e);
  }
  return [...map.values()].sort((x, y) => y.tokens - x.tokens || y.requests - x.requests);
}

export interface UsageTotals {
  runs: number;
  models: number;
  providers: number;
  requests: number;
  ok: number;
  tokens: number;
  rateLimited: number;
  overloaded: number;
  failed: number;
  latencyMsTotal: number;
}

/** Grand totals across a filtered ledger — the headline stat row. */
export function summarize(entries: UsageEntry[]): UsageTotals {
  const runs = new Set<string>();
  const models = new Set<string>();
  const providers = new Set<string>();
  const t: UsageTotals = {
    runs: 0,
    models: 0,
    providers: 0,
    requests: 0,
    ok: 0,
    tokens: 0,
    rateLimited: 0,
    overloaded: 0,
    failed: 0,
    latencyMsTotal: 0,
  };
  for (const e of entries) {
    runs.add(e.at);
    models.add(`${e.provider}:${e.model}`);
    providers.add(e.provider);
    t.requests += e.requests;
    t.ok += e.ok;
    t.tokens += e.tokens;
    t.rateLimited += e.rateLimited;
    t.overloaded += e.overloaded;
    t.failed += e.failed;
    t.latencyMsTotal += e.latencyMsTotal;
  }
  t.runs = runs.size;
  t.models = models.size;
  t.providers = providers.size;
  return t;
}

/** Per-run token + call totals in chronological order (oldest → newest) for the sparklines. */
export function trendSeries(entries: UsageEntry[]): { tokens: number[]; requests: number[] } {
  const byRun = new Map<string, { t: number; tokens: number; requests: number }>();
  for (const e of entries) {
    let g = byRun.get(e.at);
    if (!g) {
      g = { t: Date.parse(e.at), tokens: 0, requests: 0 };
      byRun.set(e.at, g);
    }
    g.tokens += e.tokens;
    g.requests += e.requests;
  }
  const sorted = [...byRun.values()].sort((a, b) => a.t - b.t);
  return { tokens: sorted.map((g) => g.tokens), requests: sorted.map((g) => g.requests) };
}

// ───────── sorting ─────────
export type ModelCol = 'model' | 'requests' | 'tokens';
export type LedgerCol = 'at' | 'requests' | 'tokens';

export function sortModels(aggs: UsageAgg[], col: ModelCol, dir: SortDir): UsageAgg[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...aggs].sort((a, b) => {
    const d =
      col === 'model'
        ? `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`)
        : col === 'requests'
          ? a.requests - b.requests
          : a.tokens - b.tokens;
    return d * mul;
  });
}

export function sortLedger(entries: UsageEntry[], col: LedgerCol, dir: SortDir): UsageEntry[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const primary =
      col === 'at'
        ? Date.parse(a.at) - Date.parse(b.at)
        : col === 'requests'
          ? a.requests - b.requests
          : a.tokens - b.tokens;
    // Tiebreak by time so equal rows keep a stable, meaningful order.
    const d = primary !== 0 ? primary : Date.parse(a.at) - Date.parse(b.at);
    return d * mul;
  });
}
