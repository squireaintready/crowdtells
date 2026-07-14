import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperationsView, aggregateLlm } from '../components/admin/OperationsTab';
import type { PipelineRunRow } from '../lib/admin';
import type { LlmModelUsage, PipelineRunSummary } from '../lib/types';

const usage = (over: Partial<LlmModelUsage>): LlmModelUsage => ({
  provider: 'nvidia',
  model: 'z-ai/glm-5.2',
  requests: 0,
  ok: 0,
  rateLimited: 0,
  overloaded: 0,
  failed: 0,
  tokens: 0,
  latencyMsTotal: 0,
  ...over,
});

const run = (i: number, over: Partial<PipelineRunRow> = {}, llm?: LlmModelUsage[]): PipelineRunRow => {
  const at = new Date(Date.UTC(2026, 5, 26, 3, i)).toISOString();
  const detail: PipelineRunSummary = {
    at,
    durationMs: 90_000,
    generated: 3,
    skipped: 1,
    refreshed: 0,
    results: 0,
    newPages: 1,
    active: 72,
    resolved: 600,
    briefed: 700,
    candidates: 100,
    stories: 40,
    llm: llm ?? [
      usage({ requests: 3, ok: 3, tokens: 4500, latencyMsTotal: 21_000 }),
    ],
    primaryProvider: 'nvidia',
    primaryDown: false,
    sourceErrors: [],
    commit: 'abc1234',
    runId: '123',
  };
  return {
    id: `run-${i}`,
    run_at: at,
    duration_ms: 90_000,
    generated: 3,
    skipped: 1,
    results: 0,
    briefed: 700,
    primary_down: false,
    primary_provider: 'nvidia',
    commit_sha: 'abc1234',
    run_id: '123',
    total_count: 0,
    detail,
    ...over,
  };
};

const view = (rows: PipelineRunRow[], error: string | null = null) =>
  render(
    <OperationsView rows={rows} total={rows.length} loading={false} error={error} onReload={() => {}} />,
  );

describe('aggregateLlm', () => {
  it('sums per-model usage across runs', () => {
    const agg = aggregateLlm([run(1), run(2)]);
    expect(agg).toHaveLength(1);
    expect(agg[0]).toMatchObject({ provider: 'nvidia', requests: 6, ok: 6, tokens: 9000 });
  });
});

describe('OperationsView', () => {
  it('renders the healthy banner, LLM table, and run log when the primary briefer is up', () => {
    view([run(2), run(1)]);
    expect(screen.getByText(/NVIDIA healthy/i)).toBeInTheDocument();
    expect(screen.getByText('z-ai/glm-5.2')).toBeInTheDocument();
    expect(screen.getByRole('log', { name: /recent pipeline runs/i })).toBeInTheDocument();
  });

  it('shows the DOWN banner + fallback badge when the latest run lost the primary briefer', () => {
    const down = run(3, { primary_down: true }, [
      usage({ provider: 'nvidia', model: 'z-ai/glm-5.2', requests: 4, ok: 0, rateLimited: 4 }),
      usage({ provider: 'gemini', model: 'gemini-2.5-flash', requests: 4, ok: 4, tokens: 3000 }),
    ]);
    view([down]);
    expect(screen.getByText(/NVIDIA unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/NVIDIA DOWN/i)).toBeInTheDocument();
    // the fallback provider appears in the usage table
    expect(screen.getByText('gemini-2.5-flash')).toBeInTheDocument();
  });

  it('renders the empty state when there are no runs', () => {
    view([]);
    expect(screen.getByText(/No pipeline runs recorded yet/i)).toBeInTheDocument();
  });

  it('surfaces an error banner', () => {
    view([], 'forbidden');
    expect(screen.getByText('forbidden')).toBeInTheDocument();
  });
});
