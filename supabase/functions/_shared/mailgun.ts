/**
 * Shared Mailgun sender for the edge functions — so every Crowdtells email goes
 * out the same way: click-tracking OFF (links stay on crowdtells.com), and a
 * unique X-Entity-Ref-ID per send so Gmail never threads/collapses repeated emails
 * behind "show trimmed content" (•••). Deno globals only (fetch, btoa, crypto).
 */
export interface MailgunConfig {
  apiKey: string;
  domain: string;
  base: string; // https://api.mailgun.net (or .eu)
}

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  tag: string; // Mailgun o:tag
  replyTo?: string; // optional Reply-To (route replies to a monitored inbox)
  listUnsubscribeUrl?: string; // optional first-party List-Unsubscribe
}

/** Resolve Mailgun config from env; null when not configured (caller skips gracefully). */
export function mailgunConfig(env: (k: string) => string): MailgunConfig | null {
  const apiKey = env('MAILGUN_API_KEY');
  const domain = env('MAILGUN_DOMAIN');
  if (!apiKey || !domain) return null;
  const base = env('MAILGUN_REGION') === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  return { apiKey, domain, base };
}

/** Send ONE email via Mailgun. Throws on a non-2xx response. */
export async function sendViaMailgun(cfg: MailgunConfig, msg: OutgoingEmail): Promise<void> {
  const body = new URLSearchParams();
  body.set('from', msg.from);
  body.set('to', msg.to);
  body.set('subject', msg.subject);
  body.set('html', msg.html);
  body.set('text', msg.text);
  body.set('o:tag', msg.tag);
  body.set('o:tracking', 'no');
  body.set('h:X-Entity-Ref-ID', crypto.randomUUID());
  if (msg.replyTo) body.set('h:Reply-To', msg.replyTo);
  if (msg.listUnsubscribeUrl) body.set('h:List-Unsubscribe', `<${msg.listUnsubscribeUrl}>`);

  const res = await fetch(`${cfg.base}/v3/${cfg.domain}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${cfg.apiKey}`)}` },
    body,
  });
  if (!res.ok) throw new Error(`Mailgun send failed: ${res.status} ${await res.text()}`);
}
