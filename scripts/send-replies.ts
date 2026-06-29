/**
 * Crowdtells — comment reply-notification emails.
 *
 * A standard retention loop: when someone replies to your comment, we email you
 * "<name> replied to your comment." Reads the still-owed replies from Supabase
 * (server-side, service role, via the pending_reply_notifications RPC), claims each
 * one in a durable ledger BEFORE sending, then emails the parent comment's author —
 * each message carrying that recipient's own first-party one-click opt-out link.
 *
 * Respectful by design:
 *  - never emails a self-reply (the RPC excludes parent.user_id = replier);
 *  - never emails an opted-out user (the RPC filters on profiles.reply_notify);
 *  - at-most-once per reply (claim_reply_notification is atomic, claimed BEFORE send);
 *  - one-click opt-out (a per-profile token link that flips reply_notify off).
 *
 * Inert by default — mirrors the breaking-alerts / social patterns: it does nothing
 * unless REPLY_NOTIFY_ENABLED=true AND Mailgun + Supabase are configured. The
 * pipeline step is also gated on vars.REPLY_NOTIFY_ENABLED, so with no flag + no
 * creds the run is a no-op. `--dry-run` renders + logs a sample without claiming,
 * sending, or needing a Mailgun key. Safe to run before the schema is migrated: a
 * missing column/RPC is recognised as not-yet-provisioned and skips cleanly (exit 0).
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Feed } from '../src/lib/types';
import { storySlug } from '../src/lib/storyPath';
import { isUnprovisionedError } from './send-confirmations';
import { mailButton } from './lib/mailButton';
import { mailingAddress, replyToAddress, setListUnsubHeaders } from './lib/mailMeta';

/** A reply still owed a notification email, as read from Supabase. */
export interface PendingReply {
  /** The reply comment's id — the dedup/claim key. */
  commentId: string;
  /** The market the conversation is on (→ story title + link). */
  marketId: string;
  /** The parent comment author's email (the recipient). */
  parentEmail: string;
  /** Per-profile opt-out token for the first-party "turn these off" link. */
  replyUnsubToken?: string;
  /** The replier's display name (already coalesced to "Someone" when unknown). */
  replierName: string;
  /** A short, plain-text excerpt of the reply body (quoted in the email). */
  snippet: string;
}

// How far back to look for un-notified replies. The claim ledger enforces true
// at-most-once; this just bounds the backlog a single run will consider (a long
// outage drains over runs rather than blasting everything at once).
const LOOKBACK_HOURS = 72;
// Hard cap on emails sent per run — a sane throttle so a brigade of replies can't
// turn one run into a send storm.
const MAX_PER_RUN = 100;
const SNIPPET_MAX = 200;

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

/** Whether the sender is armed: explicitly enabled AND Mailgun + Supabase wired.
 * Pure → unit-testable. Inert (false) by default, so no flag + no creds = no-op. */
export function replyNotifyArmed(e: NodeJS.ProcessEnv): boolean {
  const enabled = ['1', 'true', 'on'].includes((e.REPLY_NOTIFY_ENABLED ?? '').trim().toLowerCase());
  const hasMailgun = !!(e.MAILGUN_API_KEY ?? '').trim() && !!(e.MAILGUN_DOMAIN ?? '').trim();
  const hasSupabase =
    !!((e.SUPABASE_URL ?? '') || (e.VITE_SUPABASE_URL ?? '')).trim() &&
    !!(e.SUPABASE_SERVICE_KEY ?? '').trim();
  return enabled && hasMailgun && hasSupabase;
}

/** Collapse whitespace and cap a reply body to a tidy one-line excerpt. Pure. */
export function snippetOf(body: string, max = SNIPPET_MAX): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** The human title for a market, from the published feed; falls back to a generic
 * label when the conversation's market has aged out of the live feed. Pure. */
export function storyTitleFor(feed: Feed | null, marketId: string): string {
  const m = feed?.markets.find((x) => x.id === marketId);
  return (m?.hook || m?.title || '').trim() || 'your story';
}

/** Render one reply-notification email (pure → unit-testable). Escapes every piece
 * of user-supplied text (the replier's name, the snippet, the story title). */
