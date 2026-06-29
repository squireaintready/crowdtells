import { createRoot } from 'react-dom/client';
import { StandingToasts } from './StandingToasts';

let mounted = false;

/** Boot the global standing-toast overlay on its own React root (lazily imported from main.tsx for
 * signed-in readers, so supabase never reaches the eager bundle). Idempotent. */
export function mountStandingToasts(): void {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  const host = document.createElement('div');
  host.id = 'ct-standing-toasts';
  document.body.appendChild(host);
  createRoot(host).render(<StandingToasts />);
}
