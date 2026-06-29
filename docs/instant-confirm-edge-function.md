# Instant confirmation emails — `send-confirm` edge function

Sends a web signup's double-opt-in confirm email **within ~1 second** instead of
waiting for the pulse cron (≤15 min market hours, up to ~3h overnight). The cron
(`scripts/send-confirmations.ts`) stays as a **backstop** — anything the function
misses is re-mailed on the next pulse, and the two can't double-send (both claim
on `confirm_sent_at IS NULL`).

- Function: `supabase/functions/send-confirm/index.ts`
- Shared email (same branded card as the cron): `supabase/functions/_shared/confirm-email.ts`
- Trigger: a Database Webhook on **INSERT** of `public.subscribers`.
- Free: well within Supabase's Edge Function free tier. **No GitHub Actions minutes.**

Your project ref appears to be **`tywaueceynslsyvxkgdl`** — confirm in the dashboard URL.

---

## 1. One-time: install + link the CLI

```bash
brew install supabase/tap/supabase     # or: npm i -g supabase
supabase login
supabase link --project-ref tywaueceynslsyvxkgdl
```

## 2. Make a webhook secret

```bash
openssl rand -hex 32        # copy the output — used in steps 3 and 4
```

## 3. Set the function secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do **not** set them.

```bash
supabase secrets set \
  CONFIRM_WEBHOOK_SECRET=<the openssl value from step 2> \
  MAILGUN_API_KEY=<your Mailgun API key> \
  MAILGUN_DOMAIN=mg.crowdtells.com \
  MAILGUN_REGION=us \
  NEWSLETTER_FROM='Crowdtells <news@crowdtells.com>' \
  SITE_URL=https://crowdtells.com
```

## 4. Deploy the function

`--no-verify-jwt` makes it callable by the webhook; our `x-confirm-secret` header is what actually guards it. This is also persisted in [`supabase/config.toml`](../supabase/config.toml) (`[functions.send-confirm] verify_jwt = false`), so a flagless redeploy stays correct — the flag is belt-and-suspenders.

```bash
supabase functions deploy send-confirm --no-verify-jwt
```

Its URL will be: `https://tywaueceynslsyvxkgdl.supabase.co/functions/v1/send-confirm`

## 5. Create the Database Webhook

Dashboard → **Database → Webhooks → Create a new hook**:

- **Name**: `send-confirm-on-signup`
- **Table**: `public.subscribers`
- **Events**: **Insert** only (⚠️ not Update/Delete — the function ignores them, and Insert is what makes new signups instant)
- **Type**: HTTP Request → **POST**
- **URL**: `https://tywaueceynslsyvxkgdl.supabase.co/functions/v1/send-confirm`
- **HTTP Headers** → add:
  - `x-confirm-secret` = `<the same openssl value from step 2>`

Save.

## 6. Verify

1. On crowdtells.com, subscribe with a **non-account** email (a fresh address).
2. The confirm email should arrive **within seconds** (from `news@crowdtells.com`).
3. Check **Dashboard → Edge Functions → send-confirm → Logs** — you should see `sent to <email>`.
4. The cron still runs every pulse as a backstop; it will log "No pending confirmations" because the function already handled them.

---

## How it stays correct (for reference)

- **At-most-once**: the function and the cron both only send when `confirm_sent_at IS NULL`. The function *claims* by stamping `confirm_sent_at` in a single conditional `UPDATE` before sending; if 0 rows update, it stops. So they never double-send.
- **Failure-safe**: if Mailgun errors, the function rolls `confirm_sent_at` back to null, and the cron re-mails on the next pulse.
- **No loop**: the function only acts on INSERT, so its own claim/rollback UPDATEs never re-invoke it.
- **Signed-in users** are unaffected — they're auto-confirmed (`source='account'`, already confirmed), so the function skips them.
