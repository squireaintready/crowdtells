import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AiUsageView } from '../components/admin/AiUsageTab';
import { aggregateUsage, flattenUsage, summarize, trendSeries } from '../components/admin/aiUsage';
import { fmtCompact } from '../components/admin/format';
import type { PipelineRunRow } from '../lib/admin';
import type { LlmModelUsage, PipelineRunSummary } from '../lib/types';

const usage = (over: Partial<LlmModelUsage>): LlmModelUsage => ({
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  requests: 0,
  ok: 0,
  rateLimited: 0,
  overloaded: 0,
  failed: 0,
  tokens: 0,
  latencyMsTotal: 0,
  ...over,
});

/** A run at a fixed absolute time (ms) with the given per-model usage. */
const runAt = (id: string, atMs: number, llm: LlmModelUsage[], over: Partial<PipelineRunRow> = {}): PipelineRunRow => {
  const at = new Date(atMs).toISOString();
  const detail: PipelineRunSummary = {
    at,
    durationMs: 90_000,
    generated: 3,
    skipped: 1,
    refreshed: 0,
    results: 2,
    newPages: 1,
    active: 72,
    resolved: 600,
    briefed: 700,
    candidates: 100,
    stories: 40,
    llm,
    primaryProvider: 'nvidia',
    primaryDown: false,
    briefingsServed: [],
    sourceErrors: [],
    commit: 'abc1234',
    runId: '9001',
  };
  return {
    id,
    run_at: at,
    duration_ms: 90_000,
    generated: 3,
    skipped: 1,
    results: 2,
    briefed: 700,
    primary_down: false,
    primary_provider: 'nvidia',
    commit_sha: 'abc1234',
    run_id: '9001',
    total_count: 0,
    detail,
    ...over,
  };
};

const NOW = Date.UTC(2026, 6, 13, 12, 0, 0);
const H = 3_600_000;

describe('fmtCompact', () => {
  it('scales into k/M/B with one decimal below 10× a unit', () => {
    expect(fmtCompact(0)).toBe('0');
    expect(fmtCompact(999)).toBe('999');
    expect(fmtCompact(4500)).toBe('4.5k');
    expect(fmtCompact(12_000)).toBe('12k');
    expect(fmtCompact(1_500_000)).toBe('1.5M');
    expect(fmtCompact(12_000_000)).toBe('12M');
  });
  it('promotes across a magnitude boundary instead of rendering "1000k"/"1000M"', () => {
    expect(fmtCompact(999_600)).toBe('1.0M'); // not "1000k"
    expect(fmtCompact(999_499)).toBe('999k');
    expect(fmtCompact(999_600_000)).toBe('1.0B'); // not "1000M"
    expect(fmtCompact(1_000_000_000)).toBe('1.0B');
  });
  it('guards non-finite input', () => {
    expect(fmtCompact(NaN)).toBe('—');
    expect(fmtCompact(Infinity)).toBe('—');
  });
});

describe('flattenUsage', () => {
  it('flattens each run × model into its own ledger row', () => {
    const rows = [
      runAt('r1', NOW - H, [usage({ requests: 3, ok: 3, tokens: 4500 }), usage({ provider: 'groq', model: 'llama-3.3-70b-versatile', requests: 1, ok: 1, tokens: 900 })]),
      runAt('r2', NOW - 2 * H, [usage({ requests: 2, ok: 2, tokens: 3000 })]),
    ];
    const flat = flattenUsage(rows, { nowMs: NOW });
    expect(flat).toHaveLength(3);
    expect(flat.map((e) => e.key)).toContain('r1:groq:llama-3.3-70b-versatile');
    // carries the run's context for the "who/when"
    expect(flat[0]).toMatchObject({ commit: 'abc1234', runId: '9001', generated: 3, results: 2 });
  });

  it('filters by provider and by model', () => {
    const rows = [
      runAt('r1', NOW - H, [usage({ requests: 3 }), usage({ provider: 'nvidia', model: 'glm-4.6', requests: 2 })]),
    ];
    expect(flattenUsage(rows, { provider: 'nvidia', nowMs: NOW })).toHaveLength(1);
    expect(flattenUsage(rows, { model: 'gemini-2.5-flash', nowMs: NOW })).toHaveLength(1);
    expect(flattenUsage(rows, { provider: 'groq', nowMs: NOW })).toHaveLength(0);
  });

  it('honours the trailing time window against the injected now', () => {
    const rows = [
      runAt('recent', NOW - H, [usage({ requests: 1 })]),
      runAt('old', NOW - 48 * H, [usage({ requests: 1 })]),
    ];
    expect(flattenUsage(rows, { window: '24h', nowMs: NOW }).map((e) => e.at.slice(0, 10))).toHaveLength(1);
    expect(flattenUsage(rows, { window: '7d', nowMs: NOW })).toHaveLength(2);
    expect(flattenUsage(rows, { window: 'all', nowMs: NOW })).toHaveLength(2);
  });
});

