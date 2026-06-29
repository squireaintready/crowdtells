import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EmailPrefs, Frequency } from '../lib/newsletter';
import styles from './EmailPrefs.module.css';

const FREQS: { key: Frequency; label: string; hint: string }[] = [
  { key: 'weekly', label: 'Weekly', hint: 'one brief a week' },
  { key: 'daily', label: 'Daily', hint: 'every morning' },
];

// The topic list is long (40+ categories); collapse it to two rows behind a
// "Show all" toggle so it never dominates the card. Mirrors the category-rail
// collapse in Controls.tsx, but the toggle sits on its own line below the rail
// (it doesn't need to land at the end of row two).
const TOPIC_ROWS = 2;

/**
 * Controlled email-preference fields (frequency · topics), shared by
 * the footer signup and the account panel so the two stay identical. Topics are
 * an opt-in filter: none picked = every category. Categories come from the live
 * feed; the topic picker is hidden when none are known.
 */
export function EmailPrefsFields({
  value,
  onChange,
  categories,
}: {
  value: EmailPrefs;
  onChange: (next: EmailPrefs) => void;
  categories: string[];
}) {
  const toggleTopic = (t: string) =>
    onChange({
      ...value,
      topics: value.topics.includes(t)
        ? value.topics.filter((x) => x !== t)
        : [...value.topics, t],
    });

  const railRef = useRef<HTMLDivElement>(null);
  const [topicsOpen, setTopicsOpen] = useState(false);
  // Chips that fit within TOPIC_ROWS rows; null = unmeasured (render all so we
  // can read their wrapped positions, then settle on a count).
  const [fitCount, setFitCount] = useState<number | null>(null);
  const sig = categories.join('|');

  // A new category set → re-measure from scratch.
  useLayoutEffect(() => {
    setFitCount(null);
  }, [sig]);

  // Count the chips whose top sits within the first TOPIC_ROWS rows. Runs while
  // unmeasured (all chips rendered) and settles once.
  useLayoutEffect(() => {
    if (topicsOpen || fitCount !== null) return;
    const rail = railRef.current;
    if (!rail) return;
    const chips = Array.from(rail.querySelectorAll<HTMLElement>('[data-topic]'));
    if (chips.length === 0) return;
    const tops = chips.map((c) => c.offsetTop);
    const rowTops = [...new Set(tops)].sort((a, b) => a - b);
    if (rowTops.length <= TOPIC_ROWS) {
      setFitCount(chips.length); // already two rows or fewer — no toggle
      return;
    }
    const cutoff = rowTops[TOPIC_ROWS]!; // top of the first row past the limit
    setFitCount(Math.max(1, tops.filter((t) => t < cutoff).length));
  }, [topicsOpen, fitCount, sig]);

  // Re-measure only when the rail's WIDTH changes (ignore the height changes our
  // own slicing causes, so this can't feed back on itself).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let last = 0;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]!.contentRect.width;
      if (Math.abs(w - last) < 1) return;
      last = w;
      setFitCount(null);
    });
    ro.observe(rail);
    return () => ro.disconnect();
  }, []);

  const measuring = fitCount === null;
  const hasOverflow = fitCount !== null && fitCount < categories.length;
  const shownTopics = topicsOpen || measuring ? categories : categories.slice(0, fitCount);
  const showToggle = topicsOpen || hasOverflow;

  return (
    <div className={styles.fields}>
      <div className={styles.field}>
        <span className={styles.label}>How often</span>
        <div className={styles.seg} role="radiogroup" aria-label="Email frequency">
          {FREQS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={value.frequency === f.key}
              className={`${styles.segBtn} ${value.frequency === f.key ? styles.segOn : ''}`}
              onClick={() => onChange({ ...value, frequency: f.key })}
            >
              {f.label}
              <span className={styles.segHint}>{f.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>
            Topics <span className={styles.hint}>· all if none picked</span>
          </span>
          <div ref={railRef} className={styles.topics}>
            {shownTopics.map((c) => (
              <button
                key={c}
                type="button"
                data-topic
                aria-pressed={value.topics.includes(c)}
                className={`${styles.chip} ${value.topics.includes(c) ? styles.chipOn : ''}`}
                onClick={() => toggleTopic(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {showToggle && (
            <button
              type="button"
              className={styles.topicsToggle}
              aria-expanded={topicsOpen}
              onClick={() => setTopicsOpen((o) => !o)}
            >
              {topicsOpen ? 'Show fewer' : `Show all ${categories.length} topics`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
