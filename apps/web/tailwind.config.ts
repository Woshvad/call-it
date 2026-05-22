import type { Config } from 'tailwindcss';
import uiPreset from '../../packages/ui/tailwind.preset';

/**
 * Call It — Tailwind CSS configuration
 *
 * Color palette, font stack, and border widths are defined in the shared
 * packages/ui tailwind preset and consumed here via `presets: [uiPreset]`.
 *
 * Neobrutalist design system tokens (spec §14.6):
 * - brand-bg, brand-accent (#E8F542), brand-text, brand-muted, brand-border, brand-surface
 * - Outcome: outcome-win (green), outcome-loss (red), outcome-contrarian (purple)
 *
 * Fonts (loaded from public/fonts/):
 * - Syne — display / headlines
 * - Space Grotesk — body / UI
 * - JetBrains Mono — monospace / values
 */
const config: Config = {
  presets: [uiPreset],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  plugins: [],
};

export default config;
