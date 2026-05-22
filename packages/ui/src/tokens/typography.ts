/**
 * Design token: typography
 *
 * Font family names aligned with tailwind.preset.ts fontFamily config.
 * Used for non-Tailwind rendering contexts (Satori, canvas, etc.)
 */

export const FONT_DISPLAY = 'Syne';
export const FONT_BODY = 'Space Grotesk';
export const FONT_MONO = 'JetBrains Mono';

export const FONT_FAMILIES = {
  display: FONT_DISPLAY,
  body: FONT_BODY,
  mono: FONT_MONO,
} as const;
