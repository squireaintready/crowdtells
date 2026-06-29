/**
 * Crowdtells — weekly email digest.
 *
 * Reads the live feed (top stories), reads the subscriber list from Supabase
 * (server-side, service role), renders a branded HTML email, and sends one
 * personalized Mailgun message per recipient — each carrying that recipient's own
 * first-party unsubscribe link in both the body and a List-Unsubscribe header.
 * Runs in CI on a weekly cron; `--dry-run` builds + logs without sending or
 * needing a Mailgun key.
 *
 * Safe to run before setup: if Mailgun / Supabase aren't configured it logs and
 * exits 0, so a scheduled run can't fail (or alert) until the owner is ready.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Feed, Market } from '../src/lib/types';
import { storySlug } from '../src/lib/storyPath';
import { formatUsd } from '../src/lib/format';
import { isUnprovisionedError } from './send-confirmations';
import { mailButton } from './lib/mailButton';
import { mailingAddress, replyToAddress, setListUnsubHeaders } from './lib/mailMeta';

type Cadence = 'weekly' | 'daily';

interface DigestOpts {
  cadence: Cadence;
  siteUrl: string;
  /** Category filter for this recipient cohort; empty/absent = all categories. */
  topics?: string[];
  /**
   * The unsubscribe link embedded in the footer — a first-party URL on crowdtells.com
   * (`<site>/?unsubscribe=<token>`) so the opt-out lands on OUR domain (valid cert)
   * and writes straight to our DB. The per-recipient sender substitutes the real
   * token in; the bare default here is only used by the dry-run preview. The token
   * is a uuid (URL-safe), so the URL is intentionally not escaped.
   */
  unsubscribeUrl?: string;
  /**
   * The issue date rendered in the header dateline. Defaults to "now" — passing it
   * explicitly keeps buildDigest pure for tests and makes every cohort in one run
   * carry the same date. The dateline also gives each send a UNIQUE line at the top of
   * the message, so Gmail won't trim the (otherwise identical) header chrome as
   * already-seen content — the real fix for the "blank/collapsed email" symptom.
   */
  date?: Date;
}

/** A confirmed recipient + their topic filter, as read from Supabase. */
export interface Subscriber {
  email: string;
  topics: string[];
  /** Per-subscriber opt-out token for the first-party unsubscribe link (absent
   * until the unsubscribe_token column is migrated). */
  unsubscribeToken?: string;
}

