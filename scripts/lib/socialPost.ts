/**
 * Posting clients for the gated resolution-card auto-poster (growth bet #1).
 *
 * Two free, no-SDK clients — Bluesky (AT Protocol) and Mastodon — that publish a
 * resolution card with a link-card embed. Both are NO-OPS that return
 * {ok:false, skipped:true} when their credentials are absent, so the orchestrator
 * (and the pipeline) stay completely inert until the owner sets secrets. We use the
 * shared `request` helper (timeouts + retry) and NEVER log credentials or tokens.
 *
 * Bluesky: createSession (handle + app password → accessJwt + did), uploadBlob for
 * the image, then createRecord (app.bsky.feed.post) with an app.bsky.embed.external
 * link card. Default service host https://bsky.social.
 * Mastodon: optional /api/v2/media upload, then POST /api/v1/statuses with a Bearer
 * token. The card text already contains the link, so Mastodon renders its own card.
 */
import { readFileSync } from 'node:fs';
import { request } from './http';

/** Outcome of one post attempt. `skipped` marks the inert (no-creds) no-op so the
 * orchestrator can tell "not configured" from a real failure. */
export interface PostResult {
  ok: boolean;
  /** Platform post id / URI on success. */
  id?: string;
  /** Human-readable error on failure (never contains credentials). */
  error?: string;
  /** True when the client no-op'd because its credentials weren't configured. */
  skipped?: boolean;
}

/** Bluesky (AT Protocol) credentials, read from env by the orchestrator. */
export interface BlueskyCreds {
  /** e.g. "crowdtells.bsky.social" or a custom-domain handle. */
  handle: string;
  /** An APP password (Settings → App Passwords), never the account password. */
  appPassword: string;
  /** Service host; defaults to https://bsky.social. */
  service?: string;
}

/** Mastodon credentials, read from env by the orchestrator. */
export interface MastodonCreds {
  /** Instance origin, e.g. "https://mastodon.social". */
  instance: string;
  /** A user access token with `write:statuses` (+ `write:media` for an image). */
  token: string;
}

/** Guess an image's MIME type from its extension (we only ever render PNG). */
function imageMime(path: string): string {
  return /\.jpe?g$/i.test(path) ? 'image/jpeg' : 'image/png';
}

const POST_TIMEOUT_MS = 15_000;

/**
 * Post a resolution card to Bluesky. NO-OP returning {ok:false, skipped:true} when
 * creds are absent. On a configured run: open a session, (optionally) upload the
 * image as a blob, then create a feed post with an external link-card embed pointing
 * at `link`. Returns the post URI on success; an error string (never the password)
 * on failure. Best-effort — the caller treats any failure as non-fatal.
 */
export async function postToBluesky(
  text: string,
  link: string,
  creds: BlueskyCreds | null,
  opts: { imgPath?: string; title?: string; description?: string } = {},
): Promise<PostResult> {
  if (!creds || !creds.handle || !creds.appPassword) return { ok: false, skipped: true };
  const service = (creds.service || 'https://bsky.social').replace(/\/$/, '');

  try {
    // 1. Session → accessJwt + did.
    const sessRes = await request(`${service}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: creds.handle, password: creds.appPassword }),
      timeoutMs: POST_TIMEOUT_MS,
      retries: 2,
    });
    if (!sessRes.ok) return { ok: false, error: `createSession ${sessRes.status}` };
    const session = (await sessRes.json()) as { accessJwt?: string; did?: string };
    if (!session.accessJwt || !session.did) return { ok: false, error: 'createSession: no token' };
    const auth = { Authorization: `Bearer ${session.accessJwt}` };

    // 2. Optional image blob for the link-card thumbnail.
    let thumb: unknown;
    if (opts.imgPath) {
      try {
        const bytes = readFileSync(opts.imgPath);
        const blobRes = await request(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': imageMime(opts.imgPath) },
          body: bytes,
          timeoutMs: POST_TIMEOUT_MS,
          retries: 2,
        });
        if (blobRes.ok) thumb = ((await blobRes.json()) as { blob?: unknown }).blob;
      } catch {
        // A failed thumbnail must not block the post — fall through without it.
      }
    }

    // 3. The post itself, with an external link-card embed.
    const external: Record<string, unknown> = {
      uri: link,
      title: opts.title || 'Crowdtells',
      description: opts.description || text,
    };
    if (thumb) external.thumb = thumb;
    const record = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
      embed: { $type: 'app.bsky.embed.external', external },
    };
    const postRes = await request(`${service}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
      timeoutMs: POST_TIMEOUT_MS,
      retries: 2,
    });
    if (!postRes.ok) return { ok: false, error: `createRecord ${postRes.status}` };
    const out = (await postRes.json()) as { uri?: string };
    return { ok: true, id: out.uri };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Post a resolution card to Mastodon. NO-OP returning {ok:false, skipped:true} when
 * creds are absent. On a configured run: (optionally) upload the image to
 * /api/v2/media, then POST /api/v1/statuses with a Bearer token. The status text
 * carries the link, so Mastodon renders its own preview card. Returns the status id
 * on success; an error string (never the token) on failure. Best-effort.
 */
export async function postToMastodon(
  text: string,
  link: string,
  creds: MastodonCreds | null,
  opts: { imgPath?: string; altText?: string } = {},
): Promise<PostResult> {
  if (!creds || !creds.instance || !creds.token) return { ok: false, skipped: true };
  const instance = creds.instance.replace(/\/$/, '');
  const auth = { Authorization: `Bearer ${creds.token}` };
  // The link is appended to the status (Mastodon has no separate link field) so the
  // instance builds its own preview card; de-dup if the caller already included it.
  const status = text.includes(link) ? text : `${text}\n\n${link}`;

  try {
    // 1. Optional media upload (v2 → media id).
    let mediaId: string | undefined;
    if (opts.imgPath) {
      try {
        const bytes = readFileSync(opts.imgPath);
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: imageMime(opts.imgPath) }), 'card.png');
        if (opts.altText) form.append('description', opts.altText);
        const mediaRes = await request(`${instance}/api/v2/media`, {
          method: 'POST',
          headers: auth,
          body: form,
          timeoutMs: POST_TIMEOUT_MS,
          retries: 2,
        });
        if (mediaRes.ok) mediaId = ((await mediaRes.json()) as { id?: string }).id;
      } catch {
        // A failed media upload must not block the status — post text-only.
      }
    }

    // 2. The status. Idempotency-Key dedupes a retried POST instance-side.
    const body: Record<string, unknown> = { status, visibility: 'public' };
    if (mediaId) body.media_ids = [mediaId];
    const res = await request(`${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'Idempotency-Key': link },
      body: JSON.stringify(body),
      timeoutMs: POST_TIMEOUT_MS,
      retries: 2,
    });
    if (!res.ok) return { ok: false, error: `statuses ${res.status}` };
    const out = (await res.json()) as { id?: string };
    return { ok: true, id: out.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
