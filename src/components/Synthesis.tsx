import { lazy, Suspense } from 'react';
import type { Synthesis as SynthesisData } from '../lib/types';
import type { Lean } from '../lib/sources';
import { commentsEnabled } from '../lib/social';
import { leanForOutlet, MIN_CONSENSUS_SOURCES, outletDisplay } from '../lib/sources';
import styles from './Synthesis.module.css';

const LEAN_LABEL: Record<Lean, string> = { left: 'Left', center: 'Center', right: 'Right' };

// Lazy so supabase-js (the polling backend) only loads with the discussion chunk.
const ClaimPolls = lazy(() => import('./discussion/ClaimPolls'));

/**
 * Cross-source breakdown, and — once comments are live — three secret-ballot reader polls
 * over it:
 *   • What the coverage AGREES on → "does the reporting hold up?" (true/false)
 *   • Where sources DISAGREE       → accurate / inaccurate (+ community notes)
 *   • Each outlet's PERSPECTIVE     → fact vs opinion
 * Consensus is shown only under the two-source rule (>= 2 cited outlets). Every poll is blind
 * until the reader casts their own vote, then reveals — so the room can't herd the read. When
 * comments aren't configured (SSR / the static twin), each section degrades to a plain list.
 */
export function Synthesis({
  data,
  marketId,
  sourceCount = 0,
}: {
  data: SynthesisData;
  marketId: string;
  /** Distinct cited outlets — gates consensus behind the two-source rule. */
  sourceCount?: number;
}) {
  const hasConsensus = data.consensus.length > 0 && sourceCount >= MIN_CONSENSUS_SOURCES;
  const hasDisputed = data.disputed.length > 0;
  const hasPerspectives = data.perspectives.length > 0;
  if (!hasConsensus && !hasDisputed && !hasPerspectives) return null;

  // Plain, non-interactive fallbacks — what the static twin (and the test/SSR render without
  // comments configured) shows, and the Suspense fallback while the poll chunk loads.
  const plainConsensus = (
    <ul className={styles.list}>
      {data.consensus.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
  const plainDisputed = (
    <ul className={styles.list}>
      {data.disputed.map((d, i) => (
        <li key={i}>{d}</li>
      ))}
    </ul>
  );
  const perspectiveLead = (source: string) => {
    // Normalize a domain-looking source ("reuters.com") to its friendly name; curated
    // names ("Politico") pass through. Carry the subtle L/C/R lean dot when we know it.
    const name = source.includes('.') ? outletDisplay(source) : source;
    const lean = leanForOutlet(source);
    return (
      <span className={styles.outletRow}>
        {lean && (
          <span
            className={`${styles.lean} ${styles[lean]}`}
            role="img"
            aria-label={`${LEAN_LABEL[lean]}-leaning`}
            title={`${LEAN_LABEL[lean]}-leaning outlet`}
          />
        )}
        <span className={styles.outlet}>{name}</span>
      </span>
    );
  };
  const plainPerspectives = (
    <ul className={styles.perspectives}>
      {data.perspectives.map((p, i) => (
        <li key={i}>
          {perspectiveLead(p.source)}
          <span className={styles.view}>{p.view}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={styles.wrap}>
      {hasConsensus && (
        <section className={styles.block}>
          <h2 className={styles.heading}>
            <span className={`${styles.icon} ${styles.agree}`} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor">
                <path
                  d="M3.5 8.5l3 3 6-7"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            What the coverage agrees on
          </h2>
          {commentsEnabled ? (
            <>
              <p className={styles.note}>
                Does the reporting hold up? Your read stays hidden until you cast it.
              </p>
              <div data-keep-open>
                <Suspense fallback={plainConsensus}>
                  <ClaimPolls
                    marketId={marketId}
                    kind="consensus"
                    items={data.consensus.map((c) => ({ text: c }))}
                  />
                </Suspense>
              </div>
            </>
          ) : (
            plainConsensus
          )}
        </section>
      )}

      {hasDisputed && (
        <section className={styles.block}>
          <h2 className={styles.heading}>
            <span className={`${styles.icon} ${styles.dispute}`} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                <rect x="7" y="3.2" width="2" height="6" rx="1" />
                <circle cx="8" cy="12" r="1.15" />
              </svg>
            </span>
            Where sources disagree
          </h2>
          {commentsEnabled && (
            <p className={styles.note}>
              Reader takes below aren’t a verdict — they show how readers read each claim, not a
              fact-check we’ve adjudicated.
            </p>
          )}
          {commentsEnabled ? (
            <div data-keep-open>
              <Suspense fallback={plainDisputed}>
                <ClaimPolls
                  marketId={marketId}
                  kind="dispute"
                  items={data.disputed.map((d) => ({ text: d }))}
                />
              </Suspense>
            </div>
          ) : (
            plainDisputed
          )}
        </section>
      )}

      {hasPerspectives && (
        <section className={styles.block}>
          <h2 className={styles.heading}>
            <span className={`${styles.icon} ${styles.angle}`} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" />
              </svg>
            </span>
            Perspectives
          </h2>
          {commentsEnabled ? (
            <>
              <p className={styles.note}>
                Is each outlet reporting fact, or framing opinion? Weigh in — blind until you vote.
              </p>
              <div data-keep-open>
                <Suspense fallback={plainPerspectives}>
                  <ClaimPolls
                    marketId={marketId}
                    kind="perspective"
                    items={data.perspectives.map((p) => ({
                      text: p.view,
                      lead: perspectiveLead(p.source),
                    }))}
                  />
                </Suspense>
              </div>
            </>
          ) : (
            plainPerspectives
          )}
        </section>
      )}
    </div>
  );
}
