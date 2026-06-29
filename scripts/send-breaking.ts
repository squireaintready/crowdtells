/**
 * Crowdtells — breaking-news email alerts.
 *
 * Reads the published feed (the same stable `feed.json` the digest reads),
 * detects the handful of genuinely alert-worthy events since the last run — a
 * briefed market that just RESOLVED, a big 24h odds SWING on a liquid market, or
 * a fresh corroborated DEVELOPING news cluster pinned to a market — and emails
 * the subscribers who opted into breaking alerts. Each candidate is claimed in a
 * durable Supabase ledger BEFORE sending, so the same event never alerts twice
 * even though the sender runs on a frequent schedule (at-most-once by design —
 * we would rather miss a rare infra-failure alert than ever spam).
 *
 * Decoupled from the content pipeline: it reads only the published feed contract
 * (Market + an optional developing-cluster array), so it neither depends on nor
 * collides with how those clusters are produced. `--dry-run` builds + logs the
 * candidates without sending, claiming, or needing a Mailgun key.
 *
 * Safe to run before setup: if Mailgun / Supabase aren't configured it logs and
 * exits 0, and if the dedup table isn't migrated it skips cleanly — so a
 * scheduled run can't fail (or alert ops) until the owner is ready.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Feed, Market } from '../src/lib/types';
import { storySlug } from '../src/lib/storyPath';
import { isSportsCategory } from './lib/category';
import { isUnprovisionedError } from './send-confirmations';
import { mailButton } from './lib/mailButton';
import { mailingAddress, replyToAddress, setListUnsubHeaders } from './lib/mailMeta';

type Kind = 'resolved' | 'final' | 'developing' | 'swing';

/** A genuinely alert-worthy event detected in the feed (pure, rankable). */
export interface BreakingEvent {
  marketId: string;
  kind: Kind;
  /** Stable dedup key — claimed once in the ledger, then never re-alerted. */
  eventKey: string;
  category: string;
  /** Higher = more alert-worthy; used to pick the top few per run. */
  priority: number;
  /** Email headline (the news, not the market question). */
  headline: string;
  /** One-line context: the outcome, the swung odds, or the corroboration. */
  detail: string;
  /** Story slug for the read-more link. */
  slug: string;
}

/** A confirmed breaking-alert subscriber + their topic filter and opt-out token. */
export interface BreakingSubscriber {
  email: string;
  topics: string[];
  unsubscribeToken?: string;
}

/**
 * The fields we read off a pinned developing-news cluster. Defined locally (a
 * structural subset of the feed's BreakingItem) so this sender stays decoupled
 * from how the developing layer evolves — an absent/renamed cluster shape simply
 * yields no developing alerts rather than a crash.
 */
interface DevelopingCluster {
  title?: unknown;
  outlets?: unknown;
  firstSeen?: unknown;
  lastSeen?: unknown;
}

/** The fields we read off a pinned real-world event (a structural subset of the
 * feed's EventItem) — defensively typed so an evolving events layer can't crash
 * this sender. A just-`final` event mapped to a market is a breaking trigger. */
interface PinnedEvent {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  detail?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  /** Coarse kind from the events layer ('sports' | 'esports' | 'economic' | …) — the
   * only reliable sports signal when a match is mapped to a non-sports market and the
   * title carries no sport keyword (e.g. "Saudi Arabia at Spain"). */
  kind?: unknown;
}

// Detection thresholds — deliberately high so an alert always means something.
const SWING_PTS = 20; // a ≥20-point favored-odds move in 24h is a real shift
const SWING_MIN_VOLUME = 250_000; // …only on a liquid market (USD 24h volume)
const RESOLVE_LOOKBACK_HOURS = 48; // alert recent resolutions only (no backlog flood)
const RESOLVE_MIN_VOLUME = 5_000_000; // …only a market that carried serious money (drops novelty/prop markets)
const DEVELOPING_FRESH_HOURS = 6; // a cluster is "breaking" only while fresh
const DEVELOPING_MIN_OUTLETS = 3; // …and well-corroborated (push bar > the feed's ≥2)
const FINAL_FRESH_HOURS = 12; // a just-finished event is "breaking" only while fresh
const MAX_EVENTS_PER_RUN = 3; // throttle: never blast more than a few per run

