import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Brand fonts are self-hosted (latin woff2) via @font-face in global.css and
// preloaded in index.html — one pipeline shared with the static /s/ pages, and
// render-priority preloadable (vs. @fontsource's hashed, late-discovered chunks).
import './styles/global.css';
import './styles/accent.css';
import { App } from './App';
import { initAnalytics } from './lib/analytics';
import { initPostHog } from './lib/posthog';
import { getAuthBreadcrumb } from './lib/authBreadcrumb';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

const root = createRoot(container);
// A public profile (?u=) is a standalone destination page — like the static /s/ pages — so it
// mounts here INSTEAD of the full app, lazily (its own chunk, kept off the feed's critical
// path). Everything else is the app. Theme + fonts come from index.html's pre-paint + the css
// imported above, so the profile page is themed without booting the feed.
const params = new URLSearchParams(window.location.search);
const profileId = params.get('u');
// The Standing hub (?standing) is the signed-in reader's OWN full record — also a standalone
// destination (its own lazy chunk), so supabase stays off the eager feed bundle.
const wantsStanding = params.has('standing');
if (profileId) {
  void import('./components/profile/ProfileView').then(({ ProfileView }) =>
    root.render(
      <StrictMode>
        <ProfileView userId={profileId} />
      </StrictMode>,
    ),
  );
} else if (wantsStanding) {
  void import('./components/standing/StandingHub').then(({ StandingHub }) =>
    root.render(
      <StrictMode>
        <StandingHub />
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Standing celebrations — a global toast that pops when the reader earns a badge or levels up,
// wherever they are. Lazy + signed-in-only (gated on the supabase-free auth crumb) so supabase
// never reaches the eager bundle, and deferred so it never competes with first paint.
if (!profileId && !wantsStanding && getAuthBreadcrumb()) {
  setTimeout(() => {
    void import('./components/standing/mountStandingToasts').then((m) => m.mountStandingToasts());
  }, 1500);
}

// Google Analytics — dormant unless VITE_GA_ID is set, deferred to idle, DNT-respecting.
// Kicked off after render so it never competes with first paint (see lib/analytics.ts).
initAnalytics();
// PostHog product analytics — same live-host + DNT gates, idle-deferred, SDK lazy-loaded
// (its own chunk). Behaviour funnels (reading / Calls / comments); see lib/posthog.ts.
initPostHog();
