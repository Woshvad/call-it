/**
 * @call-it/ui — shared Tailwind CSS preset
 *
 * Phase 09.2: values remapped to the prototype token layer (CSS custom
 * properties defined in apps/web/app/globals.css :root — the single source
 * of truth, D-01/D-02). Every existing KEY is preserved so ~30 @call-it/ui
 * consumer files keep compiling; only the VALUES changed.
 *
 * - Palette: brand-bg, brand-accent (chartreuse), brand-text, brand-muted,
 *            brand-border, brand-surface, brand-cream (signature inverse)
 * - Outcome colors: outcome-win (chartreuse), outcome-loss (soft red),
 *   outcome-contrarian (win color per D-03 — CONTRARIAN HIT is a win;
 *   duel identity has its own accent-duel key)
 * - Font stack: display (Archivo), body (Inter), mono (JetBrains Mono) —
 *   loaded via next/font in apps/web/app/layout.tsx (D-04)
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
        // Prototype palette via CSS custom properties (globals.css :root)
        'brand-bg': 'var(--bg-primary)',
        'brand-accent': 'var(--accent-win)',
        'brand-text': 'var(--text-primary)',
        'brand-muted': 'var(--text-secondary)',
        'brand-border': 'var(--border-subtle)',
        'brand-surface': 'var(--bg-secondary)',
        'brand-cream': 'var(--bg-inverse)',
        // Outcome colors (D-03: win/loss = chartreuse/soft red)
        'outcome-win': 'var(--accent-win)',
        'outcome-loss': 'var(--accent-loss)',
        'outcome-contrarian': 'var(--accent-win)',
        // Semantic accents
        'accent-neutral': 'var(--accent-neutral)',
        'accent-warning': 'var(--accent-warning)',
      },
      fontFamily: {
        display: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
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
