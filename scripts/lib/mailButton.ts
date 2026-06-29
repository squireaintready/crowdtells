/**
 * A bulletproof email CTA button — renders as a real, rounded, filled button
 * across every major client INCLUDING Outlook on Windows (the Word rendering
 * engine, which ignores padding/border-radius on inline anchors and would
 * otherwise collapse a styled <a> to bare link text).
 *
 * The trick is two mutually-exclusive blocks:
 *  - an MSO-only VML <v:roundrect> that Word actually draws as a button, hidden
 *    from every non-Outlook client (it lives inside an `[if mso]` comment);
 *  - the normal padded <a> for everyone else, hidden from Outlook (inside an
 *    `[if !mso]` comment).
 * Both carry the same href + label, so there is exactly one visible button.
 *
 * The caller passes ALREADY-ESCAPED href + label (these senders esc() their
 * dynamic values), so this helper does no escaping of its own.
 */
export function mailButton(href: string, label: string): string {
  // VML needs an explicit pixel width; approximate from the label so the box
  // hugs the text (15px semibold ≈ 8.5px/char) + horizontal padding.
  const width = Math.round(label.length * 8.5) + 44;
  return (
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${href}" style="height:42px;v-text-anchor:middle;width:${width}px;" arcsize="12%" stroke="f" fillcolor="#27496d">` +
    `<w:anchorlock/>` +
    `<center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">${label}</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-- -->` +
    `<a href="${href}" style="display:inline-block;background:#27496d;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:6px;">${label}</a>` +
    `<!--<![endif]-->`
  );
}
