/**
 * Dev-only environment bootstrap (side-effecting module).
 *
 * Loads the relayer's `.env.local` (then the monorepo-root `.env` as a fallback)
 * into `process.env` when NOT running in production. In production
 * (`NODE_ENV=production`) env is injected by Fly secrets (synced from GCP Secret
 * Manager per D-09), so this skips file loading entirely and leaves `process.env`
 * untouched.
 *
 * MUST be imported FIRST in src/index.ts so env is populated before
 * `initEnv()` / `getDb()` read it. The relayer dev script runs `tsx watch
 * src/index.ts` with no `--env-file` and there is no dotenv dependency, so
 * without this shim every `process.env.*` is undefined at boot and the env
 * validation throws "POSTGRES_URL is required".
 *
 * Uses Node's native `process.loadEnvFile` (Node >=20.12) — no dotenv dep.
 * Never throws: a missing file, unsupported runtime, or parse error is ignored
 * (real shell env / Fly secrets remain the source of truth).
 *
 * Precedence: the monorepo-root `.env` is loaded first (lowest priority), then
 * the relayer-specific `.env.local` last so its values win.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'production') {
  // `here` = <pkg>/src/lib (tsx) or <pkg>/dist/lib (node) — pkg root is two up.
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgRoot = resolve(here, '../../');

  // Lowest priority first, highest (relayer .env.local) last.
  const candidates = [
    resolve(pkgRoot, '../../.env'), // monorepo root .env
    resolve(pkgRoot, '.env.local'), // apps/relayer/.env.local
  ];

  for (const envPath of candidates) {
    try {
      if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      }
    } catch {
      /* ignore — fall through; values may already be present in process.env */
    }
  }
}
