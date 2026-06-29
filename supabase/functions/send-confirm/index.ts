/**
 * Crowdtells — INSTANT double-opt-in confirmation email (Supabase Edge Function).
 *
 * Fired by a Database Webhook on INSERT/UPDATE of public.subscribers, so a web
 * signup gets its confirm email within ~1s — no waiting on the pulse cron. The
 * cron (scripts/send-confirmations.ts) stays as a backstop: anything this misses
 * (function down, transient Mailgun error → rolled back) is re-mailed on the next
 * pulse, since both gate on `confirm_sent_at IS NULL`.
 *
 * Flow: verify the webhook secret → guard (web, unconfirmed, not unsubscribed,
 * not yet sent) → CLAIM atomically (stamp confirm_sent_at only if still null, so
 * the cron and a duplicate webhook can't double-send) → render the SAME branded
 * email as the cron (shared _shared/confirm-email.ts) → send via Mailgun → on a
 * send failure, roll the stamp back so the backstop retries.
 *
 * Secrets (Project → Edge Functions → Secrets): CONFIRM_WEBHOOK_SECRET,
 * MAILGUN_API_KEY, MAILGUN_DOMAIN, and optionally MAILGUN_REGION, NEWSLETTER_FROM,
 * SITE_URL. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 */
import { buildConfirmationEmail } from '../_shared/confirm-email.ts';
import { mailgunConfig, sendViaMailgun } from '../_shared/mailgun.ts';

interface SubscriberRow {
  id: string;
  email: string;
  source: string | null;
  confirm_token: string | null;
  confirmed_at: string | null;
  confirm_sent_at: string | null;
  unsubscribed_at: string | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: SubscriberRow | null;
}

function env(name: string): string {
  return (Deno.env.get(name) ?? '').trim();
}

/** Constant-time compare via fixed-width SHA-256 digests, so a length mismatch never
 * early-returns and can't leak the secret's length as a timing oracle (this sits on a
 * public --no-verify-jwt endpoint, and the configured secret is variable-length). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i]! ^ ub[i]!;
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (msg: string) => new Response(JSON.stringify({ ok: true, msg }), { status: 200 });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // The webhook is the only legitimate caller. A shared secret (configured as a
  // custom header on the webhook) stops a random POST from triggering sends.
  // Checked BEFORE parsing the body, so an unauthenticated caller can't make us work.
  const secret = env('CONFIRM_WEBHOOK_SECRET');
  if (!secret || !(await safeEqual(req.headers.get('x-confirm-secret') ?? '', secret))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const row = payload.record;
  if (!row || payload.table !== 'subscribers') return ok('not a subscribers row');

  // INSERT only — on purpose. New signups (the case that must feel instant) are
  // INSERTs. Acting on UPDATEs would let our own claim/rollback writes re-trigger
  // this function (a rollback resets confirm_sent_at → another UPDATE → resend…),
  // risking a loop. Resurrected opt-outs (an UPDATE) are rarer and the cron
  // backstop re-mails them. So configure the webhook for INSERT, and enforce it here.
  if (payload.type !== 'INSERT') return ok('not an insert — backstop handles updates');

  // Only un-emailed, unconfirmed, still-subscribed WEB signups need a confirm
  // email. Account rows are auto-confirmed; confirmed/unsubscribed/already-sent
  // rows are skipped. (The atomic claim below is the authoritative guard; this is
  // just an early exit that avoids a needless DB write.)
  if (row.source !== 'web' || row.confirmed_at || row.unsubscribed_at || row.confirm_sent_at) {
    return ok('not an unconfirmed web signup');
  }

  // row.id is interpolated into the PostgREST claim URL below — never trust an
  // unvalidated value from the webhook payload.
  if (!UUID.test(row.id)) return ok('non-uuid id');

  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const cfg = mailgunConfig(env);
  // Graceful no-op until Mailgun is wired (mirrors the cron) — the backstop sends.
  if (!supabaseUrl || !serviceKey || !cfg) return ok('not configured — backstop will send');

  const from = env('NEWSLETTER_FROM') || `Crowdtells <news@${cfg.domain}>`;
  const replyTo = env('REPLY_TO') || 'hello@crowdtells.com';
  const site = (env('SITE_URL') || 'https://crowdtells.com').replace(/\/$/, '');
  const rest = `${supabaseUrl}/rest/v1/subscribers`;
  const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // CLAIM: stamp confirm_sent_at, but ONLY if it's still null (and the row is still
  // unconfirmed + subscribed). PostgREST returns the rows it actually updated — an
  // empty result means the cron or a concurrent webhook already claimed it, so we
  // stop without sending. This is what makes instant + backstop at-most-once.
  const claimUrl =
    `${rest}?id=eq.${row.id}&confirmed_at=is.null&unsubscribed_at=is.null&confirm_sent_at=is.null` +
    `&select=email,confirm_token`;
  const claimStamp = new Date().toISOString();
  const claimRes = await fetch(claimUrl, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ confirm_sent_at: claimStamp }),
  });
  if (!claimRes.ok) return new Response(`claim failed: ${claimRes.status}`, { status: 500 });
  const claimed = (await claimRes.json()) as { email: string; confirm_token: string }[];
  const me = claimed[0];
  if (!me?.confirm_token) return ok('already claimed elsewhere');

  // Render + send the SAME branded email through the SAME pipeline as every
  // Crowdtells email (shared confirm-email + mailgun: tracking off, unique
  // X-Entity-Ref-ID).
  const confirmUrl = `${site}/?confirm=${me.confirm_token}`;
  const { subject, html, text } = buildConfirmationEmail(confirmUrl, me.email, new Date().toUTCString());
  try {
    await sendViaMailgun(cfg, { from, to: me.email, subject, html, text, tag: 'confirm', replyTo });
  } catch (err) {
    // Roll back ONLY our own claim (match the exact stamp we wrote). If the cron
    // re-stamped meanwhile (i.e. it sent fine), the filter matches nothing and we
    // don't clobber its legitimate send. Either way the backstop re-mails if needed.
    await fetch(`${rest}?id=eq.${row.id}&confirm_sent_at=eq.${encodeURIComponent(claimStamp)}`, {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ confirm_sent_at: null }),
    }).catch(() => {});
    console.error('confirm send failed:', err instanceof Error ? err.message : err);
    return new Response('mailgun send failed', { status: 500 });
  }

  return ok(`sent to ${me.email}`);
});
