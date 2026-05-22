/**
 * @call-it/shared — barrel export
 *
 * Re-exports all constants, schemas, and types so consumers can:
 *   import { USDC_ARB_NATIVE } from '@call-it/shared'
 *
 * Task 2 populates these modules with real values.
 * Task 1 creates empty placeholders so `pnpm turbo run build` works.
 */

// Constants
export * from './constants/usdc.js';
export * from './constants/networks.js';
export * from './constants/addresses.js';
export * from './constants/pyth-feed-ids.js';
export * from './constants/fees.js';

// Schemas
export * from './schemas/env-config.js';

// Plan 03: Shared types, validation, and hashing
export * from './types/call.js';
export * from './validation/call-gates.js';
export * from './hashing/duplicate-hash.js';
