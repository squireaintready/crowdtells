import { useEffect, useMemo, useState } from 'react';
import s from './AdminPanel.module.css';
import { useAdminQuery } from './useAdminQuery';
import { Banner, Empty, Loading, Pager, ProviderPill, SortableTh, Stat, Trend } from './ui';
import { listPipelineRuns, type PipelineRunRow, type SortDir } from '../../lib/admin';
import { fmtCompact, fmtDateTime, fmtRel } from './format';
import {
  aggregateUsage,
  flattenUsage,
  sortLedger,
  sortModels,
  summarize,
  trendSeries,
  WINDOW_LABEL,
  type LedgerCol,
  type ModelCol,
  type UsageAgg,
  type UsageTotals,
  type UsageWindow,
} from './aiUsage';

const LOAD = 250; // runs to pull — the pipeline_runs table only keeps ~30 days, so this is the lot
const PAGE_SIZE = 40; // ledger rows per page (client-side; every run is already loaded)
const REPO = 'squireaintready/crowdtells';

// ───────── formatting ─────────
const int = (n: number | null | undefined): string => (n ?? 0).toLocaleString();
const pct = (num: number, den: number): string => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—');
const avgMs = (a: UsageAgg | UsageTotals): string =>
  a.requests > 0 ? `${Math.round(a.latencyMsTotal / a.requests)}ms` : '—';
const share = (n: number, total: number): number => (total > 0 ? (n / total) * 100 : 0);

