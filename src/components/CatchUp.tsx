import { useState } from 'react';
import type { Market } from '../lib/types';
import { MOBILE_MQ } from '../lib/responsive';
import styles from './CatchUp.module.css';

const isPhone = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches;

/** A compact "what matters right now" brief over the day's top stories. */
export function CatchUp({ stories, onOpen }: { stories: Market[]; onOpen: (id: string) => void }) {
  // Open by default on desktop; on phones it lands collapsed to a single-story peek so
  // it doesn't push the feed down — the peek plus "Show all" signal that it expands.
  const [open, setOpen] = useState(() => !isPhone());
  if (stories.length === 0) return null;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const visible = open ? stories : stories.slice(0, 1);

  return (
    <section
      className={`${styles.wrap} ${open ? '' : styles.compact}`}
      aria-label="Today's brief"
    >
      <button
        type="button"
        className={styles.head}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.kicker}>Catch me up</span>
        <span className={styles.date}>{today}</span>
        <span className={styles.chev} aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      <ol className={styles.list}>
        {visible.map((m, i) => (
          <li key={m.id}>
            <button type="button" className={styles.item} onClick={() => onOpen(m.id)}>
              <span className={styles.num} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.hook}>{m.hook || m.title}</span>
              <span className={styles.cat}>{m.category}</span>
            </button>
          </li>
        ))}
      </ol>
      {!open && stories.length > visible.length && (
        <button
          type="button"
          className={styles.showAll}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          Show all {stories.length}
        </button>
      )}
    </section>
  );
}
