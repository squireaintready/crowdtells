import { useState } from 'react';
import * as admin from '../../lib/admin';
import s from './AdminPanel.module.css';
import { useAdminQuery } from './useAdminQuery';
import { Banner, Empty, Loading, Pager } from './ui';
import { useConfirm } from './useConfirm';
import { displayName, fmtRel } from './format';

const PAGE_SIZE = 50;

export function ModerationTab() {
  const [page, setPage] = useState(0);

  const q = useAdminQuery(
    () => admin.moderationQueue({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    `${page}`,
  );

  const { confirm, confirmEl } = useConfirm(() => q.reload());

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  return (
    <section aria-label="Moderation queue">
      <div className={s.toolbar}>
        <span className={s.count}>Reported comments, most-flagged first.</span>
        <span className={s.toolSpacer} />
        {!q.loading && (
          <span className={s.count}>
            {total.toLocaleString()} reported
          </span>
        )}
      </div>

      {q.error && <Banner kind="error">{q.error}</Banner>}

      {q.loading && !q.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nothing in the queue — no comments have been reported.</Empty>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.num}>Reports</th>
                <th>Author</th>
                <th>Comment</th>
                <th>Categories</th>
                <th className={s.hideSm}>Last</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.comment_id} className={r.deleted ? s.rowMuted : undefined}>
                  <td className={`${s.num} tnum`} data-label="Reports">{r.n_reports}</td>
                  <td data-label="Author">{displayName(r.author_name)}</td>
                  <td className={s.bodyCell} data-label="Comment">
                    {r.body}
                    {r.deleted && (
                      <span className={`${s.pill} ${s.pillBad}`} style={{ marginLeft: 'var(--s-2)' }}>
                        hidden
                      </span>
                    )}
                  </td>
                  <td data-label="Categories">
                    {Object.entries(r.categories).map(([cat, n]) => (
                      <span key={cat} className={s.pill} style={{ marginRight: 4 }}>
                        {cat}×{n}
                      </span>
                    ))}
                  </td>
                  <td className={s.hideSm} data-label="Last reported">{fmtRel(r.last_reported_at)}</td>
                  <td data-label="Actions">
                    <button
                      type="button"
                      className={r.deleted ? `${s.btn} ${s.btnSm}` : `${s.btn} ${s.btnDanger} ${s.btnSm}`}
                      onClick={() =>
                        confirm({
                          title: r.deleted ? 'Unhide comment' : 'Hide comment',
                          body: r.body,
                          danger: !r.deleted,
                          confirmLabel: r.deleted ? 'Unhide' : 'Hide',
                          run: () => admin.setCommentDeleted(r.comment_id, !r.deleted),
                        })
                      }
                    >
                      {r.deleted ? 'Unhide' : 'Hide'}
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
