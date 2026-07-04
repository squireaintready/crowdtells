import { useState } from 'react';
import { NOTE_MAX } from '../../lib/gamify';
import {
  type ClaimNote,
  deleteNote,
  postNote,
  rateNote,
  unrateNote,
  validateNote,
} from '../../lib/notes';
import { track } from '../../lib/posthog';
import styles from './ClaimNotes.module.css';

/** One community note: body, attribution, bridged status, and (signed-in) ratings.
 * You can't rate your own note — only delete it (keeps the bridging signal clean). */
function Note({
  note,
  userId,
  onChange,
}: {
  note: ClaimNote;
  userId: string | null;
  onChange: () => void;
}) {
  const [rating, setRating] = useState<boolean | null>(note.myRating);
  const [count, setCount] = useState(note.nRaters);
  const mine = !!userId && note.authorId === userId;
  const helpful = note.status === 'helpful';

  const rate = async (helpfulVote: boolean) => {
    if (!userId) return;
    const prev = rating;
    const prevCount = count;
    const next = rating === helpfulVote ? null : helpfulVote; // click the same one to clear
    setRating(next);
    if (prev === null && next !== null) setCount((c) => c + 1);
    if (prev !== null && next === null) setCount((c) => c - 1);
    try {
      if (next === null) await unrateNote(note.id, userId);
      else await rateNote(note.id, userId, next);
      track(next === null ? 'note_unrated' : 'note_rated', { helpful: next ?? undefined });
    } catch {
      setRating(prev);
      setCount(prevCount);
    }
  };

  return (
    <div className={`${styles.note} ${helpful ? styles.helpful : ''}`}>
      {helpful && (
        <span className={styles.tag} title="Readers across differing viewpoints found this helpful">
          ✓ Helpful context
        </span>
      )}
      <p className={styles.body}>{note.body}</p>
      <div className={styles.meta}>
        <span className={styles.author}>{note.authorName ?? 'Contributor'}</span>
        {count > 0 && (
          <span className={styles.raters}>
            · {count} rating{count === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {userId && !mine && (
        <div className={styles.rate} role="group" aria-label="Was this context helpful?">
          <button
            type="button"
            className={`${styles.rateBtn} ${rating === true ? styles.rOn : ''}`}
            aria-pressed={rating === true}
            onClick={() => void rate(true)}
          >
            Helpful
          </button>
          <button
            type="button"
            className={`${styles.rateBtn} ${rating === false ? styles.rOff : ''}`}
            aria-pressed={rating === false}
            onClick={() => void rate(false)}
          >
            Not helpful
          </button>
        </div>
      )}
      {mine && (
        <div className={styles.rate}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={async () => {
              if (!window.confirm('Delete this note?')) return;
              try {
                await deleteNote(note.id, userId!);
                onChange();
              } catch {
                /* keep the note visible if the delete failed */
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Community context under a disputed claim. Notes that earned cross-viewpoint
 * agreement show openly; proposed ones sit behind a neutral "not yet established"
 * disclosure (a pending note is NEVER presented as endorsed). Adding context is
 * gated to Contributor+; rating is open to any signed-in reader.
 */
export function ClaimNotes({
  claimId,
  notes,
  canAuthor,
  signedIn,
  userId,
  onChange,
}: {
  claimId: string;
  notes: ClaimNote[];
  canAuthor: boolean;
  signedIn: boolean;
  userId: string | null;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const helpful = notes.filter((n) => n.status === 'helpful');
  const proposed = notes.filter((n) => n.status !== 'helpful');

  const submit = async () => {
    if (!userId) return;
    setErr(null);
    try {
      validateNote(draft);
      setBusy(true);
      await postNote(claimId, userId, draft);
      setDraft('');
      setOpen(false);
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Nothing to show and nothing the viewer can do → stay out of the way.
  if (notes.length === 0 && !signedIn) return null;

  return (
    <div className={styles.wrap}>
      {helpful.map((n) => (
        <Note key={n.id} note={n} userId={userId} onChange={onChange} />
      ))}

      {proposed.length > 0 && (
        <details className={styles.proposed}>
          <summary className={styles.proposedSummary}>
            {proposed.length} note{proposed.length === 1 ? '' : 's'} proposed — not yet established
          </summary>
          <div className={styles.proposedList}>
            {proposed.map((n) => (
              <Note key={n.id} note={n} userId={userId} onChange={onChange} />
            ))}
          </div>
        </details>
      )}

      {open ? (
        <div className={styles.composer}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="Add sourced context — what's missing, misleading, or needs a citation here?"
            aria-label="Add context to this claim"
            autoFocus
          />
          {/* Always mounted (empty until a failure) so the swap-in is reliably announced. */}
          <p className={styles.err} aria-live="polite">
            {err}
          </p>
          <div className={styles.composerActions}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.add}
              onClick={() => void submit()}
              disabled={busy || draft.trim().length === 0}
            >
              {busy ? 'Adding…' : 'Add context'}
            </button>
          </div>
        </div>
      ) : canAuthor ? (
        <button type="button" className={styles.addLink} onClick={() => setOpen(true)}>
          + Add context
        </button>
      ) : signedIn ? (
        <p className={styles.hint}>Adding context unlocks at the Contributor tier.</p>
      ) : null}
    </div>
  );
}
