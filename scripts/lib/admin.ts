/**
 * Service-role helpers for the operator data-rights CLIs (export-user,
 * delete-user). Plain fetch against Supabase's REST + GoTrue Admin APIs — no
 * supabase-js dependency, mirroring send-digest.ts. The service key bypasses RLS
 * and can administer auth.users, so these run ONLY from a trusted shell (locally
 * or a manually-dispatched CI job), NEVER in the browser bundle.
 */

export interface AdminCtx {
  url: string;
  key: string;
}

/** Read SUPABASE_URL + SUPABASE_SERVICE_KEY from env, or throw a clear error. */
export function adminCtxFromEnv(): AdminCtx {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL and/or SUPABASE_SERVICE_KEY. Export them (the service_role ' +
        'key — NEVER the anon key) before running this tool.',
    );
  }
  return { url: url.replace(/\/$/, ''), key };
}

function headers(ctx: AdminCtx, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: ctx.key, Authorization: `Bearer ${ctx.key}`, ...extra };
}

export interface AdminUser {
  id: string;
  email: string | null;
}

/**
 * Find an auth user by email (case-insensitive). Pages the GoTrue Admin list —
 * fine for a small user base; returns null when no match.
 */
export async function findUserByEmail(ctx: AdminCtx, email: string): Promise<AdminUser | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`${ctx.url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: headers(ctx),
    });
    if (!res.ok) throw new Error(`admin users list failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { users?: AdminUser[] };
    const users = body.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? null };
    if (users.length < perPage) break; // last page
  }
  return null;
}

/** GET rows from a PostgREST table with the service role (bypasses RLS). */
export async function restSelect<T = Record<string, unknown>>(
  ctx: AdminCtx,
  table: string,
  filter: string,
): Promise<T[]> {
  const res = await fetch(`${ctx.url}/rest/v1/${table}?${filter}`, {
    headers: headers(ctx, { Accept: 'application/json' }),
  });
  if (!res.ok) {
    // A table that doesn't exist yet (e.g. saved_stories before the migration) is
    // not fatal for an export — report empty rather than aborting the whole dump.
    if (res.status === 404) return [];
    throw new Error(`select ${table} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

/** DELETE rows from a PostgREST table; returns the deleted rows. */
export async function restDelete<T = Record<string, unknown>>(
  ctx: AdminCtx,
  table: string,
  filter: string,
): Promise<T[]> {
  const res = await fetch(`${ctx.url}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: headers(ctx, { Prefer: 'return=representation', Accept: 'application/json' }),
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`delete ${table} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

/** Bulk UPSERT rows into a PostgREST table, merging on the primary key. Used by
 * the feed-sync step to mirror the published client feed into Supabase. */
export async function restUpsert(ctx: AdminCtx, table: string, rows: object[]): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetch(`${ctx.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(ctx, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`upsert ${table} failed: ${res.status} ${await res.text()}`);
}

/** Call a SECURITY DEFINER rpc with the service role. Used by the gamification
 * scorer to recompute a user's trust after their calls resolve. */
export async function restRpc(ctx: AdminCtx, fn: string, body: object): Promise<void> {
  const res = await fetch(`${ctx.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(ctx, { 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rpc ${fn} failed: ${res.status} ${await res.text()}`);
}

/** Hard-delete an auth user (cascades profiles → comments/likes/votes/saved/etc). */
export async function adminDeleteUser(ctx: AdminCtx, userId: string): Promise<void> {
  const res = await fetch(`${ctx.url}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: headers(ctx),
  });
  if (!res.ok) throw new Error(`admin delete user failed: ${res.status} ${await res.text()}`);
}

/** PostgREST filter value for an exact email match, URL-encoded. */
export function eqEmail(email: string): string {
  return `email=eq.${encodeURIComponent(email)}`;
}

/**
 * Case-insensitive email filter (ilike), URL-encoded. CRITICAL: `_` and `%` are
 * LIKE wildcards and `_` is a legal email character, so we backslash-escape them
 * (PostgREST honors the default LIKE escape) before encoding. Without this,
 * deleting `a_b@x.com` would match — and on the delete path, ERASE — `aXb@x.com`,
 * `a1b@x.com`, etc. (irreversible over-deletion of unrelated subscribers).
 */
export function ilikeEmail(email: string): string {
  const escaped = email.replace(/([\\%_])/g, '\\$1');
  return `email=ilike.${encodeURIComponent(escaped)}`;
}
