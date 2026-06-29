/**
 * PostHog — product analytics for *behaviour* (GA4 + Cloudflare cover traffic).
 * It answers the questions GA4 can't: do readers actually read, do they hesitate
 * before making a Call, do they bail on the comment box. Same privacy contract as
 * analytics.ts, deliberately:
 *
 *  - LIVE-HOST ONLY: the project key is baked in but only loads from crowdtells.com;
 *    local dev, `vite preview`, and *.pages.dev previews never pollute the project.
 *    `VITE_POSTHOG_KEY` overrides the key (then it loads anywhere — e.g. to dogfood
 *    locally); `VITE_POSTHOG_KEY=''` disables PostHog entirely.
 *  - HONORS Do Not Track: with DNT on, PostHog never loads (shares analytics.ts' check).
 *  - DEFERRED to idle, and the SDK itself is a LAZY import() — it lands in its own chunk
 *    so it never weighs on first paint / the main bundle.
 *  - COOKIELESS: persistence is localStorage only, so the only cookie the site sets stays
 *    GA4's `_ga` (see privacy.html). person_profiles:'identified_only' means anonymous
 *    readers create no person profile until they sign in.
 *  - Session replay is masked (every input) and canvas-off (charts aren't re-serialized);
 *    whether it records at all, and at what sample rate, is governed from the PostHog
 *    project dashboard — this only opens the door + the CSP for it.
 *
 * Components never touch posthog-js directly: they call track()/identifyUser()/resetUser(),
 * which are safe no-ops until (and unless) the SDK loads, and queue anything fired in the
 * brief window before it does.
 *
 * Event taxonomy (ids/enums/counts only — never comment/email/PII; the lone exception is
 * the search query, deliberately captured as news-search product signal):
 *   reading     article_opened · article_read_progress · article_completed · article_closed · card_opened
 *   the call    call_widget_viewed · call_started · call_submitted · call_blocked_auth
 *   reactions   like_toggled · claim_vote_submitted · claim_vote_retracted · note_rated · note_unrated · reader_followed
 *   comments    comment_box_viewed · comment_compose_focused · comment_submitted · comment_abandoned ·
 *               comment_reply · comment_edit · comment_reported · comment_blocked_auth
 *   discovery   search_performed · section_changed · category_filtered · feed_load_more
 *   value       article_saved · article_unsaved · article_shared · source_clicked ·
 *               newsletter_prompt_shown · newsletter_signup
 *   identity    signin_started · signin_email_sent · signout · account_exported · account_deleted
 *   personalize personalize_opened · onboarding_opened · interests_saved · theme_changed · intensity_changed
 * Super-properties on EVERY event (register/registerContext): signed_in · returning · theme · reading_intensity.
 */
import type { PostHog } from 'posthog-js';
import { doNotTrack } from './analytics';

// The public (write-only, client-safe) project key. VITE_POSTHOG_KEY overrides it; '' disables.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY ?? 'phc_yMEoAro5dvwJzEwWy3UttwLYpSWY378nfAhbmLEyVght';
const POSTHOG_HOST = 'https://us.i.posthog.com';

type Props = Record<string, unknown>;

let started = false;
let enabled = false;
let ph: PostHog | null = null;
const queue: Array<{ event: string; props?: Props }> = [];
let pendingIdentify: { id: string; props?: Props } | null = null;
let pendingReset = false;
const pendingRegister: Props = {};

/** Fire a behavioural event. No-op until PostHog is enabled + loaded; events fired in
 * the load window are queued and flushed once it is. */
export function track(event: string, props?: Props): void {
  if (!enabled) return;
  if (ph) ph.capture(event, props);
  else queue.push({ event, props });
}

/** Link subsequent events to a signed-in reader (an anonymous reader stays anonymous —
 * person_profiles:'identified_only'). Called from the single auth choke point. */
export function identifyUser(id: string, props?: Props): void {
  if (!enabled) return;
  pendingReset = false;
  if (ph) ph.identify(id, props);
  else pendingIdentify = { id, props };
}

/** Unlink on sign-out so the next reader on a shared device isn't merged into the last. */
export function resetUser(): void {
  if (!enabled) return;
  pendingIdentify = null;
  if (ph) ph.reset();
  else pendingReset = true;
}

