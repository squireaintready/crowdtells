import { useCallback, useState } from 'react';

/**
 * The reading style ("intensity"):
 *  - 'aggressive' — the bold Pretext treatment (prose flows around the crowd's
 *    confidence curve, a heavier headline, a more prominent Market Lens). DEFAULT.
 *  - 'calm' — the shipped editorial design (a settled long read).
 *
 * Like the theme, it's a display preference: set on `<html data-intensity>` before
 * paint (see the inline script in index.html) and persisted to localStorage, so
 * there's no flash and it survives reloads. Crucially, the aggressive layer is a
 * progressive ENHANCEMENT applied client-side after the engine loads — the initial
 * render is always the calm, crawlable text regardless of this setting.
 */
export type Intensity = 'aggressive' | 'calm';
const KEY = 'ct:intensity';
export const INTENSITIES: Intensity[] = ['aggressive', 'calm'];

function currentIntensity(): Intensity {
  const v = document.documentElement.getAttribute('data-intensity');
  return v === 'calm' ? 'calm' : 'aggressive';
}

/** Reads the intensity set before paint (index.html), switches + persists it. */
export function useIntensity(): {
  intensity: Intensity;
  intensities: Intensity[];
  setIntensity: (next: Intensity) => void;
} {
  const [intensity, setState] = useState<Intensity>(currentIntensity);

  const setIntensity = useCallback((next: Intensity) => {
    document.documentElement.setAttribute('data-intensity', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable — keep in-memory only */
    }
    setState(next);
  }, []);

  return { intensity, intensities: INTENSITIES, setIntensity };
}
