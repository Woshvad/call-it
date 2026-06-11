/**
 * L1-first read-through / write-through cache helper (quick-260611-h36).
 *
 * Layering:
 *   READ:  in-process MemoryCache (L1) → Redis (L2, error-guarded + 2s bound)
 *   WRITE: MemoryCache FIRST (cannot fail) → Redis best-effort
 *
 * WHY: during the 2026-06-11 Upstash quota outage every redis.get/set threw,
 * and the routes' "treat Redis errors as a cache miss" guards meant ZERO
 * caching — letting the rate-limited subgraph 429-storm and the feed render
 * empty. With this adapter the single-Fly-machine relayer keeps serving from
 * memory through a dead Redis (see lib/memory-cache.ts header).
 *
 * Contract:
 *   - Values are parsed objects (not JSON strings) — call sites drop their own
 *     JSON.parse / JSON.stringify.
 *   - getCached NEVER throws: any Redis error/timeout or JSON parse failure is
 *     a miss (null).
 *   - setCached NEVER throws: the L1 write always succeeds; the Redis write is
 *     best-effort.
 *   - getRedis() is called LAZILY inside each function body (never captured at
 *     module scope) so existing tests' vi.mock of ../lib/redis.js keeps
 *     applying.
 */

import { memoryCache } from './memory-cache.js';
import { getRedis } from './redis.js';
import { getLogger } from './logger.js';
import { withTimeout } from './with-timeout.js';

/** Bound for the L2 Redis read — mirrors profile.ts's 2s cache-read bound. */
const REDIS_READ_TIMEOUT_MS = 2_000;

/**
 * L1-first read. Returns the parsed cached value or null on miss.
 *
 * Order: (a) fresh L1 hit → immediate; (b) Redis get (guarded + 2s bound);
 * (c) Redis hit → JSON.parse (parse failure = miss) + L1 backfill when
 * `backfillTtlSeconds` is provided (call sites pass their site TTL).
 */
export async function getCached<T>(
  key: string,
  backfillTtlSeconds?: number,
): Promise<T | null> {
  // (a) L1 — fresh hit returns immediately.
  const l1 = memoryCache.get<T>(key);
  if (l1 !== undefined) return l1;

  // (b) L2 — Redis, error-guarded and time-bounded.
  let raw: string | null;
  try {
    raw = await withTimeout(getRedis().get(key), REDIS_READ_TIMEOUT_MS, `cache-read:${key}`);
  } catch (err) {
    getLogger().warn(
      { event: 'cache_redis_read_failed', key, err: err instanceof Error ? err.message : String(err) },
      'Redis cache read failed — treating as miss (L1-only mode)',
    );
    return null;
  }

  if (raw === null || raw === undefined) return null;

  // (c) Parse + L1 backfill. A non-JSON legacy value reads as a miss.
  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    return null;
  }
  if (backfillTtlSeconds !== undefined && backfillTtlSeconds > 0) {
    memoryCache.set(key, parsed, backfillTtlSeconds * 1000);
  }
  return parsed;
}

/**
 * Write-through set. L1 ALWAYS written first (memory cannot fail); the Redis
 * write is best-effort and never throws.
 */
export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  memoryCache.set(key, value, ttlSeconds * 1000);

  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    getLogger().warn(
      { event: 'cache_redis_write_failed', key, err: err instanceof Error ? err.message : String(err) },
      'Redis cache write failed — L1 still holds the value',
    );
  }
}
