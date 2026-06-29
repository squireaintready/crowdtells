/**
 * Word-level diff between two short strings — used to highlight how our read of a
 * story changed from one briefing version to the next (the revision timeline).
 * A classic longest-common-subsequence over whitespace-split tokens; inputs are
 * headlines/short sentences, so the O(n·m) table is trivially small. Adjacent
 * tokens of the same op are merged so the renderer emits one span per run.
 */
export type DiffOp = 'same' | 'add' | 'del';

export interface DiffSeg {
  op: DiffOp;
  /** One or more words (space-joined) sharing the same op. */
  text: string;
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter((w) => w !== '');
}

function mergeRuns(tokens: { op: DiffOp; text: string }[]): DiffSeg[] {
  const out: DiffSeg[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.op === t.op) last.text += ' ' + t.text;
    else out.push({ op: t.op, text: t.text });
  }
  return out;
}

/**
 * Diff `before` → `after` at word granularity. Returns ordered segments tagged
 * `same` (unchanged), `del` (only in `before`), or `add` (only in `after`).
 * Reconstruct the new text from `same`+`add`, the old from `same`+`del`.
 */
export function wordDiff(before: string, after: string): DiffSeg[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const m = a.length;
  const n = b.length;

  // dp[i][j] = LCS length of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const raw: { op: DiffOp; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      raw.push({ op: 'same', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      raw.push({ op: 'del', text: a[i]! });
      i++;
    } else {
      raw.push({ op: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < m) raw.push({ op: 'del', text: a[i++]! });
  while (j < n) raw.push({ op: 'add', text: b[j++]! });

  return mergeRuns(raw);
}

/** Whether two versions actually differ (any add/del segment) — lets the UI hide
 * a diff that would render as an unchanged line. */
export function hasChange(segs: DiffSeg[]): boolean {
  return segs.some((s) => s.op !== 'same');
}
