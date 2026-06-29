import { describe, expect, it } from 'vitest';
import { wordDiff, hasChange, type DiffSeg } from '../lib/diff';

const render = (segs: DiffSeg[]) => segs.map((s) => `${s.op[0]}:${s.text}`).join('|');
const rebuild = (segs: DiffSeg[], side: 'before' | 'after') =>
  segs
    .filter((s) => s.op === 'same' || s.op === (side === 'before' ? 'del' : 'add'))
    .map((s) => s.text)
    .join(' ');

describe('wordDiff', () => {
  it('marks an identical string as all same', () => {
    const segs = wordDiff('Fed holds rates steady', 'Fed holds rates steady');
    expect(segs).toEqual([{ op: 'same', text: 'Fed holds rates steady' }]);
    expect(hasChange(segs)).toBe(false);
  });

  it('captures a trailing word change', () => {
    const segs = wordDiff('Newsom leads the field', 'Newsom leads the race');
    expect(render(segs)).toBe('s:Newsom leads the|d:field|a:race');
    expect(hasChange(segs)).toBe(true);
  });

  it('captures an insertion in the middle', () => {
    const segs = wordDiff('A wide-open race', 'A wide-open contested race');
    expect(render(segs)).toBe('s:A wide-open|a:contested|s:race');
  });

  it('captures a deletion', () => {
    const segs = wordDiff('the clear front-runner now', 'the front-runner');
    expect(render(segs)).toBe('s:the|d:clear|s:front-runner|d:now');
  });

  it('losslessly rebuilds both sides from the segments', () => {
    const before = 'Buttigieg closes as undecideds grow';
    const after = 'Newsom consolidates as the field narrows';
    const segs = wordDiff(before, after);
    expect(rebuild(segs, 'before')).toBe(before);
    expect(rebuild(segs, 'after')).toBe(after);
  });

  it('merges adjacent same-op tokens into one run', () => {
    const segs = wordDiff('one two three four', 'five two three six');
    // first/last words change, the middle run stays a single same segment
    expect(segs.some((s) => s.op === 'same' && s.text === 'two three')).toBe(true);
  });

  it('handles empty before (all additions)', () => {
    const segs = wordDiff('', 'brand new headline');
    expect(render(segs)).toBe('a:brand new headline');
  });
});
