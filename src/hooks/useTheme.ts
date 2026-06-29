import { useCallback, useState } from 'react';

export type Theme = 'light' | 'bordeaux' | 'forest';
const KEY = 'crowdtell-theme';
export const THEMES: Theme[] = ['light', 'bordeaux', 'forest'];

/** Background color per theme, mirrored from tokens.css — used to keep the
 * browser UI <meta name="theme-color"> in sync with the active theme. */
const META_BG: Record<Theme, string> = {
  light: '#fbfaf7',
  bordeaux: '#090406',
  forest: '#0c1410',
};

function currentTheme(): Theme {
  const t = document.documentElement.getAttribute('data-theme') as Theme | null;
  return t && THEMES.includes(t) ? t : 'light';
}

/** Reads the theme set before paint (index.html), switches + persists it. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', META_BG[next]);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable — keep in-memory only */
    }
    setThemeState(next);
  }, []);

  return { theme, themes: THEMES, setTheme };
}
