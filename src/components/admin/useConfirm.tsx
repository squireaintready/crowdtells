import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ui';

/** The shape of a pending confirm action (title/body + the async mutation to run). */
export interface Confirmable {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  run: () => Promise<void>;
}

/**
 * Owns the confirm-modal state the admin tabs all repeated: `confirm(p)` opens the
 * ConfirmDialog for a pending action; on success it closes and calls `onConfirmed`
 * with that action (so a caller can branch on its own extra fields, e.g. a drawer
 * that closed). Render `confirmEl` once in the tree. Generic over P so a caller can
 * extend Confirmable. Kept in its own module (not ui.tsx) so ui.tsx stays a
 * components-only file for React Fast Refresh.
 */
export function useConfirm<P extends Confirmable>(onConfirmed: (p: P) => void): {
  confirm: (p: P) => void;
  confirmEl: ReactNode;
} {
  const [pending, setPending] = useState<P | null>(null);
  const confirmEl = pending ? (
    <ConfirmDialog
      title={pending.title}
      body={pending.body}
      danger={pending.danger}
      confirmLabel={pending.confirmLabel}
      onConfirm={pending.run}
      onClose={() => setPending(null)}
      onDone={() => {
        const p = pending;
        setPending(null);
        onConfirmed(p);
      }}
    />
  ) : null;
  return { confirm: setPending, confirmEl };
}
