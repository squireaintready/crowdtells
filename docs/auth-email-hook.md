# Auth emails via our Mailgun — `auth-email` Send Email Hook

Makes every **auth** email (magic link, confirm signup, recovery, email change,
reauthentication) composed by our code and sent through our Mailgun, with the same
brand card, the same `X-Entity-Ref-ID`, and version-controlled templates. (Newsletter
confirmations + digests are sent separately by `send-confirm` / `send-digest`.) Free.

- Function: `supabase/functions/auth-email/index.ts`
- Auth templates: `supabase/functions/_shared/auth-emails.ts` (brand card from `_shared/brand.ts`, send via `_shared/mailgun.ts`)
- After this, the **dashboard auth templates + custom SMTP become unused** (custom SMTP can stay as a fallback if you ever disable the hook).

Project ref: **`tywaueceynslsyvxkgdl`** (confirm in the dashboard URL).

---

## 1. Deploy the function

```bash
supabase functions deploy auth-email --no-verify-jwt
```
(`--no-verify-jwt`: Supabase's hook authenticates with its own Standard-Webhooks signature, which the function verifies — not a Supabase JWT.)

> **Now persisted in [`supabase/config.toml`](../supabase/config.toml)** (`[functions.auth-email] verify_jwt = false`), so a plain `supabase functions deploy auth-email` keeps the JWT gate off too — the flag is belt-and-suspenders. ⚠️ Before that file existed, a flagless redeploy silently re-enabled the gate and broke the hook: sign-in showed an empty `{}` error, then `email rate limit exceeded` once retries burned the hourly auth-email cap.

## 2. Enable the hook + get its secret

Dashboard → **Authentication → Hooks** → **Send Email** → **Enable** →
- **Hook type**: HTTPS
- **URL**: `https://tywaueceynslsyvxkgdl.supabase.co/functions/v1/auth-email`
- Click **Generate secret** → copy it (looks like `v1,whsec_…`).

## 3. Set the function secrets

`SUPABASE_URL` is injected automatically.

```bash
supabase secrets set \
  SEND_EMAIL_HOOK_SECRET='v1,whsec_…the secret from step 2…' \
  MAILGUN_API_KEY=<your Mailgun API key> \
  MAILGUN_DOMAIN=mg.crowdtells.com \
  MAILGUN_REGION=us \
  AUTH_EMAIL_FROM='Crowdtells <noreply@crowdtells.com>'
```

## 4. Verify

1. Sign out of crowdtells.com → sign back in **with email** (magic link).
2. The email arrives from **`noreply@crowdtells.com`** with the **same Crowdtells card** as the newsletter, and **no `•••` trim** (it carries `X-Entity-Ref-ID`).
3. Check **Dashboard → Edge Functions → auth-email → Logs** for the send.
4. Click the link → lands on crowdtells.com, signed in.

Once confirmed, the dashboard "Send" path is fully ours.

---

## How it stays correct / safe

- **Signed payloads only**: verifies the Standard-Webhooks HMAC + a 5-min replay window before doing anything; rejects anything unsigned.
- **One pipeline**: composes via the shared brand card + sends via the shared Mailgun helper — identical to the newsletter (tracking off, unique `X-Entity-Ref-ID`).
- **Fails loud, not silent**: if Mailgun errors or isn't configured, it returns 500 so Supabase records the failure rather than dropping a sign-in email.
- **Links** resolve on `*.supabase.co/auth/v1/verify` (valid cert) → redirect to crowdtells.com — no extra domain setup.
