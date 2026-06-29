/**
 * Bridging-based helpfulness for community notes — a compact 1-dimensional matrix
 * factorization modeled on X's Community Notes. The idea: a note's HELPFULNESS that
 * survives across the latent opinion spectrum (the per-note INTERCEPT) is the
 * signal, NOT raw helpful-vote volume. Same-side pile-ons get absorbed into the
 * viewpoint term (rater_factor · note_factor) and leave the intercept low; a note
 * that raters on OPPOSITE sides both find helpful can only be explained by a high
 * intercept. So intercept ≥ threshold == "cross-cutting helpful".
 *
 * Pure + deterministic (hash-seeded init, fixed global mean) so it's unit-testable
 * and produces STABLE statuses across pipeline runs (no flapping). Runs in the
 * pipeline, best-effort. Thresholds are STARTING values to validate against
 * resolution ground truth before being trusted — see tasks/gamify.md.
 */

export interface Rating {
  noteId: string;
  userId: string;
  helpful: boolean;
}

export type NoteStatus = 'helpful' | 'pending' | 'not_helpful';

export interface NoteResult {
  intercept: number;
  nRaters: number;
  status: NoteStatus;
}

export interface BridgeOpts {
  epochs?: number;
  lr?: number;
  /** Regularization on factors + rater bias. */
  lambda?: number;
  /** Heavier regularization on the note intercept (the bridging signal). */
  lambdaIntercept?: number;
  /** Intercept at/above which a note is surfaced as cross-cutting helpful. */
  threshold?: number;
  /** Minimum distinct raters before any verdict (anti-noise / anti-brigade). */
  minRaters?: number;
}

const DEFAULTS: Required<BridgeOpts> = {
  epochs: 300,
  lr: 0.1,
  lambda: 0.05,
  lambdaIntercept: 0.15,
  // Starting values; our 1-dim regularized model yields smaller intercepts than
  // Community Notes' multi-pass model, and launch volume is low. Validate + retune.
  threshold: 0.25,
  minRaters: 5,
};

/** Deterministic small init in ~[-0.05, 0.05] from a string id (FNV-1a). Breaks the
 * factor symmetry without randomness, so runs are reproducible. */
function seed(s: string): number {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619) >>> 0;
  }
  return ((x % 1000) / 1000 - 0.5) * 0.1;
}

/** Map an intercept + rater count to a verdict. Exported + tested directly so the
 * status policy is decoupled from MF-tuning. */
export function statusFor(intercept: number, nRaters: number, opts: BridgeOpts = {}): NoteStatus {
  const { threshold, minRaters } = { ...DEFAULTS, ...opts };
  if (nRaters < minRaters) return 'pending';
  if (intercept >= threshold) return 'helpful';
  if (intercept <= -threshold) return 'not_helpful';
  return 'pending';
}

/**
 * Fit the model and return per-note {intercept, nRaters, status}. The global mean
 * is fixed (not trained) for stability; rater bias, note intercept, and both
 * factors train via regularized SGD.
 */
export function fitBridging(ratings: Rating[], opts: BridgeOpts = {}): Map<string, NoteResult> {
  const o = { ...DEFAULTS, ...opts };
  const out = new Map<string, NoteResult>();
  if (ratings.length === 0) return out;

  const users = [...new Set(ratings.map((r) => r.userId))];
  const notes = [...new Set(ratings.map((r) => r.noteId))];

  const bu = new Map<string, number>();
  const fu = new Map<string, number>();
  const bi = new Map<string, number>();
  const fi = new Map<string, number>();
  for (const u of users) {
    bu.set(u, 0);
    fu.set(u, seed('u' + u));
  }
  for (const n of notes) {
    bi.set(n, 0);
    fi.set(n, seed('n' + n));
  }
  // Fixed global mean — the baseline helpful rate; intercepts are deviations from it.
  const mu = ratings.reduce((s, r) => s + (r.helpful ? 1 : 0), 0) / ratings.length;

  for (let e = 0; e < o.epochs; e++) {
    for (const r of ratings) {
      const y = r.helpful ? 1 : 0;
      const pu = fu.get(r.userId)!;
      const pi = fi.get(r.noteId)!;
      const bU = bu.get(r.userId)!;
      const bI = bi.get(r.noteId)!;
      const err = y - (mu + bU + bI + pu * pi);
      bu.set(r.userId, bU + o.lr * (err - o.lambda * bU));
      bi.set(r.noteId, bI + o.lr * (err - o.lambdaIntercept * bI));
      fu.set(r.userId, pu + o.lr * (err * pi - o.lambda * pu));
      fi.set(r.noteId, pi + o.lr * (err * pu - o.lambda * pi));
    }
  }

  const raters = new Map<string, number>();
  for (const r of ratings) raters.set(r.noteId, (raters.get(r.noteId) ?? 0) + 1);

  for (const n of notes) {
    const intercept = bi.get(n)!;
    const nRaters = raters.get(n) ?? 0;
    out.set(n, { intercept, nRaters, status: statusFor(intercept, nRaters, o) });
  }
  return out;
}

// ───────────────────────── pipeline orchestration ─────────────────────────
// Kept separate from the pure fit above (which stays I/O-free + unit-tested). Runs
// in generate.ts; best-effort and no-op without a service key.
import { adminCtxFromEnv, restRpc, restSelect, restUpsert, type AdminCtx } from './admin';

/**
 * Recompute every note's bridged status and persist it. Writes a status row for
 * ALL non-deleted notes (notes with no ratings → pending), so the UI always has a
 * row to read. Then recomputes trust for authors of any note that became helpful
 * (awards the "corrected the record" badge). Returns notes processed. Never throws.
 */
export async function bridgeNotes(nowIso: string): Promise<number> {
  let ctx: AdminCtx;
  try {
    ctx = adminCtxFromEnv();
  } catch {
    return 0; // local / dry — nothing to bridge
  }
  try {
    const notes = await restSelect<{ id: string; user_id: string }>(
      ctx,
      'claim_notes',
      'select=id,user_id&deleted=eq.false&limit=20000',
    );
    if (notes.length === 0) return 0;

    const rows = await restSelect<{ note_id: string; user_id: string; helpful: boolean }>(
      ctx,
      'note_ratings',
      'select=note_id,user_id,helpful&limit=50000',
    );
    const fit = fitBridging(rows.map((r) => ({ noteId: r.note_id, userId: r.user_id, helpful: r.helpful })));

    const statusRows = notes.map((n) => {
      const res = fit.get(n.id);
      return {
        note_id: n.id,
        intercept: res?.intercept ?? null,
        status: res?.status ?? 'pending',
        n_raters: res?.nRaters ?? 0,
        updated_at: nowIso,
      };
    });
    await restUpsert(ctx, 'note_status', statusRows);

    const helpful = new Set(statusRows.filter((s) => s.status === 'helpful').map((s) => s.note_id));
    const authors = new Set(notes.filter((n) => helpful.has(n.id)).map((n) => n.user_id));
    for (const uid of authors) {
      try {
        await restRpc(ctx, 'recompute_trust', { p_user_id: uid });
      } catch (e) {
        console.warn(`bridging: recompute_trust ${uid} failed (non-fatal): ${(e as Error).message}`);
      }
    }
    return statusRows.length;
  } catch (e) {
    console.warn(`bridging skipped (non-fatal): ${(e as Error).message}`);
    return 0;
  }
}
