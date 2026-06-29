/**
 * Single source of the Crowdtells double-opt-in confirmation email.
 *
 * PURE (no Node/Deno APIs) — rendered identically by BOTH the cron backstop
 * (scripts/send-confirmations.ts, Node/tsx) and the instant edge function
 * (supabase/functions/send-confirm, Deno). Built on the shared brand card, so it
 * stays visually identical to every other Crowdtells email.
 */
import { card, esc } from './brand.ts';

export function buildConfirmationEmail(
  confirmUrl: string,
  email?: string,
  sentAt?: string,
): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Confirm your Crowdtells subscription';
  // Name the address being confirmed — clarity for the reader, and a per-recipient
  // unique line so two different people's emails aren't byte-identical.
  const who = email ? `${esc(email)} was entered` : 'someone entered this email';
  const whoText = email ? `${email} was entered` : 'someone entered this email';

  // Deliberately plain + transactional (no marketing phrasing in the preheader or
  // body, single verb-first CTA). This is the ONE email that must land in Gmail's
  // Primary tab, not Promotions — promo language ("biggest market moves…") and a
  // hype preheader are exactly what trips the Promotions/spam classifier.
  const html = card({
    preheader: 'Confirm your email to finish subscribing to Crowdtells.',
    heading: 'Confirm your subscription',
    meta: sentAt ? `Requested ${esc(sentAt)}` : undefined,
    bodyHtml:
      'Confirm your email address to finish subscribing to Crowdtells. This link only verifies it’s really you.',
    ctaUrl: confirmUrl,
    ctaLabel: 'Confirm subscription',
    footerHtml: `You received this because ${who} at crowdtells.com. If that wasn't you, just ignore it — you won't be subscribed, and we won't email you again.`,
  });

  const text =
    `Crowdtells — confirm your subscription\n\n` +
    (sentAt ? `Requested ${sentAt}\n\n` : '') +
    `Confirm your email address to finish subscribing to Crowdtells:\n${confirmUrl}\n\n` +
    `You received this because ${whoText} at crowdtells.com. ` +
    `If that wasn't you, just ignore it — you won't be subscribed, and we won't email you again.`;

  return { subject, html, text };
}
