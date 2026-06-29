/**
 * Shared email-compliance helpers for the Node/tsx bulk senders (digest, breaking,
 * reply-notify). Keeps the CAN-SPAM postal address, the Reply-To inbox, and the
 * RFC 8058 one-click-unsubscribe wiring in ONE place so all three senders stay
 * consistent and a compliance change lands once, not three times.
 */

/** Reply-To inbox (a monitored address) so a reader who hits Reply reaches a human. */
export function replyToAddress(): string {
  return (process.env.REPLY_TO || '').trim() || 'hello@crowdtells.com';
}

/**
 * CAN-SPAM §5 requires a valid physical postal address in every commercial email.
 * Returns the configured address, or '' when unset — we never invent a fake one.
 * Set MAILING_ADDRESS (e.g. a registered P.O. box) in the CI vars to populate it.
 */
export function mailingAddress(): string {
  return (process.env.MAILING_ADDRESS || '').trim();
}

/**
 * Build the per-recipient one-click POST endpoint from the first-party SPA opt-out
 * URL, deriving the token + list kind so callers don't have to thread a second URL:
 *   …/?unsubscribe=<token>        → kind=news
 *   …/?reply_unsubscribe=<token>  → kind=reply
 * Returns '' when no token is present or no endpoint base is configured.
 */
export function oneClickUnsubUrl(spaUnsubUrl: string, base: string): string {
  const root = base.trim().replace(/\/$/, '');
  if (!root) return '';
  let token = '';
  let kind = '';
  try {
    const params = new URL(spaUnsubUrl).searchParams;
    const news = params.get('unsubscribe');
    const reply = params.get('reply_unsubscribe');
    if (news) {
      token = news;
      kind = 'news';
    } else if (reply) {
      token = reply;
      kind = 'reply';
    }
  } catch {
    return ''; // malformed URL → no one-click (the RFC 2369 link still ships)
  }
  if (!token) return '';
  return `${root}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}&kind=${kind}`;
}

/**
 * Set the List-Unsubscribe header(s) on a Mailgun message body.
 *
 * Default (LIST_UNSUBSCRIBE_POST_BASE unset) — UNCHANGED behavior: RFC 2369 only,
 * the first-party SPA opt-out link (a GET the ?unsubscribe= handler completes).
 *
 * When LIST_UNSUBSCRIBE_POST_BASE is set to the deployed `unsubscribe` edge
 * function's origin (e.g. https://<ref>.supabase.co) — RFC 8058 one-click: the
 * POST-capable endpoint becomes the List-Unsubscribe value and List-Unsubscribe-Post
 * advertises one-click, which Gmail/Yahoo's 2024 bulk-sender rules look for. The
 * endpoint only ACTS on POST — a security scanner's GET shows a confirm page and
 * never auto-unsubscribes, so prefetching can't opt anyone out by accident.
 */
export function setListUnsubHeaders(body: URLSearchParams, spaUnsubUrl: string): void {
  const oneClick = oneClickUnsubUrl(spaUnsubUrl, process.env.LIST_UNSUBSCRIBE_POST_BASE || '');
  if (oneClick) {
    body.set('h:List-Unsubscribe', `<${oneClick}>`);
    body.set('h:List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
  } else {
    body.set('h:List-Unsubscribe', `<${spaUnsubUrl}>`);
  }
}
