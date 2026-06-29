import { describe, expect, it } from 'vitest';
import { claimId } from '../lib/claims';

describe('claimId', () => {
  it('is deterministic for the same market + claim', () => {
    const a = claimId('mkt-1', 'Services inflation is cooling fast enough.');
    const b = claimId('mkt-1', 'Services inflation is cooling fast enough.');
    expect(a).toBe(b);
  });

  it('ignores case, punctuation, and whitespace so light edits keep the poll', () => {
    const a = claimId('mkt-1', 'Services inflation is cooling fast enough.');
    const b = claimId('mkt-1', '  services   inflation is cooling, fast enough!!  ');
    expect(a).toBe(b);
  });

  it('is scoped to the market — same text on different markets differs', () => {
    expect(claimId('mkt-1', 'Same claim text.')).not.toBe(claimId('mkt-2', 'Same claim text.'));
  });

  it('distinguishes genuinely different claims on the same market', () => {
    expect(claimId('mkt-1', 'Inflation is cooling.')).not.toBe(
      claimId('mkt-1', 'Unemployment is rising.'),
    );
  });

  it('namespaces the id with the market so collisions stay per-market', () => {
    expect(claimId('mkt-1', 'Anything.').startsWith('mkt-1:')).toBe(true);
  });
});
