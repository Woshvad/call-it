/**
 * paymaster-policy route tests (Plan 07, Task 1 — TDD GREEN).
 *
 * Tests:
 *   1. Returns paymaster result when counter is 0 (under cap)
 *   2. Returns paymaster result when counter is 4 (under cap — last sponsored tx)
 *   3. Returns -32000 sponsorship-cap-exceeded when counter is 5 (at cap)
 *   4. Returns -32000 when counter is 6 (over cap)
 *   5. Policy endpoint NEVER calls incrementPaymasterCount (D-02 guard)
 *   6. registerSenderMapping is called on grant (side effect for confirmer)
 *   7. Invalid request body returns -32600 error
 *   8. GET /api/paymaster-count returns { count, capacity: 5, remaining }
 *   9. GET /api/paymaster-count returns 401 without valid session
 *
 * Mock strategy:
 *   - ioredis-mock for Redis (no Upstash connection needed)
 *   - @privy-io/server-auth mocked for GET /api/paymaster-count auth
 *   - workers/alerts.js mocked to suppress Telegram
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @privy-io/server-auth ───────────────────────────────────────────────

const VALID_TOKEN = 'valid-privy-token-policy-test';
const VALID_USER_ID = 'did:privy:policy-test-user';

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

// ─── Mock Redis with ioredis-mock ─────────────────────────────────────────────

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

// ─── Mock paymaster-confirmer to avoid WS connections in tests ───────────────

vi.mock('../src/workers/paymaster-confirmer.js', () => ({
  startPaymasterConfirmer: vi.fn().mockReturnValue(() => undefined),
  handleUserOperationEvent: vi.fn().mockResolvedValue(undefined),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import { paymasterPolicyRoute } from '../src/routes/paymaster-policy.js';

process.env.PRIVY_APP_ID = 'test-app-id';
process.env.PRIVY_APP_SECRET = 'test-app-secret';
process.env.ALCHEMY_PAYMASTER_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(paymasterPolicyRoute);
  return app;
}

function makePolicyBody(privyUserId: string, method: string = 'pm_getPaymasterData') {
  return {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: [
      { sender: '0x1234567890123456789012345678901234567890' },
      '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',  // entryPoint
      '0xa4b1',  // chainId (Arbitrum)
      { privyUserId },
    ],
  };
}

describe('POST /paymaster/policy', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    // Reset Redis state between tests
    await redisMock.flushall();
    app = await buildTestApp();
  });

  it('Test 1: returns paymaster result when counter is 0 (under cap)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/paymaster/policy',
      headers: { 'content-type': 'application/json' },
      payload: makePolicyBody('did:privy:user-zero-count'),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { result?: { paymaster: string }; error?: unknown };
    expect(body.result).toBeDefined();
    expect(body.result?.paymaster).toBeDefined();
    expect(body.error).toBeUndefined();
  });

  it('Test 2: returns paymaster result when counter is 4 (last sponsored tx)', async () => {
    // Pre-set counter to 4
    await redisMock.set('paymaster:user:did:privy:user-at-4:count', '4');

    const res = await app.inject({
      method: 'POST',
      url: '/paymaster/policy',
      headers: { 'content-type': 'application/json' },
      payload: makePolicyBody('did:privy:user-at-4'),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { result?: { paymaster: string }; error?: unknown };
    expect(body.result).toBeDefined();
    expect(body.error).toBeUndefined();
  });

  it('Test 3: returns -32000 sponsorship-cap-exceeded when counter is 5 (at cap)', async () => {
    // Pre-set counter to 5
    await redisMock.set('paymaster:user:did:privy:user-at-5:count', '5');

    const res = await app.inject({
      method: 'POST',
      url: '/paymaster/policy',
      headers: { 'content-type': 'application/json' },
      payload: makePolicyBody('did:privy:user-at-5'),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { error?: { code: number; message: string } };
    expect(body.error).toBeDefined();
    expect(body.error?.code).toBe(-32000);
    expect(body.error?.message).toBe('sponsorship-cap-exceeded');
  });

  it('Test 4: returns -32000 when counter is 6 (over cap)', async () => {
    await redisMock.set('paymaster:user:did:privy:user-at-6:count', '6');

    const res = await app.inject({
      method: 'POST',
      url: '/paymaster/policy',
      headers: { 'content-type': 'application/json' },
      payload: makePolicyBody('did:privy:user-at-6'),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { error?: { code: number; message: string } };
    expect(body.error?.code).toBe(-32000);
  });

  it('Test 5: policy endpoint NEVER increments the counter (D-02 guard)', async () => {
    const privyUserId = 'did:privy:no-increment-user';
    const countKey = `paymaster:user:${privyUserId}:count`;

    // Verify counter starts at 0 (absent)
    const before = await redisMock.get(countKey);
    expect(before).toBeNull();

    // Call policy endpoint 3 times
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/paymaster/policy',
        headers: { 'content-type': 'application/json' },
        payload: makePolicyBody(privyUserId),
      });
    }

    // Counter must still be absent (not incremented by policy)
    const after = await redisMock.get(countKey);
    expect(after).toBeNull();
  });

  it('Test 6: registerSenderMapping is called on grant (confirmer lookup side effect)', async () => {
    const privyUserId = 'did:privy:sender-map-user';
    const sender = '0xabcdef1234567890abcdef1234567890abcdef12';

    await app.inject({
      method: 'POST',
      url: '/paymaster/policy',
      headers: { 'content-type': 'application/json' },
      payload: {
        ...makePolicyBody(privyUserId),
        params: [
          { sender },
          '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
          '0xa4b1',
          { privyUserId },
        ],
      },
    });

    // Verify the sender mapping was registered in Redis
    const mappedUser = await redisMock.get(`aa:sender:${sender.toLowerCase()}`);
    expect(mappedUser).toBe(privyUserId);
  });

  it('Test 7: invalid request body returns -32600 error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/paymaster/policy',
      headers: { 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', id: 1, method: 'unknown_method', params: [] },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error?: { code: number } };
    expect(body.error?.code).toBe(-32600);
  });
});

describe('GET /api/paymaster-count', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await redisMock.flushall();
    app = await buildTestApp();
  });

  it('Test 8: returns count/capacity/remaining for authenticated user', async () => {
    // Pre-set counter to 3
    await redisMock.set(`paymaster:user:${VALID_USER_ID}:count`, '3');

    const res = await app.inject({
      method: 'GET',
      url: '/api/paymaster-count',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { count: number; capacity: number; remaining: number };
    expect(body.count).toBe(3);
    expect(body.capacity).toBe(5);
    expect(body.remaining).toBe(2);
  });

  it('Test 9: returns 401 without valid session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/paymaster-count',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('invalid_session');
  });
});
