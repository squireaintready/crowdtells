/**
 * Google Analytics 4 — a deliberately small, opt-in bootstrap.
 *
 *  - LIVE-HOST ONLY: the production Measurement ID is baked in, but it only reports from
 *    crowdtells.com — local dev, `vite preview`, and Cloudflare *.pages.dev preview deploys
 *    never pollute the property. `VITE_GA_ID` overrides the id (e.g. a staging property, and
 *    then it fires anywhere); `VITE_GA_ID=''` disables analytics entirely.
 *  - HONORS Do Not Track: if the reader's browser sends DNT, GA is skipped entirely.
 *    (Cloudflare Web Analytics — cookieless — still covers aggregate traffic.)
 *  - DEFERRED to idle so the tag never competes with first paint / LCP.
 *  - No INLINE script: the enforced CSP has no 'unsafe-inline' for scripts, so gtag.js
 *    is injected as an external <script> from the allowlisted googletagmanager.com, and
 *    the gtag stub lives here in the bundle (not an inline <script> needing a hash).
 *
 * SPA page-views are tracked by GA4's Enhanced Measurement ("page changes based on
 * browser history events", on by default), which catches the app's pushState article
 * navigations — so this module only has to bootstrap gtag, not fire page-views itself.
 */

// The live GA4 id (public — it appears in the page source of any GA-instrumented site).
// VITE_GA_ID overrides it; '' disables. It only fires on the production host (see below).
const GA_ID = import.meta.env.VITE_GA_ID ?? 'G-RM0SKB22G9';

/** True when the reader has asked not to be tracked (any of the DNT signals).
 * Exported so the PostHog bootstrap honors the exact same opt-out (see lib/posthog.ts). */
export function doNotTrack(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = typeof window !== 'undefined' ? (window as Window & { doNotTrack?: string }) : undefined;
  const signal = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return signal === '1' || signal === 'yes';
}

let started = false;

/**
 * Bootstrap GA4 once, lazily. No-op unless a Measurement ID is configured, we're in a
 * real browser, and the reader hasn't opted out via Do Not Track.
 */
export function initAnalytics(): void {
  if (started) return;
  if (!GA_ID) return; // VITE_GA_ID='' disables analytics entirely
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Only the live site reports — so local dev, `vite preview`, and Cloudflare *.pages.dev
  // preview deploys don't pollute the property. An explicit VITE_GA_ID (e.g. a staging
  // property) bypasses this and fires anywhere.
  if (!import.meta.env.VITE_GA_ID && !window.location.hostname.endsWith('crowdtells.com')) return;
  if (doNotTrack()) return;
  started = true;

  const boot = () => {
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(tag);

    window.dataLayer = window.dataLayer || [];
    // GA/GTM recognizes the native `arguments` object as a gtag command (a plain array
    // would be treated as a generic dataLayer event), so push it verbatim — this is the
    // canonical gtag stub.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  };

  // Defer to idle so the tag never blocks first paint; fall back to a timeout where
  // requestIdleCallback isn't available (Safari).
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (ric) ric(boot);
  else window.setTimeout(boot, 1500);
}
