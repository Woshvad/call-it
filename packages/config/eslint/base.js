/**
 * Shared ESLint flat config for the Call It monorepo.
 *
 * Usage in each package's eslint.config.js:
 *   import base from '@call-it/config/eslint/base';
 *   export default [...base];
 *
 * The `no-display-grid` rule is registered here but scoped only to
 * apps/web/app/api/og/** — Satori does not support display:grid (Pitfall 15).
 * Full enforcement across all OG variants lands in Phase 7.
 */

'use strict';

const noDisplayGrid = require('./no-display-grid.js');

/** @type {import('eslint').Linter.FlatConfig[]} */
const baseConfig = [
  {
    // Global ignores
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/.turbo/**',
      '**/target/**',
      '**/coverage/**',
    ],
  },
  {
    // TypeScript files
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      // @typescript-eslint is added by each consuming package that has the dep
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': 'off', // Replaced by @typescript-eslint/no-unused-vars
    },
  },
  {
    // OG template files: enforce no-display-grid (Satori limitation — Pitfall 15)
    files: ['apps/web/app/api/og/**/*.ts', 'apps/web/app/api/og/**/*.tsx'],
    plugins: {
      'call-it': {
        rules: {
          'no-display-grid': noDisplayGrid,
        },
      },
    },
    rules: {
      'call-it/no-display-grid': 'error',
    },
  },
];

module.exports = baseConfig;
