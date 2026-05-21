/**
 * Task 3 TDD — Paymaster counter tests
 *
 * Tests the atomic Redis INCRBY counter with 25h TTL (SAFETY-15).
 * Uses ioredis-mock to avoid a real Redis connection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We'll use a direct mock of getRedis to inject ioredis-mock
vi.mock('../src/lib/redis.js', () => {
  const RedisMock = require('ioredis-mock');
  const redisMock = new RedisMock();
  return {
    getRedis: () => redisMock,
    _setRedisForTesting: vi.fn(),
    _resetRedisForTesting: vi.fn(),
    pingWithBullMQCompat: vi.fn().mockResolvedValue({ ok: true, failures: [] }),
  };
});

vi.mock('../src/workers/alerts.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
  P0_EVENTS: new Set(['pause', 'dispute_raised', 'force_settle', 'rep_fallback', 'settle_failed', 'stylus_reactivation']),
}));

import { getRedis } from '../src/lib/redis.js';
import {
  incrementPaymasterSpend,
  getPaymasterSpend,
} from '../src/workers/paymaster-counter.js';

describe('Paymaster daily counter', () => {
  beforeEach(async () => {
    // Clear all keys in the mock Redis before each test
    const redis = getRedis();
    await (redis as unknown as { flushall(): Promise<string> }).flushall();
    vi.clearAllMocks();
  });

  it('increments spend and sets 25h TTL on first call', async () => {
    const amountUsdc6 = 1_000_000n; // 1 USDC (6 decimals)
    await incrementPaymasterSpend(amountUsdc6);

    const spend = await getPaymasterSpend();
    expect(spend).toBe(1_000_000n);

    // Check TTL: should be between 24h and 25h (in seconds)
    const redis = getRedis();
    const today = new Date().toISOString().slice(0, 10);
    const key = `paymaster:${today}`;
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(24 * 3600);
    expect(ttl).toBeLessThanOrEqual(25 * 3600);
  });

  it('accumulates correctly across multiple increments', async () => {
    await incrementPaymasterSpend(1_000_000n); // 1 USDC
    await incrementPaymasterSpend(2_000_000n); // 2 USDC

    const spend = await getPaymasterSpend();
    expect(spend).toBe(3_000_000n);
  });
});
