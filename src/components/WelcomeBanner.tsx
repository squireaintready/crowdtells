import styles from './WelcomeBanner.module.css';

/**
 * Slim, dismissible first-run nudge to personalize the feed — the gentle,
 * non-blocking replacement for the old auto-popping welcome modal. The full topic
 * picker still opens from "Choose topics" (or the Personalize button in Controls).
 */
export function WelcomeBanner({
  onChoose,
  onDismiss,
}: {
  onChoose: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside className={styles.banner} aria-label="Personalize your feed">
      <p className={styles.text}>
        <span className={styles.lead}>Personalize your feed</span>
        <span className={styles.sub}>Follow the topics you care about — we’ll lead with them.</span>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.cta} onClick={onChoose}>
          Choose topics
        </button>
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </aside>
  );
}
