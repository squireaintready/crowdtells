/**
 * A tiny, dependency-free "the reader may have just earned something" ping. The engagement
 * actions (locking a Call, voting, commenting) call notifyStandingMaybeChanged() right after they
 * write; the standing layer (StandingToasts) subscribes and re-checks. Kept dep-free so the action
 * libs don't pull the standing store (which imports supabase) into their graph.
 */
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function onStandingPing(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

/** Debounced so a burst of actions coalesces into one re-check — and the server-side
 * recompute (which awards the badge) has a beat to run before we read it back. */
export function notifyStandingMaybeChanged(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    for (const cb of subs) cb();
  }, 1200);
}
