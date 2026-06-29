/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** "true" turns on the email newsletter signup (needs Supabase + the
   * subscribers table + the digest sender configured first). */
  readonly VITE_NEWSLETTER_ENABLED?: string;
  /** "true" layers the live Supabase Realtime feed (Model B) over the static
   * first-paint feed.json. Needs the feed_markets/feed_meta tables populated. */
  readonly VITE_REALTIME_FEED?: string;
  /** Optional GA4 override. The production Measurement ID is baked in and reports only
   * from the live host; set this to point at a different property (then it fires on any
   * host), or set it to "" to disable Google Analytics entirely. */
  readonly VITE_GA_ID?: string;
  /** Optional PostHog override. The project key is baked in and only loads from the live
   * host; set this to load PostHog anywhere (e.g. to dogfood analytics locally), or set it
   * to "" to disable PostHog entirely. See src/lib/posthog.ts. */
  readonly VITE_POSTHOG_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Google Identity Services, loaded on demand for the in-domain sign-in flow; plus the
 * GA4 gtag globals (present only once analytics initializes — see src/lib/analytics.ts). */
interface Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
          nonce?: string;
          use_fedcm_for_prompt?: boolean;
          auto_select?: boolean;
        }) => void;
        renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        prompt: () => void;
      };
    };
  };
}
