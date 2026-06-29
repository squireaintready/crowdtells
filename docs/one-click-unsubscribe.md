# One-click unsubscribe — `unsubscribe` edge function (RFC 8058)

Gmail and Yahoo's [2024 bulk-sender rules](https://blog.google/products/gmail/gmail-security-authentication-spam-protection/)
require **one-click unsubscribe** on bulk mail: the `List-Unsubscribe` header paired
with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, where the mailbox provider
can **POST** to the URL and complete the opt-out with no further interaction.

Our digest / breaking / reply senders already ship a first-party `List-Unsubscribe`
URL (the SPA `?unsubscribe=` link). This function adds the **POST-capable** endpoint
that makes it true one-click — and the senders only advertise it once it's live, so
nothing changes until you finish the steps below.

- Function: `supabase/functions/unsubscribe/index.ts`
- Wraps the existing token-keyed RPCs `unsubscribe_by_token` (newsletter) and
  `unsubscribe_replies_by_token` (reply notifications) — no new SQL, no new secret.
- `POST` performs the opt-out (one-click). `GET` shows a confirm page and **never**
  changes state, so a security scanner / link-prefetch GET can't unsubscribe anyone.

Project ref: **`tywaueceynslsyvxkgdl`**.

---

## 1. Deploy the function

`--no-verify-jwt` makes it callable by the mailbox provider; the per-recipient token
in the URL is what guards it. Also persisted in
[`supabase/config.toml`](../supabase/config.toml) (`[functions.unsubscribe] verify_jwt = false`).

```bash
supabase functions deploy unsubscribe --no-verify-jwt
```

Its URL will be: `https://tywaueceynslsyvxkgdl.supabase.co/functions/v1/unsubscribe`

No function secrets to set — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically.

## 2. Tell the senders to advertise it

Set **one** repo/CI variable so the digest, breaking, and reply senders emit the
one-click header pair (until it's set, they keep shipping the plain RFC 2369 link):

- **GitHub → Settings → Variables** (the senders run in `pipeline.yml` / `digest.yml`):
  - `LIST_UNSUBSCRIBE_POST_BASE = https://tywaueceynslsyvxkgdl.supabase.co`

(The senders append `/functions/v1/unsubscribe?token=…&kind=news|reply` themselves —
see `scripts/lib/mailMeta.ts`.)

## 3. Verify

1. Send yourself a digest (`gh workflow run digest.yml -f cadence=daily`, or wait for
   the next scheduled send).
2. In Gmail, the message's overflow (⋮) menu should show **Unsubscribe** next to the
   sender — that's the header pair being honored.
3. Click it → Gmail POSTs to the function → you're opted out, and the digest sender
   logs you as unsubscribed on its next run.
4. Open the function URL with `?token=<a real token>&kind=news` in a browser (GET) —
   you should see the confirm page, and you should still be subscribed (GET is inert).

---

## CAN-SPAM postal address

Separately, every commercial email must carry a valid physical postal address
(CAN-SPAM §5). Set:

- `MAILING_ADDRESS = "Crowdtells, PO Box ####, City, ST 00000"`

as a repo/CI variable. The digest + breaking + reply footers render it when set, and
omit it when unset (we never ship a placeholder address). Also wire it as an Edge
Function secret if you later move the digest sender server-side.
