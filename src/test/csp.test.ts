import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * The ENFORCING CSP in public/_headers allowlists EVERY bare inline script in index.html
 * (the pre-paint theme-setter + intensity-setter) by its sha256 hash instead of
 * 'unsafe-inline'. Now that the policy enforces, an un-allowlisted or drifted hash BLOCKS
 * that script on the live site — so this guard recomputes each hash from source and asserts
 * the header carries it, failing CI loudly with a clear reminder to update the header.
 * It checks ALL of them, not just the first: a second pre-paint script once shipped
 * un-allowlisted and was silently blocked because the guard only looked at the first.
 * Vite copies the inline scripts verbatim, so each source hash equals the served (dist)
 * hash. Only attribute-less `<script>` is executable + CSP-gated; `<script
 * type="application/ld+json">` is data and intentionally not matched.
 */
describe('CSP inline-script hash', () => {
  const root = process.cwd();
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8');

  it('allowlists EVERY bare inline script in index.html in the enforced CSP', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts.length, 'expected the pre-paint inline scripts in index.html').toBeGreaterThan(
      0,
    );
    for (const m of scripts) {
      const hash = 'sha256-' + createHash('sha256').update(m[1]!, 'utf8').digest('base64');
      expect(headers, `inline-script hash ${hash} must be allowlisted in the CSP`).toContain(
        `'${hash}'`,
      );
    }
  });

  it('serves an ENFORCING Content-Security-Policy header (not Report-Only)', () => {
    // The real header directive must be the enforcing form. Strip comment lines first so
    // the "-Report-Only" mentioned in the explanatory comment can't satisfy the match.
    const directive = headers
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .find((l) => /Content-Security-Policy/.test(l));
    expect(directive).toBeTruthy();
    expect(directive).toMatch(/Content-Security-Policy:/);
    expect(directive).not.toMatch(/Content-Security-Policy-Report-Only:/);
  });
});
