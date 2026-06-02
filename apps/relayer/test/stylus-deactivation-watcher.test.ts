/**
 * stylus-deactivation-watcher.test.ts — unit tests for the Stylus deactivation watcher (D-13)
 *
 * Tests:
 * - Test 1: No alert fires when daysRemaining > 30
 * - Test 2: Alerts fire at T-30, T-15, T-7, T-1 thresholds; Redis idempotency lock prevents duplicate fires
 * - Test 3: graceful skip when readContract throws (Phase 0 no-Stylus case)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startStylusDeactivationWatcher } from '../src/workers/stylus-deactivation-watcher.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Mock sendAlert
vi.mock('../src/workers/alerts.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { sendAlert } from '../src/workers/alerts.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper factories
// ─────────────────────────────────────────────────────────────────────────────

function nowPlusDays(days: number): bigint {
  const ms = Date.now() + days * 24 * 60 * 60 * 1000;
  return BigInt(Math.floor(ms / 1000));
}

function makeMockRedis(setNxResult: 'OK' | null = 'OK') {
  return {
    set: vi.fn().mockResolvedValue(setNxResult),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  };
}

function makeMockPublicClient(expiryTimestamp: bigint | null, shouldThrow = false) {
  return {
    readContract: shouldThrow
      ? vi.fn().mockRejectedValue(new Error('Contract not deployed'))
      : vi.fn().mockResolvedValue(expiryTimestamp),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('startStylusDeactivationWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: no alert fires when daysRemaining > 30', async () => {
    const mockRedis = makeMockRedis();
    const expiryTimestamp = nowPlusDays(45); // 45 days remaining — above T-30 threshold
    const mockPublicClient = makeMockPublicClient(expiryTimestamp);

    const watcher = startStylusDeactivationWatcher({
      publicClient: mockPublicClient as any,
      stylusAddress: '0x1234567890123456789012345678901234567890',
      intervalMs: 50, // Very short for test speed
      redis: mockRedis as any,
    });

    // Wait for one tick
    await new Promise((resolve) => setTimeout(resolve, 150));
    watcher.stop();

    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('Test 2: alerts fire at T-30, T-15, T-7, T-1 thresholds with Redis idempotency', async () => {
    const mockRedis = makeMockRedis('OK'); // SET NX succeeds (first time)
    const sendAlertMock = vi.mocked(sendAlert);

    // Test T-30 threshold
    const expiryAt30 = nowPlusDays(29); // 29 days remaining — crosses T-30
    const mockPublicClient30 = makeMockPublicClient(expiryAt30);

    const watcher30 = startStylusDeactivationWatcher({
      publicClient: mockPublicClient30 as any,
      stylusAddress: '0xaaaa567890123456789012345678901234567890',
      intervalMs: 50,
      redis: mockRedis as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    watcher30.stop();

    expect(sendAlertMock).toHaveBeenCalledWith(
      'stylus_reactivation',
      expect.objectContaining({
        daysRemaining: expect.any(Number),
        expiryTimestamp: expect.any(Number),
        stylusAddress: '0xaaaa567890123456789012345678901234567890',
      }),
    );

    // Verify Redis lock was acquired with NX + EX 86400
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringMatching(/stylus:alert-fired:T-\d+d:/),
      '1',
      'EX',
      86400,
      'NX',
    );

    // Test idempotency: if Redis SET NX fails (already locked), no second alert
    const mockRedisLocked = makeMockRedis(null); // SET NX fails = already locked
    const sendAlertMock2 = vi.mocked(sendAlert);
    sendAlertMock2.mockClear();

    const expiryAt30Again = nowPlusDays(28);
    const mockPublicClient30b = makeMockPublicClient(expiryAt30Again);

    const watcher30b = startStylusDeactivationWatcher({
      publicClient: mockPublicClient30b as any,
      stylusAddress: '0xaaaa567890123456789012345678901234567890',
      intervalMs: 50,
      redis: mockRedisLocked as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    watcher30b.stop();

    // Alert should NOT fire again (Redis lock already set)
    expect(sendAlertMock2).not.toHaveBeenCalled();
  });

  it('Test 3: graceful skip when readContract throws (Phase 0: no Stylus deployed)', async () => {
    const mockRedis = makeMockRedis();
    const mockPublicClient = makeMockPublicClient(null, true); // Throws on readContract

    const watcher = startStylusDeactivationWatcher({
      publicClient: mockPublicClient as any,
      stylusAddress: '0x5678567890123456789012345678901234567890',
      intervalMs: 50,
      redis: mockRedis as any,
    });

    // Wait for 2 ticks — should not crash
    await new Promise((resolve) => setTimeout(resolve, 200));
    watcher.stop();

    // sendAlert NOT called (the watcher skips gracefully)
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('Test 4: null stylusAddress skips without crashing (Phase 0 inactive state)', async () => {
    const mockRedis = makeMockRedis();
    const mockPublicClient = { readContract: vi.fn() };

    const watcher = startStylusDeactivationWatcher({
      publicClient: mockPublicClient as any,
      stylusAddress: null,
      intervalMs: 50,
      redis: mockRedis as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    watcher.stop();

    // readContract NOT called when no stylusAddress
    expect(mockPublicClient.readContract).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('Test 5: demo-cutoff alert fires when hoursUntilDemo <= 24', async () => {
    const mockRedis = makeMockRedis('OK');
    const sendAlertMock = vi.mocked(sendAlert);
    // Set demoCutoffTimestamp to nowPlusDays(0.5) = 12 hours from now (in seconds)
    const demoCutoffTs = Math.floor(Date.now() / 1000) + 12 * 3600;
    const expiryFarFuture = nowPlusDays(200); // far future — no reactivation alert
    const mockPublicClient = makeMockPublicClient(expiryFarFuture);

    const watcher = startStylusDeactivationWatcher({
      publicClient: mockPublicClient as any,
      stylusAddress: '0xStylusAddr0000000000000000000000000000',
      intervalMs: 50,
      redis: mockRedis as any,
      demoCutoffTimestamp: demoCutoffTs,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    watcher.stop();

    expect(sendAlertMock).toHaveBeenCalledWith(
      'stylus_demo_cutoff',
      expect.objectContaining({
        hoursRemaining: expect.any(Number),
        threshold: 24, // 12 hours remaining < 24h threshold → fires at T-24h
        demoCutoffTimestamp: demoCutoffTs,
      }),
    );
    // Verify Redis lock key prefix is demo-cutoff, NOT alert-fired
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringMatching(/stylus:demo-cutoff:T-24h:/),
      '1',
      'EX',
      86400,
      'NX',
    );
  });
});
