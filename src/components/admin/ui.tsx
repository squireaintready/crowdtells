import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import s from './AdminPanel.module.css';
import { initial } from './format';

/** A small round avatar with an initial fallback (no broken-image flash). */
export function Avatar({
  src,
  name,
  email,
}: {
  src?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  if (src) return <img className={s.avatar} src={src} alt="" loading="lazy" />;
  return (
    <span className={s.avatarFallback} aria-hidden="true">
      {initial(name, email)}
    </span>
  );
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  const cls = kind === 'error' ? `${s.banner} ${s.bannerErr}` : kind === 'ok' ? `${s.banner} ${s.bannerOk}` : s.banner;
  return (
    <div className={cls} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={s.loading} aria-busy="true">
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>;
}

/** A sortable column header. Clicking toggles asc/desc on its own column. */
export function SortableTh<C extends string>({
  label,
  col,
  sort,
  dir,
  onSort,
  numeric,
  className,
}: {
  label: string;
  col: C;
  sort: C;
  dir: 'asc' | 'desc';
  onSort: (col: C) => void;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort === col;
  return (
    <th className={[numeric ? s.num : '', className ?? ''].join(' ')} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={s.sortBtn} onClick={() => onSort(col)}>
        {label}
        {active && <span className={s.sortArrow} aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}

/** Prev/next pager with a "x–y of N" readout. Hidden when a single page. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className={s.pager}>
      <span className="tnum">
        {from}–{to} of {total}
      </span>
      <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => onPage(page - 1)} disabled={page <= 0}>
        ‹ Prev
      </button>
      <span className="tnum">
        {page + 1}/{pages}
      </span>
      <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => onPage(page + 1)} disabled={page + 1 >= pages}>
        Next ›
      </button>
    </div>
  );
}

/** A provider badge (Gemini / NVIDIA / Groq), styled per provider. Shared by the
 * Operations + AI-usage consoles so a new provider is coloured consistently in both. */
export function ProviderPill({ provider }: { provider: string }) {
  const tone = provider === 'gemini' ? s.provGem : provider === 'nvidia' ? s.provNvidia : s.provGroq;
  return <span className={`${s.pill} ${tone}`}>{provider}</span>;
}

/** A tiny inline trend line (oldest → newest, left → right). Pure SVG, theme-aware
 * via `currentColor`. Renders an empty frame until there are ≥2 points to connect. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 132;
  const h = 30;
  const pad = 3;
  if (values.length < 2) {
    return <svg className={s.spark} width={w} height={h} role="img" aria-label={`${label}: no trend yet`} />;
  }
  const max = Math.max(...values, 1);
  const x = (i: number): number => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v: number): number => h - pad - (v / max) * (h - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastValue = values[values.length - 1] ?? 0;
  return (
    <svg
      className={s.spark}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: trend over ${values.length} runs, latest ${lastValue.toLocaleString()}`}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(values.length - 1).toFixed(1)} cy={y(lastValue).toFixed(1)} r="2.2" fill="currentColor" />
    </svg>
  );
}

/** A labelled sparkline card: the metric name, its latest value, and the trend. */
export function Trend({ label, values, fmt }: { label: string; values: number[]; fmt: (n: number) => string }) {
  return (
    <div className={s.trendItem}>
      <div className={s.trendHead}>
        <span className={s.statLabel}>{label}</span>
        <span className={s.trendNow}>{fmt(values[values.length - 1] ?? 0)}</span>
      </div>
      <Sparkline values={values} label={label} />
    </div>
  );
}

/** A single stat card: a small label, a big mono value (red when `warn`), and an optional sub-line.
 * Shared by the Operations + AI-usage consoles. */
export function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={s.statCard}>
      <div className={s.statLabel}>{label}</div>
      <div className={`${s.statValue} ${warn ? s.warnNum : ''}`}>{value}</div>
      {sub ? <div className={s.statSub}>{sub}</div> : null}
    </div>
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// A tiny stack so nested dialogs (e.g. a confirm over the user drawer) cooperate:
// only the TOP-most open dialog reacts to Escape/Tab, and body scroll is locked while
// any dialog is open. Strict LIFO nesting, which is all the console produces.
let openDialogs = 0;
function pushDialog(): number {
  openDialogs += 1;
  if (openDialogs === 1) document.body.style.overflow = 'hidden';
  return openDialogs;
}
function popDialog(): void {
  openDialogs = Math.max(0, openDialogs - 1);
  if (openDialogs === 0) document.body.style.overflow = '';
}

/**
 * An accessible modal / right-drawer: role=dialog + aria-modal, Escape to close,
 * backdrop-click to close, initial focus moved inside, and a Tab focus trap. Restores
 * focus to the previously-focused element on unmount. Stacks cleanly when nested.
 */
export function Dialog({
  title,
  onClose,
  children,
  variant = 'modal',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  variant?: 'modal' | 'drawer';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const depth = pushDialog();
    restoreRef.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // Move focus inside (first focusable, else the container itself).
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (depth !== openDialogs) return; // only the top-most dialog reacts
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      popDialog();
      restoreRef.current?.focus?.();
    };
  }, []);

  const isDrawer = variant === 'drawer';
  return (
    <div
      className={isDrawer ? s.backdrop : `${s.backdrop} ${s.backdropCenter}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={isDrawer ? s.drawer : s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {isDrawer ? (
          <>
            <div className={s.drawerHead}>
              <div className={s.drawerTitle}>
                <span id={titleId} className={s.drawerName}>
                  {title}
                </span>
              </div>
              <span style={{ flex: 1 }} />
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>
            {children}
          </>
        ) : (
          <>
            <h2 id={titleId}>{title}</h2>
            {children}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A confirm modal that owns the async action's busy/error state. onConfirm runs the
 * mutation; on success onDone fires (the caller closes + reloads); on failure the
 * error shows inline and the dialog stays open to retry.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
  onDone,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog title={title} onClose={busy ? () => {} : onClose} variant="modal">
      <div className={s.dialogText}>{body}</div>
      {err && <Banner kind="error">{err}</Banner>}
      <div className={s.dialogActions}>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? `${s.btn} ${s.btnDanger}` : `${s.btn} ${s.btnPrimary}`}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setErr(null);
            onConfirm()
              .then(() => {
                setBusy(false);
                onDone();
              })
              .catch((e) => {
                setBusy(false);
                setErr(e instanceof Error ? e.message : String(e));
              });
          }}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
