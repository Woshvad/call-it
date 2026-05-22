/**
 * ESLint flat configuration for @call-it/ui
 *
 * Extends the shared monorepo base from @call-it/config.
 * The no-display-grid rule is scoped in packages/config/eslint/base.js to:
 * - packages/ui/src/compound/Receipt.tsx
 * - packages/ui/src/compound/Receipt/**\/*.{ts,tsx}
 *
 * This prevents display:grid in the Receipt component, which Phase 7
 * will render via Satori for OG cards (Pitfall 15 anti-drift defense).
 */

'use strict';

const baseConfig = require('@call-it/config/eslint/base');
const tsParser = require('@typescript-eslint/parser');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  ...baseConfig,
  {
    // Add TypeScript parser for .ts/.tsx files
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
];