/** A topic cohort to send to: deduped recipients + their unsubscribe tokens. */
export interface RecipientGroup {
  topics: string[];
  emails: string[];
  /** email → unsubscribe token, for per-recipient first-party opt-out links.
   * Always populated post-migration; a missing entry just skips that recipient
   * (there is no Mailgun-unsubscribe fallback — an unmigrated column makes the
   * whole run skip via isUnprovisionedError). */
  tokens: Record<string, string>;
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

/** A market's structured odds line, e.g. "Yes 63% ▲4 this week". No {tokens}. */
function oddsLine(m: Market): string {
  const move = m.movement7d ?? m.movement24h;
  const arrow = move == null ? '' : move > 0 ? ` ▲${Math.abs(move).toFixed(0)}` : move < 0 ? ` ▼${Math.abs(move).toFixed(0)}` : '';
  return `${m.favored} ${Math.round(m.oddsPct)}%${arrow}`;
}

/**
 * Pick the stories for the digest: the biggest mover first, then the most
 * newsworthy by score, deduped. Active + briefed only. The mover lead is
 * cadence-aware so the two briefs feel distinct: a daily leads on the freshest
 * 24h swing (falling back to 7d), a weekly on the bigger 7d arc (falling back to
 * 24h) — a daily that just re-led with the same week-long mover wouldn't read as
 * "daily".
 */
export function selectDigestStories(
  markets: Market[],
  limit = 6,
  cadence: Cadence = 'weekly',
): Market[] {
  const eligible = markets.filter((m) => m.status === 'active' && m.generatedAt && m.hook);
  const moveOf = (m: Market) =>
    cadence === 'daily'
      ? Math.abs(m.movement24h ?? m.movement7d ?? 0)
      : Math.abs(m.movement7d ?? m.movement24h ?? 0);
  const topMover = [...eligible].sort((a, b) => moveOf(b) - moveOf(a))[0];
  const byScore = [...eligible].sort((a, b) => b.score - a.score);
  const out: Market[] = [];
  const seen = new Set<string>();
  for (const m of [topMover, ...byScore]) {
    if (m && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Keep only markets in the chosen categories; empty/absent list = all. Pure. */
export function filterByTopics(markets: Market[], topics?: string[]): Market[] {
  if (!topics || topics.length === 0) return markets;
  const set = new Set(topics);
  return markets.filter((m) => set.has(m.category));
}

/** Render the digest email (pure → unit-testable). Returns subject + html + text. */
export function buildDigest(
  feed: Feed,
  opts: DigestOpts,
): { subject: string; html: string; text: string; storyCount: number } {
  const stories = selectDigestStories(filterByTopics(feed.markets, opts.topics), 6, opts.cadence);
  const label = opts.cadence === 'daily' ? 'Daily' : 'Weekly';
  // A human dateline (in ET, matching the cron framing) — unique per issue, so the
  // header is never byte-identical run-to-run and Gmail can't collapse it as repeated.
  const issueDate = (opts.date ?? new Date()).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  const lead = stories[0];
  const subject = lead
    ? `${label} brief: ${lead.hook}`
    : `Your ${label.toLowerCase()} Crowdtells brief`;
  const site = opts.siteUrl.replace(/\/$/, '');
  // First-party opt-out (valid cert + writes back to our DB). The real per-recipient
  // token is supplied by the sender; this bare form only appears in the dry-run preview.
  const unsub = opts.unsubscribeUrl ?? `${site}/?unsubscribe=`;
  // Inbox preview line: lead with the top story so the preview sells the issue.
  const preheader = lead ? esc(lead.hook) : 'What the crowd is watching.';

  // One story block: category eyebrow → serif headline → dek → a tabular signal
  // line ("<favored> <odds>%<arrow> · <$vol> in play"). The signal line embeds the
  // structured oddsLine() verbatim, so the contract the tests assert is preserved.
  // A 1px hairline rule separates stories (every block but the first carries a
  // border-top, so there's no trailing divider under the last one).
  const card = (m: Market, i: number): string => {
    const url = `${site}/s/${storySlug(m.id)}`;
    const rule = i === 0 ? '' : 'border-top:1px solid #e7e2d8;';
    return `
      <tr><td style="${rule}padding:${i === 0 ? '0' : '20px'} 0 20px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#27496d;">${esc(m.category)}</div>
        <a href="${url}" style="text-decoration:none;color:#1a1813;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.15;font-weight:600;color:#1a1813;margin-top:7px;">${esc(m.hook)}</div>
        </a>
        ${m.dek?.trim() ? `<div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#54504a;line-height:1.5;margin-top:8px;">${esc(m.dek.trim())}</div>` : ''}
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6f695e;margin-top:11px;mso-line-height-rule:exactly;">
          <strong style="color:#27496d;font-weight:700;">${esc(oddsLine(m))}</strong> · ${esc(formatUsd(m.volume))} in play
        </div>
        <a href="${url}" style="display:inline-block;margin-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#27496d;text-decoration:none;">Read the briefing →</a>
      </td></tr>`;
  };

  const addr = mailingAddress();
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
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#6f695e;" align="left">${esc(issueDate)}</td>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#27496d;" align="right">The crowd tells it first</td>
            </tr>
          </table>
          <div style="margin-top:10px;">
            <a href="${site}/" style="text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#1a1813;letter-spacing:-0.01em;">Crowdtells</a>
          </div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6f695e;margin-top:3px;">The ${label.toLowerCase()} brief — what the crowd is watching.</div>
        </td></tr>
        <tr><td style="padding:18px 30px 0;"><div style="border-top:1px solid #e7e2d8;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
        <tr><td style="padding:18px 30px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stories.map(card).join('')}</table>
        </td></tr>
        <tr><td style="padding:6px 30px 28px;">
          ${mailButton(`${site}/`, 'See the full feed')}
        </td></tr>
        <tr><td style="padding:20px 30px 24px;border-top:1px solid #e7e2d8;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6f695e;line-height:1.6;text-align:center;">
          You're getting this because you subscribed at crowdtells.com. Odds are crowd probabilities — information, not advice.<br>
          <a href="${unsub}" style="color:#6f695e;text-decoration:underline;">Unsubscribe</a>${addr ? `<br><span style="color:#9a9488;">${esc(addr)}</span>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Crowdtells — ${label} brief · ${issueDate}\n\n` +
    stories
      .map(
        (m) =>
          `• ${m.hook}\n${m.dek?.trim() ? `  ${m.dek.trim()}\n` : ''}  ${m.category} · ${oddsLine(m)}\n  ${site}/s/${storySlug(m.id)}`,
      )
      .join('\n\n') +
    `\n\nSee the full feed: ${site}/\nUnsubscribe: ${unsub}` +
    (addr ? `\n${addr}` : '');

  return { subject, html, text, storyCount: stories.length };
}

/**
 * Collapse a recipient list case-insensitively (and trim/blank-drop), so
 * "News@x" and "news@x" — which the column-level unique lets coexist — get ONE
 * email, not two. Keeps the first-seen casing. Pure → unit-testable.
 */
export function dedupeRecipients(emails: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const email = (raw ?? '').trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/**
 * Group confirmed recipients by their exact topic selection so each distinct
 * cohort gets ONE tailored email (and the batch send stays efficient). The
 * empty-topics ("all") cohort groups together. Emails are de-duplicated within
 * each group, and each kept address keeps its unsubscribe token. Pure → unit-testable.
 */
export function planRecipientGroups(subscribers: Subscriber[]): RecipientGroup[] {
  const groups = new Map<string, { topics: string[]; subs: Subscriber[] }>();
  for (const s of subscribers) {
    const topics = [...new Set((s.topics ?? []).filter(Boolean))].sort();
    const key = topics.join(''); // '' = the all-topics cohort
    let g = groups.get(key);
    if (!g) {
      g = { topics, subs: [] };
      groups.set(key, g);
    }
    g.subs.push(s);
  }
  return [...groups.values()].map((g) => {
    const emails = dedupeRecipients(g.subs.map((s) => s.email));
    const tokens: Record<string, string> = {};
    for (const email of emails) {
      const key = email.toLowerCase();
      const sub = g.subs.find((s) => (s.email ?? '').trim().toLowerCase() === key);
      if (sub?.unsubscribeToken) tokens[email] = sub.unsubscribeToken;
    }
    return { topics: g.topics, emails, tokens };
  });
}

/** Confirmed, still-subscribed recipients on THIS cadence, with their topics.
 * Double opt-in is enforced here (confirmed_at not null) — unconfirmed signups
 * never receive mail. */
async function fetchSubscribers(
  supabaseUrl: string,
  serviceKey: string,
  cadence: Cadence,
): Promise<Subscriber[]> {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const url =
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/subscribers` +
    `?unsubscribed_at=is.null&confirmed_at=not.is.null&frequency=eq.${cadence}` +
    `&select=email,topics,unsubscribe_token`;
  // The unsubscribe token is REQUIRED (every email's opt-out is a first-party token
  // link). If the column isn't migrated yet the fetch errors with 42703 — main()
  // recognises that via isUnprovisionedError and skips cleanly rather than sending
  // mail without a working unsubscribe.
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Supabase subscribers fetch failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as {
    email: string;
    topics: string[] | null;
    unsubscribe_token?: string;
  }[];
  return rows
    .filter((r) => r.email)
    .map((r) => ({
      email: r.email,
      topics: Array.isArray(r.topics) ? r.topics : [],
      unsubscribeToken: r.unsubscribe_token,
    }));
}

/**
 * Send ONE digest to a single recipient, with that recipient's own first-party
 * unsubscribe baked into both the body and the `List-Unsubscribe` header. We send
 * per-recipient (not a Mailgun batch) precisely so the header can carry the real
 * token — Mailgun substitutes recipient variables in the body/subject but NOT in
 * custom headers. Everything points at crowdtells.com: no link in this email ever
 * touches Mailgun's tracking subdomain, so there is no cert to provision and no
 * cert warning to hit. `o:tracking: no` keeps Mailgun from rewriting links too.
 */
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
  body.set('o:tag', 'digest');
  body.set('o:tracking', 'no');
  body.set('h:Reply-To', replyToAddress());
  // List-Unsubscribe: first-party opt-out. Upgrades to RFC 8058 one-click (the pair
  // Gmail/Yahoo's 2024 bulk rules look for) when LIST_UNSUBSCRIBE_POST_BASE points at
  // the deployed `unsubscribe` edge function; otherwise the RFC 2369 SPA link, which
  // the ?unsubscribe= handler completes. See scripts/lib/mailMeta.ts.
  setListUnsubHeaders(body, msg.unsubscribeUrl);
  // Unique per send so Gmail keeps each issue standalone (no same-subject threading
  // that would collapse a prior digest behind "show trimmed content").
  body.set('h:X-Entity-Ref-ID', randomUUID());

  const res = await fetch(`${cfg.base}/v3/${cfg.domain}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}` },
    body,
  });
  if (!res.ok) throw new Error(`Mailgun send failed: ${res.status} ${await res.text()}`);
}

/** The unsubscribe-token sentinel rendered into a cohort's digest once, then
 * swapped for each recipient's real token at send time (so the cohort body is
 * built a single time, not re-rendered per recipient). */
const UNSUB_SENTINEL = '__CROWDTELLS_UNSUB_TOKEN__';

async function main(): Promise<void> {
  const cadence: Cadence = env('CADENCE', 'weekly') === 'daily' ? 'daily' : 'weekly';
  const siteUrl = env('SITE_URL', 'https://crowdtells.com');
  const apiKey = env('MAILGUN_API_KEY');
  const domain = env('MAILGUN_DOMAIN');
  const base = env('MAILGUN_REGION', 'us') === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const from = env('NEWSLETTER_FROM', `Crowdtells <news@${domain || 'crowdtells.com'}>`);
  const supabaseUrl = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_KEY');

  console.log(`Crowdtells digest — cadence=${cadence}${DRY_RUN ? ' (dry-run)' : ''}`);

  // One issue date for the whole run, so every cohort's dateline matches.
  const issuedAt = new Date();
  const feed = (await (await fetch(`${siteUrl.replace(/\/$/, '')}/feed.json`)).json()) as Feed;
  const { subject, html, storyCount } = buildDigest(feed, { cadence, siteUrl, date: issuedAt });
  console.log(`Built preview digest: "${subject}" (${storyCount} stories, ${html.length} bytes html)`);

  if (storyCount === 0) {
    console.log('No briefed stories to feature — skipping send.');
    return;
  }

  if (DRY_RUN) {
    console.log('Dry-run: not sending. Recipients would be fetched from Supabase at send time.');
    return;
  }

  // Graceful skip until the owner has wired Mailgun + the service key.
  if (!apiKey || !domain || !supabaseUrl || !serviceKey) {
    console.log(
      'Newsletter not fully configured (need MAILGUN_API_KEY, MAILGUN_DOMAIN, SUPABASE_URL, ' +
        'SUPABASE_SERVICE_KEY) — skipping send.',
    );
    return;
  }

  let subscribers: Subscriber[];
  try {
    subscribers = await fetchSubscribers(supabaseUrl, serviceKey, cadence);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Table exists but lacks unsubscribe_token → schema not migrated for the
    // first-party opt-out. Skip cleanly (exit 0) rather than send mail without a
    // working unsubscribe; a genuine error still surfaces.
    if (isUnprovisionedError(message)) {
      console.log(
        'Subscribers table missing unsubscribe_token (run supabase/schema.sql) — skipping send.',
      );
      return;
    }
    throw err;
  }
  console.log(`Subscribers (${cadence}, confirmed): ${subscribers.length}`);
  if (subscribers.length === 0) {
    console.log('No confirmed subscribers on this cadence — nothing to send.');
    return;
  }

  // One tailored email per topic cohort. Render each cohort's brief ONCE (with a
  // token sentinel), then send per recipient — swapping in their own token so the
  // body link AND the List-Unsubscribe header are a first-party crowdtells.com URL.
  const site = siteUrl.replace(/\/$/, '');
  const groups = planRecipientGroups(subscribers);
  let sent = 0;
  for (const g of groups) {
    const who = g.topics.length ? g.topics.join(', ') : 'all topics';
    const d = buildDigest(feed, {
      cadence,
      siteUrl,
      topics: g.topics,
      unsubscribeUrl: `${site}/?unsubscribe=${UNSUB_SENTINEL}`,
      date: issuedAt,
    });
    if (d.storyCount === 0) {
      console.log(`  – ${g.emails.length} recipient(s) skipped — no stories for: ${who}`);
      continue;
    }
    for (const email of g.emails) {
      const token = g.tokens[email];
      if (!token) {
        console.error(`  ✗ ${email}: no unsubscribe token — skipped`);
        continue;
      }
      const unsubscribeUrl = `${site}/?unsubscribe=${token}`;
      try {
        await sendOne(
          email,
          {
            from,
            subject: d.subject,
            html: d.html.split(UNSUB_SENTINEL).join(token),
            text: d.text.split(UNSUB_SENTINEL).join(token),
            unsubscribeUrl,
          },
          { apiKey, domain, base },
        );
        sent += 1;
      } catch (err) {
        console.error(`  ✗ ${email}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  console.log(`Done. Sent the ${cadence} brief to ${sent} subscriber(s) across ${groups.length} cohort(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
