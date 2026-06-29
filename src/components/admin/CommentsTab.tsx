import { useEffect, useState } from 'react';
import * as admin from '../../lib/admin';
import type { SortDir } from '../../lib/admin';
import s from './AdminPanel.module.css';
import { useAdminQuery, useDebounced } from './useAdminQuery';
import { Banner, Empty, Loading, Pager, SortableTh } from './ui';
import { useConfirm } from './useConfirm';
import { displayName, fmtRel } from './format';

const PAGE_SIZE = 50;

export function CommentsTab() {
  const [search, setSearch] = useState('');
  const dq = useDebounced(search.trim(), 300);
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [dir, setDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [dq, includeDeleted, dir]);

  const q = useAdminQuery(
    () => admin.listComments({ search: dq, includeDeleted, dir, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    `${dq}|${includeDeleted}|${dir}|${page}`,
  );

  const { confirm, confirmEl } = useConfirm(() => q.reload());

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  return (
    <section aria-label="Comments">
      <div className={s.toolbar}>
        <input
          className={s.search}
          type="search"
          placeholder="Search comment text or market id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search comments"
        />
        <label className={s.count} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
          Show hidden
        </label>
        <span className={s.toolSpacer} />
        {!q.loading && (
          <span className={s.count}>
            {total.toLocaleString()} comment{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {q.error && <Banner kind="error">{q.error}</Banner>}

      {q.loading && !q.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No comments match.</Empty>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Author</th>
                <th>Comment</th>
                <th className={s.hideSm}>Market</th>
                <SortableTh label="Posted" col="created_at" sort="created_at" dir={dir} onSort={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))} className={s.hideSm} />
                <th className={s.num}>Reports</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={c.deleted ? s.rowMuted : undefined}>
                  <td data-label="Author">{displayName(c.author_name)}</td>
                  <td className={s.bodyCell} data-label="Comment">
                    {c.body}
                    {c.deleted && <span className={`${s.pill} ${s.pillBad}`} style={{ marginLeft: 'var(--s-2)' }}>hidden</span>}
                  </td>
                  <td className={`${s.hideSm} ${s.mono}`} data-label="Market">{c.market_id}</td>
                  <td className={s.hideSm} data-label="Posted">{fmtRel(c.created_at)}</td>
                  <td className={`${s.num} tnum`} data-label="Reports">{c.report_count}</td>
                  <td data-label="Actions">
                    <button
                      type="button"
                      className={c.deleted ? `${s.btn} ${s.btnSm}` : `${s.btn} ${s.btnDanger} ${s.btnSm}`}
                      onClick={() =>
                        confirm({
                          title: c.deleted ? 'Unhide comment' : 'Hide comment',
                          body: c.body,
                          danger: !c.deleted,
                          confirmLabel: c.deleted ? 'Unhide' : 'Hide',
                          run: () => admin.setCommentDeleted(c.id, !c.deleted),
                        })
                      }
                    >
                      {c.deleted ? 'Unhide' : 'Hide'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />

      {confirmEl}
    </section>
  );
}
