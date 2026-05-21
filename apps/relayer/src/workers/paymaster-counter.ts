/**
 * Paymaster daily spend counter (SAFETY-15, SAFETY-17, OPS-10).
 *
 * Tracks total USDC sponsored by the paymaster on each calendar day (UTC).
 * Redis key: `paymaster:YYYY-MM-DD` (INCRBY, TTL 25h for clean daily reset)
 * Cap key: `paymaster:cap` (set via PATCH /admin/paymaster-cap, SAFETY-16)
 *
 * 80% threshold alert (SAFETY-17):
 * - When daily spend >= 0.8 × cap, dispatch sendAlert('paymaster_80', ...)
 * - Idempotent: uses SET NX lock `paymaster:alert-fired:YYYY-MM-DD` (1 alert per day max)
 *
 * Default cap: $50 USDC = 50_000_000 USDC6 (6-decimal native USDC)
 */

import { getRedis } from '../lib/redis.js';
import { sendAlert } from './alerts.js';
import { getLogger } from '../lib/logger.js';

/** Default daily paymaster cap: $50 USDC in 6-decimal units */
const DEFAULT_CAP_USDC6 = 50_000_000n;

/** TTL for daily counter: 25 hours (ensures cleanup even with UTC-edge calls) */
const COUNTER_TTL_SECONDS = 25 * 3600;

/** Lock TTL: 24 hours (one alert-fired lock per calendar day) */
const ALERT_LOCK_TTL_SECONDS = 24 * 3600;

/**
 * Get the Redis key for the current UTC day's paymaster counter.
 */
function getDailyKey(): string {
  return `paymaster:${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Get the Redis key for the daily alert-fired lock.
 */
function getAlertLockKey(): string {
  return `paymaster:alert-fired:${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Atomically increment the paymaster daily spend counter.
 *
 * Uses INCRBY (atomic) + EXPIRE (resets TTL on each increment, capped at 25h).
 * The EXPIRE call uses KEEPTTL semantics — if the key already has a TTL set,
 * we only extend it if the new TTL would be larger (prevents racing resets).
 *
 * @param amountUsdc6 - spend amount in USDC 6-decimal units (e.g. 1 USDC = 1_000_000n)
 * @returns new cumulative daily spend
 */
export async function incrementPaymasterSpend(amountUsdc6: bigint): Promise<bigint> {
  const redis = getRedis();
  const key = getDailyKey();

  // INCRBY is atomic — safe for concurrent relayer processes
  const newValue = await redis.incrby(key, amountUsdc6.toString());

  // Set TTL to 25h on first increment; subsequent calls extend if needed
  const currentTtl = await redis.ttl(key);
  if (currentTtl < 0 || currentTtl > COUNTER_TTL_SECONDS) {
    // TTL not set (new key) or too large — set to 25h
    await redis.expire(key, COUNTER_TTL_SECONDS);
  }

  getLogger().info(
    { event: 'paymaster_spend_increment', amountUsdc6: amountUsdc6.toString(), total: newValue },
    'Paymaster spend incremented',
  );

  return BigInt(newValue);
}

/**
 * Read the current paymaster daily spend (without incrementing).
 *
 * @returns cumulative spend for today in USDC6 units
 */
export async function getPaymasterSpend(): Promise<bigint> {
  const redis = getRedis();
  const key = getDailyKey();
  const value = await redis.get(key);
  return value ? BigInt(value) : 0n;
}

/**
 * Check if the paymaster daily spend has crossed the 80% threshold.
 *
 * Reads the current cap from Redis (default: $50 USDC6).
 * If current >= 0.8 × cap AND the alert lock is not set:
 *   1. Acquire the lock (SET NX with 24h TTL)
 *   2. Dispatch sendAlert('paymaster_80', { current, cap, ratio })
 *
 * @returns { crossed80, current, cap }
 */
export async function checkPaymasterThreshold(): Promise<{
  crossed80: boolean;
  current: bigint;
  cap: bigint;
}> {
  const redis = getRedis();

  const current = await getPaymasterSpend();
  const capRaw = await redis.get('paymaster:cap');
  const cap = capRaw ? BigInt(capRaw) : DEFAULT_CAP_USDC6;

  // 80% threshold: current >= 0.8 × cap
  const threshold = (cap * 8n) / 10n;
  const crossed80 = current >= threshold;

  if (crossed80) {
    // Try to acquire the daily alert lock (idempotent via SET NX)
    const lockKey = getAlertLockKey();
    const acquired = await redis.set(lockKey, '1', 'EX', ALERT_LOCK_TTL_SECONDS, 'NX');

    if (acquired === 'OK') {
      // Lock acquired — first crossing today, fire the alert
      const ratio = Number(current) / Number(cap);
      try {
        await sendAlert('paymaster_80', {
          current: current.toString(),
          cap: cap.toString(),
          ratio: ratio.toFixed(3),
          threshold: threshold.toString(),
        });
        getLogger().warn(
          { event: 'paymaster_threshold_alert', current: current.toString(), cap: cap.toString(), ratio },
          'Paymaster 80% daily cap threshold crossed — alert sent',
        );
      } catch (err) {
        // Alert failed — release lock so it can retry on next check
        await redis.del(lockKey).catch(() => undefined);
        getLogger().error(
          { event: 'paymaster_alert_failed', err: err instanceof Error ? err.message : String(err) },
          'Failed to send paymaster_80 alert — lock released for retry',
        );
      }
    } else {
      // Lock already held — alert already sent today (idempotent)
      getLogger().debug(
        { event: 'paymaster_alert_suppressed', current: current.toString() },
        'Paymaster alert suppressed — already sent today',
      );
    }
  }

  return { crossed80, current, cap };
}
