import { useEffect, useRef, useState } from 'react';
import { useIntensity } from '../../hooks/useIntensity';

interface Props {
  /** The text to set justified-flush. Real, selectable text. */
  text: string;
  /** Class carrying the type (family/size/weight/colour) — read back to measure. */
  className?: string;
  /** Element tag (default p). */
  as?: 'p' | 'div';
}

interface Line {
  text: string;
  wordSpacing: number;
}

/**
 * Metric justification — every line but the last fills the column EXACTLY by
 * distributing real per-word slack (CSS `text-align: justify` can't give the numbers).
 *
 * Progressive enhancement: CALM / first paint / SSR / jsdom / no-JS / crawlers get the
 * real text as a normal paragraph (the shipped, ragged-right look). In AGGRESSIVE mode,
 * on the client, it measures the rendered font + column and lays the text out with
 * `justifyParagraph`, rendering one span per line with its own word-spacing. The last
 * line is left ragged (never stretched). A debounced ResizeObserver re-flows on resize.
 */
export function JustifyText({ text, className, as = 'p' }: Props) {
  const { intensity } = useIntensity();
  const hostRef = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState<Line[] | null>(null);

  useEffect(() => {
    if (intensity !== 'aggressive') {
      setLines(null);
      return;
    }
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let lastW = -1;

    const run = async () => {
      const host = hostRef.current;
      if (!host || cancelled) return;
      if (Math.round(host.clientWidth) < 120) return; // too narrow to justify cleanly
      try {
        const engine = await import('../../lib/pretext/engine');
        if (cancelled) return;
        await engine.readyFonts();
        const host2 = hostRef.current;
        if (cancelled || !host2) return;
        const w = Math.round(host2.clientWidth);
        if (w < 120) return;
        lastW = w;
        const cs = getComputedStyle(host2);
        const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
        const placed = engine.justifyParagraph(text, font, { width: w, lineHeight: lh });
        if (cancelled || placed.length < 2) {
          setLines(null); // 1 line → nothing to justify; keep it natural
          return;
        }
        setLines(placed.map((l) => ({ text: l.text, wordSpacing: l.wordSpacing })));
      } catch {
        if (!cancelled) setLines(null);
      }
    };

    void run();
    if (typeof ResizeObserver !== 'undefined' && hostRef.current) {
      observer = new ResizeObserver(() => {
        const w = Math.round(hostRef.current?.clientWidth ?? 0);
        if (Math.abs(w - lastW) < 2) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => void run(), 140);
      });
      observer.observe(hostRef.current);
    }
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      observer?.disconnect();
    };
  }, [intensity, text]);

  const Tag = as;
  return (
    <Tag ref={hostRef as never} className={className}>
      {lines
        ? lines.map((l, i) => (
            <span
              key={i}
              style={{ display: 'block', whiteSpace: 'nowrap', wordSpacing: `${l.wordSpacing.toFixed(2)}px` }}
            >
              {l.text}
            </span>
          ))
        : text}
    </Tag>
  );
}
