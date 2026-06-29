/** Small, pure display helpers for the admin tables (no React → fast-refresh clean). */

const DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
const DATETIME: Intl.DateTimeFormatOptions = { ...DATE, hour: '2-digit', minute: '2-digit' };

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, DATE);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, DATETIME);
}

/** Compact relative time, e.g. "3d ago", "just now", "in 2mo" (future). */
export function fmtRel(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = d.getTime() - Date.now();
  const past = diff <= 0;
  const s = Math.abs(diff) / 1000;
  const units: [number, string][] = [
    [60, 's'],
    [3600, 'm'],
    [86400, 'h'],
    [2592000, 'd'],
    [31536000, 'mo'],
    [Infinity, 'y'],
  ];
  let n = s;
  let label = 's';
  let prev = 1;
  for (const [limit, u] of units) {
    if (s < limit) {
      n = Math.floor(s / prev);
      label = u;
      break;
    }
    prev = limit;
  }
  if (label === 's' && n < 5) return 'just now';
  return past ? `${n}${label} ago` : `in ${n}${label}`;
}

/** A user is banned only while banned_until is in the future. */
export function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const d = new Date(bannedUntil);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

/** First letter for an avatar fallback. */
export function initial(name: string | null | undefined, email?: string | null): string {
  const src = (name || email || '?').trim();
  return (src[0] || '?').toUpperCase();
}

/** Best label for a user with no display name. */
export function displayName(name: string | null | undefined, email?: string | null): string {
  return name || email?.split('@')[0] || 'Member';
}
