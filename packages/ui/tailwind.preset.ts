/**
 * @call-it/ui — shared Tailwind CSS preset
 *
 * Neobrutalist design system tokens (spec §14.6):
 * - Palette: brand-bg, brand-accent (yellow-green), brand-text, brand-muted,
 *            brand-border, brand-surface
 * - Outcome colors: outcome-win (green), outcome-loss (red), outcome-contrarian (purple)
 * - Font stack: display (Syne), body (Space Grotesk), mono (JetBrains Mono)
 * - Border widths: 3px, 4px (neobrutalist hard edges)
 *
 * Consumed by apps/web/tailwind.config.ts via `presets: [uiPreset]`.
 * Consumed by Phase 8 Mini Apps when they land.
 *
 * NOTE: Do NOT add `display: grid` to any component — Satori does not support
 * CSS Grid (Pitfall 15). Pure flexbox only.
 */

import type { Config } from 'tailwindcss';

const uiPreset: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        // Neobrutalist palette (spec §14.6)
        'brand-bg': '#09090E',
        'brand-accent': '#E8F542',
        'brand-text': '#FFFFFF',
        'brand-muted': '#A1A1AA',
        'brand-border': '#27272A',
        'brand-surface': '#18181B',
        // Outcome colors (spec §14.6)
        'outcome-win': '#22C55E',
        'outcome-loss': '#EF4444',
        'outcome-contrarian': '#A855F7',
      },
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        body: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderWidth: {
        '3': '3px',
        '4': '4px',
      },
    },
  },
  plugins: [],
};

export default uiPreset;
