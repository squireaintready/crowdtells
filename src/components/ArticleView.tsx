import { type CSSProperties, Fragment, lazy, Suspense, useEffect, useState } from 'react';
import type { ImageRef, Market } from '../lib/types';
import { crowdRead, crowdShift, describeShift, isDecided, marketTiming } from '../lib/signals';
import { wordDiff, hasChange } from '../lib/diff';
import {
  categoryHue,
  formatDate,
  formatDateShort,
  formatMovement,
  formatPct,
  formatRelative,
  formatUsd,
} from '../lib/format';
import { commentsEnabled } from '../lib/social';
import { useEngagementGate } from '../hooks/useEngagementGate';
import { useReadingAnalytics } from '../hooks/useReadingAnalytics';
import { useIntensity } from '../hooks/useIntensity';
import { useAuthBreadcrumb } from '../lib/authBreadcrumb';
import { hydrateBriefing } from '../lib/hydrate';
import { safeHref } from '../lib/url';
import { figureLayout } from '../lib/figureLayout';
import { imageKind } from '../lib/imageKind';
import { ProbBar } from './ProbBar';
import { TrendChart } from './TrendChart';
import { beliefSeries } from '../lib/trend';
import { Synthesis } from './Synthesis';
import { Sources } from './Sources';
import { SourceBias } from './SourceBias';
import { ShareButton } from './ShareButton';
import { SaveButton } from './SaveButton';
import { BreakingPin, EventsPin } from './Breaking';
import { AggressiveLead } from './pretext/AggressiveLead';
import { FitText } from './pretext/FitText';
import { JustifyText } from './pretext/JustifyText';
// The article reuses the card's editorial type/panel styles (read panel, take,
// market lens, provenance) so the two surfaces stay visually identical.
import card from './StoryCard.module.css';
import styles from './ArticleView.module.css';

const Discussion = lazy(() => import('./discussion/Discussion'));
const TheCall = lazy(() => import('./discussion/TheCall'));

const SOURCE_NAME: Record<Market['source'], string> = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
};

/**
 * The then-odds set behind a revision step as a large, low-opacity serif numeral —
 * the aggressive-only "ghost figure" from the Pretext timeline (the moat made
 * visible: the number we saw at each point, in the background). Purely decorative
 * (the real, legible odds stay in `.todds` in front); CSS scopes it to the
 * aggressive intensity, sits it BEHIND the foreground text, and hides it from a11y.
 */
function GhostOdds({ pct }: { pct: number }) {
  // Exact-fit (FitText) in aggressive — each then-odds numeral fills ~a third of the
  // step to the pixel, whatever the digits (the comp's ghost type). Calm keeps it
  // hidden (CSS) and FitText renders nothing visible; aria-hidden either way.
  return (
    <FitText
      text={formatPct(pct)}
      className={styles.tghost}
      weight={300}
      fillFrac={0.32}
      maxWidthPx={150}
      maxFontPx={120}
      minFontPx={34}
      aria-hidden
    />
  );
}

