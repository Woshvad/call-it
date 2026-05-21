import type { Config } from 'tailwindcss';

/**
 * Call It — Tailwind CSS configuration
 *
 * Neobrutalist color palette per CLAUDE.md + spec §14.6:
 * - Background: #09090E (near-black)
 * - Accent: #E8F542 (yellow-green)
 * - Text primary: #FFFFFF
 * - Text secondary: #A1A1AA
 *
 * Fonts (loaded from public/fonts/):
 * - Syne — display / headlines
 * - Space Grotesk — body / UI
 * - JetBrains Mono — monospace / values
 */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
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

export default config;
