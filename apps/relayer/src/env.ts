/**
 * Module-level env singleton for the Call It relayer.
 *
 * Usage:
 *   import { initEnv, env } from './env.js';
 *   await initEnv(); // call once at boot in index.ts
 *   // After init, `env` is populated and safe to access
 *
 * Do NOT import `env` before `initEnv()` completes — it will be undefined.
 */

import { loadSecrets } from './lib/secret-manager.js';
import type { RelayerEnv } from './types.js';

// Module-level singleton — undefined until initEnv() completes
let _env: RelayerEnv | undefined;

/**
 * Call once at boot (from index.ts). Fetches all secrets from GCP Secret Manager
 * (with local-dev fallback to process.env). Subsequent calls return the cached value.
 */
export async function initEnv(): Promise<RelayerEnv> {
  if (_env) return _env;
  _env = await loadSecrets();
  return _env;
}

/**
 * Access the loaded env after initEnv() has been called.
 * Throws if called before initEnv() completes.
 */
export function getEnv(): RelayerEnv {
  if (!_env) {
    throw new Error('env not initialized — call initEnv() first');
  }
  return _env;
}

/**
 * Reset env (for testing only).
 * @internal
 */
export function _resetEnvForTesting(): void {
  _env = undefined;
}
