/**
 * Ref-counted body-scroll lock so multiple simultaneously-open overlays (e.g. the
 * account sheet with the topic picker opened over it) don't clobber each other's
 * lock: the first locker hides overflow, and it's only restored once the LAST locker
 * releases. Each caller calls lockBodyScroll() on open and the returned fn on close.
 * SSR/no-document safe. (The admin console keeps its own equivalent counter, isolated
 * in its ?admin takeover where these reader modals never coexist with it.)
 */
let locks = 0;
let prevOverflow = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (locks === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks++;
  let released = false;
  return () => {
    if (released) return; // idempotent — a double-release can't under-count
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = prevOverflow;
  };
}
