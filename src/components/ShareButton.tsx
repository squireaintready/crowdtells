import { useState } from 'react';
import { shareStory } from '../lib/social';
import { track } from '../lib/posthog';
import styles from './ShareButton.module.css';

export function ShareButton({ marketId, title }: { marketId: string; title: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={styles.share}
      onClick={async () => {
        try {
          const result = await shareStory(title, marketId);
          track('article_shared', { market_id: marketId, method: result });
          if (result === 'copied') {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }
        } catch {
          /* clipboard blocked or share cancelled — ignore */
        }
      }}
    >
      {/* SVG arrow matches the SaveButton bookmark's 14px/1.5-stroke drawing, so the
          two icons in the action row read as one set. */}
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4.5 11.5 11.5 4.5 M6 4.5h5.5V10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* role="status": the Share → "Link copied" swap is announced, not just shown. */}
      <span role="status">{copied ? 'Link copied' : 'Share'}</span>
    </button>
  );
}
