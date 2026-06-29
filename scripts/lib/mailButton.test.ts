import { describe, expect, it } from 'vitest';
import { mailButton } from './mailButton';

describe('mailButton', () => {
  const html = mailButton('https://crowdtells.com/x', 'Read the briefing');

  it('emits an Outlook VML roundrect inside an [if mso] block', () => {
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('v:roundrect');
    expect(html).toContain('fillcolor="#27496d"');
    expect(html).toContain('<![endif]-->');
  });

  it('emits the normal padded anchor inside an [if !mso] block', () => {
    expect(html).toContain('<!--[if !mso]><!-- -->');
    expect(html).toContain('<a href="https://crowdtells.com/x"');
    expect(html).toContain('<!--<![endif]-->');
  });

  it('carries the href and label in both the VML and the anchor (one visible button)', () => {
    expect(html.match(/https:\/\/crowdtells\.com\/x/g)?.length).toBe(2);
    expect(html.match(/Read the briefing/g)?.length).toBe(2);
  });

  it('does not escape — the caller passes already-escaped href/label', () => {
    // A pre-escaped label flows through verbatim (no double-escaping).
    expect(mailButton('https://x/y', 'A &amp; B')).toContain('A &amp; B');
  });
});
