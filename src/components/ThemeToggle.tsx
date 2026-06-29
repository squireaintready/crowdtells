import { useEffect, useRef, useState } from 'react';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useIntensity, type Intensity } from '../hooks/useIntensity';
import { register, track } from '../lib/posthog';
import styles from './ThemeToggle.module.css';

const LABELS: Record<Theme, string> = { light: 'Light', bordeaux: 'Bordeaux', forest: 'Forest' };
const INTENSITY_LABELS: Record<Intensity, string> = { aggressive: 'Aggressive', calm: 'Calm' };
// Mini-preview = theme background fill ringed by its accent.
const SWATCH: Record<Theme, string> = { light: '#fbfaf7', bordeaux: '#090406', forest: '#0c1410' };
const ACCENT: Record<Theme, string> = { light: '#27496d', bordeaux: '#d6a35b', forest: '#cf9d63' };

/**
 * The toggle's glyph: a yin-yang whose two lobes are the active theme's own
 * light/dark tokens, so it reads in every theme and visually inverts in dark
 * modes. It rotates a third-turn per theme (light 0° → bordeaux 120° → forest
 * 240°), animated via a CSS transition on the transform, so switching themes
 * spins it to a new orientation.
 */
function YinYang({ angle }: { angle: number }) {
  return (
    <svg
      className={styles.yin}
      viewBox="0 0 100 100"
      width="18"
      height="18"
      aria-hidden="true"
      style={{ transform: `rotate(${angle}deg)` }}
    >
      <circle cx="50" cy="50" r="47" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="3" />
      <path d="M50 3 a47 47 0 0 1 0 94 a23.5 23.5 0 0 1 0 -47 a23.5 23.5 0 0 0 0 -47 z" fill="var(--text)" />
      <circle cx="50" cy="26.5" r="8" fill="var(--text)" />
      <circle cx="50" cy="73.5" r="8" fill="var(--surface)" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, themes, setTheme } = useTheme();
  const { intensity, intensities, setIntensity } = useIntensity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Single owner of the theme + reading-intensity super-properties: register the current
  // values on mount and whenever they change, so every event is segmentable by them.
  useEffect(() => {
    register({ theme, reading_intensity: intensity });
  }, [theme, intensity]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={styles.toggle}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${LABELS[theme]}. Change theme`}
        title="Change theme"
      >
        <YinYang angle={themes.indexOf(theme) * 120} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <span className={styles.group} role="presentation">
            Theme
          </span>
          {themes.map((t) => (
            <button
              key={t}
              role="menuitemradio"
              aria-checked={t === theme}
              className={styles.item}
              onClick={() => {
                track('theme_changed', { theme: t });
                setTheme(t); // the effect above re-registers the super-property
                setOpen(false);
              }}
            >
              <span
                className={styles.swatch}
                style={{ background: SWATCH[t], borderColor: ACCENT[t] }}
                aria-hidden="true"
              />
              <span className={styles.label}>{LABELS[t]}</span>
              {t === theme && (
                <span className={styles.check} aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}

          {/* Reading style — the bold Pretext treatment vs. the settled editorial
              read. A segmented control, kept in the same visual-preferences popover
              as the theme so it's discoverable to everyone (no auth gate). */}
          <span className={styles.group} role="presentation">
            Reading style
          </span>
          <div className={styles.segmented} role="radiogroup" aria-label="Reading style">
            {intensities.map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={i === intensity}
                className={`${styles.seg} ${i === intensity ? styles.segOn : ''}`}
                onClick={() => {
                  track('intensity_changed', { intensity: i });
                  setIntensity(i); // the effect above re-registers the super-property
                }}
              >
                {INTENSITY_LABELS[i]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
