/**
 * Crowdtells AUTH emails (magic link, confirm signup, recovery, email change,
 * reauthentication OTP) — composed by us so they match the newsletter exactly:
 * same brand card, same headers, version-controlled here instead of in the
 * Supabase dashboard. Sent by the Send Email Hook (supabase/functions/auth-email).
 * PURE (no Node/Deno APIs) — built on the shared brand card.
 */
import { card, esc } from './brand.ts';

export interface AuthEmailInput {
  /** Supabase email_action_type. */
  action: string;
  /** The verify link (for link-based actions). */
  actionUrl: string;
  /** The 6-digit OTP (used for reauthentication; also a fallback code). */
  token: string;
  /** Recipient (current address). */
  email: string;
  /** New address (email_change only). */
  newEmail?: string;
  /** Per-send timestamp — surfaced as a dim line so Gmail doesn't thread/collapse
   *  repeated same-subject auth emails behind "show trimmed content". */
  sentAt?: string;
}

interface Spec {
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  bodyText: string;
  footerHtml: string;
  footerText: string;
  ctaLabel: string;
  /** OTP-code email (reauthentication): no link, show the code instead. */
  code?: boolean;
}

const IGNORE = "If that wasn't you, you can safely ignore this email.";

function spec(i: AuthEmailInput): Spec {
  switch (i.action) {
    case 'magiclink':
      return {
        subject: 'Your Crowdtells sign-in link',
        preheader: 'Your one-time link to sign in to Crowdtells.',
        heading: 'Sign in to Crowdtells',
        bodyHtml: 'Click below to sign in. For your security, this link works once and expires shortly.',
        bodyText: 'Click the link below to sign in. For your security, it works once and expires shortly.',
        ctaLabel: 'Log in to Crowdtells',
        footerHtml: "Didn't try to sign in? You can ignore this email — no one can access your account without this link.",
        footerText: "Didn't try to sign in? You can ignore this email — no one can access your account without this link.",
      };
    case 'recovery':
      return {
        subject: 'Reset your Crowdtells password',
        preheader: 'Reset the password for your Crowdtells account.',
        heading: 'Reset your password',
        bodyHtml: 'Follow the link below to choose a new password for your Crowdtells account.',
        bodyText: 'Follow the link below to choose a new password for your Crowdtells account.',
        ctaLabel: 'Reset password',
        footerHtml: "If you didn't ask to reset your password, ignore this email — your password won't change.",
        footerText: "If you didn't ask to reset your password, ignore this email — your password won't change.",
      };
    case 'email_change': {
      const from = esc(i.email);
      const to = esc(i.newEmail || '');
      return {
        subject: 'Confirm your new email address',
        preheader: 'Confirm the new email address for your Crowdtells account.',
        heading: 'Confirm your email change',
        bodyHtml: `Follow the link below to confirm changing your Crowdtells email from ${from} to ${to}.`,
        bodyText: `Follow the link below to confirm changing your Crowdtells email from ${i.email} to ${i.newEmail || ''}.`,
        ctaLabel: 'Confirm email change',
        footerHtml: `If you didn't request this change, ignore this email — your address stays ${from}.`,
        footerText: `If you didn't request this change, ignore this email — your address stays ${i.email}.`,
      };
    }
    case 'reauthentication':
      return {
        subject: 'Your Crowdtells verification code',
        preheader: 'Your code to verify it’s you.',
        heading: "Verify it's you",
        bodyHtml: `Enter this code to continue:<div style="font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:0.12em;color:#1a1813;margin-top:12px;">${esc(i.token)}</div>`,
        bodyText: `Enter this code to continue: ${i.token}`,
        ctaLabel: '',
        footerHtml: IGNORE,
        footerText: IGNORE,
        code: true,
      };
    case 'invite':
      return {
        subject: "You're invited to Crowdtells",
        preheader: 'Accept your invitation to Crowdtells.',
        heading: "You're invited to Crowdtells",
        bodyHtml: 'You’ve been invited to Crowdtells — the biggest market moves and the stories behind them. Follow the link below to set up your account.',
        bodyText: 'You have been invited to Crowdtells. Follow the link below to set up your account.',
        ctaLabel: 'Accept invitation',
        footerHtml: IGNORE,
        footerText: IGNORE,
      };
    case 'signup':
    default:
      return {
        subject: 'Confirm your email address',
        preheader: 'One click confirms your email and finishes signing you in to Crowdtells.',
        heading: 'Confirm your email address',
        bodyHtml: 'Follow the link below to confirm your email and finish signing in to Crowdtells — the biggest market moves and the stories behind them.',
        bodyText: 'Follow the link below to confirm your email and finish signing in to Crowdtells.',
        ctaLabel: 'Confirm email address',
        footerHtml: "You're receiving this because this email was used to sign in at crowdtells.com. If that wasn't you, you can safely ignore it — no account will be created.",
        footerText: "You're receiving this because this email was used to sign in at crowdtells.com. If that wasn't you, you can safely ignore it — no account will be created.",
      };
  }
}

export function buildAuthEmail(i: AuthEmailInput): { subject: string; html: string; text: string } {
  const s = spec(i);
  const html = card({
    preheader: s.preheader,
    heading: s.heading,
    meta: i.sentAt ? `Requested ${esc(i.sentAt)}` : undefined,
    bodyHtml: s.bodyHtml,
    footerHtml: s.footerHtml,
    ctaUrl: s.code ? undefined : i.actionUrl,
    ctaLabel: s.code ? undefined : s.ctaLabel,
  });
  const action = s.code
    ? `Code: ${i.token}\n\n`
    : `${s.ctaLabel}:\n${i.actionUrl}\n\n`;
  const meta = i.sentAt ? `Requested ${i.sentAt}\n\n` : '';
  const text = `Crowdtells — ${s.heading}\n\n${meta}${s.bodyText}\n\n${action}${s.footerText}`;
  return { subject: s.subject, html, text };
}
