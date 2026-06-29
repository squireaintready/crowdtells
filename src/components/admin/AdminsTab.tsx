import * as admin from '../../lib/admin';
import s from './AdminPanel.module.css';
import { useAdminQuery } from './useAdminQuery';
import { Avatar, Banner, Empty, Loading } from './ui';
import { useConfirm } from './useConfirm';
import { displayName, fmtDate } from './format';

export function AdminsTab() {
  const q = useAdminQuery(() => admin.listAdmins(), 'admins');
  const { confirm, confirmEl } = useConfirm(() => q.reload());
  const rows = q.data ?? [];

  return (
    <section aria-label="Admins">
      <div className={s.toolbar}>
        <span className={s.count}>
          Admins can view all user data and moderate. To add one, open a user in the Users tab and choose “Make admin.”
        </span>
      </div>

      {q.error && <Banner kind="error">{q.error}</Banner>}

      {q.loading && !q.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No admins found.</Empty>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Admin</th>
                <th className={s.hideSm}>Added</th>
                <th className={s.hideSm}>Added by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.user_id}>
                  <td className={s.primaryCell}>
                    <span className={s.who2}>
                      <Avatar src={a.avatar_url} name={a.display_name} email={a.email} />
                      <span>
                        <div>{displayName(a.display_name, a.email)}</div>
                        <div className={s.mono}>{a.email ?? a.user_id}</div>
                      </span>
                    </span>
                  </td>
                  <td className={s.hideSm} data-label="Added">{fmtDate(a.added_at)}</td>
                  <td className={s.hideSm} data-label="Added by">
                    {a.added_by_name ?? (a.added_by ? 'another admin' : 'bootstrap')}
                  </td>
                  <td data-label="Actions">
                    <button
                      type="button"
                      className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
                      disabled={rows.length <= 1}
                      title={rows.length <= 1 ? 'Cannot revoke the last admin' : undefined}
                      onClick={() =>
                        confirm({
                          title: 'Revoke admin',
                          body: `Remove admin access from ${displayName(a.display_name, a.email)} (${a.email ?? a.user_id})?`,
                          danger: true,
                          confirmLabel: 'Revoke',
                          run: () => admin.revokeAdmin(a.user_id),
                        })
                      }
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmEl}
    </section>
  );
}
