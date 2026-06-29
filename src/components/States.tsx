import styles from './States.module.css';

export function LoadingState() {
  return (
    <div className={styles.grid} aria-busy="true" aria-label="Loading stories">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.skeleton}>
          <div className={styles.skelHead}>
            <span className={styles.skelIcon} />
            <span className={styles.skelLines}>
              <span className={styles.skelLine} style={{ width: '90%' }} />
              <span className={styles.skelLine} style={{ width: '60%' }} />
            </span>
          </div>
          <span className={styles.skelBar} />
          <span className={styles.skelLine} style={{ width: '100%' }} />
          <span className={styles.skelLine} style={{ width: '80%' }} />
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
