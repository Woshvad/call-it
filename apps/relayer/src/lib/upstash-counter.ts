/**
 * Per-user paymaster counter — lifetime 5-tx cap (D-02, Pitfall 14).
 *
 * All keys are stored in Upstash (ioredis). No TTL on user counters —
 * the limit is LIFETIME, not daily (D-02 "lifetime not daily").
 *
 * Exports:
 *   getPaymasterCount(privyUserId)                  — read counter (0 if absent)
 *   incrementPaymasterCount(privyUserId, userOpHash) — INCRBY with SETNX idempotency
 *   registerSenderMapping(senderAddress, privyUserId) — aa:sender:{addr} = privyUserId
 *
 * Key namespaces:
 *   paymaster:user:{privyUserId}:count              — lifetime userOp counter
 *   paymaster:userop:{userOpHash}:counted           — idempotency lock (30-day TTL)
 *   aa:sender:{senderAddress}                       — sender → privyUserId mapping
 *
 * Security (T-01-41, T-01-45):
 *   - INCRBY is atomic — no race condition on concurrent inclusion events
 *   - SETNX on userOpHash prevents double-count on bundler reconnect
 *   - Counter is per-user — only readable by authenticated owner (T-01-46)
 */

import { getRedis } from './redis.js';
import { getLogger } from './logger.js';

// ─── Key helpers ─────────────────────────────────────────────────────────────

const PAYMASTER_CAP = 5;
export const PAYMASTER_CAP_LIMIT = PAYMASTER_CAP;

function userCountKey(privyUserId: string): string {
  return `paymaster:user:${privyUserId}:count`;
}

function userOpIdempotencyKey(userOpHash: string): string {
  return `paymaster:userop:${userOpHash}:counted`;
}

function senderMappingKey(senderAddress: string): string {
  return `aa:sender:${senderAddress.toLowerCase()}`;
}

// 30 days in seconds
const USEROP_IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 60 * 60;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Read the current lifetime paymaster count for a user.
 * Returns 0 if the user has no counter yet.
 */
export async function getPaymasterCount(privyUserId: string): Promise<number> {
  const redis = getRedis();
  const raw = await redis.get(userCountKey(privyUserId));
  const count = raw ? parseInt(raw, 10) : 0;

  getLogger().debug(
    { event: 'paymaster_count_read', privyUserId, count },
    'paymaster count read',
  );

  return count;
}

/**
 * Increment the paymaster counter for a user, guarded by SETNX idempotency.
 *
 * Returns:
 *   { alreadyCounted: true }  — userOpHash already processed (idempotency lock hit)
 *   { alreadyCounted: false, newCount }  — successfully incremented
 *
 * SETNX lock uses a 30-day TTL so replayed UserOperationEvents (bundler reconnect)
 * cannot double-count (T-01-45).
 */
export async function incrementPaymasterCount(
  privyUserId: string,
  userOpHash: string,
): Promise<{ newCount: number; alreadyCounted: boolean }> {
  const redis = getRedis();
  const idempotencyKey = userOpIdempotencyKey(userOpHash);

  // Attempt to claim the idempotency slot — SET NX EX 30d
  const claimed = await redis.set(idempotencyKey, '1', 'EX', USEROP_IDEMPOTENCY_TTL_SECONDS, 'NX');

  if (claimed === null) {
    // Already counted — SETNX returned null (key existed)
    getLogger().info(
      { event: 'paymaster_inclusion_already_counted', privyUserId, userOpHash },
      'userOpHash already counted — skipping increment',
    );
    const currentCount = await getPaymasterCount(privyUserId);
    return { newCount: currentCount, alreadyCounted: true };
  }

  // Atomically increment the counter (no TTL — lifetime counter)
  const newCount = await redis.incrby(userCountKey(privyUserId), 1);

  getLogger().info(
    { event: 'paymaster_inclusion_confirmed', privyUserId, userOpHash, newCount },
    'paymaster count incremented on confirmed inclusion',
  );

  return { newCount, alreadyCounted: false };
}

/**
 * Register the sender address → privyUserId mapping.
 * Written at policy sign time so the confirmer worker can look up the user
 * from a UserOperationEvent's `sender` field.
 *
 * No TTL — wallet is stable for the user's lifetime.
 */
export async function registerSenderMapping(
  senderAddress: string,
  privyUserId: string,
): Promise<void> {
  const redis = getRedis();
  await redis.set(senderMappingKey(senderAddress), privyUserId);

  getLogger().debug(
    { event: 'sender_mapping_registered', senderAddress: senderAddress.toLowerCase(), privyUserId },
    'sender → privyUserId mapping registered',
  );
}

/**
 * Look up privyUserId from a sender address.
 * Returns null if not found (sender not managed by this relayer).
 */
export async function getSenderMapping(senderAddress: string): Promise<string | null> {
  const redis = getRedis();
  return redis.get(senderMappingKey(senderAddress));
}
