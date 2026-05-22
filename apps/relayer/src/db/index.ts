/**
 * @call-it/relayer — database module barrel export
 *
 * Re-exports the Drizzle client factory, test helpers, and schema table objects.
 * Import from here, not from client.ts or schema.ts directly.
 *
 * Usage:
 *   import { getDb, addressBook, authMethods, onboardingState } from './db/index.js'
 */

export { getDb, _resetDbForTesting, _setDbForTesting } from './client.js';
export { addressBook, authMethods, onboardingState } from './schema.js';
