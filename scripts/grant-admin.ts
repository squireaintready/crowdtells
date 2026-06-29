/**
 * Crowdtells — grant or revoke admin-console access for a user (by email).
 *
 *   # list current admins:
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npx tsx scripts/grant-admin.ts --list
 *   # grant admin:
 *   … npx tsx scripts/grant-admin.ts --email you@example.com
 *   # revoke admin:
 *   … npx tsx scripts/grant-admin.ts --email you@example.com --revoke
 *
 * This is the BOOTSTRAP path: the in-app "grant admin" action is itself admin-gated,
 * so the very first admin must be added here, with the service-role key (which
 * bypasses RLS), from a trusted shell. The user must already have signed in at least
 * once (so their auth account + profile exist). After this, admins manage each other
 * from the /?admin console. Mirrors scripts/delete-user.ts; never runs in the browser.
 */
import { fileURLToPath } from 'node:url';
import {
  adminCtxFromEnv,
  findUserByEmail,
  restDelete,
  restSelect,
  restUpsert,
  type AdminCtx,
} from './lib/admin';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface AdminRow {
  user_id: string;
  added_at: string;
  added_by: string | null;
}

/** Print the current admin allowlist (joined to emails for legibility). */
export async function listAdmins(ctx: AdminCtx): Promise<void> {
  const rows = await restSelect<AdminRow>(ctx, 'admins', 'select=user_id,added_at,added_by&order=added_at.asc');
  if (rows.length === 0) {
    console.log('No admins yet. Grant the first with: --email <address>');
    return;
  }
  console.log(`${rows.length} admin(s):`);
  for (const r of rows) {
    // Best-effort email lookup so the list is readable; the id is the source of truth.
    const profile = await restSelect<{ display_name: string | null }>(
      ctx,
      'profiles',
      `id=eq.${r.user_id}&select=display_name`,
    );
    const name = profile[0]?.display_name ?? '';
    console.log(`  ${r.user_id}${name ? `  (${name})` : ''}  — added ${r.added_at}`);
  }
}

async function main(): Promise<void> {
  const ctx = adminCtxFromEnv();
  if (process.argv.includes('--list')) {
    await listAdmins(ctx);
    return;
  }

  const email = arg('--email');
  const revoke = process.argv.includes('--revoke');
  if (!email) {
    console.error('Usage: grant-admin.ts --email <address> [--revoke] | --list');
    process.exitCode = 1;
    return;
  }

  const user = await findUserByEmail(ctx, email);
  if (!user) {
    console.error(
      `No account found for ${email}. The user must sign in at least once before they ` +
        'can be made an admin (so their auth account + profile exist).',
    );
    process.exitCode = 1;
    return;
  }

  if (revoke) {
    const all = await restSelect<AdminRow>(ctx, 'admins', 'select=user_id');
    if (all.length <= 1 && all.some((a) => a.user_id === user.id)) {
      console.error('Refusing to revoke the last admin (would lock everyone out).');
      process.exitCode = 1;
      return;
    }
    const removed = await restDelete(ctx, 'admins', `user_id=eq.${user.id}`);
    console.log(
      removed.length > 0
        ? `Revoked admin from ${email} (${user.id}).`
        : `${email} (${user.id}) was not an admin — nothing to revoke.`,
    );
    return;
  }

  // Grant: upsert the allowlist row (idempotent; merges on the user_id PK).
  await restUpsert(ctx, 'admins', [{ user_id: user.id }]);
  console.log(`Granted admin to ${email} (${user.id}). They can now open /?admin while signed in.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
