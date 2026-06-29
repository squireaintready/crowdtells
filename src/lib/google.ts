/**
 * Google Identity Services (GIS) helpers for in-domain sign-in.
 *
 * Using GIS + `signInWithIdToken` keeps the entire Google consent on
 * crowdtells.com — unlike the redirect OAuth flow, which bounces through the
 * Supabase project domain and shows a "continue to <ref>.supabase.co" screen.
 * The client id is public (safe to ship); RLS protects the data.
 */
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisPromise: Promise<void> | null = null;

/** Load the GIS script once; resolves when `window.google` is available. */
export function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GIS failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GIS failed to load'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** A random nonce (raw value goes to Supabase; its SHA-256 goes to Google). */
export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
}

export async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
