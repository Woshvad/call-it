/**
 * calls-dup-check route tests (Plan 08, Task 1 — TDD GREEN).
 *
 * Tests:
 *   1. Returns { exists: false } when activeDuplicateHashes returns 0
 *   2. Returns { exists: true, existingCallId } when activeDuplicateHashes returns non-zero
 *   3. Second identical request returns cached result (Redis cache hit — no second viem call)
 *   4. Returns 401 without valid Privy session
 *   5. Returns 400 on invalid body (missing required fields)
 *   6. Uses dayBucketUtc for the expiry — two expirations on the same UTC day share same hash
 *
 * Mock strategy:
 *   - viem publicClient.readContract is mocked to control activeDuplicateHashes return
 *   - ioredis-mock for Redis (no Upstash connection needed)
 *   - @privy-io/server-auth mocked for session verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock @privy-io/server-auth ───────────────────────────────────────────────

const VALID_TOKEN = 'valid-privy-token-dup-check-test';
const VALID_USER_ID = 'did:privy:dup-check-test-user';

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => ({
    verifyAuthToken: vi.fn().mockImplementation((token: string) => {
      if (token === VALID_TOKEN) {
        return Promise.resolve({ userId: VALID_USER_ID });
      }
      return Promise.reject(new Error('Invalid token'));
    }),
  })),
}));

// ─── Mock ioredis ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RedisMock = require('ioredis-mock');
const redisMock = new RedisMock();

vi.mock('../src/lib/redis.js', () => ({
  getRedis: () => redisMock,
  _setRedisForTesting: vi.fn(),
  _resetRedisForTesting: vi.fn(),
  pingWithBullMQCompat: vi.fn().mockResolvedValue({ ok: true, failures: [] }),
}));

// ─── Mock alerts ──────────────────────────────────────────────────────────────

vi.mock('../src/workers/alerts.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
  P0_EVENTS: new Set(['pause', 'dispute_raised', 'force_settle', 'rep_fallback', 'settle_failed', 'stylus_reactivation', 'address_book_cooldown_bypass_attempt']),
}));

// ─── Mock paymaster-confirmer to avoid WS connections ────────────────────────

vi.mock('../src/workers/paymaster-confirmer.js', () => ({
  startPaymasterConfirmer: vi.fn().mockReturnValue(() => undefined),
  handleUserOperationEvent: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock viem (public client readContract) ───────────────────────────────────
// Create a stable shared mock that persists across all createPublicClient() calls.
// The route calls createPublicClient() per request, so we need the same mock every time.

const mockReadContract = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
    })),
    // quick-260611-co5: passthrough — production code wraps transports in fallback()
    fallback: vi.fn((transports: unknown[]) => transports[0]),
    http: vi.fn(() => ({})),
  };
});

// ─── Test setup ───────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import { callsDupCheckRoute } from '../src/routes/calls-dup-check.js';
import { memoryCache } from '../src/lib/memory-cache.js';

process.env.PRIVY_APP_ID = 'test-app-id';
process.env.PRIVY_APP_SECRET = 'test-app-secret';
process.env.NEXT_PUBLIC_CALL_REGISTRY_ADDRESS = '0x1234567890123456789012345678901234567890';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(callsDupCheckRoute);
  return app;
}

function makeValidBody() {
  // A call expiring 1 day from now (far in future)
  const futureExpiry = Math.floor(Date.now() / 1000) + 86400;
  return {
    marketType: 'priceTarget',
    assetA: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC Pyth feed
    eventSubtype: 'none',
    targetValue: '80000000000', // 80k USD in smallest units
    expiry: futureExpiry,
  };
}

describe('POST /api/calls/dup-check', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await redisMock.flushall();
    // quick-260611-h36: clear the in-process L1 (lib/cache.ts is L1-first) so a
    // prior test's cached dup-check result can't short-circuit this test.
    memoryCache._clearAllForTesting();
    mockReadContract.mockReset();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close().catch(() => undefined);
  });

  it('Test 1: returns { exists: false } when activeDuplicateHashes returns 0', async () => {
    mockReadContract.mockResolvedValue(0n);

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/dup-check',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { exists: boolean; existingCallId?: number };
    expect(body.exists).toBe(false);
    expect(body.existingCallId).toBeUndefined();
  });

  it('Test 2: returns { exists: true, existingCallId: 42 } when activeDuplicateHashes returns 42', async () => {
    mockReadContract.mockResolvedValue(42n);

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/dup-check',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { exists: boolean; existingCallId?: number };
    expect(body.exists).toBe(true);
    expect(body.existingCallId).toBe(42);
  });

  it('Test 3: second identical request hits Redis cache (readContract called only once)', async () => {
    mockReadContract.mockResolvedValue(7n); // callId 7

    const payload = makeValidBody();
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${VALID_TOKEN}`,
    };

    // First request — calls readContract
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/calls/dup-check',
      headers,
      payload,
    });
    expect(res1.statusCode).toBe(200);

    // Second request — should hit Redis cache, NOT call readContract again
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/calls/dup-check',
      headers,
      payload,
    });
    expect(res2.statusCode).toBe(200);

    const body1 = JSON.parse(res1.body) as { exists: boolean; existingCallId?: number };
    const body2 = JSON.parse(res2.body) as { exists: boolean; existingCallId?: number };

    // Both responses should match
    expect(body1.exists).toBe(true);
    expect(body1.existingCallId).toBe(7);
    expect(body2.exists).toBe(true);
    expect(body2.existingCallId).toBe(7);

    // readContract should have been called only ONCE (second hit was from cache)
    expect(mockReadContract).toHaveBeenCalledTimes(1);
  });

  it('Test 4: returns 401 without valid Privy session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/dup-check',
      headers: { 'content-type': 'application/json' },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error: string; code: string };
    expect(body.code).toBe('invalid_session');
  });

  it('Test 5: returns 400 on invalid body (missing required field)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/dup-check',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: {
        // marketType missing, targetValue missing
        assetA: 'BTC',
        expiry: Math.floor(Date.now() / 1000) + 86400,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe('invalid_request');
  });

  it('Test 6: two expirations on same UTC day share the same hash (PITFALL-12)', async () => {
    mockReadContract.mockResolvedValue(0n);

    const utcMidnight = Math.floor(Date.now() / 1000 / 86400) * 86400;
    // Two times on the same UTC day: 1 hour after midnight, 23 hours after midnight
    const expiry1 = utcMidnight + 3600;   // 01:00 UTC
    const expiry2 = utcMidnight + 82800;  // 23:00 UTC

    const baseBody = {
      marketType: 'priceTarget',
      assetA: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
      eventSubtype: 'none',
      targetValue: '80000000000',
    };

    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${VALID_TOKEN}`,
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/calls/dup-check',
      headers,
      payload: { ...baseBody, expiry: expiry1 },
    });

    // Flush Redis to avoid cache hit from first request
    await redisMock.flushall();
    mockReadContract.mockResolvedValue(0n); // reset for second request

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/calls/dup-check',
      headers,
      payload: { ...baseBody, expiry: expiry2 },
    });

    const body1 = JSON.parse(res1.body) as { hash: string };
    const body2 = JSON.parse(res2.body) as { hash: string };

    // Both should produce the same hash (UTC-day bucket is the same)
    expect(body1.hash).toBe(body2.hash);
  });
});
