/**
 * Task 3 TDD — Paymaster 80% threshold alert tests (SAFETY-17)
 *
 * Tests that the 80% alert fires once (idempotent) when spend crosses threshold.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

// Use a factory function to avoid hoisting issues with mockSendAlert
vi.mock('../src/workers/alerts.js', () => {
  return {
    sendAlert: vi.fn().mockResolvedValue(undefined),
    P0_EVENTS: new Set(['pause', 'dispute_raised', 'force_settle', 'rep_fallback', 'settle_failed', 'stylus_reactivation']),
  };
});

import { getRedis } from '../src/lib/redis.js';
import * as alertsModule from '../src/workers/alerts.js';
import {
  incrementPaymasterSpend,
  checkPaymasterThreshold,
} from '../src/workers/paymaster-counter.js';

describe('Paymaster 80% threshold alert', () => {
  beforeEach(async () => {
    const redis = getRedis();
    await (redis as unknown as { flushall(): Promise<string> }).flushall();
    vi.clearAllMocks();
  });

  it('fires paymaster_80 alert when spend crosses 80% of $50 cap (40 USDC)', async () => {
    // $50 cap = 50_000_000 USDC6; 80% = 40_000_000
    // Set spend to just below threshold
    await incrementPaymasterSpend(39_000_000n);
    let result = await checkPaymasterThreshold();
    expect(result.crossed80).toBe(false);
    expect(alertsModule.sendAlert).not.toHaveBeenCalled();

    // Cross the threshold
    await incrementPaymasterSpend(1_000_001n); // now 40_000_001 > 40_000_000
    result = await checkPaymasterThreshold();
    expect(result.crossed80).toBe(true);
    expect(alertsModule.sendAlert).toHaveBeenCalledOnce();
    expect(alertsModule.sendAlert).toHaveBeenCalledWith('paymaster_80', expect.objectContaining({
      current: expect.any(String),
      cap: expect.any(String),
    }));
  });

  it('alert fires only once per day (idempotent via Redis SET NX lock)', async () => {
    // Simulate already-crossed state
    await incrementPaymasterSpend(41_000_000n);

    // First check — should fire alert
    await checkPaymasterThreshold();
    expect(alertsModule.sendAlert).toHaveBeenCalledOnce();

    vi.clearAllMocks();

    // Second check on same day — lock already set, should NOT re-fire
    await incrementPaymasterSpend(1_000_000n);
    await checkPaymasterThreshold();
    expect(alertsModule.sendAlert).not.toHaveBeenCalled();
  });
});
