import { TIERS, type Tier } from '../../lib/gamify';
import styles from './TrustBadge.module.css';

/**
 * The small earned-tier mark beside a contributor's name. Reader (the default) is
 * unmarked — recognition is for the earned tiers only. Pure presentational chip;
 * the tier itself comes from the public author_tiers() rpc.
 */
export function TrustBadge({ tier }: { tier: Tier }) {
  if (tier === 'reader') return null;
  return (
    <span className={`${styles.badge} ${styles[tier]}`} title={TIERS[tier].blurb}>
      {TIERS[tier].label}
    </span>
  );
}
