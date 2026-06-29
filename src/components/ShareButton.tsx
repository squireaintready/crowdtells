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
      <span aria-hidden="true">↗</span> {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
