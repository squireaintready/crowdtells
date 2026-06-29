import * as admin from '../../lib/admin';
import s from './AdminPanel.module.css';
import { useAdminQuery } from './useAdminQuery';
import { Banner, Dialog, Loading } from './ui';
import { useConfirm, type Confirmable } from './useConfirm';
import { displayName, fmtDate, fmtDateTime, fmtRel, isBanned } from './format';

interface Pending extends Confirmable {
  /** Set when the action closes the drawer (delete), so we don't refetch the gone user. */
  closesDrawer?: boolean;
}

/** Full per-user record + guarded admin actions, in a right-side drawer. */
export function UserDetail({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const q = useAdminQuery(() => admin.userDetail(userId), userId);
  const d = q.data;
  const banned = d ? isBanned(d.banned_until) : false;
  const trust = (d?.trust ?? {}) as Record<string, unknown>;

  // After a successful action: refresh the list behind it, and the drawer too — unless
  // the action unmounted the drawer (delete), where refetching the gone user is wasted.
  const afterAction = (p: Pending) => {
    onChanged();
    if (!p.closesDrawer) q.reload();
  };
  const { confirm, confirmEl } = useConfirm<Pending>(afterAction);

  const title = d ? displayName(d.profile?.display_name as string | null, d.email) : 'User';

  return (
    <Dialog title={title} onClose={onClose} variant="drawer">
      <div className={s.drawerBody}>
        {q.loading && !d ? (
          <Loading />
        ) : q.error ? (
          <Banner kind="error">{q.error}</Banner>
        ) : d ? (
          <>
            <div className={s.actions}>
              {banned ? (
                <button
                  type="button"
                  className={s.btn}
                  onClick={() =>
                    confirm({
                      title: 'Unban user',
                      body: `Restore sign-in access for ${d.email}?`,
                      confirmLabel: 'Unban',
                      run: () => admin.setUserBanned(userId, false),
                    })
                  }
                >
                  Unban
                </button>
              ) : (
                <button
                  type="button"
                  className={`${s.btn} ${s.btnDanger}`}
                  onClick={() =>
                    confirm({
                      title: 'Ban user',
                      body: `Block ${d.email} from getting a new session. Their content stays; they can't sign in until unbanned.`,
                      danger: true,
                      confirmLabel: 'Ban',
                      run: () => admin.setUserBanned(userId, true),
                    })
                  }
                >
                  Ban
                </button>
              )}
              {d.is_admin ? (
                <button
                  type="button"
                  className={s.btn}
                  onClick={() =>
                    confirm({
                      title: 'Revoke admin',
                      body: `Remove admin-console access from ${d.email}?`,
                      danger: true,
                      confirmLabel: 'Revoke',
                      run: () => admin.revokeAdmin(userId),
                    })
                  }
                >
                  Revoke admin
                </button>
              ) : (
                <button
                  type="button"
                  className={s.btn}
                  onClick={() =>
                    confirm({
                      title: 'Grant admin',
                      body: `Give ${d.email} full admin-console access (they can manage all users + data)?`,
                      confirmLabel: 'Grant admin',
                      run: () => admin.grantAdmin(userId),
                    })
                  }
                >
                  Make admin
                </button>
              )}
              <button
                type="button"
                className={`${s.btn} ${s.btnGhost}`}
                onClick={() =>
                  confirm({
                    title: 'Recompute trust',
                    body: `Recompute the trust tier for ${d.email} from their recent activity?`,
                    confirmLabel: 'Recompute',
                    run: () => admin.recomputeTrust(userId),
                  })
                }
              >
                Recompute trust
              </button>
              <button
                type="button"
                className={`${s.btn} ${s.btnDanger}`}
                onClick={() =>
                  confirm({
                    title: 'Delete user',
                    body: `Permanently delete ${d.email} and ALL their data — comments, calls, likes, saves, and newsletter subscription. This cannot be undone.`,
                    danger: true,
                    confirmLabel: 'Delete forever',
                    closesDrawer: true,
                    run: () => admin.deleteUser(userId).then(() => onClose()),
                  })
                }
              >
                Delete
              </button>
            </div>

            <section className={s.section}>
              <div className={s.sectionHead}>Identity</div>
              <div className={s.kvGrid}>
                <span className={s.kvKey}>User ID</span>
                <span className={`${s.kvVal} ${s.mono}`}>{d.user_id}</span>
                <span className={s.kvKey}>Email</span>
                <span className={s.kvVal}>
                  {d.email ?? '—'}{' '}
                  {d.email_confirmed_at ? (
                    <span className={`${s.pill} ${s.pillOk}`}>verified</span>
                  ) : (
                    <span className={`${s.pill} ${s.pillBad}`}>unverified</span>
                  )}
                </span>
                <span className={s.kvKey}>Providers</span>
                <span className={s.kvVal}>{d.providers.join(', ') || '—'}</span>
                <span className={s.kvKey}>Joined</span>
                <span className={s.kvVal}>{fmtDateTime(d.created_at)}</span>
                <span className={s.kvKey}>Last seen</span>
                <span className={s.kvVal}>
                  {fmtRel(d.last_sign_in_at)}{' '}
                  <span className={s.miniMeta}>({fmtDateTime(d.last_sign_in_at)})</span>
                </span>
                <span className={s.kvKey}>Status</span>
                <span className={s.kvVal}>
                  {d.is_admin && <span className={`${s.pill} ${s.pillAdmin}`}>admin</span>}{' '}
                  {banned ? (
                    <span className={`${s.pill} ${s.pillBad}`}>banned until {fmtDate(d.banned_until)}</span>
                  ) : (
                    <span className={`${s.pill} ${s.pillOk}`}>active</span>
                  )}
                </span>
              </div>
            </section>

            <section className={s.section}>
              <div className={s.sectionHead}>Trust</div>
              <div className={s.kvGrid}>
                <span className={s.kvKey}>Tier</span>
                <span className={s.kvVal}>
                  <span className={s.pill}>{(trust.tier as string) ?? 'reader'}</span>
                </span>
                <span className={s.kvKey}>Streak</span>
                <span className={s.kvVal}>
                  {(trust.current_streak as number) ?? 0} day
                  {((trust.current_streak as number) ?? 0) === 1 ? '' : 's'} (best{' '}
                  {(trust.longest_streak as number) ?? 0})
                </span>
              </div>
              {d.badges.length > 0 && (
                <div className={s.badges}>
                  {d.badges.map((b) => (
                    <span key={b.badge_id} className={s.pill}>
                      {b.badge_id.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className={s.section}>
              <div className={s.sectionHead}>Activity</div>
              <div className={s.statGrid}>
                {Object.entries(d.counts).map(([k, v]) => (
                  <div key={k} className={s.stat}>
                    <div className={`${s.statNum} tnum`}>{v}</div>
                    <div className={s.statLabel}>{k.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            </section>

            {d.subscription && (
              <section className={s.section}>
                <div className={s.sectionHead}>Newsletter</div>
                <div className={s.kvGrid}>
                  <span className={s.kvKey}>Status</span>
                  <span className={s.kvVal}>
                    {d.subscription.subscribed ? (
                      d.subscription.confirmed ? (
                        <span className={`${s.pill} ${s.pillOk}`}>confirmed</span>
                      ) : (
                        <span className={s.pill}>unconfirmed</span>
                      )
                    ) : (
                      <span className={`${s.pill} ${s.pillMute}`}>unsubscribed</span>
                    )}
                  </span>
                  <span className={s.kvKey}>Frequency</span>
                  <span className={s.kvVal}>
                    {d.subscription.frequency}
                    {d.subscription.breaking ? ' · breaking alerts' : ''}
                  </span>
                  <span className={s.kvKey}>Topics</span>
                  <span className={s.kvVal}>
                    {d.subscription.topics.length ? d.subscription.topics.join(', ') : 'all'}
                  </span>
                </div>
              </section>
            )}

            <section className={s.section}>
              <div className={s.sectionHead}>Recent comments</div>
              {d.recent_comments.length === 0 ? (
                <span className={s.miniMeta}>None.</span>
              ) : (
                <div className={s.miniList}>
                  {d.recent_comments.map((c) => (
                    <div key={c.id} className={s.miniRow}>
                      <div>{c.body}</div>
                      <div className={s.miniMeta}>
                        {fmtRel(c.created_at)} · {c.market_id}
                        {c.deleted && ' · hidden'}{' '}
                        <button
                          type="button"
                          className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                          onClick={() =>
                            confirm({
                              title: c.deleted ? 'Unhide comment' : 'Hide comment',
                              body: c.body,
                              confirmLabel: c.deleted ? 'Unhide' : 'Hide',
                              danger: !c.deleted,
                              run: () => admin.setCommentDeleted(c.id, !c.deleted),
                            })
                          }
                        >
                          {c.deleted ? 'Unhide' : 'Hide'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {d.recent_calls.length > 0 && (
              <section className={s.section}>
                <div className={s.sectionHead}>Recent calls</div>
                <div className={s.miniList}>
                  {d.recent_calls.map((c) => (
                    <div key={c.market_id} className={s.miniRow}>
                      <div>
                        {c.pick.toUpperCase()} · {c.confidence}% — {c.target_outcome}
                      </div>
                      <div className={s.miniMeta}>
                        {fmtRel(c.created_at)} · {c.market_id}
                        {c.hidden && ' · hidden'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>

      {confirmEl}
    </Dialog>
  );
}
