import { useState } from 'react';
import * as admin from '../../lib/admin';
import s from './AdminPanel.module.css';
import { useAdminQuery } from './useAdminQuery';
import { Banner, Empty, Loading, Pager } from './ui';
import { displayName, fmtDateTime } from './format';

const PAGE_SIZE = 100;

function detailText(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return parts.join(' · ');
}

export function AuditTab() {
  const [page, setPage] = useState(0);
  const q = useAdminQuery(() => admin.listAudit({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }), `${page}`);
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  return (
    <section aria-label="Audit log">
      <div className={s.toolbar}>
        <span className={s.count}>Every admin action, most recent first.</span>
        <span className={s.toolSpacer} />
        {!q.loading && <span className={s.count}>{total.toLocaleString()} entries</span>}
      </div>

      {q.error && <Banner kind="error">{q.error}</Banner>}

      {q.loading && !q.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No admin actions recorded yet.</Empty>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th className={s.hideSm}>Target</th>
                <th className={s.hideSm}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td data-label="When">{fmtDateTime(a.created_at)}</td>
                  <td data-label="Admin">{displayName(a.actor_name)}</td>
                  <td data-label="Action">
                    <span className={s.pill}>{a.action.replace(/_/g, ' ')}</span>
                  </td>
                  <td className={`${s.hideSm} ${s.mono}`} data-label="Target">
                    {a.target_type ? `${a.target_type}: ${a.target_id ?? ''}` : '—'}
                  </td>
                  <td className={`${s.hideSm} ${s.bodyCell}`} data-label="Detail">
                    {detailText(a.detail) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
    </section>
  );
}
