/**
 * Drizzle ORM database client singleton (Phase 1).
 *
 * Follows the exact singleton+memo pattern from apps/relayer/src/lib/redis.ts
 * (PATTERNS § Pattern G):
 *   - Module-level `let _db: ... | undefined`
 *   - `getDb()` lazy constructor
 *   - `_resetDbForTesting()` for test isolation
 *
 * Connection: postgres-js driver with max 10 connections, 20s idle timeout.
 * POSTGRES_URL is fetched from process.env (injected by Fly secrets via
 * GCP Secret Manager per Phase 0 D-09).
 *
 * Security (T-01-02):
 * - POSTGRES_URL never written to source control or logs
 * - Env schema (apps/relayer/src/env.ts) rejects localhost in mainnet profile
 * - max: 10 connections enforces a pool ceiling appropriate for shared-cpu-1x Fly VMs
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { getLogger } from '../lib/logger.js';

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DbClient | undefined;
let _sql: ReturnType<typeof postgres> | undefined;

/**
 * Returns the memoized Drizzle client connected to Fly Postgres.
 * Creates the connection on first call.
 *
 * Env vars used:
 * - POSTGRES_URL: postgres:// or postgresql:// connection string from Fly secrets
 */
export function getDb(): DbClient {
  if (_db) return _db;

  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('POSTGRES_URL is not set — cannot connect to Fly Postgres');
  }

  _sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
  });

  _db = drizzle(_sql, { schema });

  // Log first connection event per Pino structured logging convention
  try {
    getLogger().info({ event: 'postgres_connection_established' }, 'Fly Postgres connection pool initialized');
  } catch {
    // Logger may not be initialized yet in early boot — silently continue
  }

  return _db;
}

/**
 * Reset the Postgres connection singleton (for testing only).
 * @internal
 */
export async function _resetDbForTesting(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 }).catch(() => undefined);
    _sql = undefined;
  }
  _db = undefined;
}

/**
 * Inject a pre-built Drizzle client (for testing with a test database).
 * @internal
 */
export function _setDbForTesting(db: DbClient): void {
  _db = db;
}
