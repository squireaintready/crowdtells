import { useEffect, useState } from 'react';
import * as admin from '../../lib/admin';
import type { SortDir, UserSort } from '../../lib/admin';
import s from './AdminPanel.module.css';
import { useAdminQuery, useDebounced } from './useAdminQuery';
import { Avatar, Banner, Empty, Loading, Pager, SortableTh } from './ui';
import { displayName, fmtDate, fmtRel, isBanned } from './format';
import { UserDetail } from './UserDetail';

const PAGE_SIZE = 50;

export function UsersTab() {
  const [search, setSearch] = useState('');
  const dq = useDebounced(search.trim(), 300);
  const [sort, setSort] = useState<UserSort>('created_at');
  const [dir, setDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  // A new search or sort starts at the first page.
  useEffect(() => setPage(0), [dq, sort, dir]);

  const q = useAdminQuery(
    () => admin.listUsers({ search: dq, sort, dir, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    `${dq}|${sort}|${dir}|${page}`,
  );

  const onSort = (col: UserSort) => {
    if (col === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(col);
      setDir(col === 'display_name' || col === 'email' ? 'asc' : 'desc');
    }
  };

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  return (
    <section aria-label="Users">
      <div className={s.toolbar}>
        <input
          className={s.search}
          type="search"
          placeholder="Search name, email, or exact user id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
        <span className={s.toolSpacer} />
        {!q.loading && (
          <span className={s.count}>
            {total.toLocaleString()} user{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {q.error && <Banner kind="error">{q.error}</Banner>}

      {q.loading && !q.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No users match.</Empty>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <SortableTh label="User" col="display_name" sort={sort} dir={dir} onSort={onSort} />
                <SortableTh label="Tier" col="tier" sort={sort} dir={dir} onSort={onSort} className={s.hideSm} />
                <th className={s.hideSm}>Providers</th>
                <SortableTh label="Joined" col="created_at" sort={sort} dir={dir} onSort={onSort} className={s.hideSm} />
                <SortableTh label="Last seen" col="last_sign_in_at" sort={sort} dir={dir} onSort={onSort} />
                <th className={`${s.num} ${s.hideSm}`}>Calls</th>
                <th className={s.num}>Comments</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.user_id}
                  className={s.rowClickable}
                  tabIndex={0}
                  onClick={() => setOpenId(u.user_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenId(u.user_id);
                    }
                  }}
                >
                  <td className={s.primaryCell}>
                    <span className={s.who2}>
                      <Avatar src={u.avatar_url} name={u.display_name} email={u.email} />
                      <span>
                        <div>{displayName(u.display_name, u.email)}</div>
                        <div className={s.mono}>{u.email ?? '—'}</div>
                      </span>
                    </span>
                  </td>
                  <td className={s.hideSm} data-label="Tier">
                    <span className={s.pill}>{u.tier}</span>
                  </td>
                  <td className={s.hideSm} data-label="Providers">
                    {u.providers.join(', ') || '—'}
                  </td>
                  <td className={s.hideSm} data-label="Joined">{fmtDate(u.created_at)}</td>
                  <td data-label="Last seen">{fmtRel(u.last_sign_in_at)}</td>
                  <td className={`${s.num} ${s.hideSm} tnum`} data-label="Calls">{u.calls_count}</td>
                  <td className={`${s.num} tnum`} data-label="Comments">{u.comments_count}</td>
                  <td data-label="Flags">
                    {u.is_admin && <span className={`${s.pill} ${s.pillAdmin}`}>admin</span>}{' '}
                    {isBanned(u.banned_until) && <span className={`${s.pill} ${s.pillBad}`}>banned</span>}{' '}
                    {u.is_subscriber && (
                      <span
                        className={`${s.pill} ${u.subscriber_confirmed ? s.pillOk : ''}`}
                        title={u.subscriber_confirmed ? 'confirmed subscriber' : 'unconfirmed subscriber'}
                      >
                        {u.subscriber_confirmed ? 'sub' : 'sub?'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />

      {openId && <UserDetail userId={openId} onClose={() => setOpenId(null)} onChanged={q.reload} />}
    </section>
  );
}
