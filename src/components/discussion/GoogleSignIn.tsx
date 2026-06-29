import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { googleClientId, loadGis, randomNonce, sha256hex } from '../../lib/google';
import { track } from '../../lib/posthog';
import styles from './Discussion.module.css';

/**
 * Renders Google's in-domain "Sign in with Google" button (GIS) and exchanges
 * the returned ID token with Supabase. Consent stays on crowdtells.com — no
 * redirect through the Supabase project domain. Falls back to the redirect
 * OAuth flow if GIS can't load or sign-in fails, so login never breaks.
 */
export function GoogleSignIn({ fallback }: { fallback: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!googleClientId || !supabase);

  useEffect(() => {
    if (!googleClientId || !supabase) return;
    let cancelled = false;

    void (async () => {
      try {
        await loadGis();
        if (cancelled || !window.google || !ref.current) return;
        const nonce = randomNonce();
        const hashedNonce = await sha256hex(nonce);
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          nonce: hashedNonce,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            track('signin_started', { method: 'google' });
            void supabase!.auth
              .signInWithIdToken({ provider: 'google', token: response.credential, nonce })
              .then(({ error }) => {
                if (error) setFailed(true); // surface the redirect fallback instead
              })
              .catch(() => setFailed(true));
          },
        });
        const dark =
          (document.documentElement.getAttribute('data-theme') || 'light') !== 'light';
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          // Fill the sign-in panel (GIS clamps to 200–400px) so the button matches
          // the full-width email row beneath it instead of an orphaned 240px pill.
          width: Math.min(400, Math.max(240, Math.round(ref.current.offsetWidth) || 240)),
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <>{fallback}</>;
  return <div ref={ref} className={styles.gisButton} />;
}
