import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useIntensity } from '../../hooks/useIntensity';

interface Props {
  /** The text to fit (e.g. a probability like "72%"). Real, selectable text. */
  text: string;
  /** Weight to measure + render at (must match the rendered weight for an exact fit). */
  weight?: number;
  /** CSS family list. Defaults to the element's computed family. */
  family?: string;
  /** Fraction of the measured slot (the host's parent) the text should fill. */
  fillFrac?: number;
  /** Hard cap on the target WIDTH in px (mirrors the comp's `min(inner*0.4, 200)`). */
  maxWidthPx?: number;
  /** Hard cap / floor on the resulting FONT size in px. */
  maxFontPx?: number;
  minFontPx?: number;
  /** Calm/fallback class — drives the size with CSS when not enhanced (or pre-fit). */
  className?: string;
  style?: CSSProperties;
  /** Element tag (default span). */
  as?: 'span' | 'div';
  'aria-hidden'?: boolean;
}

/**
 * Exact-fit display type — the comp's signature "the number is measured, not guessed".
 *
 * Progressive enhancement: in CALM mode (and on first paint / SSR / jsdom / no-JS /
 * crawlers) it's just the real `text` sized by `className` (a CSS clamp). In AGGRESSIVE
 * mode, on the client, it lazily loads the Pretext engine, measures the slot, and uses
 * `fitFontSize` to scale the glyphs so they fill the column to the pixel — whatever the
 * digits. A debounced ResizeObserver re-fits on resize; any failure stays on the CSS size.
 */
export function FitText({
  text,
  weight = 400,
  family,
  fillFrac = 1,
  maxWidthPx = 100_000,
  maxFontPx = 320,
  minFontPx = 10,
  className,
  style,
  as = 'span',
  'aria-hidden': ariaHidden,
}: Props) {
  const { intensity } = useIntensity();
  const hostRef = useRef<HTMLSpanElement>(null);
  const [px, setPx] = useState<number | null>(null);

  useEffect(() => {
    if (intensity !== 'aggressive') {
      setPx(null);
      return;
    }
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const fit = async () => {
      const host = hostRef.current;
      const slot = host?.parentElement;
      if (!host || !slot || cancelled) return;
      if (slot.clientWidth < 2) return;
      try {
        const engine = await import('../../lib/pretext/engine');
        if (cancelled) return;
        await engine.readyFonts();
        if (cancelled || !hostRef.current?.parentElement) return;
        const w = hostRef.current.parentElement.clientWidth;
        if (w < 2) return;
        const fam = family || getComputedStyle(hostRef.current).fontFamily;
        const target = Math.min(w * fillFrac, maxWidthPx);
        const size = engine.fitFontSize(text, {
          family: fam,
          weight,
          target,
          max: maxFontPx,
          min: minFontPx,
        });
        if (!cancelled) setPx(size);
      } catch {
        if (!cancelled) setPx(null); // jsdom / no canvas / measurement error → CSS size
      }
    };

    void fit();
    const slot = hostRef.current?.parentElement;
    if (typeof ResizeObserver !== 'undefined' && slot) {
      observer = new ResizeObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void fit(), 120);
      });
      observer.observe(slot);
    }
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      observer?.disconnect();
    };
  }, [intensity, text, weight, family, fillFrac, maxWidthPx, maxFontPx, minFontPx]);

  const Tag = as;
  return (
    <Tag
      ref={hostRef as never}
      className={className}
      aria-hidden={ariaHidden}
      style={{
        ...(px != null
          ? { fontSize: `${px.toFixed(1)}px`, lineHeight: 0.82, whiteSpace: 'nowrap', display: 'block' }
          : null),
        ...style,
      }}
    >
      {text}
    </Tag>
  );
}
