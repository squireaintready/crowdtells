# Branding Supabase Auth emails (sign-in / magic link)

Purpose: make the **sign-in emails** come from `crowdtells.com` (branded) instead of
the generic `noreply@mail.app.supabase.io`. These are the magic-link / "confirm your
email" emails Supabase sends when someone signs in **by email**.

This is **dashboard config only — no code.** Everything else (the newsletter signup
bug) is already fixed and shipped.

> **Nothing here is required.** The sign-in email already works; this just makes it
> on-brand and routed through your own Mailgun (better deliverability + higher limits).

---

## TASK A — Re-run the SQL (2 min, recommended)

Activates the rest of the newsletter fix that shipped in commit `6112cf7`
(the honest "you're already subscribed" message + re-mailing resurrected opt-outs).
The signed-in-signup fix itself is already live without this.

1. Supabase Dashboard → **SQL Editor**.
2. Open the project's `supabase/schema.sql`, copy the whole file, paste, **Run**.
   (It's idempotent — safe to run again; it only adds/updates, never drops data.)

---

## TASK B — Brand the sign-in emails (10 min, optional)

### B1. Turn on Custom SMTP (this is what changes the "from" address)

Supabase Dashboard → **Authentication → Emails → SMTP Settings**
(direct link: `/project/_/auth/smtp`) → toggle **Enable Custom SMTP ON**, then fill:

| Field         | Value                          |
| ------------- | ------------------------------ |
| Sender email  | `noreply@crowdtells.com`       |
| Sender name   | `Crowdtells`                   |
| Host          | `smtp.mailgun.org`             |
| Port          | `587`                          |
| Username      | `postmaster@mg.crowdtells.com` |
| Password      | _(your Mailgun SMTP password — get it in B2)_ |
| Min TLS       | `1.2` (if shown — optional)    |

Then **Save**.

> Want replies to land in your inbox? Use `hello@crowdtells.com` as the Sender email
> instead of `noreply@` (it's already routed to you). Either works.

### B2. Get the one password you need (from Mailgun)

Mailgun → **Sending → Domain Settings** → pick **mg.crowdtells.com** →
**SMTP credentials** tab → on the `postmaster@mg.crowdtells.com` row click
**Reset Password** → copy the new password into the Password field above.

⚠️ This is the **SMTP password**, NOT your Mailgun API key. They're different.

### B3. Paste the 4 templates

Supabase Dashboard → **Authentication → Emails → Templates**. For each template below,
set the **Subject** and replace the **Message body (HTML)** with the matching block.

Only **① Confirm sign up** and **② Magic Link** actually fire for this app (you use
Google + email magic-link). ③ and ④ are included so every path is on-brand.

---

#### ① Confirm sign up — Subject: `Confirm your email address`

```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#fbfaf7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">One click confirms your email and finishes signing you in to Crowdtells.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf7;"><tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;border-radius:8px;">
      <tr><td style="padding:28px 28px 6px;"><span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1a1813;letter-spacing:-0.01em;">Crowdtells</span><div style="font-size:13px;color:#6f695e;margin-top:2px;">What the money is moving on.</div></td></tr>
      <tr><td style="padding:18px 28px 4px;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.4;font-weight:600;color:#1a1813;">Confirm your email address</div><div style="font-size:14px;color:#3a352c;line-height:1.6;margin-top:8px;">Follow the link below to confirm your email and finish signing in to Crowdtells — the biggest market moves and the stories behind them.</div></td></tr>
      <tr><td style="padding:18px 28px 6px;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{ .ConfirmationURL }}" style="height:42px;v-text-anchor:middle;width:223px;" arcsize="12%" stroke="f" fillcolor="#27496d"><w:anchorlock/><center style="color:#ffffff;font-family:Georgia,serif;font-size:15px;font-weight:bold;">Confirm email address</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#27496d;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:5px;">Confirm email address</a><!--<![endif]--></td></tr>
      <tr><td style="padding:6px 28px 24px;font-size:12px;color:#6f695e;line-height:1.5;">Button not working? Open this link:<br><a href="{{ .ConfirmationURL }}" style="color:#27496d;word-break:break-all;">{{ .ConfirmationURL }}</a></td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #e7e2d8;font-size:12px;color:#6f695e;line-height:1.5;">You're receiving this because this email was used to sign in at crowdtells.com. If that wasn't you, you can safely ignore it — no account will be created.</td></tr>
    </table>
  </td></tr></table>
</body></html>
```

#### ② Magic Link — Subject: `Your Crowdtells sign-in link`

```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#fbfaf7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Your one-time link to sign in to Crowdtells.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf7;"><tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;border-radius:8px;">
      <tr><td style="padding:28px 28px 6px;"><span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1a1813;letter-spacing:-0.01em;">Crowdtells</span><div style="font-size:13px;color:#6f695e;margin-top:2px;">What the money is moving on.</div></td></tr>
      <tr><td style="padding:18px 28px 4px;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.4;font-weight:600;color:#1a1813;">Sign in to Crowdtells</div><div style="font-size:14px;color:#3a352c;line-height:1.6;margin-top:8px;">Click below to sign in. For your security, this link works once and expires shortly.</div></td></tr>
      <tr><td style="padding:18px 28px 6px;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{ .ConfirmationURL }}" style="height:42px;v-text-anchor:middle;width:214px;" arcsize="12%" stroke="f" fillcolor="#27496d"><w:anchorlock/><center style="color:#ffffff;font-family:Georgia,serif;font-size:15px;font-weight:bold;">Log in to Crowdtells</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#27496d;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:5px;">Log in to Crowdtells</a><!--<![endif]--></td></tr>
      <tr><td style="padding:6px 28px 24px;font-size:12px;color:#6f695e;line-height:1.5;">Button not working? Open this link:<br><a href="{{ .ConfirmationURL }}" style="color:#27496d;word-break:break-all;">{{ .ConfirmationURL }}</a></td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #e7e2d8;font-size:12px;color:#6f695e;line-height:1.5;">Didn't try to sign in? You can ignore this email — no one can access your account without this link.</td></tr>
    </table>
  </td></tr></table>
</body></html>
```

#### ③ Reset Password — Subject: `Reset your Crowdtells password`

```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#fbfaf7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Reset the password for your Crowdtells account.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf7;"><tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;border-radius:8px;">
      <tr><td style="padding:28px 28px 6px;"><span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1a1813;letter-spacing:-0.01em;">Crowdtells</span><div style="font-size:13px;color:#6f695e;margin-top:2px;">What the money is moving on.</div></td></tr>
      <tr><td style="padding:18px 28px 4px;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.4;font-weight:600;color:#1a1813;">Reset your password</div><div style="font-size:14px;color:#3a352c;line-height:1.6;margin-top:8px;">Follow the link below to choose a new password for your Crowdtells account.</div></td></tr>
      <tr><td style="padding:18px 28px 6px;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{ .ConfirmationURL }}" style="height:42px;v-text-anchor:middle;width:163px;" arcsize="12%" stroke="f" fillcolor="#27496d"><w:anchorlock/><center style="color:#ffffff;font-family:Georgia,serif;font-size:15px;font-weight:bold;">Reset password</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#27496d;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:5px;">Reset password</a><!--<![endif]--></td></tr>
      <tr><td style="padding:6px 28px 24px;font-size:12px;color:#6f695e;line-height:1.5;">Button not working? Open this link:<br><a href="{{ .ConfirmationURL }}" style="color:#27496d;word-break:break-all;">{{ .ConfirmationURL }}</a></td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #e7e2d8;font-size:12px;color:#6f695e;line-height:1.5;">If you didn't ask to reset your password, ignore this email — your password won't change.</td></tr>
    </table>
  </td></tr></table>
</body></html>
```

#### ④ Change Email Address — Subject: `Confirm your new email address`

```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#fbfaf7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Confirm the new email address for your Crowdtells account.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf7;"><tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;border-radius:8px;">
      <tr><td style="padding:28px 28px 6px;"><span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1a1813;letter-spacing:-0.01em;">Crowdtells</span><div style="font-size:13px;color:#6f695e;margin-top:2px;">What the money is moving on.</div></td></tr>
      <tr><td style="padding:18px 28px 4px;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.4;font-weight:600;color:#1a1813;">Confirm your email change</div><div style="font-size:14px;color:#3a352c;line-height:1.6;margin-top:8px;">Follow the link below to confirm changing your Crowdtells email from {{ .Email }} to {{ .NewEmail }}.</div></td></tr>
      <tr><td style="padding:18px 28px 6px;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{ .ConfirmationURL }}" style="height:42px;v-text-anchor:middle;width:214px;" arcsize="12%" stroke="f" fillcolor="#27496d"><w:anchorlock/><center style="color:#ffffff;font-family:Georgia,serif;font-size:15px;font-weight:bold;">Confirm email change</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#27496d;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:5px;">Confirm email change</a><!--<![endif]--></td></tr>
      <tr><td style="padding:6px 28px 24px;font-size:12px;color:#6f695e;line-height:1.5;">Button not working? Open this link:<br><a href="{{ .ConfirmationURL }}" style="color:#27496d;word-break:break-all;">{{ .ConfirmationURL }}</a></td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #e7e2d8;font-size:12px;color:#6f695e;line-height:1.5;">If you didn't request this change, ignore this email — your address stays {{ .Email }}.</td></tr>
    </table>
  </td></tr></table>
</body></html>
```

---

### B4. Verify the auth URL config (so the links land on crowdtells.com)

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL** = `https://crowdtells.com`
- **Redirect URLs** allow-list includes `https://crowdtells.com/**` (and `https://crowdtells.com/`)

The app already passes the right redirect at call time (`redirectTo()` → `https://crowdtells.com/`),
but Supabase only honors a redirect that's on this allow-list — otherwise magic-link / confirm-signup
links bounce to the default URL. **This is probably already set** (email + Google sign-in work on the
live site), but confirm it while you're here.

---

## Verify it worked

1. Sign out of crowdtells.com, then sign back in **with email** (magic link).
2. The email should arrive **from `noreply@crowdtells.com`** with the Crowdtells card.
3. Click the link → it lands back on **crowdtells.com**, signed in (confirms B4).

Note: Supabase keeps a default **30 auth-emails/hour** cap even on custom SMTP —
fine for now; raise it under **Authentication → Rate Limits** if you ever need to.
