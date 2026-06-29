/**
 * Crowdtells — RFC 8058 one-click List-Unsubscribe endpoint (Supabase Edge Function).
 *
 * Mailbox providers (Gmail/Yahoo) POST here when a reader uses the native inbox
 * "Unsubscribe" affordance, completing the opt-out with no click-through — the pair
 * (List-Unsubscribe + List-Unsubscribe-Post: One-Click) their 2024 bulk-sender rules
 * look for. Wraps the existing token-keyed, unauthenticated RPCs:
 *   kind=news   → public.unsubscribe_by_token(p_token)          (newsletter digest)
 *   kind=reply  → public.unsubscribe_replies_by_token(p_token)  (reply notifications)
 * The per-recipient token IS the credential, so no JWT or extra secret is needed
 * (supabase/config.toml sets verify_jwt = false).
 *
 *   POST /unsubscribe?token=<uuid>&kind=news|reply → perform opt-out, 200
 *   GET  /unsubscribe?token=<uuid>&kind=news|reply → a confirm page (NO state change),
 *        so a security scanner / link-prefetch GET can never opt anyone out by accident.
 *
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically — don't set them.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function env(name: string): string {
  return (Deno.env.get(name) ?? '').trim();
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Crowdtells</title></head>
<body style="margin:0;background:#fbfaf7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1813;">
<div style="max-width:480px;margin:12vh auto;padding:28px 24px;background:#fff;border:1px solid #e7e2d8;border-radius:8px;text-align:center;">
<div style="font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:-0.01em;">Crowdtells</div>
${body}
</div></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/** kind=reply → reply-notify list; anything else → the newsletter list (safe default). */
function rpcFor(kind: string): string {
  return kind === 'reply' ? 'unsubscribe_replies_by_token' : 'unsubscribe_by_token';
}

async function optOut(token: string, kind: string): Promise<boolean> {
  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return false;
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcFor(kind)}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  });
  // The RPC is idempotent and returns boolean; a true means a row matched. A network
  // failure is the only real error — surface it so the provider can retry.
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  return (await res.json()) === true;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  // Token + kind come from the query string (the per-recipient link the senders bake
  // in); a POST from the GET confirm form may also carry them as form fields.
  let token = url.searchParams.get('token') ?? '';
  let kind = url.searchParams.get('kind') ?? 'news';

  if (req.method === 'POST') {
    const ct = req.headers.get('content-type') ?? '';
    if (!token && ct.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData().catch(() => null);
      if (form) {
        token = String(form.get('token') ?? '');
        kind = String(form.get('kind') ?? kind);
      }
    }
    if (!UUID.test(token)) return page('Unsubscribe', '<p style="margin-top:14px;color:#6f695e;">This unsubscribe link is invalid or has expired.</p>', 400);
    try {
      await optOut(token, kind);
    } catch {
      return page('Unsubscribe', '<p style="margin-top:14px;color:#6f695e;">Something went wrong. Please try again, or email hello@crowdtells.com.</p>', 502);
    }
    return page(
      'Unsubscribed',
      '<p style="margin-top:14px;font-size:16px;">You’re unsubscribed.</p>' +
        '<p style="margin-top:8px;color:#6f695e;font-size:14px;">You won’t receive these emails anymore. Changed your mind? Re-subscribe anytime at crowdtells.com.</p>',
    );
  }

  if (req.method === 'GET') {
    // A GET never changes state (scanners/prefetch can hit List-Unsubscribe URLs).
    // Show a one-tap confirm whose button POSTs back to this same endpoint.
    if (!UUID.test(token)) return page('Unsubscribe', '<p style="margin-top:14px;color:#6f695e;">This unsubscribe link is invalid or has expired.</p>', 400);
    const escKind = kind === 'reply' ? 'reply' : 'news';
    const what = escKind === 'reply' ? 'reply notifications' : 'the Crowdtells newsletter';
    return page(
      'Unsubscribe',
      `<p style="margin-top:14px;font-size:16px;">Unsubscribe from ${what}?</p>` +
        `<form method="POST" action="?token=${encodeURIComponent(token)}&kind=${escKind}" style="margin-top:18px;">` +
        `<button type="submit" style="background:#27496d;color:#fff;border:none;border-radius:6px;padding:12px 22px;font-size:15px;font-weight:600;cursor:pointer;">Unsubscribe</button>` +
        `</form>`,
    );
  }

  return new Response('Method Not Allowed', { status: 405 });
});
