/**
 * Design token: colors
 *
 * Literal hex mirrors of the prototype token layer (apps/web/app/globals.css
 * :root — Phase 09.2, D-01/D-02) exposed as TypeScript constants for
 * non-Tailwind use cases (framer-motion color animation, canvas rendering,
 * Satori OG style objects, etc.). These MUST stay literal hexes — CSS custom
 * properties do not reach framer-motion boxShadow strings reliably.
 */

// Prototype palette
export const BRAND_BG = '#09090E';
export const BRAND_ACCENT = '#E8F542';
export const BRAND_TEXT = '#F1F5F9';
export const BRAND_MUTED = '#94A3B8';
export const BRAND_BORDER = '#1E1E2E';
export const BRAND_SURFACE = '#111118';
export const BRAND_CREAM = '#F5F1E8';

// Outcome colors (D-03: contrarian stamp uses the win color)
export const OUTCOME_WIN = '#E8F542';
export const OUTCOME_LOSS = '#F87171';
export const OUTCOME_CONTRARIAN = '#E8F542';

// Duel/challenger identity — named literal now that OUTCOME_CONTRARIAN
// no longer carries purple (D-03)
export const ACCENT_DUEL = '#A855F7';

// Map from Tailwind color name to hex
export const COLOR_MAP = {
  'brand-bg': BRAND_BG,
  'brand-accent': BRAND_ACCENT,
  'brand-text': BRAND_TEXT,
  'brand-muted': BRAND_MUTED,
  'brand-border': BRAND_BORDER,
  'brand-surface': BRAND_SURFACE,
  'brand-cream': BRAND_CREAM,
  'outcome-win': OUTCOME_WIN,
  'outcome-loss': OUTCOME_LOSS,
  'outcome-contrarian': OUTCOME_CONTRARIAN,
  'accent-duel': ACCENT_DUEL,
} as const;

export type BrandColor = keyof typeof COLOR_MAP;
