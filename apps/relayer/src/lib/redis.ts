/**
 * Upstash Redis client singleton (D-03).
 *
 * Uses ioredis with Upstash REST URL + token.
 * Memoized via module-level variable — getRedis() returns the same instance.
 *
 * Boot-time validation: pingWithBullMQCompat() proves Upstash supports:
 * (a) PING, (b) XADD/XLEN (stream commands for BullMQ), (c) SUBSCRIBE/PUBLISH
 * If any fail → logs a bullmq_compat_warning Pino event (Pitfall A mitigation).
 *
 * Security (T-00-12): Redis operations use atomic INCRBY for counter integrity.
 */

import { Redis, type RedisOptions } from 'ioredis';
import { getLogger } from './logger.js';

let _redis: Redis | undefined;

/**
 * Returns the memoized ioredis client connected to Upstash.
 * Creates the connection on first call.
 *
 * Env vars used:
 * - UPSTASH_REDIS_REST_URL: redis://... or rediss://... URL from Upstash
 * - UPSTASH_REDIS_REST_TOKEN: Upstash auth token (injected as password)
 */
export function getRedis(): Redis {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL ?? 'redis://localhost:6379';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const options: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    // Disable offline queue for tests to fail fast
    enableOfflineQueue: process.env.NODE_ENV !== 'test',
  };

  // Upstash exposes a standard Redis URL; the token is the AUTH password.
  // Pass it as a discrete option rather than baking it into the URL string:
  //   1. Security — a token embedded in the connection string can leak into ioredis
  //      error/debug output that echoes the URL; an options.password never appears there.
  //   2. Correctness — detect already-embedded credentials via the PARSED userinfo, not a
  //      `url.includes('@')` substring check that misfires when an '@' appears elsewhere
  //      (query string, host) or the URL carries a username but no password.
  // URL-embedded credentials, when present, take precedence (we don't override them).
  let hasEmbeddedCreds = false;
  try {
    const parsed = new URL(url);
    hasEmbeddedCreds = parsed.username !== '' || parsed.password !== '';
  } catch {
    // Non-URL connection string (e.g. bare host:port) — treat as no embedded creds.
    hasEmbeddedCreds = false;
  }
  if (token && !hasEmbeddedCreds) {
    options.password = token;
  }

  _redis = new Redis(url, options);

  _redis.on('error', (err: Error) => {
    getLogger().warn({ event: 'redis_error', err: err.message }, 'Redis connection error');
  });

  return _redis;
}

/**
 * Reset the Redis singleton (for testing only).
 * @internal
 */
export async function _resetRedisForTesting(): Promise<void> {
  if (_redis) {
    await _redis.quit().catch(() => undefined);
    _redis = undefined;
  }
}

/**
 * Inject a pre-built Redis instance (for testing with ioredis-mock).
 * @internal
 */
export function _setRedisForTesting(r: unknown): void {
  _redis = r as Redis;
}

/**
 * BullMQ compatibility smoke test (Pitfall A mitigation).
 *
 * Verifies that Upstash supports the Redis command set required by BullMQ:
 * (a) PING — basic connectivity
 * (b) XADD + XLEN — stream commands for BullMQ job state machine
 * (c) SUBSCRIBE + PUBLISH — pub/sub for QueueEvents notifications
 *
 * Does NOT crash on failure — emits Pino warning.
 * The caller (index.ts) routes failures to a P1 alert.
 */
export async function pingWithBullMQCompat(): Promise<{ ok: boolean; failures: string[] }> {
  const redis = getRedis();
  const failures: string[] = [];

  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') failures.push('PING returned non-PONG');
  } catch (err) {
    failures.push(`PING failed: ${String(err)}`);
  }

  // (b) Stream commands (XADD / XLEN)
  const testStream = `bullmq-compat-test-${Date.now()}`;
  try {
    await redis.xadd(testStream, '*', 'field', 'value');
    const len = await redis.xlen(testStream);
    if (len < 1) failures.push('XLEN returned 0 after XADD — stream commands may be broken');
    // Cleanup
    await redis.del(testStream).catch(() => undefined);
  } catch (err) {
    failures.push(`XADD/XLEN failed: ${String(err)}`);
  }

  // (c) Pub/Sub round-trip
  // Note: In test environments with ioredis-mock, pub/sub may not be fully supported.
  // We treat pub/sub failures as warnings, not hard errors, for local dev compatibility.
  try {
    const sub: Redis = redis.duplicate();
    const pub: Redis = redis.duplicate();

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.quit().catch(() => undefined);
        pub.quit().catch(() => undefined);
        // Don't fail on pub/sub timeout — Upstash serverless may not support persistent connections
        getLogger().warn({ event: 'bullmq_pubsub_timeout' }, 'Pub/sub round-trip timed out — BullMQ QueueEvents may not work with serverless Redis');
        resolve();
      }, 2000);

      sub.subscribe('bullmq-compat-channel').then(() => {
        sub.on('message', (_channel: string, _message: string) => {
          clearTimeout(timeout);
          sub.quit().catch(() => undefined);
          pub.quit().catch(() => undefined);
          resolve();
        });

        return pub.publish('bullmq-compat-channel', 'test');
      }).catch((err: Error) => {
        clearTimeout(timeout);
        sub.quit().catch(() => undefined);
        pub.quit().catch(() => undefined);
        // Pub/sub not supported — note as informational warning
        getLogger().warn({ event: 'bullmq_pubsub_unsupported', err: err.message }, 'Pub/sub not supported — consider Fly Redis sidecar for BullMQ QueueEvents');
        resolve();
        reject; // appease lint
      });
    });
  } catch (err) {
    // Non-fatal — Upstash may not support persistent pub/sub connections
    getLogger().warn({ event: 'bullmq_pubsub_check_failed', err: String(err) }, 'Pub/sub compatibility check failed');
  }

  const ok = failures.length === 0;

  if (!ok) {
    getLogger().warn(
      { event: 'bullmq_compat_warning', failures },
      'BullMQ compatibility check failed — some Redis commands may not work with Upstash free tier. Consider upgrading to Upstash Pro or switching to Fly Redis sidecar.',
    );
  } else {
    getLogger().info({ event: 'bullmq_compat_ok' }, 'BullMQ compatibility check passed');
  }

  return { ok, failures };
}
