import { describe, expect, it } from 'vitest';
import { nextShownCount } from '../lib/twoRowCollapse';

// Rows are at offsetTop 0, 20, 40…; the toggle's offsetTop says which row it landed on.
describe('nextShownCount', () => {
  it('returns -1 when every chip and the toggle fit in two rows', () => {
    expect(nextShownCount([0, 0, 20, 20], 20, null)).toBe(-1);
  });

  it('collapses to the chips that fit in two rows when chips overflow', () => {
    // 5 chips spill onto a third row (40) → keep the 4 in rows one and two.
    expect(nextShownCount([0, 0, 20, 20, 40], 40, null)).toBe(4);
  });

  it('also collapses when the chips fit but the TOGGLE spills to row three', () => {
    expect(nextShownCount([0, 0, 20, 20], 40, null)).toBe(4);
  });

  it('drops one more chip when, already collapsed, the inline toggle still spills', () => {
    expect(nextShownCount([0, 0, 20, 20], 40, 4)).toBe(3);
  });

  it('holds steady when collapsed and the toggle now fits', () => {
    expect(nextShownCount([0, 0, 20, 20], 20, 3)).toBe(3);
  });

  it('never collapses below one chip', () => {
    expect(nextShownCount([0, 20], 40, 1)).toBe(1);
  });

  it('passes the current state through when there are no chips', () => {
    expect(nextShownCount([], 0, 5)).toBe(5);
  });
});
