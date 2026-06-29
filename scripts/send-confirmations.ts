/**
 * Crowdtells — double-opt-in confirmation emails.
 *
 * Reads the subscriber list from Supabase (server-side, service role) for rows
 * that signed up on the web but haven't confirmed yet and haven't been emailed a
 * confirm link, renders a branded confirmation email, and sends one personalized
 * message per recipient via Mailgun (each carries that subscriber's own confirm
 * link). After a successful send the row's `confirm_sent_at` is stamped, so a
 * later run never double-emails the same address. Runs in CI on a frequent cron;
 * `--dry-run` builds + logs without sending or needing a Mailgun key.
 *
 * Safe to run before setup: if Mailgun / Supabase aren't configured it logs and
 * exits 0, so a scheduled run can't fail (or alert) until the owner is ready.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// The branded confirmation email is rendered by ONE shared source, used by both
// this cron backstop and the instant-send edge function (supabase/functions/
// send-confirm). Imported for local use in main() and re-exported so existing
// importers — and the tests — keep working.
import { buildConfirmationEmail } from '../supabase/functions/_shared/confirm-email.ts';
import { replyToAddress } from './lib/mailMeta.ts';
export { buildConfirmationEmail };

/** An unconfirmed signup awaiting a confirm email (claimed by id before sending). */
export interface PendingConfirm {
  id: string;
  email: string;
}

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

/**
 * Whether a Supabase/PostgREST error means the schema hasn't been migrated yet
 * (the newsletter columns / RPCs live in supabase/schema.sql, which the owner runs
 * at activation). That's a not-yet-provisioned state, not a failure — so a run
 * skips cleanly instead of erroring (and alerting ops) every cron until the
 * migration lands. Covers the shapes PostgREST returns for the unprovisioned case:
 *   • 42703 / "does not exist"  — a missing column (undefined_column)
 *   • 42P01                     — a missing table (undefined_table)
 *   • PGRST202 / "Could not find …" / "schema cache" — a missing RPC/relation not
 *     in the schema cache (e.g. claim_breaking_alert before schema.sql is re-run)
 */
export function isUnprovisionedError(message: string): boolean {
  return /42703|42P01|PGRST202|PGRST205|confirm_token|confirm_sent_at|does not exist|could not find|schema cache/i.test(
    message,
  );
}

/** Web signups awaiting a confirm email: unconfirmed, not unsubscribed, not yet sent. */
async function fetchPending(supabaseUrl: string, serviceKey: string): Promise<PendingConfirm[]> {
  const url =
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/subscribers` +
    `?confirmed_at=is.null&unsubscribed_at=is.null&confirm_sent_at=is.null&select=id,email`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`Supabase pending fetch failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { id: string; email: string }[];
  return rows.filter((r) => r.id && r.email);
}

/** Send ONE confirmation email to a single recipient (its own confirm link). */
async function sendOne(
  to: string,
  msg: { from: string; subject: string; html: string; text: string },
  cfg: { apiKey: string; domain: string; base: string },
): Promise<void> {
  const body = new URLSearchParams();
  body.set('from', msg.from);
  body.set('to', to);
  body.set('subject', msg.subject);
  body.set('html', msg.html);
  body.set('text', msg.text);
  body.set('o:tag', 'confirm');
  body.set('h:Reply-To', replyToAddress());
  // Unique per send so Gmail never threads repeated confirmation emails (same
  // sender + subject) and collapses the identical card behind "show trimmed
  // content" (•••). A fresh ref-id keeps every message standalone and expanded.
  body.set('h:X-Entity-Ref-ID', randomUUID());
  // Tracking OFF: the confirm link is the whole point of this email, so it must
  // reach crowdtells.com directly. With click-tracking on, Mailgun rewrites every
  // href through the email.mg.crowdtells.com tracking subdomain — whose TLS cert
  // isn't provisioned — turning the one critical link into a browser cert warning.
  body.set('o:tracking', 'no');

  const res = await fetch(`${cfg.base}/v3/${cfg.domain}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}` },
    body,
  });
  if (!res.ok) throw new Error(`Mailgun send failed: ${res.status} ${await res.text()}`);
}

