import { useEffect, useRef, useState } from 'react';
import { lockBodyScroll } from '../lib/bodyScroll';
import styles from './Onboarding.module.css';

interface Props {
  /** 'welcome' = first-run intro; 'edit' = returning reader tweaking topics. */
  mode?: 'welcome' | 'edit';
  /** Topics the reader can choose from (the feed's live categories). */
  available: string[];
  /** Currently followed topics (preselected when editing). */
  initial: string[];
  onSave: (topics: string[]) => void;
  /** Dismiss without changes — "see everything" (first run) / "cancel" (edit). */
  onSkip: () => void;
}

/** First-visit (and edit) topic picker that personalizes the feed. */
export function Onboarding({ mode = 'welcome', available, initial, onSave, onSkip }: Props) {
  const editing = mode === 'edit';
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
  const [showAll, setShowAll] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const releaseScroll = lockBodyScroll();
    firstBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
        return;
      }
      if (e.key !== 'Tab' || !dialog.current) return;
      const f = dialog.current.querySelectorAll<HTMLElement>('button');
      if (f.length === 0) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      releaseScroll();
      prevFocus?.focus?.();
    };
  }, [onSkip]);

  const toggle = (t: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  // Keep the picker compact: show a first batch of topics plus any already-picked
  // ones, with an inline "Show more" to reveal the rest. With the pinned footer,
  // Save/Cancel stay visible without scrolling through the whole topic list.
  const COLLAPSED = 12;
  const overflow = available.length > COLLAPSED;
  const visible =
    showAll || !overflow
      ? available
      : available.filter((t, i) => i < COLLAPSED || picked.has(t));

  return (
    <div className={styles.backdrop} onClick={onSkip}>
      <div
        ref={dialog}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.close} onClick={onSkip} aria-label="Close">
          ×
        </button>
        <p className={styles.kicker}>{editing ? 'Personalize' : 'Welcome to Crowdtells'}</p>
        <h2 id="onb-title" className={styles.title}>
          {editing ? 'Your topics' : 'What do you follow?'}
        </h2>
        <p className={styles.sub}>
          {editing
            ? 'Pick the topics you want leading your feed — we’ll surface them first. Change it anytime.'
            : 'Crowdtells follows what the crowd is watching — prediction markets flag the story, we brief it from many outlets, and we track how opinion moves as it unfolds. Pick a few topics and we’ll lead with them — change it anytime.'}
        </p>

        <div className={styles.grid} role="group" aria-label="Topics">
          {visible.map((t, i) => (
            <button
              key={t}
              ref={i === 0 ? firstBtn : undefined}
              type="button"
              className={`${styles.topic} ${picked.has(t) ? styles.on : ''}`}
              aria-pressed={picked.has(t)}
              onClick={() => toggle(t)}
            >
              {t}
            </button>
          ))}
          {overflow && (
            <button
              type="button"
              className={styles.more}
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.skip} onClick={onSkip}>
            {editing ? 'Cancel' : 'See everything'}
          </button>
          <button type="button" className={styles.cta} onClick={() => onSave([...picked])}>
            {editing
              ? picked.size > 0
                ? `Save · ${picked.size}`
                : 'Save'
              : picked.size > 0
                ? `Show my feed · ${picked.size}`
                : 'Show my feed'}
          </button>
        </div>
      </div>
    </div>
  );
}
