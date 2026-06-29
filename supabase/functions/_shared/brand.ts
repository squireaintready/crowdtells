/**
 * Shared Crowdtells email BRAND primitives — pure (no Node/Deno APIs, no imports)
 * so every transactional email renders identically: the newsletter confirm
 * (confirm-email.ts) and every auth email (auth-emails.ts). One card, one button,
 * one escape — change the look here and all of them move together.
 */

/** Escape HTML-dangerous characters in interpolated values. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Bulletproof email CTA button (MSO VML for Outlook + a padded <a> for everyone
 * else). Caller passes an already-escaped href.
 */
export function button(href: string, label: string): string {
  const width = Math.round(label.length * 8.5) + 44;
  return (
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${href}" style="height:42px;v-text-anchor:middle;width:${width}px;" arcsize="12%" stroke="f" fillcolor="#27496d">` +
    `<w:anchorlock/>` +
    `<center style="color:#ffffff;font-family:Georgia,serif;font-size:15px;font-weight:bold;">${label}</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-- -->` +
    `<a href="${href}" style="display:inline-block;background:#27496d;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:5px;">${label}</a>` +
    `<!--<![endif]-->`
  );
}

// Zero-width spacer that pads the inbox preview line (so a short preheader doesn't
// pull body text into the preview). Invisible in the body via display:none.
const PREHEADER_PAD = '&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;';

export interface CardOptions {
  /** Inbox preview line. */
  preheader: string;
  /** Serif headline. */
  heading: string;
  /** Body HTML (caller escapes any interpolated values). */
  bodyHtml: string;
  /** Footer HTML (caller escapes any interpolated values). */
  footerHtml: string;
  /** Optional small dim line under the heading (e.g. a per-send timestamp). Its
   *  job: make each send's visible content unique so Gmail won't thread + collapse
   *  repeated identical emails behind "show trimmed content" (•••). */
  meta?: string;
  /** If set, render the CTA button + a copy-paste fallback link. */
  ctaUrl?: string;
  ctaLabel?: string;
}

/**
 * The shared light card. `color-scheme: light only` stops Apple/iOS Mail from
 * auto-inverting it; the hidden preheader controls the inbox preview. Senders set
 * click-tracking OFF so links stay on crowdtells.com.
 */
export function card(o: CardOptions): string {
  const cta =
    o.ctaUrl && o.ctaLabel
      ? `<tr><td style="padding:18px 28px 6px;">
          ${button(esc(o.ctaUrl), o.ctaLabel)}
        </td></tr>
        <tr><td style="padding:6px 28px 24px;font-size:12px;color:#6f695e;line-height:1.5;">
          Button not working? <a href="${esc(o.ctaUrl)}" style="color:#27496d;">Use this link instead</a>.
        </td></tr>`
      : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#fbfaf7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${o.preheader}${PREHEADER_PAD}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf7;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;border-radius:8px;">
        <tr><td style="padding:28px 28px 6px;">
          <span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1a1813;letter-spacing:-0.01em;">Crowdtells</span>
          <div style="font-size:13px;color:#6f695e;margin-top:2px;">What the crowd is watching.</div>
        </td></tr>
        <tr><td style="padding:18px 28px 4px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.4;font-weight:600;color:#1a1813;">${o.heading}</div>
          ${o.meta ? `<div style="font-size:12px;color:#6f695e;margin-top:6px;">${o.meta}</div>` : ''}
          <div style="font-size:15px;color:#3a352c;line-height:1.6;margin-top:8px;">${o.bodyHtml}</div>
        </td></tr>
        ${cta}
        <tr><td style="padding:18px 28px;border-top:1px solid #e7e2d8;font-size:12px;color:#6f695e;line-height:1.5;">
          ${o.footerHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