/**
 * Atomically CLAIM a row before sending: stamp confirm_sent_at, but only if it's
 * still unconfirmed, subscribed, and unsent. PostgREST returns the rows it updated,
 * so an empty result means the instant edge function (or a concurrent run) already
 * claimed it — the caller then skips without sending. This, with the edge function's
 * matching claim, makes the whole system at-most-once. Returns the claimed row's
 * authoritative confirm_token, or null if not claimed.
 */
async function claimRow(
  supabaseUrl: string,
  serviceKey: string,
  id: string,
  isoStamp: string,
): Promise<{ confirm_token: string } | null> {
  const url =
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/subscribers` +
    `?id=eq.${id}&confirmed_at=is.null&unsubscribed_at=is.null&confirm_sent_at=is.null&select=confirm_token`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ confirm_sent_at: isoStamp }),
  });
  if (!res.ok) throw new Error(`Supabase claim failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { confirm_token: string }[];
  return rows[0] ?? null;
}

/** Undo a claim (only OUR own stamp) so a failed send retries next run. */
async function rollbackClaim(
  supabaseUrl: string,
  serviceKey: string,
  id: string,
  isoStamp: string,
): Promise<void> {
  const url =
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/subscribers` +
    `?id=eq.${id}&confirm_sent_at=eq.${encodeURIComponent(isoStamp)}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ confirm_sent_at: null }),
  }).catch(() => {});
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

  console.log(`Crowdtells confirmations${DRY_RUN ? ' (dry-run)' : ''}`);

  if (DRY_RUN) {
    // Build a sample so the layout is exercised without network or a Mailgun key.
    const { subject } = buildConfirmationEmail(`${site}/?confirm=<token>`);
    console.log(`Dry-run: would send "${subject}" to each pending signup with a ${site}/?confirm=<token> link.`);
    console.log('Pending signups would be fetched from Supabase at send time.');
    return;
  }

  // Graceful skip until the owner has wired Mailgun + the service key.
  if (!apiKey || !domain || !supabaseUrl || !serviceKey) {
    console.log(
      'Newsletter not fully configured (need MAILGUN_API_KEY, MAILGUN_DOMAIN, SUPABASE_URL, ' +
        'SUPABASE_SERVICE_KEY) — skipping confirmation send.',
    );
    return;
  }

  let pending: PendingConfirm[];
  try {
    pending = await fetchPending(supabaseUrl, serviceKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Table exists but lacks the double-opt-in columns → newsletter not fully
    // activated yet. Skip cleanly (exit 0); a genuine error still surfaces.
    if (isUnprovisionedError(message)) {
      console.log(
        'Subscribers table not yet migrated for double opt-in (run supabase/schema.sql) — skipping.',
      );
      return;
    }
    throw err;
  }
  console.log(`Pending confirmations: ${pending.length}`);
  if (pending.length === 0) {
    console.log('No pending confirmations — nothing to send.');
    return;
  }

  // CLAIM each row before sending (atomic stamp gated on confirm_sent_at IS NULL),
  // so the instant edge function and this backstop never double-send. Skip rows
  // already claimed elsewhere; on a send failure, roll our own claim back to retry.
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of pending) {
    const claimStamp = new Date().toISOString();
    let claimed: { confirm_token: string } | null;
    try {
      claimed = await claimRow(supabaseUrl, serviceKey, row.id, claimStamp);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${row.email}: claim ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (!claimed) {
      skipped += 1; // the instant edge function already sent this one
      continue;
    }
    const confirmUrl = `${site}/?confirm=${claimed.confirm_token}`;
    const { subject, html, text } = buildConfirmationEmail(confirmUrl, row.email, new Date().toUTCString());
    try {
      await sendOne(row.email, { from, subject, html, text }, { apiKey, domain, base });
      sent += 1;
    } catch (err) {
      await rollbackClaim(supabaseUrl, serviceKey, row.id, claimStamp);
      failed += 1;
      console.error(`  ✗ ${row.email}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(
    `Done. Sent: ${sent}, skipped (already sent instantly): ${skipped}, failed: ${failed} (of ${pending.length}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
