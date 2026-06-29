import type { ImageRef } from './types';

/**
 * How an image should be PLACED depends on what it depicts, not its raw aspect:
 * - 'flag'  — country flags: bordered landscape chip.
 * - 'logo'  — team/org/coin marks: contained on a light tile (so a mark with its
 *             own background, e.g. a cream sports crest, reads cleanly in any theme).
 * - 'photo' — people & real-world scenes: a cutout shown at its natural aspect.
 *
 * Shared by ArticleView (which picks the CSS chrome/sizing class) and figureLayout
 * (which scores the gallery lead), so the two can never drift apart.
 */
export function imageKind(i: ImageRef): 'flag' | 'logo' | 'photo' {
  if (i.source === 'flag' || i.type === 'country') return 'flag';
  if (i.source === 'token' || i.source === 'logo' || i.type === 'team' || i.type === 'org')
    return 'logo';
  return 'photo';
}
