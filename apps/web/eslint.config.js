import tsParser from '@typescript-eslint/parser';
import noDisplayGrid from './eslint-rules/no-display-grid-in-og.js';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: ['node_modules/**', '.next/**', 'dist/**'],
  },
  {
    // SC1 / T-07-01-01: ban display:'grid' and grid* props in every OG source
    // (Satori is flexbox-only — Pitfall 15). Scoped to the OG render surface only.
    files: ['app/og/**/*.{ts,tsx}', 'app/api/og/**/*.ts', 'lib/og-*.ts'],
    languageOptions: {
      // OG sources are TypeScript/TSX — the default Espree parser cannot read them.
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'call-it-og': {
        rules: {
          'no-display-grid': noDisplayGrid,
        },
      },
    },
    rules: {
      'call-it-og/no-display-grid': 'error',
    },
  },
];