// ═════════════════ view ═════════════════
export interface AiUsageViewProps {
  rows: PipelineRunRow[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

/** Presentational console — split from data so it can be unit-tested + previewed with mocks. */
export function AiUsageView({ rows, loading, error, onReload }: AiUsageViewProps) {
  const [provider, setProvider] = useState('all');
  const [model, setModel] = useState('all');
  const [window, setWindow] = useState<UsageWindow>('all');
  const [modelSort, setModelSort] = useState<{ col: ModelCol; dir: SortDir }>({ col: 'tokens', dir: 'desc' });
  const [ledgerSort, setLedgerSort] = useState<{ col: LedgerCol; dir: SortDir }>({ col: 'at', dir: 'desc' });
  const [page, setPage] = useState(0);

  // Filter option lists come from the FULL dataset (window 'all' ignores the clock), so a
  // provider/model never vanishes from its dropdown just because it was quiet lately.
  const allEntries = useMemo(() => flattenUsage(rows, { nowMs: 0 }), [rows]);
  const providerOptions = useMemo(() => [...new Set(allEntries.map((e) => e.provider))].sort(), [allEntries]);
  const modelOptions = useMemo(
    () => [...new Set(allEntries.filter((e) => provider === 'all' || e.provider === provider).map((e) => e.model))].sort(),
    [allEntries, provider],
  );

  // Keep the model filter valid when the provider filter narrows the model list.
  useEffect(() => {
    if (model !== 'all' && !modelOptions.includes(model)) setModel('all');
  }, [modelOptions, model]);
  // Any filter/sort change returns the ledger to page one.
  useEffect(() => setPage(0), [provider, model, window, ledgerSort]);

  // The trailing-window slice needs a clock; a coarse window tolerates a per-interaction
  // snapshot (it re-evaluates whenever a filter changes or the data reloads).
  const entries = useMemo(
    () => flattenUsage(rows, { provider, model, window, nowMs: Date.now() }),
    [rows, provider, model, window],
  );
  const totals = useMemo(() => summarize(entries), [entries]);
  const byProvider = useMemo(() => aggregateUsage(entries, 'provider'), [entries]);
  const byModel = useMemo(() => aggregateUsage(entries, 'model'), [entries]);
  const modelRows = useMemo(() => sortModels(byModel, modelSort.col, modelSort.dir), [byModel, modelSort]);
  const trends = useMemo(() => trendSeries(entries), [entries]);
  const ledger = useMemo(() => sortLedger(entries, ledgerSort.col, ledgerSort.dir), [entries, ledgerSort]);
  // Clamp the page during render so a filter/sort change (which shrinks `ledger` before the
  // reset effect fires) can never paint an out-of-range, empty page for a frame.
  const pageCount = Math.max(1, Math.ceil(ledger.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const ledgerPage = ledger.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const onModelSort = (col: ModelCol) =>
    setModelSort((s0) => (s0.col === col ? { col, dir: s0.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }));
  const onLedgerSort = (col: LedgerCol) =>
    setLedgerSort((s0) => (s0.col === col ? { col, dir: s0.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }));

  const latest = rows[0];
  const limitHits = totals.rateLimited + totals.overloaded;

  return (
    <section aria-label="AI usage">
      <div className={s.toolbar}>
        <select
          className={s.select}
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          aria-label="Filter by provider"
        >
          <option value="all">All providers</option>
          {providerOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className={s.select}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-label="Filter by model"
        >
          <option value="all">All models</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          className={s.select}
          value={window}
          onChange={(e) => setWindow(e.target.value as UsageWindow)}
          aria-label="Filter by time window"
        >
          <option value="all">All time</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <span className={s.toolSpacer} />
        {!loading && latest && (
          <span className={s.count}>
            {int(totals.runs)} run{totals.runs === 1 ? '' : 's'} · updated {fmtRel(latest.run_at)}
          </span>
        )}
        <button type="button" className={s.btn} onClick={onReload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {loading && rows.length === 0 ? (
        <Loading label="Loading AI usage…" />
      ) : rows.length === 0 ? (
        <Empty>
          No AI usage recorded yet. This console populates after the next pipeline run — make sure the
          owner has re-run <code>supabase/schema.sql</code> so the <code>pipeline_runs</code> table exists.
        </Empty>
      ) : (
        <>
          <p className={s.usageNote}>
            All AI spend is the automated <strong>Pulse Pipeline</strong> — Crowdtells has no user-facing
            AI. Every figure below is attributed to the run that spent it (its time, commit, and Actions
            log), broken out by provider and model. Tokens are the total billed per call (prompt +
            completion + any hidden reasoning).
          </p>

          {entries.length === 0 ? (
            <Empty>No AI usage matches these filters. Widen the window or clear the provider/model.</Empty>
          ) : (
            <>
              <div className={s.opsGrid}>
                <Stat label="Tokens" value={fmtCompact(totals.tokens)} sub={WINDOW_LABEL[window]} />
                <Stat label="LLM calls" value={fmtCompact(totals.requests)} sub={`${int(totals.runs)} runs`} />
                <Stat label="Success" value={pct(totals.ok, totals.requests)} sub={`${int(totals.ok)} ok`} />
                <Stat label="Limit hits" value={int(limitHits)} sub="429 + 503" warn={limitHits > 0} />
                <Stat label="Failures" value={int(totals.failed)} sub="4xx/5xx/net" warn={totals.failed > 0} />
                <Stat label="Avg latency" value={avgMs(totals)} sub="per call" />
                <Stat label="Models" value={int(totals.models)} sub={`${int(totals.providers)} providers`} />
                <Stat label="Runs" value={int(totals.runs)} sub="in window" />
              </div>

              <h3 className={s.opsH3}>By provider · {WINDOW_LABEL[window]}</h3>
              <div className={s.provCards}>
                {byProvider.map((p) => (
                  <div key={p.provider} className={s.provCard}>
                    <div className={s.provCardHead}>
                      <ProviderPill provider={p.provider} />
                      <span className={s.provShare}>{Math.round(share(p.tokens, totals.tokens))}% of tokens</span>
                    </div>
                    <div className={s.provCardTokens}>{fmtCompact(p.tokens)}</div>
                    <div className={s.barTrack}>
                      <div className={s.barFill} style={{ width: `${share(p.tokens, totals.tokens).toFixed(1)}%` }} />
                    </div>
                    <div className={s.provMeta}>
                      <span>
                        <b>{int(p.requests)}</b> calls
                      </span>
                      <span>
                        <b>{pct(p.ok, p.requests)}</b> ok
                      </span>
                      {p.rateLimited + p.overloaded > 0 && (
                        <span>
                          <b className={s.warnNum}>{int(p.rateLimited + p.overloaded)}</b> limited
                        </span>
                      )}
                      <span>
                        <b>{avgMs(p)}</b> avg
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={s.trends}>
                <Trend label="Tokens / run" values={trends.tokens} fmt={fmtCompact} />
                <Trend label="LLM calls / run" values={trends.requests} fmt={int} />
              </div>

              <h3 className={s.opsH3}>By model · {WINDOW_LABEL[window]}</h3>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <SortableTh label="Provider · model" col="model" sort={modelSort.col} dir={modelSort.dir} onSort={onModelSort} />
                      <SortableTh label="Calls" col="requests" sort={modelSort.col} dir={modelSort.dir} onSort={onModelSort} numeric />
                      <th className={`${s.num} ${s.hideSm}`}>OK</th>
                      <th className={s.num}>429</th>
                      <th className={`${s.num} ${s.hideSm}`}>503</th>
                      <th className={`${s.num} ${s.hideSm}`}>Fail</th>
                      <SortableTh label="Tokens" col="tokens" sort={modelSort.col} dir={modelSort.dir} onSort={onModelSort} numeric />
                      <th className={`${s.num} ${s.hideSm}`}>Share</th>
                      <th className={`${s.num} ${s.hideSm}`}>Avg ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelRows.map((u) => (
                      <tr key={`${u.provider}:${u.model}`}>
                        <td data-label="Model">
                          <ProviderPill provider={u.provider} /> <span className={s.mono}>{u.model}</span>
                        </td>
                        <td className={s.num} data-label="Calls">
                          {int(u.requests)}
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="OK">
                          {int(u.ok)}
                        </td>
                        <td className={s.num} data-label="429">
                          {u.rateLimited > 0 ? <strong className={s.warnNum}>{int(u.rateLimited)}</strong> : '0'}
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="503">
                          {u.overloaded > 0 ? <strong className={s.warnNum}>{int(u.overloaded)}</strong> : '0'}
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="Fail">
                          {u.failed > 0 ? <strong className={s.warnNum}>{int(u.failed)}</strong> : '0'}
                        </td>
                        <td className={s.num} data-label="Tokens">
                          {fmtCompact(u.tokens)}
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="Share">
                          <span className={s.cellShare}>
                            <span className={s.cellBar}>
                              <span className={s.cellBarFill} style={{ width: `${share(u.tokens, totals.tokens).toFixed(1)}%` }} />
                            </span>
                            {Math.round(share(u.tokens, totals.tokens))}%
                          </span>
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="Avg ms">
                          {avgMs(u)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className={s.opsH3}>Usage ledger · run × model</h3>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <SortableTh label="When" col="at" sort={ledgerSort.col} dir={ledgerSort.dir} onSort={onLedgerSort} />
                      <th>Provider · model</th>
                      <SortableTh label="Calls" col="requests" sort={ledgerSort.col} dir={ledgerSort.dir} onSort={onLedgerSort} numeric />
                      <th className={`${s.num} ${s.hideSm}`}>OK</th>
                      <th className={s.num}>429</th>
                      <th className={`${s.num} ${s.hideSm}`}>503</th>
                      <th className={`${s.num} ${s.hideSm}`}>Fail</th>
                      <SortableTh label="Tokens" col="tokens" sort={ledgerSort.col} dir={ledgerSort.dir} onSort={onLedgerSort} numeric />
                      <th className={`${s.num} ${s.hideSm}`}>Avg ms</th>
                      <th className={s.hideSm}>Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerPage.map((e) => (
                      <tr key={e.key}>
                        <td data-label="When">
                          <span className={s.usageWhen}>
                            {fmtDateTime(e.at)}
                            <span className={s.usageRel}>{fmtRel(e.at)}</span>
                          </span>
                        </td>
                        <td data-label="Model">
                          <ProviderPill provider={e.provider} /> <span className={s.mono}>{e.model}</span>
                        </td>
                        <td className={s.num} data-label="Calls">
                          {int(e.requests)}
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="OK">
                          {int(e.ok)}
                        </td>
                        <td className={s.num} data-label="429">
                          {e.rateLimited > 0 ? <strong className={s.warnNum}>{int(e.rateLimited)}</strong> : '0'}
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="503">
                          {e.overloaded > 0 ? <strong className={s.warnNum}>{int(e.overloaded)}</strong> : '0'}
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="Fail">
                          {e.failed > 0 ? <strong className={s.warnNum}>{int(e.failed)}</strong> : '0'}
                        </td>
                        <td className={s.num} data-label="Tokens">
                          {fmtCompact(e.tokens)}
                        </td>
                        <td className={`${s.num} ${s.hideSm}`} data-label="Avg ms">
                          {e.requests > 0 ? Math.round(e.latencyMsTotal / e.requests) : '—'}
                        </td>
                        <td className={`${s.hideSm} ${s.bodyCell} ${s.usageCtx}`} data-label="Run">
                          gen {int(e.generated)}
                          {e.results ? ` · res ${int(e.results)}` : ''}
                          {e.commit ? <> · <span className={s.usageCommit}>{e.commit}</span></> : null}
                          {e.runId ? (
                            <>
                              {' · '}
                              <a
                                href={`https://github.com/${REPO}/actions/runs/${e.runId}`}
                                target="_blank"
                                rel="noreferrer"
                                className={s.opsLink}
                              >
                                log ↗
                              </a>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={safePage} pageSize={PAGE_SIZE} total={ledger.length} onPage={setPage} />
            </>
          )}
        </>
      )}
    </section>
  );
}

/** Data wrapper: pulls recent runs via the admin RPC and hands them to the view. */
export function AiUsageTab() {
  const q = useAdminQuery(() => listPipelineRuns({ limit: LOAD }), 'aiusage');
  return <AiUsageView rows={q.data?.rows ?? []} loading={q.loading} error={q.error} onReload={q.reload} />;
}
