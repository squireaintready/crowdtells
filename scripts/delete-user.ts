/**
 * Crowdtells — erase one user's data (GDPR/CCPA deletion request).
 *
 *   # preview only (default):
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npx tsx scripts/delete-user.ts --email you@example.com
 *   # actually delete:
 *   … npx tsx scripts/delete-user.ts --email you@example.com --yes
 *
 * Deletes the newsletter subscription (keyed by email, no FK to auth) and then
 * hard-deletes the auth user, which cascades profiles → comments, comment_likes,
 * story_likes, reports, claim_votes, saved_stories, user_interests. This is the
 * operator path; signed-in users can self-serve via the delete_my_account() RPC.
 *
 * Dry-run by DEFAULT: prints what would be removed and changes nothing unless
 * --yes is passed. Honors the deletion promise in public/privacy.html.
 */
import { fileURLToPath } from 'node:url';
import {
  adminCtxFromEnv,
  adminDeleteUser,
  findUserByEmail,
  ilikeEmail,
  restDelete,
  restSelect,
  type AdminCtx,
} from './lib/admin';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Count the rows that erasing this user/email would remove (for the preview). */
export async function previewDeletion(
  ctx: AdminCtx,
  userId: string | null,
  email: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (userId) {
    const byUser = `user_id=eq.${userId}&select=*`;
    const tables = [
      'comments',
      'comment_likes',
      'story_likes',
      'reports',
      'claim_votes',
      'saved_stories',
      'user_interests',
    ];
    const results = await Promise.all(tables.map((t) => restSelect(ctx, t, byUser)));
    tables.forEach((t, i) => (counts[t] = results[i]!.length));
    counts.profiles = (await restSelect(ctx, 'profiles', `id=eq.${userId}&select=id`)).length;
  }
  counts.subscribers = (await restSelect(ctx, 'subscribers', `${ilikeEmail(email)}&select=id`))
    .length;
  return counts;
}

async function main(): Promise<void> {
  const email = arg('--email');
  const confirmed = process.argv.includes('--yes');
  if (!email) {
    console.error('Usage: delete-user.ts --email <address> [--yes]');
    process.exitCode = 1;
    return;
  }
  const ctx = adminCtxFromEnv();
  const user = await findUserByEmail(ctx, email);

  const counts = await previewDeletion(ctx, user?.id ?? null, email);
  const summary = Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  console.log(`Target: ${email}${user ? ` (account ${user.id})` : ' (no account found)'}`);
  console.log(`Rows: ${summary}`);

  if (!confirmed) {
    console.log('\nDry-run (default). Re-run with --yes to permanently delete.');
    return;
  }

  // Subscriber rows have no FK to auth.users, so remove them explicitly first.
  const subs = await restDelete(ctx, 'subscribers', ilikeEmail(email));
  console.log(`Deleted ${subs.length} subscriber row(s).`);

  if (user) {
    // Cascades profiles → comments, likes, votes, saved_stories, user_interests.
    await adminDeleteUser(ctx, user.id);
    console.log(`Deleted account ${user.id} and all cascaded data.`);
  } else {
    console.log('No account to delete (subscriber-only erasure complete).');
  }
  console.log('Done.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