export function buildReplyEmail(
  reply: PendingReply,
  opts: { siteUrl: string; storyTitle: string; unsubscribeUrl: string },
): { subject: string; html: string; text: string } {
  const site = opts.siteUrl.replace(/\/$/, '');
  const url = `${site}/s/${storySlug(reply.marketId)}`;
  const who = (reply.replierName.trim() || 'Someone').slice(0, 40);
  const title = opts.storyTitle.trim() || 'your story';
  const snippet = snippetOf(reply.snippet);
  const rawSubject = `${who} replied to your comment on ${title}`;
  // Cap the inbox subject so a long story title doesn't truncate awkwardly mid-word.
  const subject = rawSubject.length > 78 ? `${rawSubject.slice(0, 77)}…` : rawSubject;
  const unsub = opts.unsubscribeUrl;

  const eName = esc(who);
  const eTitle = esc(title);
  const eSnippet = esc(snippet);

  const addr = mailingAddress();
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#fbfaf7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${eSnippet}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf7;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;border-radius:8px;">
        <tr><td style="padding:28px 28px 6px;">
          <a href="${site}/" style="text-decoration:none;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1a1813;letter-spacing:-0.01em;">Crowdtells</a>
          <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#27496d;margin-top:6px;">New reply</div>
        </td></tr>
        <tr><td style="padding:10px 28px 4px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.3;font-weight:600;color:#1a1813;">${eName} replied to your comment</div>
          <div style="font-size:13px;color:#6f695e;margin-top:6px;">on <a href="${url}" style="color:#27496d;text-decoration:none;font-weight:600;">${eTitle}</a></div>
          <div style="margin-top:14px;padding:12px 16px;background:#f7f5ef;border-left:3px solid #d8d2c4;border-radius:4px;font-size:14px;color:#3a352c;line-height:1.6;">${eSnippet}</div>
        </td></tr>
        <tr><td style="padding:18px 28px 28px;">
          ${mailButton(url, 'View the reply')}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e7e2d8;font-size:12px;color:#6f695e;line-height:1.5;">
          You're getting this because you commented at crowdtells.com and someone replied.<br>
          <a href="${unsub}" style="color:#6f695e;text-decoration:underline;">Turn off reply notifications</a>${addr ? `<br><span style="color:#9a9488;">${esc(addr)}</span>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Crowdtells — new reply\n\n` +
    `${who} replied to your comment on ${title}.\n\n` +
    `"${snippet}"\n\n` +
    `View the reply: ${url}\n\n` +
    `You commented at crowdtells.com and someone replied.\nTurn off reply notifications: ${unsub}` +
    (addr ? `\n${addr}` : '');

  return { subject, html, text };
}

/** Read the replies still owed a notification (un-notified, opted-in, not self-reply,
 * within the lookback) via the SECURITY DEFINER RPC — the service role resolves the
 * recipient's auth email server-side. An unmigrated column/RPC throws an
 * unprovisioned error, which main() recognises and skips on. */
async function fetchPendingReplies(
  supabaseUrl: string,
  serviceKey: string,
  sinceIso: string,
): Promise<PendingReply[]> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/pending_reply_notifications`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_since: sinceIso, p_limit: MAX_PER_RUN }),
  });
  if (!res.ok) throw new Error(`Supabase pending_reply_notifications failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as {
    comment_id: string;
    market_id: string;
    parent_email: string;
    reply_unsub_token?: string;
    replier_name: string;
    snippet: string;
  }[];
  return rows
    .filter((r) => r.comment_id && r.market_id && r.parent_email)
    .map((r) => ({
      commentId: r.comment_id,
      marketId: r.market_id,
      parentEmail: r.parent_email,
      replyUnsubToken: r.reply_unsub_token,
      replierName: r.replier_name || 'Someone',
      snippet: r.snippet || '',
    }));
}

/**
 * Atomically claim a reply for notifying via claim_reply_notification. Returns true
 * exactly once per comment id (first caller), false on every later call — so the
 * reply is emailed once and only once. Claimed BEFORE sending, so an overlapping /
 * retried run can't double-send.
 */
