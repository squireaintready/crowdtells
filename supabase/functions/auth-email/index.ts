/**
 * Crowdtells — Supabase Auth "Send Email Hook" (Deno edge function).
 *
 * Supabase calls this instead of sending auth emails itself, so EVERY auth email
 * (magic link, confirm signup, recovery, email change, reauthentication) is
 * composed by us (shared brand card, version-controlled templates) and sent
 * through our Mailgun — identical pipeline + headers to the newsletter. One system.
 *
 * Security: the payload is signed (Standard Webhooks / HMAC-SHA256). We verify the
 * signature + a 5-min replay window before doing anything. Configure the hook +
 * secret in Dashboard → Authentication → Hooks → Send Email. See
 * docs/auth-email-hook.md.
 *
 * Secrets: SEND_EMAIL_HOOK_SECRET (from the dashboard, "v1,whsec_…"),
 * MAILGUN_API_KEY, MAILGUN_DOMAIN, and optionally MAILGUN_REGION, AUTH_EMAIL_FROM.
 * SUPABASE_URL is injected automatically.
 */
import { buildAuthEmail } from '../_shared/auth-emails.ts';
import { mailgunConfig, sendViaMailgun } from '../_shared/mailgun.ts';

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
}
interface HookPayload {
  user: { email?: string; new_email?: string };
  email_data: EmailData;
}

function env(name: string): string {
  return (Deno.env.get(name) ?? '').trim();
}

/** Constant-time byte compare. (Inputs here are fixed-length base64 MACs, so the
 *  length-equality early return leaks nothing about the secret. Don't reuse this
 *  for variable-length secrets without removing that early return.) */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length); // fresh ArrayBuffer-backed (Web Crypto wants that)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
const bytesToB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

/**
 * Verify a Standard Webhooks signature (the scheme Supabase auth hooks use).
 * signed content = `${id}.${timestamp}.${body}`; signature = base64(HMAC-SHA256).
 * The webhook-signature header is a space-separated list of `v1,<sig>`.
 */
async function verify(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sigHeader = headers.get('webhook-signature');
  if (!id || !ts || !sigHeader) return false;

  const t = Number.parseInt(ts, 10);
  if (!Number.isFinite(t) || Math.abs(Math.floor(Date.now() / 1000) - t) > 300) return false; // replay window

  const keyB64 = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = b64ToBytes(keyB64);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = bytesToB64(mac);
  return sigHeader.split(' ').some((part) => safeEqual(part.split(',')[1] ?? '', expected));
}

const ok = () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const secret = env('SEND_EMAIL_HOOK_SECRET');
  if (!secret) return new Response('Hook secret not configured', { status: 500 });

  const raw = await req.text();
  if (!(await verify(secret, req.headers, raw))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const d = payload.email_data;
  if (!d?.email_action_type) return ok(); // nothing to send
  const action = d.email_action_type;
  const KNOWN = new Set(['signup', 'magiclink', 'recovery', 'email_change', 'reauthentication', 'invite']);
  if (!KNOWN.has(action)) console.warn('auth-email: unknown email_action_type', action);
  const isChange = action === 'email_change';
  const isCode = action === 'reauthentication';

  // Recipient: the NEW address for a secure email change (that's where the
  // actionable link must land); the current address for everything else.
  const to = isChange ? payload.user?.new_email || payload.user?.email : payload.user?.email;
  if (!to) return ok();

  // Code emails (reauthentication) carry an OTP and no link; link emails need a
  // token_hash — and for email_change the actionable one is the NEW token.
  const tokenHash = isChange ? d.token_hash_new || d.token_hash : d.token_hash;
  if (isCode) {
    if (!d.token) return new Response('missing otp', { status: 500 });
  } else if (!tokenHash) {
    return ok();
  }

  const cfg = mailgunConfig(env);
  if (!cfg) {
    // Not wired yet — fail so Supabase falls back to its own sender rather than
    // silently dropping a sign-in email.
    return new Response('Mailgun not configured', { status: 500 });
  }
  const from = env('AUTH_EMAIL_FROM') || `Crowdtells <noreply@${cfg.domain.replace(/^mg\./, '')}>`;
  const replyTo = env('REPLY_TO') || 'hello@crowdtells.com';
  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '');

  // Supabase verifies token_hash at its own /auth/v1/verify endpoint, then bounces
  // the reader to redirect_to (crowdtells.com). Valid cert, no extra setup.
  const actionUrl =
    `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}` +
    `&type=${encodeURIComponent(action)}` +
    `&redirect_to=${encodeURIComponent(d.redirect_to || d.site_url || 'https://crowdtells.com')}`;

  const { subject, html, text } = buildAuthEmail({
    action,
    actionUrl,
    token: d.token,
    email: payload.user?.email ?? to, // CURRENT address — used in the email-change "from" line
    newEmail: payload.user?.new_email,
    sentAt: new Date().toUTCString(),
  });

  try {
    await sendViaMailgun(cfg, { from, to, subject, html, text, tag: `auth-${action}`, replyTo });
  } catch (err) {
    // 500 → Supabase records the failure (and the user can retry). We never expose
    // internals; the error is logged to the function logs.
    console.error('auth-email send failed:', err instanceof Error ? err.message : err);
    return new Response('send failed', { status: 500 });
  }

  return ok();
});
