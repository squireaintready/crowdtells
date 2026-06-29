/**
 * Crowdtells — export one user's data (GDPR/CCPA access request).
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npx tsx scripts/export-user.ts --email you@example.com [--out file.json]
 *
 * Gathers every row tied to a person — across their auth identity (comments,
 * likes, votes, reports, saved stories, topic interests, profile) and their
 * newsletter subscription (keyed by email) — and writes a single JSON document.
 * Uses the service role, so it works whether or not the user is currently signed
 * in. Read-only; pairs with delete-user.ts for the erasure half of the promise.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  adminCtxFromEnv,
  findUserByEmail,
  ilikeEmail,
  restSelect,
  type AdminCtx,
} from './lib/admin';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Collect every record tied to a user id + email into one document. */
export async function collectUserData(
  ctx: AdminCtx,
  user: { id: string; email: string | null },
  email: string,
): Promise<Record<string, unknown>> {
  const byUser = `user_id=eq.${user.id}&select=*`;
  const [profile, comments, commentLikes, storyLikes, reports, claimVotes, saved, interests, subs] =
    await Promise.all([
      restSelect(ctx, 'profiles', `id=eq.${user.id}&select=*`),
      restSelect(ctx, 'comments', byUser),
      restSelect(ctx, 'comment_likes', byUser),
      restSelect(ctx, 'story_likes', byUser),
      restSelect(ctx, 'reports', byUser),
      restSelect(ctx, 'claim_votes', byUser),
      restSelect(ctx, 'saved_stories', byUser),
      restSelect(ctx, 'user_interests', byUser),
      restSelect(ctx, 'subscribers', `${ilikeEmail(email)}&select=*`),
    ]);
  return {
    account: { id: user.id, email: user.email },
    profile: profile[0] ?? null,
    comments,
    comment_likes: commentLikes,
    story_likes: storyLikes,
    reports,
    claim_votes: claimVotes,
    saved_stories: saved,
    user_interests: interests[0] ?? null,
    subscriptions: subs,
  };
}

async function main(): Promise<void> {
  const email = arg('--email');
  if (!email) {
    console.error('Usage: export-user.ts --email <address> [--out <file.json>]');
    process.exitCode = 1;
    return;
  }
  const ctx = adminCtxFromEnv();
  const user = await findUserByEmail(ctx, email);
  if (!user) {
    // Still export any subscriber rows for that email (a subscriber may have no account).
    const subs = await restSelect(ctx, 'subscribers', `${ilikeEmail(email)}&select=*`);
    const doc = { account: null, subscriptions: subs, exportedFor: email };
    output(doc, arg('--out'));
    console.error(`No account found for ${email}${subs.length ? ' (subscriber rows only)' : ''}.`);
    return;
  }
  const doc = await collectUserData(ctx, user, email);
  doc.exportedFor = email;
  output(doc, arg('--out'));
}

function output(doc: Record<string, unknown>, out: string | undefined): void {
  const json = JSON.stringify(doc, null, 2);
  if (out) {
    writeFileSync(out, json);
    console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
