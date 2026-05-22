/**
 * Design token: colors
 *
 * These are the raw hex values from tailwind.preset.ts exposed as
 * TypeScript constants for non-Tailwind use cases (framer-motion
 * color animation, canvas rendering, Satori OG style objects, etc.)
 */

// Neobrutalist palette (spec §14.6)
export const BRAND_BG = '#09090E';
export const BRAND_ACCENT = '#E8F542';
export const BRAND_TEXT = '#FFFFFF';
export const BRAND_MUTED = '#A1A1AA';
export const BRAND_BORDER = '#27272A';
export const BRAND_SURFACE = '#18181B';

// Outcome colors
export const OUTCOME_WIN = '#22C55E';
export const OUTCOME_LOSS = '#EF4444';
export const OUTCOME_CONTRARIAN = '#A855F7';

// Map from Tailwind color name to hex
export const COLOR_MAP = {
  'brand-bg': BRAND_BG,
  'brand-accent': BRAND_ACCENT,
  'brand-text': BRAND_TEXT,
  'brand-muted': BRAND_MUTED,
  'brand-border': BRAND_BORDER,
  'brand-surface': BRAND_SURFACE,
  'outcome-win': OUTCOME_WIN,
  'outcome-loss': OUTCOME_LOSS,
  'outcome-contrarian': OUTCOME_CONTRARIAN,
} as const;

export type BrandColor = keyof typeof COLOR_MAP;
