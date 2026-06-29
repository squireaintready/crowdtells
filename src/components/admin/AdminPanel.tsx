import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { amIAdmin } from '../../lib/admin';
import s from './AdminPanel.module.css';
import { Banner, Loading } from './ui';
import { UsersTab } from './UsersTab';
import { SubscribersTab } from './SubscribersTab';
import { CommentsTab } from './CommentsTab';
import { ModerationTab } from './ModerationTab';
import { AdminsTab } from './AdminsTab';
import { AuditTab } from './AuditTab';
import { OperationsTab } from './OperationsTab';

type TabKey = 'operations' | 'users' | 'subscribers' | 'comments' | 'moderation' | 'admins' | 'audit';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'operations', label: 'Operations' },
  { key: 'users', label: 'Users' },
  { key: 'subscribers', label: 'Subscribers' },
  { key: 'comments', label: 'Comments' },
  { key: 'moderation', label: 'Moderation' },
  { key: 'admins', label: 'Admins' },
  { key: 'audit', label: 'Audit log' },
];

/**
 * The admin console. Mounts when the URL carries ?admin (see App.tsx). The gate here
 * is UX only — every read/action is enforced server-side by is_admin() inside the
 * SECURITY DEFINER rpcs, so a non-admin who forces this open sees nothing actionable.
 */
export default function AdminPanel({ onExit }: { onExit: () => void }) {
  const { user, ready, signInWithGoogle, signInWithEmail, signOut } = useAuth();
  const [access, setAccess] = useState<'checking' | 'yes' | 'no'>('checking');
  const [tab, setTab] = useState<TabKey>('operations');

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setAccess('no');
      return;
    }
    let cancelled = false;
    setAccess('checking');
    amIAdmin()
      .then((ok) => {
        if (!cancelled) setAccess(ok ? 'yes' : 'no');
      })
      .catch(() => {
        if (!cancelled) setAccess('no');
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  // Roving-tabindex arrow-key navigation for the WAI-ARIA tablist.
  const onTabKey = (e: ReactKeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const nextTab = TABS[(idx + delta + TABS.length) % TABS.length]!;
    setTab(nextTab.key);
    document.getElementById(`admintab-${nextTab.key}`)?.focus();
  };

  if (!ready || (user && access === 'checking')) {
    return (
      <div className={s.root}>
        <Loading label="Checking access…" />
      </div>
    );
  }

  if (!user) {
    return (
      <SignInGate
        onExit={onExit}
        onGoogle={signInWithGoogle}
        onEmail={signInWithEmail}
      />
    );
  }

  if (access === 'no') {
    return (
      <div className={s.gate}>
        <div className={s.gateCard}>
          <h1>No admin access</h1>
          <p className="">
            You're signed in as <strong>{user.email}</strong>, but this account isn't an admin.
          </p>
          <div className={s.actions}>
            <button type="button" className={s.btn} onClick={onExit}>
              ← Back to site
            </button>
            <button
              type="button"
              className={`${s.btn} ${s.btnGhost}`}
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        <header className={s.bar}>
          <div className={s.barInner}>
            <span className={s.brand}>
              Crowdtells <span className={s.brandTag}>Admin</span>
            </span>
            <span className={s.barSpacer} />
            <span className={s.who} title={user.email ?? ''}>
              {user.email}
            </span>
            <div className={s.barActions}>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onExit}>
                View site
              </button>
              <button
                type="button"
                className={s.btn}
                onClick={() => {
                  void signOut();
                  onExit();
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>
        <nav className={s.tabsWrap} aria-label="Admin sections">
          <div className={s.tabs} role="tablist" aria-label="Admin sections">
            {TABS.map((t, i) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`admintab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="admin-tabpanel"
                tabIndex={tab === t.key ? 0 : -1}
                className={tab === t.key ? `${s.tab} ${s.tabOn}` : s.tab}
                onClick={() => setTab(t.key)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <main className={s.main} id="admin-tabpanel" role="tabpanel" aria-labelledby={`admintab-${tab}`}>
        {tab === 'operations' && <OperationsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'subscribers' && <SubscribersTab />}
        {tab === 'comments' && <CommentsTab />}
        {tab === 'moderation' && <ModerationTab />}
        {tab === 'admins' && <AdminsTab />}
        {tab === 'audit' && <AuditTab />}
      </main>
    </div>
  );
}

/** Signed-out gate: a minimal sign-in (Google + magic link) before the console loads. */
function SignInGate({
  onExit,
  onGoogle,
  onEmail,
}: {
  onExit: () => void;
  onGoogle: () => void;
  onEmail: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The OAuth/magic-link bounce returns to the homepage (redirectTo has no ?admin), so
  // leave a one-shot breadcrumb that App restores the takeover from on return.
  const rememberReturn = () => {
    try {
      sessionStorage.setItem('ct:returnAdmin', '1');
    } catch {
      /* private mode — the account-menu entry still works after sign-in */
    }
  };
  return (
    <div className={s.gate}>
      <div className={s.gateCard}>
        <h1>
          Crowdtells <span className={s.brandTag}>Admin</span>
        </h1>
        <p>Sign in with your admin account to continue.</p>
        <button
          type="button"
          className={`${s.btn} ${s.btnPrimary}`}
          onClick={() => {
            rememberReturn();
            onGoogle();
          }}
        >
          Continue with Google
        </button>
        {err && <Banner kind="error">{err}</Banner>}
        {sent ? (
          <Banner kind="ok">Check your inbox for a sign-in link.</Banner>
        ) : (
          <form
            className={s.actions}
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              setErr(null);
              rememberReturn();
              void onEmail(email.trim())
                .then(() => setSent(true))
                .catch((ex) => setErr(ex instanceof Error ? ex.message : String(ex)));
            }}
          >
            <input
              className={s.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email for a sign-in link"
            />
            <button type="submit" className={s.btn}>
              Email me a link
            </button>
          </form>
        )}
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onExit}>
          ← Back to site
        </button>
      </div>
    </div>
  );
}
