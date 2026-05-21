/**
 * Shared Prettier configuration for the Call It monorepo.
 *
 * Usage in each package's prettier.config.js:
 *   import base from '@call-it/config/prettier/base';
 *   export default base;
 */

'use strict';

/** @type {import('prettier').Config} */
const baseConfig = {
  tabWidth: 2,
  singleQuote: true,
  printWidth: 100,
  semi: true,
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
};

module.exports = baseConfig;