// Which detected kinds actually warrant an EMAIL. The digest (daily/weekly) is the
// DEFAULT channel; only a genuinely major, SETTLED event — a high-volume market
// resolving — is worth interrupting an inbox. Live "developing" news and routine odds
// "swings" are the firehose (they stay in the feed / developing rail / digest), and
// 'final' real-world events are deliberately NOT emailed either: a non-sports 'final'
// carries no usable body line (its detail is a bare source name or the "Final"
// placeholder, both suppressed), so the alert is little more than a headline — which
// both reads as "not breaking enough" AND collapses to a near-empty card in Gmail,
// which trims the shared header/footer chrome as already-seen content and leaves almost
// nothing visible (the "blank email" symptom). Detection of every kind is unchanged
// (the feed + tests still see them); this only gates mail.
const EMAIL_KINDS: ReadonlySet<Kind> = new Set<Kind>(['resolved']);

/**
 * Master switch for breaking-alert EMAIL. OFF for now — the product emails ONLY the
 * daily and weekly digests (scripts/send-digest.ts). Breaking alerts are paused until
 * they clear a higher "genuinely interrupt-the-inbox" bar. Detection still runs (the
 * feed's Developing rail + the unit tests are unaffected) — this gates only the SEND.
 * Re-enable by flipping this to true (and setting the repo variable
 * BREAKING_ALERTS_ENABLED=true). We deliberately do NOT claim events while paused, so a
 * genuinely major one can still alert exactly once when breaking is turned back on.
 */
const SEND_BREAKING_EMAILS = false;

/**
 * Routine sports/competition outcomes are NOT push-alert material — the product
 * editorially demotes the sports family (it lives in the feed + scoreboard, not in
 * your inbox), and on a busy day every World-Cup group match would otherwise blast
 * an alert. We exclude the whole family from breaking alerts; checking the hook too
 * catches markets the source mislabels (e.g. a "Games" category whose hook is a
 * World Cup match). Tune here if you ever want major finals to alert.
 */
function isRoutineSports(m: Market): boolean {
  return isSportsCategory(m.category) || isSportsCategory(m.hook || '');
}

/**
 * A resolution outcome that is just a number / range / measurement — "200-219",
 * "$52,000", "70°", "65-89" — signals a quantity-novelty market (tweet counts,
 * price ticks, daily temperatures), NOT "did X happen" news. Real events settle to
 * a CATEGORICAL outcome ("Yes", "No", "Fed maintains rate", "Above 3.25%"), which
 * always contains a word (≥2 consecutive letters). So an outcome with no word is
 * the novelty tell — we don't push-alert those. Range connectors ("to"/"and")
 * don't count as a word, so "75° to 76°" is still caught.
 */
function isNoveltyOutcome(outcome: string): boolean {
  const letters = outcome.replace(/\b(?:to|and|or)\b/gi, '').replace(/[^a-z]/gi, '');
  return letters.length < 2;
}

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Whether we wrote a briefing for this market (the bar for "worth alerting"). */
function isBriefed(m: Market): boolean {
  return !!m.generatedAt && !!m.hook;
}

/** Hours between an ISO timestamp and now; Infinity if absent/unparseable. */
function hoursSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : (nowMs - t) / 3_600_000;
}

