/**
 * Composition-driven placement for the article's supporting figures.
 *
 * The article reads as a real article (not a row of identical tiles) by choosing
 * a layout from the SHAPE of the figure set rather than forcing every image to
 * one height. The person-portrait curtain HERO is handled separately by
 * ArticleView; `figures` here is exactly the set ArticleView builds:
 *   (m.images ?? []).filter((i) => i.url !== heroRef?.url && i.name)
 * i.e. the hero is already removed and every figure is NAMED + resolvable.
 *
 * Pure + deterministic (same inputs → same mode + feature index, no I/O), so it
 * is unit-testable. `market` is unused today but kept in the signature so a
 * future category/source-keyed mode needs no call-site change.
 */
import type { ImageRef, Market } from './types';
import { imageKind } from './imageKind';

export type FigureMode = 'solo' | 'versus' | 'lineup' | 'pair' | 'gallery';

export interface FigureLayout {
  mode: FigureMode;
  /** Gallery only: index of the lead/feature figure, or -1 for a flat peer grid.
   *  Ignored by every other mode. */
  feature: number;
}

/** A genuinely depictable subject deserves to LEAD a gallery. People/scenes and
 *  topic posters are the most pictorial; a lone token (a coin) is also a subject;
 *  brand/team logos are mid; flags are pure context. Portrait orientation is the
 *  strongest signal a thing was shot to be looked at. */
function featureScore(i: ImageRef): number {
  let s = 0;
  if (imageKind(i) === 'photo') s += 3; // person / scene / topic poster art
  if (i.orientation === 'portrait') s += 2; // shot to be the lead
  if (i.type === 'token') s += 2; // a single coin reads as the subject
  if (imageKind(i) === 'flag') s -= 1; // flags are always context, never lead
  return s;
}

export function figureLayout(figures: ImageRef[], _market: Market): FigureLayout {
  const n = figures.length;
  if (n === 0) return { mode: 'gallery', feature: -1 }; // caller guards n>0; safe default
  if (n === 1) return { mode: 'solo', feature: -1 };

  // Count how many share ONE competitive type. This single count tells a
  // two-sided matchup (exactly 2 teams/countries) apart from a multi-way field
  // (3+): Giants/Braves & US/Iran → 2 (versus); LeBron → 3 teams, World Cup → 4
  // teams (lineup).
  const teams = figures.filter((f) => f.type === 'team').length;
  const countries = figures.filter((f) => f.type === 'country').length;
  const competitors = Math.max(teams, countries);
  const a = figures[0]!;
  const b = figures[1]!;
  const leadsAreSameComp =
    (a.type === 'team' && b.type === 'team') ||
    (a.type === 'country' && b.type === 'country');

  // LINEUP: a field of 3+ same-kind peers. A 2-up "vs" would misrepresent it.
  if (competitors >= 3) return { mode: 'lineup', feature: -1 };

  // VERSUS: a real two-sided matchup — the two leads are the same competitive
  // kind and there are at most two of that kind total. Trailing context marks
  // (league org / topic / extra flag) are allowed; the renderer demotes them.
  if (leadsAreSameComp && competitors === 2) return { mode: 'versus', feature: -1 };

  // PAIR: exactly two, mixed/non-competitive (org+token, person+person, …).
  if (n === 2) return { mode: 'pair', feature: -1 };

  // GALLERY: 3+ mixed marks. Pick the feature by score; tie-break by original
  // order (the model already ranks entities by prominence, so the earliest
  // top-scoring figure is the best lead). If nothing scores > 0 it is a true peer
  // set (all logos/flags) → feature = -1 → flat even grid.
  let feature = -1;
  let best = 0; // strictly-positive threshold: a 0-score (plain logo) never leads
  for (let i = 0; i < n; i++) {
    const sc = featureScore(figures[i]!);
    if (sc > best) {
      best = sc;
      feature = i;
    }
  }
  return { mode: 'gallery', feature };
}
