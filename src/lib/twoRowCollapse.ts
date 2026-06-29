/**
 * The collapsed-chip count for a two-row "show all" rail, given each chip's
 * offsetTop, the inline toggle's offsetTop, and the current `shown` state. Returns
 * the NEXT `shown`:
 *   -1  → everything (incl. the toggle) fits in two rows, so hide the toggle,
 *   n>0 → collapse to n chips so the toggle lands at the end of row two,
 *   or the unchanged `shown` when no adjustment is needed.
 *
 * Controls and Breaking share this math; the per-component effect wiring (when to
 * run, deps, resize source) stays local because it genuinely differs. Pure → this is
 * the part worth unit-testing, since the components' live offsetTop reads can't be
 * (jsdom returns 0, which resolves to "everything fits").
 */
export function nextShownCount(
  chipTops: number[],
  toggleTop: number,
  shown: number | null,
): number | null {
  if (chipTops.length === 0) return shown;
  const rowTops = [...new Set(chipTops)].sort((a, b) => a - b);
  const row2Bottom = (rowTops[1] ?? rowTops[0]!) + 1; // +1px slack for sub-pixel rows
  const showingAll = shown === null || shown === -1;
  if (showingAll) {
    const overflows = chipTops.some((t) => t > row2Bottom) || toggleTop > row2Bottom;
    if (!overflows) return -1; // fits in two rows → no toggle needed
    return Math.max(1, chipTops.filter((t) => t <= row2Bottom).length);
  }
  // Collapsed: if the inline toggle spilled onto a third row, drop one more chip.
  if (shown !== null && shown > 1 && toggleTop > row2Bottom) return shown - 1;
  return shown;
}