/** Attach super-properties to EVERY subsequent event (incl. autocapture) so the whole
 * funnel is segmentable. Persisted in localStorage by posthog; safe before load (queued). */
export function register(props: Props): void {
  if (!enabled) return;
  if (ph) ph.register(props);
  else Object.assign(pendingRegister, props);
}

// `returning` = had this visitor been here before THIS load? Computed once and cached so
// later registerContext() calls (e.g. on sign-in) don't flip it mid-session.
let returningCached: boolean | null = null;
function isReturning(): boolean {
  if (returningCached !== null) return returningCached;
  let r = false;
  try {
    r = localStorage.getItem('ct:seen') === '1';
    localStorage.setItem('ct:seen', '1');
  } catch {
    /* private mode / storage off → treat as new */
  }
  returningCached = r;
  return r;
}

/** Register the signed-in + returning-visitor context every event should carry. Theme and
 * reading intensity are owned separately by their control (ThemeToggle), which registers
 * them on mount + change — one writer per super-property, no racing on the same key. */
export function registerContext(ctx: { signedIn: boolean }): void {
  if (!enabled) return;
  register({
    signed_in: ctx.signedIn,
    returning: isReturning(),
  });
}

/**
 * Bootstrap PostHog once, lazily. No-op unless a key is configured, we're in a real
 * browser on the live host (or an explicit key is set), and DNT is off. The gates run
 * synchronously so track() knows immediately whether it's live; only the SDK load is
 * deferred to idle.
 */
export function initPostHog(): void {
  if (started) return;
  started = true;
  if (!POSTHOG_KEY) return; // VITE_POSTHOG_KEY='' disables PostHog entirely
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Live-host only unless an explicit key is set (mirrors analytics.ts).
  if (!import.meta.env.VITE_POSTHOG_KEY && !window.location.hostname.endsWith('crowdtells.com')) return;
  if (doNotTrack()) return;
  enabled = true;

  const boot = () => {
    void import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          ui_host: 'https://us.posthog.com',
          // Anonymous readers create no person profile until they sign in.
          person_profiles: 'identified_only',
          // Cookieless: keep GA4's `_ga` the only cookie the site sets.
          persistence: 'localStorage',
          // SPA route changes (each article open/close pushes history) become pageviews.
          capture_pageview: 'history_change',
          capture_pageleave: true,
          // Hybrid capture: broad autocapture + heatmaps under the named funnel events.
          autocapture: true,
          enable_heatmaps: true,
          // Autocapture records element metadata, not values — but its default DOES send
          // each clicked element's textContent ($el_text), which on a whole-card click is
          // the headline. We disclaim collecting page text in privacy.html, and every
          // funnel already has explicit enum/id events, so strip element text + attributes.
          // (Heatmaps key on position/selector, so they're unaffected.)
          mask_all_text: true,
          mask_all_element_attributes: true,
          // Defense-in-depth: also opt out at the SDK layer if DNT is set.
          respect_dnt: true,
          // Replay is opened here; the dashboard governs whether/how much it records.
          disable_session_recording: false,
          // Canvas recording is off by default — we keep it off so the SVG/canvas charts
          // aren't re-serialized frame-by-frame (perf). Inputs are always masked.
          session_recording: {
            maskAllInputs: true, // never capture what's typed (comments, email, auth)
            recordCrossOriginIframes: false,
          },
          loaded: () => {
            ph = posthog;
            // Expose the instance so the PostHog toolbar / heatmap visual editor can attach
            // (module imports don't set this global the way the snippet does).
            (window as Window & { posthog?: PostHog }).posthog = posthog;
            if (pendingReset) {
              posthog.reset();
              pendingReset = false;
            }
            if (pendingIdentify) {
              posthog.identify(pendingIdentify.id, pendingIdentify.props);
              pendingIdentify = null;
            }
            if (Object.keys(pendingRegister).length) {
              posthog.register(pendingRegister);
              for (const k of Object.keys(pendingRegister)) delete pendingRegister[k];
            }
            for (const q of queue) posthog.capture(q.event, q.props);
            queue.length = 0;
          },
        });
      })
      .catch(() => {
        // Network blocked / jsdom / SDK chunk failed — analytics is strictly best-effort.
      });
  };

  // Defer to idle so the SDK never competes with first paint; timeout fallback for Safari.
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (ric) ric(boot);
  else window.setTimeout(boot, 1500);
}
