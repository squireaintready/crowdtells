import { useEffect, useState } from 'react';
import * as admin from '../../lib/admin';
import type { SortDir, SubscriberStatus } from '../../lib/admin';
import s from './AdminPanel.module.css';
import { useAdminQuery, useDebounced } from './useAdminQuery';
import { Banner, Empty, Loading, Pager, SortableTh } from './ui';
import { useConfirm } from './useConfirm';
import { fmtDate } from './format';

const PAGE_SIZE = 50;

export function SubscribersTab() {
  const [search, setSearch] = useState('');
  const dq = useDebounced(search.trim(), 300);
  const [status, setStatus] = useState<SubscriberStatus>('all');
  const [sort, setSort] = useState<'created_at' | 'email'>('created_at');
  const [dir, setDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [dq, status, sort, dir]);

  const q = useAdminQuery(
    () => admin.listSubscribers({ search: dq, status, sort, dir, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    `${dq}|${status}|${sort}|${dir}|${page}`,
  );

  const { confirm, confirmEl } = useConfirm(() => q.reload());

  const onSort = (col: 'created_at' | 'email') => {
    if (col === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(col);
      setDir(col === 'email' ? 'asc' : 'desc');
    }
  };

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  return (
    <section aria-label="Subscribers">
      <div className={s.toolbar}>
        <input
          className={s.search}
          type="search"
          placeholder="Search email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search subscribers"
        />
        <select
          className={s.select}
          value={status}
          onChange={(e) => setStatus(e.target.value as SubscriberStatus)}
          aria-label="Filter by status"
        >
          <option value="all">All</option>
          <option value="confirmed">Confirmed</option>
          <option value="unconfirmed">Unconfirmed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        <span className={s.toolSpacer} />
        {!q.loading && (
          <span className={s.count}>
            {total.toLocaleString()} subscriber{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {q.error && <Banner kind="error">{q.error}</Banner>}

      {q.loading && !q.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No subscribers match.</Empty>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <SortableTh label="Email" col="email" sort={sort} dir={dir} onSort={onSort} />
                <th>Status</th>
                <th className={s.hideSm}>Source</th>
                <th className={s.hideSm}>Freq</th>
                <th className={s.hideSm}>Topics</th>
                <SortableTh label="Joined" col="created_at" sort={sort} dir={dir} onSort={onSort} className={s.hideSm} />
                <th>Account</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const unsub = !!r.unsubscribed_at;
                return (
                  <tr key={r.id}>
                    <td className={s.primaryCell}>{r.email}</td>
                    <td data-label="Status">
                      {unsub ? (
                        <span className={`${s.pill} ${s.pillMute}`}>unsubscribed</span>
                      ) : r.confirmed_at ? (
                        <span className={`${s.pill} ${s.pillOk}`}>confirmed</span>
                      ) : (
                        <span className={`${s.pill} ${s.pillBad}`}>unconfirmed</span>
                      )}
                    </td>
                    <td className={s.hideSm} data-label="Source">{r.source}</td>
                    <td className={s.hideSm} data-label="Frequency">
                      {r.frequency}
                      {r.breaking ? ' +brk' : ''}
                    </td>
                    <td className={s.hideSm} data-label="Topics">
                      {r.topics.length ? r.topics.join(', ') : 'all'}
                    </td>
                    <td className={s.hideSm} data-label="Joined">{fmtDate(r.created_at)}</td>
                    <td data-label="Account">
                      {r.linked_user_id ? (
                        <span className={`${s.pill} ${s.pillOk}`}>yes</span>
                      ) : (
                        <span className={s.pillMute}>—</span>
                      )}
                    </td>
                    <td data-label="Actions">
                      <span className={s.actions}>
                        {!unsub && (
                          <button
                            type="button"
                            className={`${s.btn} ${s.btnSm}`}
                            onClick={() =>
                              confirm({
                                title: 'Unsubscribe',
                                body: `Mark ${r.email} as unsubscribed? They'll stop receiving the digest.`,
                                confirmLabel: 'Unsubscribe',
                                run: () => admin.unsubscribeSubscriber(r.email),
                              })
                            }
                          >
                            Unsub
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
                          onClick={() =>
                            confirm({
                              title: 'Delete subscriber',
                              body: `Permanently remove ${r.email} from the list? (Use this for junk/abuse addresses.)`,
                              danger: true,
                              confirmLabel: 'Delete',
                              run: () => admin.deleteSubscriber(r.email),
                            })
                          }
                        >
                          Delete
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />

      {confirmEl}
    </section>
  );
}
