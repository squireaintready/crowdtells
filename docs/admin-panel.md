# Admin console

A dense operator back-office for support + moderation, served inside the SPA at
**`/?admin`** (also linked from the account menu for admins). It's where you see all
user info and manage users, the newsletter list, comments, and moderation.

## Security model (read this)

Crowdtells is a **static site** — the JS bundle is public, so a client-side "admin
check" is only UX. The real boundary is the **database**:

- One new primitive: a `public.admins` allowlist of user ids + an `is_admin()`
  `SECURITY DEFINER` function that reads the caller's `auth.uid()`.
- Every admin read/action is a `SECURITY DEFINER` rpc (`admin_*`) that **re-checks
  `is_admin()` and raises `forbidden`** for anyone else. The rpcs are granted to
  `authenticated`, but a non-admin who calls one gets nothing.
- Admins call these with their **own signed-in JWT + the public anon key**. There is
  **no service-role key in the browser** — the definer functions supply the elevated
  reach (read `auth.users`, ban, delete) themselves.
- Every mutating action writes an immutable row to `public.admin_audit_log` (visible
  in the **Audit log** tab).

So even if someone opens `/?admin` by hand, they see the "no access" gate and the
server refuses every rpc.

## One-time setup (owner)

1. **Run the schema.** In Supabase → SQL Editor, run `supabase/schema.sql` (idempotent
   and safe to re-run). This adds the `admins` + `admin_audit_log` tables, `is_admin()`,
   and all `admin_*` rpcs, and lets an admin un-hide comments (the comment guard now
   exempts admins from the "can't restore a deleted comment" rule).

2. **Bootstrap the first admin.** There's no admin yet, and the in-app "grant admin"
   action is itself admin-gated — so seed the first one from a trusted shell with the
   **service-role key** (the same `.env` the other operator CLIs use:
   `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`). The target must have signed in at least
   once (so their account + profile exist):

   ```bash
   npm run admin:grant -- --email you@example.com     # grant
   npm run admin:grant -- --email you@example.com --revoke   # revoke
   npm run admin:grant -- --list                       # list current admins
   ```

3. **Open it.** Sign in on the site with that account, then go to `/?admin` (or use the
   "Admin console" link in the account menu). From here you can grant/revoke other
   admins in-app — no more CLI needed.

## What's in it

- **Users** — every account with identity (email, providers, joined, last seen),
  trust tier, activity counts, and admin/banned/subscriber flags. Search (name / email
  / exact id), sortable columns, pagination. Click a row for the full per-user record
  and actions: **ban / unban**, **make / revoke admin**, **recompute trust**, **delete
  user** (cascades all their data), and **hide / unhide** any of their comments.
- **Subscribers** — the newsletter list (otherwise unreadable by clients), filterable
  by status (confirmed / unconfirmed / unsubscribed), with **unsubscribe** and
  **delete** per row. Confirm/unsubscribe tokens are never exposed.
- **Comments** — all comments including hidden ones, searchable, with **hide / unhide**.
- **Moderation** — reported comments ranked by report volume, with a per-category
  breakdown and one-click hide / unhide.
- **Admins** — the allowlist, with revoke (the last admin can't be removed).
- **Audit log** — every admin action, who did it, and when.

## Notes & guard-rails

- **Ban** sets `auth.users.banned_until` (GoTrue refuses new sessions while it's in the
  future). Default is effectively permanent; existing content is untouched.
- **Delete user** hard-deletes the auth user (cascading profile → comments, likes,
  votes, calls, saves) and the email-keyed subscriber row. Audited before the cascade.
- You **can't** ban or delete yourself or another admin, and you can't revoke the last
  admin — revoke an admin first if you need to remove them.
- **Tier** is auto-derived from activity (and decays); there's no manual override, only
  "recompute trust" to refresh it now.
- Re-run `supabase/schema.sql` after pulling schema changes (same as the rest of the
  project's migration-free workflow).
