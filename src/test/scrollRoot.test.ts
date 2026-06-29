import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the "Show more" auto-load. The feed window grows via a
 * viewport-rooted IntersectionObserver in LoadMore; if the document stops being the
 * scroll root, the observer never fires and "Show more" silently does nothing on
 * mobile. `overflow-x: hidden` on <body> is the trap — it forces overflow-y to
 * compute to `auto`, turning <body> into a scroll container. Use `clip` (which does
 * not affect the other axis). jsdom can't see layout, so this guards the CSS itself.
 */
describe('scroll root', () => {
  // vitest runs from the repo root, so the stylesheet is a stable relative path.
  // Strip CSS comments first — the body rule's own comment explains the trap and
  // names `overflow-x: hidden`, which would otherwise trip the guard below.
  const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('body must not use overflow-x:hidden (breaks the LoadMore auto-load)', () => {
    expect(css).not.toMatch(/\bbody\s*\{[^}]*overflow-x:\s*hidden/s);
  });

  it('body clamps horizontal overflow with clip (scroll-root-safe)', () => {
    expect(css).toMatch(/\bbody\s*\{[^}]*overflow-x:\s*clip/s);
  });
});