/** Stable, content-derived id (djb2 → base36) for an event's dedup key. */
function contentHash(s: string): string {
  const norm = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * The freshest pinned developing cluster on a market, if any is still fresh.
 * `key` is a hash of the normalized HEADLINE, not firstSeen: the upstream
 * clusterer recomputes firstSeen as the min(seenAt) of current members, so it can
 * shift run-to-run (a known prior bug) and would re-alert the same story — the
 * headline is the stabler identity within the short freshness window.
 */
function freshCluster(m: Market, nowMs: number): { title: string; outlets: number; key: string } | null {
  const raw = (m as { breaking?: unknown }).breaking;
  if (!Array.isArray(raw)) return null;
  let best: { title: string; outlets: number; key: string; ageH: number } | null = null;
  for (const item of raw as DevelopingCluster[]) {
    const outlets = Array.isArray(item.outlets) ? item.outlets.filter((o) => typeof o === 'string').length : 0;
    if (outlets < DEVELOPING_MIN_OUTLETS) continue; // corroboration floor (independent publishers)
    const firstSeen = typeof item.firstSeen === 'string' ? item.firstSeen : '';
    const lastSeen = typeof item.lastSeen === 'string' ? item.lastSeen : firstSeen;
    const ageH = hoursSince(lastSeen || firstSeen, nowMs);
    if (ageH > DEVELOPING_FRESH_HOURS) continue;
    const title = typeof item.title === 'string' ? item.title : '';
    if (!title || isSportsCategory(title)) continue; // a cluster's content can be sporty even on a non-sports market
    if (!best || ageH < best.ageH) best = { title, outlets, key: contentHash(title), ageH };
  }
  return best && { title: best.title, outlets: best.outlets, key: best.key };
}

/** The most-recently-finished real-world event pinned to a market, if one just
 * went final (e.g. a game ended, a jobs report dropped) — a breaking trigger. */
function finalEvent(m: Market, nowMs: number): { id: string; title: string; detail: string } | null {
  const raw = (m as { events?: unknown }).events;
  if (!Array.isArray(raw)) return null;
  let best: { id: string; title: string; detail: string; ageH: number } | null = null;
  for (const e of raw as PinnedEvent[]) {
    if (e.status !== 'final') continue;
    // Routine competition results never push-alert — even when the events layer maps a
    // match to a non-sports market (a soccer "FT" mis-pinned to "Culture"), where the
    // market-level sports guard and the keyword-less title both miss it. The event's own
    // kind is the reliable tell.
    if (e.kind === 'sports' || e.kind === 'esports') continue;
    const id = typeof e.id === 'string' ? e.id : '';
    const title = typeof e.title === 'string' ? e.title : '';
    if (!id || !title) continue;
    const endTime = typeof e.endTime === 'string' ? e.endTime : '';
    const startTime = typeof e.startTime === 'string' ? e.startTime : '';
    const ageH = hoursSince(endTime || startTime, nowMs);
    if (ageH > FINAL_FRESH_HOURS) continue;
    const detail = typeof e.detail === 'string' && e.detail ? e.detail : 'Final';
    if (!best || ageH < best.ageH) best = { id, title, detail, ageH };
  }
  return best && { id: best.id, title: best.title, detail: best.detail };
}

/**
 * Detect the alert-worthy events in the feed, ranked best-first. Pure →
 * unit-testable. A market can produce at most one event (its strongest), and
 * resolutions/developing news outrank market swings. Returns the FULL ranked list
 * by default; the per-run throttle is applied downstream in main() AFTER dedup
 * (so a fresher event can't permanently starve a slightly-lower-priority real one
 * — they alternate in over successive runs as claimed events age out). `limit` is
 * an optional safety cap, used mainly by tests.
 */
export function detectBreakingEvents(feed: Feed, nowMs: number, limit = Infinity): BreakingEvent[] {
  const events: BreakingEvent[] = [];

  for (const m of feed.markets) {
    // Routine sports/competition outcomes never push-alert (they live in the feed).
    if (isRoutineSports(m)) continue;

    // Resolved: a briefed, high-volume market has just settled — definitive news.
    // The volume floor drops the long tail of low-stakes/novelty markets (daily
    // weather, micro-props) so only a resolution that carried real money alerts.
    if (
      m.status === 'resolved' &&
      m.resolvedOutcome &&
      !isNoveltyOutcome(m.resolvedOutcome) &&
      isBriefed(m) &&
      m.volume >= RESOLVE_MIN_VOLUME &&
      hoursSince(m.resolvedAt, nowMs) <= RESOLVE_LOOKBACK_HOURS
    ) {
      events.push({
        marketId: m.id,
        kind: 'resolved',
        // Key on the headline, so several markets settling the same real event
        // (e.g. two "Fed holds rates steady" markets with different outcome labels)
        // collapse to a single alert.
        eventKey: `resolved:${contentHash(m.hook || m.title)}`,
        category: m.category,
        priority: 3_000 + (m.score || 0),
        headline: m.hook || m.title,
        detail: `Resolved ${m.resolvedOutcome}`,
        slug: storySlug(m.id),
      });
      continue;
    }

    // Developing: a fresh, corroborated news cluster pinned to a briefed market.
    if (m.status === 'active' && isBriefed(m)) {
      const c = freshCluster(m, nowMs);
      if (c) {
        events.push({
          marketId: m.id,
          kind: 'developing',
          // Key on the cluster CONTENT, not the market — the same corroborated
          // story is often pinned to several markets, and a subscriber should get
          // ONE alert for it (the highest-priority market wins after dedup).
          eventKey: `developing:${c.key}`,
          category: m.category,
          priority: 2_000 + c.outlets,
          headline: c.title,
          detail: `Developing · ${c.outlets} outlets corroborating`,
          slug: storySlug(m.id),
        });
        continue;
      }
    }

    // Final: a real-world event mapped to a briefed market just finished — the
    // result is in, ahead of the market formally settling.
    if (m.status === 'active' && isBriefed(m)) {
      const e = finalEvent(m, nowMs);
      if (e) {
        events.push({
          marketId: m.id,
          kind: 'final',
          // Key on the globally-unique event id (e.g. "espn:401…"), not the
          // market, so one real-world event mapped to several markets alerts once.
          eventKey: `final:${e.id}`,
          category: m.category,
          priority: 1_500,
          headline: e.title,
          detail: e.detail,
          slug: storySlug(m.id),
        });
        continue;
      }
    }

    // Swing: a big 24h favored-odds move on a liquid, briefed market.
    if (m.status === 'active' && isBriefed(m)) {
      const mv = m.movement24h;
      if (mv != null && Math.abs(mv) >= SWING_PTS && m.volume24h >= SWING_MIN_VOLUME) {
        const arrow = mv > 0 ? '▲' : '▼';
        events.push({
          marketId: m.id,
          kind: 'swing',
          // Key by leading outcome: a continuing move toward the same side won't
          // re-alert, but a flip to the other side (genuinely new) will.
          eventKey: `swing:${m.id}:${m.favored}`,
          category: m.category,
          priority: 1_000 + Math.abs(mv),
          headline: m.hook || m.title,
          detail: `${m.favored} ${Math.round(m.oddsPct)}% (${arrow}${Math.abs(mv).toFixed(0)} pts in 24h)`,
          slug: storySlug(m.id),
        });
      }
    }
  }

  // Rank, then collapse duplicate event_keys (the same story pinned to several
  // markets) keeping the highest-priority one, so a subscriber gets ONE alert per
  // real event. The downstream claim also dedupes across runs; this keeps a single
  // run clean (and the dry-run preview honest).
  const seen = new Set<string>();
  const deduped: BreakingEvent[] = [];
  for (const e of events.sort((a, b) => b.priority - a.priority)) {
    if (seen.has(e.eventKey)) continue;
    seen.add(e.eventKey);
    deduped.push(e);
  }
  return deduped.slice(0, limit);
}

/** Keep only the subscribers whose topic filter admits this event's category. */
export function recipientsForEvent(subs: BreakingSubscriber[], category: string): BreakingSubscriber[] {
  return subs.filter((s) => !s.topics || s.topics.length === 0 || s.topics.includes(category));
}

const KIND_LABEL: Record<Kind, string> = {
  resolved: 'Resolved',
  final: 'Final',
  developing: 'Developing',
  swing: 'Breaking',
};

/** Render one breaking-alert email (pure → unit-testable). */
export function buildBreakingEmail(
  ev: BreakingEvent,
  opts: { siteUrl: string; unsubscribeUrl: string },
  market?: Market,
): { subject: string; html: string; text: string } {
  const site = opts.siteUrl.replace(/\/$/, '');
  const url = `${site}/s/${ev.slug}`;
  const tag = KIND_LABEL[ev.kind];
  const subject = `${tag}: ${ev.headline}`;
  const unsub = opts.unsubscribeUrl;

  const addr = mailingAddress();
  // A 'resolved' alert's headline IS the market's own hook, so its standfirst (dek)
  // and precedents stay coherent — enrich it. A 'final' alert's headline is the EVENT
  // (which can be pinned to a market about something else), so do NOT graft the
  // market's dek/precedents onto it — they'd mismatch the headline. And show only a
  // real, multi-word detail: the events layer sometimes puts a bare SOURCE name
  // ("Wikipedia") or the redundant "Final" placeholder in ev.detail — skip those.
  const coherent = ev.kind === 'resolved';
  const detail = ev.detail.trim();
  const showDetail = detail.includes(' ');
  const dek = coherent && market?.dek?.trim() ? market.dek.trim() : '';
  const pointers = coherent ? (market?.precedents ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 3) : [];
  const pointersHtml = pointers.length
    ? `<div style="margin-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6f695e;">Worth knowing</div>
          <ul style="margin:9px 0 0;padding-left:18px;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#54504a;line-height:1.6;">
            ${pointers.map((p) => `<li style="margin:0 0 5px;">${esc(p)}</li>`).join('')}
          </ul>
          <div style="margin-top:7px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a9488;">Context compiled by AI from public record.</div>`
    : '';
  // Inbox preview: the standfirst, else a real detail, else the headline (never a bare source).
  const preheader = esc(dek || (showDetail ? detail : '') || ev.headline);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#fbfaf7;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf7;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;border-radius:8px;">
        <tr><td style="padding:26px 30px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#6f695e;" align="left">${esc(tag)} · ${esc(ev.category)}</td>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#27496d;" align="right">The crowd tells it first</td>
            </tr>
          </table>
          <div style="margin-top:10px;">
            <a href="${site}/" style="text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#1a1813;letter-spacing:-0.01em;">Crowdtells</a>
          </div>
        </td></tr>
        <tr><td style="padding:18px 30px 0;"><div style="border-top:1px solid #e7e2d8;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
        <tr><td style="padding:18px 30px 4px;">
          <a href="${url}" style="text-decoration:none;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.15;font-weight:600;color:#1a1813;">${esc(ev.headline)}</div>
          </a>
          ${showDetail ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6f695e;line-height:1.5;margin-top:11px;"><strong style="color:#27496d;font-weight:700;">${esc(detail)}</strong></div>` : ''}
          ${dek ? `<div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#54504a;line-height:1.6;margin-top:11px;">${esc(dek)}</div>` : ''}
          ${pointersHtml}
        </td></tr>
        <tr><td style="padding:20px 30px 28px;">
          ${mailButton(url, 'Read the full briefing')}
        </td></tr>
        <tr><td style="padding:20px 30px 24px;border-top:1px solid #e7e2d8;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6f695e;line-height:1.6;text-align:center;">
          You're getting this because you opted into breaking alerts at crowdtells.com. Odds are crowd probabilities — information, not advice.<br>
          <a href="${unsub}" style="color:#6f695e;text-decoration:underline;">Unsubscribe</a>${addr ? `<br><span style="color:#9a9488;">${esc(addr)}</span>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Crowdtells — ${tag}\n\n` +
    `${ev.headline}${showDetail ? `\n${detail}` : ''}\n\n` +
    (dek ? `${dek}\n\n` : '') +
    (pointers.length ? `Worth knowing (AI-compiled from public record):\n${pointers.map((p) => `• ${p}`).join('\n')}\n\n` : '') +
    `Read the full briefing: ${url}\n\n` +
    `You opted into breaking alerts at crowdtells.com.\nUnsubscribe: ${unsub}` +
    (addr ? `\n${addr}` : '');

  return { subject, html, text };
}

/** Confirmed, still-subscribed recipients who opted into breaking alerts. The
 * unsubscribe token is required (first-party opt-out); an unmigrated column makes
 * the whole run skip via isUnprovisionedError. */
async function fetchBreakingSubscribers(
  supabaseUrl: string,
  serviceKey: string,
): Promise<BreakingSubscriber[]> {
  const url =
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/subscribers` +
    `?unsubscribed_at=is.null&confirmed_at=not.is.null&breaking=is.true` +
    `&select=email,topics,unsubscribe_token`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`Supabase breaking subscribers fetch failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { email: string; topics: string[] | null; unsubscribe_token?: string }[];
  return rows
    .filter((r) => r.email)
    .map((r) => ({
      email: r.email,
      topics: Array.isArray(r.topics) ? r.topics : [],
      unsubscribeToken: r.unsubscribe_token,
    }));
}

/**
 * Atomically claim an event for alerting via the claim_breaking_alert RPC.
 * Returns true exactly once per event_key (first caller), false on every later
 * call — so the event is emailed once and only once. We claim BEFORE sending, so
 * an overlapping/retried run can't double-send.
 */
async function claimAlert(
  supabaseUrl: string,
  serviceKey: string,
  ev: BreakingEvent,
): Promise<boolean> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/claim_breaking_alert`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_event_key: ev.eventKey, p_market_id: ev.marketId, p_kind: ev.kind }),
  });
  if (!res.ok) throw new Error(`Supabase claim_breaking_alert failed: ${res.status} ${await res.text()}`);
  return (await res.json()) === true;
}

/** Send ONE alert to a single recipient, with their own first-party unsubscribe
 * baked into both the body and the List-Unsubscribe header (per-recipient, like
 * the digest — Mailgun won't substitute variables into custom headers). */
async function sendOne(
  to: string,
  msg: { from: string; subject: string; html: string; text: string; unsubscribeUrl: string },
  cfg: { apiKey: string; domain: string; base: string },
): Promise<void> {
  const body = new URLSearchParams();
  body.set('from', msg.from);
  body.set('to', to);
  body.set('subject', msg.subject);
  body.set('html', msg.html);
  body.set('text', msg.text);
  body.set('o:tag', 'breaking');
  body.set('o:tracking', 'no'); // keep links on crowdtells.com (valid cert)
  body.set('h:Reply-To', replyToAddress());
  // RFC 2369 link, upgraded to RFC 8058 one-click when LIST_UNSUBSCRIBE_POST_BASE is
  // set (the deployed `unsubscribe` edge function). See scripts/lib/mailMeta.ts.
  setListUnsubHeaders(body, msg.unsubscribeUrl);
  // Unique per send so Gmail keeps each alert standalone (no same-subject
  // threading that would collapse a prior alert behind "show trimmed content").
  body.set('h:X-Entity-Ref-ID', randomUUID());

  const res = await fetch(`${cfg.base}/v3/${cfg.domain}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}` },
    body,
  });
  if (!res.ok) throw new Error(`Mailgun send failed: ${res.status} ${await res.text()}`);
}

/** The unsubscribe-token sentinel rendered into an event's email once, then
 * swapped for each recipient's real token at send time. */
const UNSUB_SENTINEL = '__CROWDTELLS_UNSUB_TOKEN__';

async function main(): Promise<void> {
  const siteUrl = env('SITE_URL', 'https://crowdtells.com');
  const apiKey = env('MAILGUN_API_KEY');
  const domain = env('MAILGUN_DOMAIN');
  const base = env('MAILGUN_REGION', 'us') === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const from = env('NEWSLETTER_FROM', `Crowdtells <news@${domain || 'crowdtells.com'}>`);
  const supabaseUrl = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_KEY');
  const site = siteUrl.replace(/\/$/, '');

  console.log(`Crowdtells breaking alerts${DRY_RUN ? ' (dry-run)' : ''}`);

  const feed = (await (await fetch(`${site}/feed.json`)).json()) as Feed;
  // Detect everything, then email only the major settled kinds (see EMAIL_KINDS) —
  // developing/swing are excluded from mail so alerts stay rare and inbox-worthy.
  const events = detectBreakingEvents(feed, Date.now()).filter((ev) => EMAIL_KINDS.has(ev.kind));
  // Look up the full market by id so the alert can carry a standfirst + pointers.
  const byId = new Map<string, Market>(feed.markets.map((m) => [m.id, m]));
  console.log(`Alert-worthy events this run: ${events.length}`);
  for (const ev of events) console.log(`  • [${ev.kind}] ${ev.headline} — ${ev.detail}`);

  if (events.length === 0) {
    console.log('Nothing breaking — nothing to send.');
    return;
  }

  if (DRY_RUN) {
    console.log('Dry-run: not claiming or sending. Recipients would be fetched from Supabase at send time.');
    return;
  }

  // Master pause (see SEND_BREAKING_EMAILS): detection ran and logged above, but we do
  // NOT email or claim while breaking is off — so a major event can still alert once if
  // breaking is re-enabled while it's fresh. Daily/weekly digests stay the live channel.
  if (!SEND_BREAKING_EMAILS) {
    console.log(
      'Breaking email is PAUSED (SEND_BREAKING_EMAILS=false) — the detected event(s) above were ' +
        'NOT emailed or claimed. Daily/weekly digests are the active channel.',
    );
    return;
  }

  // Graceful skip until the owner has wired Mailgun + the service key.
  if (!apiKey || !domain || !supabaseUrl || !serviceKey) {
    console.log(
      'Newsletter not fully configured (need MAILGUN_API_KEY, MAILGUN_DOMAIN, SUPABASE_URL, ' +
        'SUPABASE_SERVICE_KEY) — skipping breaking send.',
    );
    return;
  }

  let subscribers: BreakingSubscriber[];
  try {
    subscribers = await fetchBreakingSubscribers(supabaseUrl, serviceKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // breaking column / table not migrated yet → skip cleanly (exit 0).
    if (isUnprovisionedError(message)) {
      console.log('Subscribers table not migrated for breaking alerts (run supabase/schema.sql) — skipping.');
      return;
    }
    throw err;
  }
  console.log(`Breaking subscribers (confirmed): ${subscribers.length}`);

  // Walk the full ranked list; alert the first MAX_EVENTS_PER_RUN events that are
  // BOTH new (claimed) and deliverable. Throttling AFTER dedup means a backlog
  // drains at a true few-per-run instead of the top-priority few re-filling the
  // cap every run and starving genuine lower-ranked news.
  let sent = 0;
  let alerted = 0;
  for (const ev of events) {
    if (alerted >= MAX_EVENTS_PER_RUN) break; // throttle on NEW alerts sent this run

    // Compute recipients BEFORE claiming, and skip WITHOUT claiming when nobody
    // can receive it — so the event_key isn't burned for an audience that has no
    // subscriber in its category yet (they'd never get it once it's claimed).
    const recipients = recipientsForEvent(subscribers, ev.category);
    if (recipients.length === 0) {
      console.log(`  – ${ev.eventKey}: no topic-matched subscribers (not claimed)`);
      continue;
    }

    // Claim BEFORE sending so an overlapping run can't double-send (at-most-once).
    let isNew: boolean;
    try {
      isNew = await claimAlert(supabaseUrl, serviceKey, ev);
    } catch (err) {
      // Missing dedup table/RPC → schema not migrated; skip the whole run cleanly.
      const message = err instanceof Error ? err.message : String(err);
      if (isUnprovisionedError(message)) {
        console.log('breaking_alerts not migrated (run supabase/schema.sql) — skipping.');
        return;
      }
      throw err;
    }
    if (!isNew) {
      console.log(`  – already alerted: ${ev.eventKey}`);
      continue;
    }
    alerted += 1;

    const built = buildBreakingEmail(
      ev,
      { siteUrl, unsubscribeUrl: `${site}/?unsubscribe=${UNSUB_SENTINEL}` },
      byId.get(ev.marketId),
    );
    for (const sub of recipients) {
      const token = sub.unsubscribeToken;
      if (!token) {
        console.error(`  ✗ ${sub.email}: no unsubscribe token — skipped`);
        continue;
      }
      try {
        await sendOne(
          sub.email,
          {
            from,
            subject: built.subject,
            html: built.html.split(UNSUB_SENTINEL).join(token),
            text: built.text.split(UNSUB_SENTINEL).join(token),
            unsubscribeUrl: `${site}/?unsubscribe=${token}`,
          },
          { apiKey, domain, base },
        );
        sent += 1;
      } catch (err) {
        console.error(`  ✗ ${sub.email}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  console.log(`Done. Alerted ${alerted} new event(s); sent ${sent} email(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