async function claimReply(supabaseUrl: string, serviceKey: string, commentId: string): Promise<boolean> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/claim_reply_notification`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_comment_id: commentId }),
  });
  if (!res.ok) throw new Error(`Supabase claim_reply_notification failed: ${res.status} ${await res.text()}`);
  return (await res.json()) === true;
}

/** Send ONE reply notification to a single recipient, with their own first-party
 * opt-out baked into both the body and the List-Unsubscribe header (per-recipient —
 * Mailgun won't substitute variables into custom headers; same shape as the digest). */
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
  body.set('o:tag', 'reply');
  body.set('o:tracking', 'no'); // keep links on crowdtells.com (valid cert)
  body.set('h:Reply-To', replyToAddress());
  // RFC 2369 link, upgraded to RFC 8058 one-click when LIST_UNSUBSCRIBE_POST_BASE is
  // set (the deployed `unsubscribe` edge function). See scripts/lib/mailMeta.ts.
  setListUnsubHeaders(body, msg.unsubscribeUrl);
  // Unique per send so Gmail keeps each notification standalone (no same-subject threading).
  body.set('h:X-Entity-Ref-ID', randomUUID());

  const res = await fetch(`${cfg.base}/v3/${cfg.domain}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}` },
    body,
  });
  if (!res.ok) throw new Error(`Mailgun send failed: ${res.status} ${await res.text()}`);
}

async function main(): Promise<void> {
  const siteUrl = env('SITE_URL', 'https://crowdtells.com');
  const apiKey = env('MAILGUN_API_KEY');
  const domain = env('MAILGUN_DOMAIN');
  const base = env('MAILGUN_REGION', 'us') === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const from = env('NEWSLETTER_FROM', `Crowdtells <news@${domain || 'crowdtells.com'}>`);
  const supabaseUrl = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_KEY');
  const site = siteUrl.replace(/\/$/, '');

  console.log(`Crowdtells reply notifications${DRY_RUN ? ' (dry-run)' : ''}`);

  if (DRY_RUN) {
    // Build a sample so the layout + escaping are exercised without network or a key.
    const sample = buildReplyEmail(
      { commentId: 'c', marketId: 'sample-market', parentEmail: 'you@x.com', replierName: 'Avery', snippet: 'Good point — but the resolution criteria say otherwise.' },
      { siteUrl, storyTitle: 'Will the Fed cut rates in July?', unsubscribeUrl: `${site}/?reply_unsubscribe=<token>` },
    );
    console.log(`Dry-run: would send "${sample.subject}" (${sample.html.length} bytes html).`);
    console.log('Pending replies + recipient emails would be read from Supabase at send time.');
    return;
  }

  // Inert unless explicitly enabled AND Mailgun + Supabase are wired (mirrors
  // breaking/social): with no flag + no creds the run is a clean no-op.
  if (!replyNotifyArmed(process.env)) {
    console.log(
      'Reply notifications not armed (need REPLY_NOTIFY_ENABLED=true plus MAILGUN_API_KEY, ' +
        'MAILGUN_DOMAIN, SUPABASE_URL, SUPABASE_SERVICE_KEY) — skipping.',
    );
    return;
  }

  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();

  let pending: PendingReply[];
  try {
    pending = await fetchPendingReplies(supabaseUrl, serviceKey, sinceIso);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // RPC / column not migrated yet → skip cleanly (exit 0) rather than alert ops.
    if (isUnprovisionedError(message)) {
      console.log('Reply-notification schema not migrated (run supabase/schema.sql) — skipping.');
      return;
    }
    throw err;
  }
  console.log(`Replies owed a notification this run: ${pending.length}`);
  if (pending.length === 0) {
    console.log('No new replies — nothing to send.');
    return;
  }

  // The published feed gives each conversation's market a human story title; absent
  // (feed unreachable) we fall back to a generic label per reply — non-fatal.
  let feed: Feed | null = null;
  try {
    feed = (await (await fetch(`${site}/feed.json`)).json()) as Feed;
  } catch (err) {
    console.error(`  ! feed.json unreachable (${err instanceof Error ? err.message : err}) — using generic titles`);
  }

  let sent = 0;
  let notified = 0;
  for (const reply of pending) {
    if (notified >= MAX_PER_RUN) break;

    if (!reply.replyUnsubToken) {
      console.error(`  ✗ ${reply.parentEmail}: no opt-out token — skipped (not claimed)`);
      continue;
    }

    // Claim BEFORE sending so an overlapping run can't double-send (at-most-once).
    let isNew: boolean;
    try {
      isNew = await claimReply(supabaseUrl, serviceKey, reply.commentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isUnprovisionedError(message)) {
        console.log('reply_notifications not migrated (run supabase/schema.sql) — skipping.');
        return;
      }
      throw err;
    }
    if (!isNew) {
      console.log(`  – already notified: ${reply.commentId}`);
      continue;
    }
    notified += 1;

    const token = reply.replyUnsubToken;
    const unsubscribeUrl = `${site}/?reply_unsubscribe=${token}`;
    const built = buildReplyEmail(reply, {
      siteUrl,
      storyTitle: storyTitleFor(feed, reply.marketId),
      unsubscribeUrl,
    });
    try {
      await sendOne(
        reply.parentEmail,
        { from, subject: built.subject, html: built.html, text: built.text, unsubscribeUrl },
        { apiKey, domain, base },
      );
      sent += 1;
    } catch (err) {
      console.error(`  ✗ ${reply.parentEmail}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Done. Claimed ${notified} reply(ies); sent ${sent} email(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
