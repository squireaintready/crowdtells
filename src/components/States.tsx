import styles from './States.module.css';

export function LoadingState() {
  // Mirrors the real card anatomy (eyebrow → serif headline → teaser → byline) in
  // StoryCard's unboxed editorial list, so the page doesn't flash a generic card
  // grid before snapping to the loaded feed.
  return (
    <div className={styles.list} aria-busy="true" aria-label="Loading stories">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.skeleton}>
          <span className={styles.skelEyebrow} />
          <span className={styles.skelHead}>
            <span className={styles.skelHeadline} style={{ width: '92%' }} />
            <span className={styles.skelHeadline} style={{ width: '55%' }} />
          </span>
          <span className={styles.skelBody}>
            <span className={styles.skelLine} style={{ width: '100%' }} />
            <span className={styles.skelLine} style={{ width: '97%' }} />
            <span className={styles.skelLine} style={{ width: '72%' }} />
          </span>
          <span className={styles.skelMeta} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyMark} aria-hidden="true">
        ◎
      </span>
      <p>{message}</p>
      {action && (
        <button className={styles.retry} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyMark} aria-hidden="true">
        ⚠
      </span>
      <p>Couldn&apos;t load the feed.</p>
      <button className={styles.retry} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