describe('aggregateUsage', () => {
  const entries = flattenUsage(
    [
      runAt('r1', NOW - H, [usage({ requests: 3, ok: 3, tokens: 4500 }), usage({ provider: 'groq', model: 'llama', requests: 1, ok: 0, rateLimited: 1 })]),
      runAt('r2', NOW - 2 * H, [usage({ requests: 2, ok: 2, tokens: 3000 })]),
    ],
    { nowMs: NOW },
  );

  it('rolls up by provider×model', () => {
    const byModel = aggregateUsage(entries, 'model');
    const gem = byModel.find((a) => a.model === 'gemini-2.5-flash');
    expect(gem).toMatchObject({ requests: 5, ok: 5, tokens: 7500 });
    expect(byModel[0]!.tokens).toBeGreaterThanOrEqual(byModel[byModel.length - 1]!.tokens); // sorted by tokens desc
  });

  it('rolls up by provider (model blanked)', () => {
    const byProv = aggregateUsage(entries, 'provider');
    expect(byProv.find((a) => a.provider === 'gemini')).toMatchObject({ tokens: 7500, model: '' });
    expect(byProv.find((a) => a.provider === 'groq')).toMatchObject({ requests: 1, rateLimited: 1 });
  });
});

describe('summarize + trendSeries', () => {
  const rows = [
    runAt('r1', NOW - H, [usage({ requests: 3, ok: 3, tokens: 4500 }), usage({ provider: 'groq', model: 'llama', requests: 1, ok: 1, tokens: 1000 })]),
    runAt('r2', NOW - 2 * H, [usage({ requests: 2, ok: 1, failed: 1, tokens: 3000 })]),
  ];
  const entries = flattenUsage(rows, { nowMs: NOW });

  it('summarize counts distinct runs/models/providers and sums outcomes', () => {
    const t = summarize(entries);
    expect(t).toMatchObject({ runs: 2, providers: 2, requests: 6, ok: 5, tokens: 8500, failed: 1 });
    expect(t.models).toBe(2);
  });

  it('trendSeries returns per-run totals oldest → newest', () => {
    const { tokens, requests } = trendSeries(entries);
    expect(tokens).toEqual([3000, 5500]); // r2 (older) then r1
    expect(requests).toEqual([2, 4]);
  });
});

describe('AiUsageView', () => {
  const rows = [
    runAt('r1', NOW - H, [
      usage({ requests: 4, ok: 4, tokens: 6000, latencyMsTotal: 20_000 }),
      usage({ provider: 'nvidia', model: 'glm-4.6', requests: 2, ok: 2, tokens: 2500, latencyMsTotal: 8000 }),
    ]),
    runAt('r2', NOW - 2 * H, [
      usage({ provider: 'groq', model: 'llama-3.3-70b-versatile', requests: 3, ok: 2, rateLimited: 1, tokens: 1800 }),
    ]),
  ];
  const view = (r: PipelineRunRow[] = rows, error: string | null = null) =>
    render(<AiUsageView rows={r} loading={false} error={error} onReload={() => {}} />);

  it('renders the totals, provider cards, model table, and ledger', () => {
    view();
    expect(screen.getByText(/automated/i)).toBeInTheDocument(); // the "who" note
    expect(screen.getByRole('heading', { name: /By provider/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Usage ledger/i })).toBeInTheDocument();
    // all three providers surface; models appear in both the model table and the ledger
    expect(screen.getAllByText('gemini').length).toBeGreaterThan(0);
    expect(screen.getAllByText('nvidia').length).toBeGreaterThan(0);
    expect(screen.getAllByText('glm-4.6').length).toBeGreaterThan(0);
    expect(screen.getAllByText('llama-3.3-70b-versatile').length).toBeGreaterThan(0);
  });

  it('filters the ledger by provider', () => {
    view();
    fireEvent.change(screen.getByLabelText('Filter by provider'), { target: { value: 'groq' } });
    // gemini/nvidia models drop out of the visible tables; groq stays
    expect(screen.getAllByText('llama-3.3-70b-versatile').length).toBeGreaterThan(0);
    expect(screen.queryByText('glm-4.6')).toBeNull();
    expect(screen.queryByText('gemini-2.5-flash')).toBeNull();
  });

  it('shows a "no usage matches" note when the runs carry no LLM usage', () => {
    view([runAt('empty', NOW - H, [])]);
    expect(screen.getByText(/No AI usage matches these filters/i)).toBeInTheDocument();
  });

  it('renders the empty state when there are no runs', () => {
    view([]);
    expect(screen.getByText(/No AI usage recorded yet/i)).toBeInTheDocument();
  });

  it('surfaces an error banner', () => {
    view([], 'forbidden');
    expect(screen.getByText('forbidden')).toBeInTheDocument();
  });

  it('reports the run count in the toolbar', () => {
    view();
    expect(screen.getByText(/2 runs · updated/)).toBeInTheDocument();
  });
});
