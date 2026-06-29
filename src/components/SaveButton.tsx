import { useState } from 'react';
import { toggleSaved, useIsSaved } from '../lib/saved';
import { Burst } from './Burst';
import burst from './Burst.module.css';
import styles from './SaveButton.module.css';

/** Bookmark toggle for read-later. */
export function SaveButton({ marketId }: { marketId: string }) {
  const saved = useIsSaved(marketId);
  const [saveKey, setSaveKey] = useState(0);
  return (
    <button
      type="button"
      className={`${styles.save} ${saved ? styles.on : ''}`}
      aria-pressed={saved}
      aria-label={saved ? 'Saved — tap to remove' : 'Save for later'}
      onClick={() => {
        if (!saved) setSaveKey((k) => k + 1); // flourish only when saving, never on un-save
        toggleSaved(marketId);
      }}
    >
      <span className={styles.icon}>
        <svg
          key={saveKey}
          className={saveKey ? burst.pop : undefined}
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z"
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <Burst trigger={saveKey} tone="accent" />
      </span>
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
