import { supabase } from './supabase';
import { type Tier, NOTE_MAX } from './gamify';

/**
 * Community notes on disputed claims + their bridged helpfulness. Authoring is
 * gated to Contributor+ (enforced by RLS; the UI also checks my_tier to avoid
 * offering an action that would be rejected). Ratings are a secret ballot, open to
 * any signed-in reader. All reads fail soft (render nothing pre-migration). Lives in
 * the lazy discussion chunk.
 */
export type NoteStatus = 'helpful' | 'pending' | 'not_helpful';

export interface ClaimNote {
  id: string;
  claimId: string;
  authorId: string;
  body: string;
  authorName: string | null;
  authorAvatar: string | null;
  status: NoteStatus;
  nRaters: number;
  /** The viewer's own rating: true = helpful, false = not, null = unrated. */
  myRating: boolean | null;
}

export interface ClaimNotesData {
  byClaim: Map<string, ClaimNote[]>;
  myTier: Tier;
}

/** Trim + validate a note body; throws a user-facing error when invalid. */
export function validateNote(body: string): string {
  const text = body.trim();
  if (text.length === 0) throw new Error('Write the context first.');
  if (text.length > NOTE_MAX) throw new Error(`Keep it under ${NOTE_MAX} characters.`);
  return text;
}

/** Notes for a set of claims (with bridged status + the viewer's own ratings), plus
 * the viewer's tier so the UI can gate the "add context" affordance. */
export async function fetchClaimNotes(
  claimIds: string[],
  userId: string | null,
): Promise<ClaimNotesData> {
  const byClaim = new Map<string, ClaimNote[]>();
  let myTier: Tier = 'reader';
  if (!supabase || claimIds.length === 0) return { byClaim, myTier };

  const { data } = await supabase.rpc('note_helpfulness', { p_claim_ids: claimIds });
  const rows = (data ?? []) as {
    note_id: string;
    claim_id: string;
    user_id: string;
    body: string;
    author_name: string | null;
    author_avatar: string | null;
    status: NoteStatus;
    n_raters: number;
    created_at: string;
  }[];

  const mine = new Map<string, boolean>();
  if (userId && rows.length > 0) {
    const { data: rData } = await supabase
      .from('note_ratings')
      .select('note_id, helpful')
      .eq('user_id', userId)
      .in(
        'note_id',
        rows.map((r) => r.note_id),
      );
    for (const r of (rData ?? []) as { note_id: string; helpful: boolean }[]) {
      mine.set(r.note_id, r.helpful);
    }
  }

  for (const r of rows) {
    const note: ClaimNote = {
      id: r.note_id,
      claimId: r.claim_id,
      authorId: r.user_id,
      body: r.body,
      authorName: r.author_name,
      authorAvatar: r.author_avatar,
      status: r.status,
      nRaters: Number(r.n_raters),
      myRating: mine.has(r.note_id) ? mine.get(r.note_id)! : null,
    };
    const list = byClaim.get(r.claim_id);
    if (list) list.push(note);
    else byClaim.set(r.claim_id, [note]);
  }

  if (userId) {
    const { data: t } = await supabase.rpc('my_tier');
    if (typeof t === 'string') myTier = t as Tier;
  }
  return { byClaim, myTier };
}

/** Add a note to a claim. RLS rejects it unless the author is Contributor+. */
export async function postNote(claimId: string, userId: string, body: string): Promise<void> {
  if (!supabase) return;
  const text = validateNote(body);
  const { error } = await supabase
    .from('claim_notes')
    .insert({ claim_id: claimId, user_id: userId, body: text });
  if (error) throw new Error(error.message);
}

/** Remove the caller's own note (ratings + status cascade). */
export async function deleteNote(noteId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('claim_notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/** Rate a note helpful / not helpful (upsert — re-rating overwrites). */
export async function rateNote(noteId: string, userId: string, helpful: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('note_ratings')
    .upsert({ note_id: noteId, user_id: userId, helpful }, { onConflict: 'note_id,user_id' });
  if (error) throw new Error(error.message);
}

export async function unrateNote(noteId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('note_ratings')
    .delete()
    .eq('note_id', noteId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