function Figure({ image }: { image: ImageRef }) {
  // Drop a figure whose image fails to load rather than show a broken-image icon.
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const dims = image.width && image.height ? { width: image.width, height: image.height } : {};
  return (
    <figure className={`${styles.fig} ${styles[imageKind(image)]}`}>
      <img
        src={image.url}
        alt={image.name || ''}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        {...dims}
      />
      {(image.name || image.credit) && (
        <figcaption className={styles.cap}>
          {image.name && <span className={styles.figName}>{image.name}</span>}
          {image.name && image.credit ? ' · ' : ''}
          {image.credit}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Composition-driven figure placement. The layout is chosen from the SHAPE of
 * the figure set (see figureLayout): a team/country head-to-head becomes a
 * matchup panel, a lone image stands large, a field of peers reads as a lineup,
 * a mixed set leads with its most depictable subject — so the article never
 * renders as a row of identical tiles.
 */
function Figures({ figures, market }: { figures: ImageRef[]; market: Market }) {
  if (figures.length === 0) return null;
  const { mode, feature } = figureLayout(figures, market);

  // SOLO — one figure, large and centered, sized by kind in CSS.
  if (mode === 'solo') {
    return (
      <div className={`${styles.figs} ${styles.solo}`}>
        <Figure image={figures[0]!} />
      </div>
    );
  }

  // VERSUS — the two same-kind leads in a matchup panel; trailers demoted to tags.
  if (mode === 'versus') {
    const compType = figures[0]!.type; // 'team' | 'country'
    const leads = figures.filter((f) => f.type === compType).slice(0, 2);
    const tags = figures.filter((f) => !leads.includes(f)); // league / topic / extra marks
    return (
      <div className={`${styles.figs} ${styles.versus}`}>
        <div className={styles.matchup}>
          <Figure image={leads[0]!} />
          <div className={styles.vs} aria-hidden="true">
            <span className={styles.vsLabel}>vs</span>
          </div>
          <Figure image={leads[1]!} />
        </div>
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map((t) => (
              <span key={t.url} className={styles.tag}>
                <img
                  className={styles.tagMark}
                  src={t.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // LINEUP — 3+ same-kind peers, equal named tiles (a field, not a head-to-head).
  if (mode === 'lineup') {
    return (
      <div className={`${styles.figs} ${styles.lineup}`}>
        {figures.map((img) => (
          <Figure key={img.url} image={img} />
        ))}
      </div>
    );
  }

  // PAIR — two non-versus figures, balanced two-up.
  if (mode === 'pair') {
    return (
      <div className={`${styles.figs} ${styles.pair}`}>
        {figures.map((img) => (
          <Figure key={img.url} image={img} />
        ))}
      </div>
    );
  }

  // GALLERY (flat) — a true peer set (all logos/flags), one even auto-fit row.
  if (feature === -1) {
    return (
      <div className={`${styles.figs} ${styles.galleryFlat}`}>
        {figures.map((img) => (
          <Figure key={img.url} image={img} />
        ))}
      </div>
    );
  }

  // GALLERY (role) — one feature subject leads, the rest a smaller supporting strip.
  const lead = figures[feature]!;
  const support = figures.filter((_, i) => i !== feature);
  return (
    <div className={`${styles.figs} ${styles.gallery}`}>
      <div className={styles.galleryFeature}>
        <Figure image={lead} />
      </div>
      <div className={styles.gallerySupport}>
        {support.map((img) => (
          <Figure key={img.url} image={img} />
        ))}
      </div>
    </div>
  );
}

/** The dedicated, full-width reading view for one story (the page behind ?s=). */
export function ArticleView({
  market: m,
  onBack,
  backLabel,
}: {
  market: Market;
  onBack: () => void;
  /** Back-link label reflecting the section the reader came from (see
   *  sectionBackLabel). Falls back to "All stories". */
  backLabel?: string;
}) {
  const source = m.source === 'kalshi' ? 'kalshi' : 'polymarket';
  // The real-world "when", stated in news terms (see marketTiming). Resolved stories
  // carry the date in the recap banner instead, so the standalone line is for
  // still-open / awaiting-result stories — the ones where "when?" is the live question.
  const timing = marketTiming(m);
  // Coverage ticks for the TrendChart — when each article landed. Drawn from the
  // durable coverage union so the timeline keeps earlier ticks across briefing
  // rewrites (falls back to current citations on records predating the field).
  const coverage = (m.coverage ?? m.sources)
    .filter((s) => s.publishedAt)
    .map((s) => ({ t: s.publishedAt!, outlet: s.domain, ...(s.title ? { title: s.title } : {}) }));
  // The durable belief arc (long daily series + recent high-res window) so the chart
  // shows the full opinion timeline, not just the trimmed ~24h window.
  const marketSeries = beliefSeries(m.oddsDaily, m.oddsHistory);
  // A significant, well-funded, non-fresh shift in the crowd's belief over time —
  // surfaced as a quiet labeled caption under the read. null in the common case
  // (see crowdShift's gates); the figures are derived from the same arc the chart draws.
  const shift = crowdShift(m);
  // The byline's dateline — the story's span (first tracked → latest read) drawn from
  // that arc; collapses to a single date when the span is one day, and is '' (so the
  // byline falls back to the briefing stamp) when there's no usable series.
  const bylineRange = (() => {
    const first = marketSeries[0]?.t;
    const last = marketSeries.at(-1)?.t;
    const a = formatDate(first);
    const b = formatDate(last);
    if (!a && !b) return '';
    if (!a || !b || a === b) return a || b;
    return `${a} – ${b}`;
  })();
  const analysis = hydrateBriefing(m.analysis, m);
  // Reading style. The aggressive lead (a horizontal belief chart with the prose set
  // in its sky, or above-the-fold over it) only engages when the reader chose it AND
  // there's a usable belief arc (≥3 points → a curve worth charting) and a lead with
  // enough prose to read as a lead. Everything else stays the calm paragraph. This is
  // only the gate; the actual chart is a client-side enhancement (AggressiveLead).
  const { intensity } = useIntensity();
  // Show the belief strip whenever there's a real curve to draw (≥3 points) and a lead
  // to sit on top of it. The chart is now a strip BELOW the prose, so it no longer
  // needs a long lead to wrap around — the old 160-char floor left too many articles
  // chartless, so it's dropped (the series length is the real requirement).
  const canFlowLead =
    intensity === 'aggressive' && marketSeries.length >= 3 && analysis.trim().length > 0;
  const background = hydrateBriefing(m.background ?? '', m);
  const whatToWatch = hydrateBriefing(m.whatToWatch ?? '', m);
  const take = hydrateBriefing(m.take, m);
  const marketRead = hydrateBriefing(m.marketRead, m);

  // Only a real person photo becomes the lead/curtain; everything else (logos,
  // flags, coins, topic art) is a figure, placed by its kind.
  const heroRef = m.hero && m.hero.type === 'person' ? m.hero : null;
  const [heroFailed, setHeroFailed] = useState(false);
  const hero = heroFailed ? null : heroRef;
  // Figures = every resolved image except the one already used as the hero.
  const figures = (m.images ?? []).filter((i) => i.url !== heroRef?.url && i.name);

  // Open a related story in-app without leaving the article history: push its ?s=
  // entry (preserving the current feed/section context) and let App's popstate handler
  // swap the article in — so Back returns to THIS story, not off-site. Mirrors the
  // pushState + synthetic-popstate pattern App's admin takeover already uses.
  const navigateToStory = (id: string) => {
    try {
      const sp = new URLSearchParams(window.location.search);
      sp.delete('o'); // never carry an overlay flag onto the related story's URL
      sp.set('s', id);
      window.history.pushState(null, '', `${window.location.pathname}?${sp.toString()}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      /* history/URL unavailable — no-op */
    }
  };

  // Esc returns to the feed, mirroring the back affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  // Reading-streak signal: once a SIGNED-IN reader genuinely engages (scroll past
  // the fold or a quiet dwell), record the read. Dynamic import keeps supabase out
  // of the eager bundle; the call is idempotent (same-day reads don't double-count).
  const crumb = useAuthBreadcrumb();
  const engaged = useEngagementGate(commentsEnabled);
  useEffect(() => {
    // Only count a real briefing (generatedAt set) toward the streak/reading tally,
    // never a stub or un-briefed shell.
    if (!engaged || !crumb || !commentsEnabled || !m.generatedAt) return;
    void import('../lib/calls').then((mod) => mod.touchRead(m.id));
  }, [engaged, crumb, m.id, m.generatedAt]);

  // Reading-funnel analytics: opened / depth milestones / completed / closed (PostHog).
  useReadingAnalytics(m);

  return (
    <article
      className={styles.article}
      style={{ '--cat-h': categoryHue(m.category) } as CSSProperties}
    >
      <button type="button" className={styles.back} onClick={onBack}>
        ← {backLabel ?? 'All stories'}
      </button>

      <div className={`${card.eyebrow} ${styles.topline}`}>
        {isDecided(m) && (
          <span
            className={card.decided}
            title="The outcome is effectively decided — near-certain and stable, though the market hasn't officially settled."
          >
            Decided
          </span>
        )}
        <span className={card.category}>{m.category}</span>
        <span className={card.sep} aria-hidden="true">
          /
        </span>
        <span className={`${card.source} ${card[source]}`}>{SOURCE_NAME[source]}</span>
        {(m.crowdVsCoverage === 'ahead' || m.crowdVsCoverage === 'contested') && (
          <span
            className={`${card.pressFlag} ${
              m.crowdVsCoverage === 'contested' ? card.pressContested : card.pressAhead
            }`}
            title="How the market's money lines up with the cited coverage"
          >
            {m.crowdVsCoverage === 'contested' ? 'Coverage disputes this' : 'Crowd ahead of press'}
          </span>
        )}
      </div>

      {m.breaking && m.breaking.length > 0 && (
        <span className={styles.developingTag}>Developing</span>
      )}
      <h1 className={styles.headline}>{m.hook || m.title}</h1>
      {/* Standfirst — justified flush in the aggressive style (metric per-line slack),
          the shipped ragged-right paragraph in calm. */}
      {m.dek && <JustifyText text={m.dek} className={styles.dek} />}

      {m.generatedAt && (
        <p className={styles.byline}>
          <span className={styles.bylineFavored}>Crowd favors {m.favored}</span>
          <span className={styles.bylineSep} aria-hidden="true">
            ·
          </span>
          <span>{formatUsd(m.volume)} in play</span>
          <span className={styles.bylineSep} aria-hidden="true">
            ·
          </span>
          {/* The story's span — when the crowd was first tracked through the latest read
              (the durable belief arc), falling back to the briefing's own stamp. */}
          {bylineRange ? (
            <span>{bylineRange}</span>
          ) : (
            <time dateTime={m.generatedAt}>{formatDate(m.generatedAt)}</time>
          )}
        </p>
      )}

      {/* "When" — the real-world clock, news-first. Still-open and awaiting-result
          stories surface it here (resolved stories carry the date in the recap). */}
      {(timing.state === 'upcoming' || timing.state === 'awaiting') && (
        <p className={`${styles.timing} ${timing.state === 'awaiting' ? styles.timingAwait : ''}`}>
          <span className={styles.timingDot} aria-hidden="true" />
          <time {...(timing.dateTime ? { dateTime: timing.dateTime } : {})}>{timing.label}</time>
          {timing.hint && <span className={styles.timingHint}>· {timing.hint}</span>}
        </p>
      )}

      {m.status === 'resolved' && m.resolvedOutcome && (
        <div className={`${card.recap} ${m.calledCorrectly ? card.recapHit : card.recapMiss}`}>
          <span className={card.recapMark} aria-hidden="true">
            {m.calledCorrectly ? '✓' : '✗'}
          </span>
          <span>
            {m.calledCorrectly ? 'The market called it' : 'The market missed this'} — resolved{' '}
            <b>{m.resolvedOutcome}</b>
            {(m.resolvedAt || m.endDate) && (
              <span className={card.recapWhen}> · {formatDateShort(m.resolvedAt ?? m.endDate)}</span>
            )}
          </span>
        </div>
      )}

      <BreakingPin items={m.breaking} />
      <EventsPin items={m.events} />

      {hero && (
        <figure className={styles.hero}>
          <img
            src={hero.url}
            alt={hero.name || m.hook || m.title}
            decoding="async"
            onError={() => setHeroFailed(true)}
            {...(hero.width && hero.height ? { width: hero.width, height: hero.height } : {})}
          />
          {(hero.name || hero.credit) && (
            <figcaption className={styles.cap}>
              {hero.name}
              {hero.name && hero.credit ? ' · ' : ''}
              {hero.credit}
            </figcaption>
          )}
        </figure>
      )}

      <div className={styles.body}>
        {/* The briefing lead. In the AGGRESSIVE reading style (client-only, once the
            Pretext engine loads) this becomes a real horizontal odds-over-time chart
            (time left→right) with the SAME prose set in its sky, or in full below it.
            In CALM mode — and always on the first render, in tests, with no JS, or for
            crawlers — it's the shipped `.prose` paragraph, untouched. A short or
            series-less lead also stays calm. */}
        {canFlowLead ? (
          <AggressiveLead
            text={analysis}
            series={marketSeries}
            coverageDates={coverage.map((c) => c.t)}
            proseClassName={styles.prose!}
          />
        ) : (
          <p className={styles.prose}>{analysis}</p>
        )}

        {background && (
          <section className={styles.sec}>
            <h2 className={styles.h2}>Background</h2>
            <p className={styles.prose}>{background}</p>
          </section>
        )}

        {m.precedents && m.precedents.length > 0 && (
          <section className={styles.sec}>
            <h2 className={styles.h2}>The precedent</h2>
            <ul className={styles.precedents}>
              {m.precedents.map((fact, i) => (
                <li key={i} className={styles.precedent}>
                  {fact}
                </li>
              ))}
            </ul>
            <p className={styles.precedentNote}>
              Context compiled by Crowdtells from the public record — verify before relying on it.
            </p>
          </section>
        )}

        {figures.length > 0 && <Figures figures={figures} market={m} />}

        {/* The market is ONE cited input — placed after the reporting — but it's the
            article's signature panel: the crowd's odds set large beside the read. */}
        {marketRead && (
          <aside className={styles.lens}>
            {/* Exact-fit odds — in aggressive the figure is measured to fill its column
                to the pixel (whatever the digits); in calm it's the shipped CSS size. */}
            <FitText
              text={formatPct(m.oddsPct)}
              className={`${styles.lensOdds} tnum`}
              weight={340}
              fillFrac={0.42}
              maxWidthPx={210}
              maxFontPx={208}
              minFontPx={60}
              aria-hidden
            />
            <span className={styles.lensBody}>
              <span className={styles.lensLabel}>Market lens</span>
              <span className={styles.lensRead}>{marketRead}</span>
            </span>
          </aside>
        )}

        {m.synthesis && (
          <Synthesis data={m.synthesis} marketId={m.id} sourceCount={m.sources.length} />
        )}

        {whatToWatch && (
          <section className={styles.sec}>
            <h2 className={styles.h2}>What to watch</h2>
            <p className={styles.prose}>{whatToWatch}</p>
          </section>
        )}

        {/* End the prose on our labeled opinion, clearly set apart from the reporting —
            an accent callout, distinct from the neutral briefing. */}
        {take && (
          <aside className={styles.take}>
            <span className={styles.takeKicker}>Our take</span>
            <p className={styles.takeText}>{take}</p>
          </aside>
        )}

        <SourceBias sources={m.sources} />
        <Sources sources={m.sources} marketId={m.id} />
      </div>

      <section className={card.read}>
        <h2 className={card.readHead}>What the market shows</h2>
        <div className={card.readTop}>
          <span className={`${card.crowd} tnum`}>{crowdRead(m)}</span>
        </div>
        {/* When the crowd's belief has moved a lot over time (and the market is well-
            funded and not brand-new), say so — a quiet labeled metric line, derived at
            render so the figures always match the chart. Silent in the common case. */}
        {shift && (
          <p className={styles.shiftNote}>
            <span className={styles.shiftKicker}>The crowd’s read</span>
            <span className="tnum">{describeShift(shift, m.favored)}</span>
          </p>
        )}
        {/* The belief-over-time chart. In the aggressive style the lead already IS this
            chart (horizontal, prose in its sky), so we don't repeat it here — the panel
            stays the numeric read (bar + movement + volume). Calm shows it as shipped. */}
        {!canFlowLead && (
          <TrendChart
            history={marketSeries.length ? marketSeries : [{ t: m.updatedAt, p: m.oddsPct }]}
            revisions={m.revisions}
            coverage={coverage}
            favored={m.favored}
          />
        )}
        <ProbBar pct={m.oddsPct} favored={m.favored} />
        <div className={`${card.moves} tnum`}>
          {m.movement24h != null && (
            <span>
              24h{' '}
              <b className={m.movement24h >= 0 ? card.up : card.down}>
                {formatMovement(m.movement24h)}
              </b>
            </span>
          )}
          {m.movement7d != null && (
            <span>
              7d{' '}
              <b className={m.movement7d >= 0 ? card.up : card.down}>
                {formatMovement(m.movement7d)}
              </b>
            </span>
          )}
          {m.startDate && <span className={card.since}>opened {formatRelative(m.startDate)}</span>}
        </div>
        <p className={`${card.facts} tnum`}>
          <b>{formatUsd(m.volume)}</b> traded
          {m.volume24h > 0 && (
            <>
              {' · '}
              <b>{formatUsd(m.volume24h)}</b> in the last day
            </>
          )}
          {m.liquidity > 0 && (
            <>
              {' · '}
              <b>{formatUsd(m.liquidity)}</b> available to trade
            </>
          )}
          {m.openInterest > 0 && (
            <>
              {' · '}
              <b>{formatUsd(m.openInterest)}</b> in open positions
            </>
          )}
        </p>
        {m.description && (
          <details className={styles.resolves}>
            <summary className={styles.resolvesSummary}>Resolution criteria</summary>
            <p className={styles.resolvesText}>{m.description}</p>
          </details>
        )}
        <div className={card.provenance}>
          <span className={card.provLabel}>Pricing</span>
          {m.marketUrl ? (
            <a
              className={card.provLink}
              href={m.marketUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {SOURCE_NAME[source]} {formatPct(m.oddsPct)}
            </a>
          ) : (
            <span className={card.provLink}>
              {SOURCE_NAME[source]} {formatPct(m.oddsPct)}
            </span>
          )}
          {m.alt &&
            (m.alt.marketUrl ? (
              <a
                className={card.provLink}
                href={safeHref(m.alt.marketUrl) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                {SOURCE_NAME[m.alt.source]} {formatPct(m.alt.oddsPct)}
              </a>
            ) : (
              <span className={card.provLink}>
                {SOURCE_NAME[m.alt.source]} {formatPct(m.alt.oddsPct)}
              </span>
            ))}
          {m.divergence != null && m.divergence >= 1 && (
            <span className={card.gap}>{m.divergence}pt gap</span>
          )}
          {(m.peers?.length ?? 0) - (m.alt ? 1 : 0) >= 1 && (
            <span
              className={card.corroboration}
              title="Multiple prediction markets on this same event, collapsed into one story"
            >
              tracked across {1 + m.peers!.length} markets
            </span>
          )}
        </div>
      </section>

      {/* The crowd's read across the OTHER facets of this same story — the absorbed
          sub-markets (e.g. for US-Iran: "Strait of Hormuz traffic returns to normal",
          "Israel withdraws from Lebanon"). This is the living record across every
          angle, so it sits with the crowd's read (after the market panel, before the
          merely-related board). Each facet links out to its platform. Quiet rows,
          capped at what subSignals holds (<=8). */}
      {m.subSignals && m.subSignals.length > 0 && (
        <section className={styles.facets}>
          <h2 className={styles.facetsHead}>The crowd’s read across this story</h2>
          <ul className={styles.facetsList}>
            {m.subSignals.map((s) => {
              const href = safeHref(s.marketUrl);
              const odds = (
                <span className={`${styles.facetOdds} tnum`}>
                  {s.favored} {formatPct(s.oddsPct)}
                </span>
              );
              const inner = (
                <>
                  <span className={styles.facetMain}>
                    <span className={styles.facetTitle}>{s.title}</span>
                    {odds}
                  </span>
                  <span className={styles.facetMeta}>
                    <ProbBar pct={s.oddsPct} favored={s.favored} />
                    {s.movement24h != null && Math.abs(s.movement24h) >= 1 && (
                      <span
                        className={`${s.movement24h >= 0 ? card.up : card.down} tnum`}
                        title="24-hour change"
                      >
                        <span aria-hidden="true">{s.movement24h >= 0 ? '▲' : '▼'}</span>{' '}
                        {formatMovement(s.movement24h)}
                      </span>
                    )}
                  </span>
                </>
              );
              return (
                <li key={s.id}>
                  {href ? (
                    <a
                      className={styles.facetLink}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className={styles.facetLink}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Other live markets that share a salient entity (a team, city, person…) but are
          a DIFFERENT question — the noteworthy intersection, surfaced as a link rather
          than fused into this story. Opens in-app (Back returns here). */}
      {m.related && m.related.length > 0 && (
        <section className={styles.related}>
          <h2 className={styles.relatedHead}>Related on the board</h2>
          <ul className={styles.relatedList}>
            {m.related.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={styles.relatedLink}
                  onClick={() => navigateToStory(r.id)}
                >
                  <span className={styles.relatedTitle}>{r.title}</span>
                  <span className={`${styles.relatedOdds} tnum`}>{formatPct(r.oddsPct)}</span>
                  {r.via && <span className={styles.relatedVia}>shared: {r.via}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* You've seen the crowd's read and ours — now make your own, scored properly
          when it resolves. Lazy (keeps supabase out of the main bundle). */}
      {commentsEnabled && (
        <Suspense fallback={null}>
          <TheCall market={m} />
        </Suspense>
      )}

      {(m.revisions?.length ?? 0) > 0 && (
        <details className={styles.history}>
          <summary className={styles.historySummary}>
            Updated {m.revisions!.length}× as the odds moved — trace our read
          </summary>
          <ol className={styles.timeline}>
            <li className={styles.tnow}>
              <span className={styles.tdot} aria-hidden="true" />
              <GhostOdds pct={m.oddsPct} />
              <div className={styles.titem}>
                <span className={styles.tmeta}>
                  <span className={styles.twhen}>Now</span>
                  <span className={styles.todds}>
                    {m.favored} {formatPct(m.oddsPct)}
                  </span>
                  {m.status === 'resolved' && m.resolvedOutcome && (
                    <span className={m.calledCorrectly ? styles.tHit : styles.tMiss}>
                      Resolved {m.resolvedOutcome}
                    </span>
                  )}
                </span>
                <p className={styles.thook}>{m.hook || m.title}</p>
              </div>
            </li>
            {m.revisions!.map((r, i) => {
              // A revision is expandable once we retained its body. Diff its
              // headline against the NEXT-NEWER version (or "Now" for the latest)
              // so the reader sees exactly how our read shifted at this step.
              const expandable = !!r.analysis;
              const newerHook = i === 0 ? m.hook || m.title : m.revisions![i - 1]!.hook;
              const headlineDiff = expandable ? wordDiff(r.hook, newerHook) : [];
              const meta = (
                <span className={styles.tmeta}>
                  <span className={styles.twhen}>{formatRelative(r.generatedAt)}</span>
                  <span className={styles.todds}>
                    {r.favored} {formatPct(r.oddsPct)}
                  </span>
                </span>
              );
              if (!expandable) {
                return (
                  <li key={`${r.generatedAt}-${i}`}>
                    <span className={styles.tdot} aria-hidden="true" />
                    <GhostOdds pct={r.oddsPct} />
                    <div className={styles.titem}>
                      {meta}
                      <p className={styles.thook}>{r.hook}</p>
                      {r.dek && <p className={styles.tdek}>{r.dek}</p>}
                    </div>
                  </li>
                );
              }
              return (
                <li key={`${r.generatedAt}-${i}`}>
                  <span className={styles.tdot} aria-hidden="true" />
                  <GhostOdds pct={r.oddsPct} />
                  <details className={styles.trev}>
                    <summary className={styles.titem}>
                      {meta}
                      <span className={styles.thook}>{r.hook}</span>
                      {r.dek && <span className={styles.tdek}>{r.dek}</span>}
                      <span className={styles.tmore}>Read this version</span>
                    </summary>
                    <div className={styles.tread}>
                      {hasChange(headlineDiff) && (
                        <p className={styles.tdiff} aria-label="How the headline changed">
                          <span className={styles.tdiffKicker}>How the headline changed</span>
                          {headlineDiff.map((seg, k) => (
                            <Fragment key={k}>
                              {k > 0 ? ' ' : ''}
                              <span
                                className={
                                  seg.op === 'add'
                                    ? styles.dadd
                                    : seg.op === 'del'
                                      ? styles.ddel
                                      : undefined
                                }
                              >
                                {seg.text}
                              </span>
                            </Fragment>
                          ))}
                        </p>
                      )}
                      <p className={styles.treadBody}>{r.analysis}</p>
                      {r.take && (
                        <p className={styles.treadTake}>
                          <span className={styles.treadKicker}>Our take then</span>
                          {r.take}
                        </p>
                      )}
                      {r.marketRead && <p className={styles.treadLens}>{r.marketRead}</p>}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </details>
      )}

      <p className={card.aiNote}>
        Synthesized by Crowdtells with AI
        {m.sources.length > 0 &&
          ` from ${m.sources.length} cited source${m.sources.length === 1 ? '' : 's'}`}
        . Odds are a market estimate, not a prediction or advice.
      </p>

      <div className={styles.actions}>
        <SaveButton marketId={m.id} />
        <ShareButton marketId={m.id} title={m.hook || m.title} />
      </div>

      {commentsEnabled && (
        <div data-keep-open>
          <Suspense fallback={<p className={card.dek}>Loading discussion…</p>}>
            <Discussion marketId={m.id} favored={m.favored} />
          </Suspense>
        </div>
      )}
    </article>
  );
}
