/**
 * calls-preflight route tests (Plan 08, Task 1 — TDD GREEN).
 *
 * Tests:
 *   1. Returns 200 { ok: true } on full pass (all on-chain reads within bounds)
 *   2. Returns 422 + TVL cap error when currentTvl + stake + fee exceeds tvlCap
 *   3. Returns 422 + insufficient_allowance error when USDC allowance too low
 *   4. Returns 422 + insufficient_balance error when USDC balance too low
 *   5. Returns 422 + duplicate_call error when activeDuplicateHashes returns non-zero
 *   6. Returns 422 Zod field errors on invalid input (stake below minimum)
 *   7. Returns 401 without valid Privy session
 *   8. Conviction auto-cap: suggestedConviction = 84 when settledCalls < 10 AND conviction >= 85
 *   9. Conviction pass-through: suggestedConviction = input when settledCalls >= 10
 *
 * Mock strategy:
 *   - viem publicClient.readContract mocked with controllable return values
 *   - @privy-io/server-auth mocked for session verification
 *   - Redis mocked (not needed for preflight, but required by route imports)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock @privy-io/server-auth ───────────────────────────────────────────────

const VALID_TOKEN = 'valid-privy-token-preflight-test';
const VALID_USER_ID = 'did:privy:preflight-test-user';

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

// ─── Mock paymaster-confirmer ─────────────────────────────────────────────────

vi.mock('../src/workers/paymaster-confirmer.js', () => ({
  startPaymasterConfirmer: vi.fn().mockReturnValue(() => undefined),
  handleUserOperationEvent: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock viem ────────────────────────────────────────────────────────────────
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
import { callsPreflightRoute } from '../src/routes/calls-preflight.js';
import {
  MIN_STAKE,
  CREATION_FEE,
  CONVICTION_AUTOCAP,
  HIGH_CONVICTION_THRESHOLD,
  CONVICTION_FLOOR_MIN_CALLS,
} from '@call-it/shared';

process.env.PRIVY_APP_ID = 'test-app-id';
process.env.PRIVY_APP_SECRET = 'test-app-secret';
process.env.NEXT_PUBLIC_CALL_REGISTRY_ADDRESS = '0x1234567890123456789012345678901234567890';
process.env.NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(callsPreflightRoute);
  return app;
}

/**
 * Makes a valid preflight body. Override specific fields to test gate failures.
 * Bigint fields are sent as strings (JSON transport pattern).
 */
function makeValidBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const futureExpiry = BigInt(Math.floor(Date.now() / 1000) + 86400);
  return {
    marketType: 'priceTarget',
    eventSubtype: 'none',
    category: 'majors',
    assetA: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    assetB: undefined,
    targetValue: String(80_000_000_000n), // 80k USD target
    expiry: String(futureExpiry),
    stake: String(MIN_STAKE), // 5 USDC as string
    conviction: 70, // below high-conviction threshold
    criteriaText: undefined,
    openToChallenges: true,
    parentCallId: undefined,
    callerSettledCalls: 5, // below CONVICTION_FLOOR_MIN_CALLS
    callerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    ...overrides,
  };
}

/**
 * Seed mock readContract to return passing values for all on-chain reads.
 * Call order: currentTvl, tvlCap, allowance, balance, settledCalls, activeDuplicateHashes
 */
function seedPassingOnChainReads(settledCalls = 5n) {
  const requiredAmount = MIN_STAKE + CREATION_FEE; // 5 + 10 = 15 USDC
  mockReadContract
    .mockResolvedValueOnce(0n)                        // currentTvl = 0
    .mockResolvedValueOnce(5_000_000_000n)            // tvlCap = 5000 USDC
    .mockResolvedValueOnce(requiredAmount + 1_000_000n) // allowance = sufficient
    .mockResolvedValueOnce(requiredAmount + 1_000_000n) // balance = sufficient
    .mockResolvedValueOnce(settledCalls)               // settledCalls
    .mockResolvedValueOnce(0n);                        // activeDuplicateHashes = 0 (no dup)
}

describe('POST /api/calls/preflight', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await redisMock.flushall();
    mockReadContract.mockReset();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close().catch(() => undefined);
  });

  it('Test 1: returns 200 { ok: true } on full pass', async () => {
    seedPassingOnChainReads();

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      hash: string;
      settledCalls: number;
      suggestedConviction: number;
    };
    expect(body.ok).toBe(true);
    expect(body.hash).toBeDefined();
    expect(typeof body.settledCalls).toBe('number');
    expect(body.suggestedConviction).toBe(70); // conviction not capped (below threshold)
  });

  it('Test 2: returns 422 + tvl_cap_reached when TVL would be exceeded', async () => {
    const tvlCap = 5_000_000_000n; // 5000 USDC cap
    // currentTvl is at cap - 1 (nearly full, even 1 unit can exceed with stake+fee)
    const currentTvl = tvlCap - 1n;
    const requiredAmount = MIN_STAKE + CREATION_FEE;

    mockReadContract
      .mockResolvedValueOnce(currentTvl)     // currentTvl (nearly at cap)
      .mockResolvedValueOnce(tvlCap)         // tvlCap
      .mockResolvedValueOnce(requiredAmount + 1_000_000n) // allowance = sufficient
      .mockResolvedValueOnce(requiredAmount + 1_000_000n) // balance = sufficient
      .mockResolvedValueOnce(5n)             // settledCalls
      .mockResolvedValueOnce(0n);            // activeDuplicateHashes = no dup

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { ok: boolean; errors: Array<{ code: string }> };
    expect(body.ok).toBe(false);
    expect(body.errors.some((e) => e.code === 'tvl_cap_reached')).toBe(true);
  });

  it('Test 3: returns 422 + insufficient_allowance when USDC allowance too low', async () => {
    const requiredAmount = MIN_STAKE + CREATION_FEE;

    mockReadContract
      .mockResolvedValueOnce(0n)             // currentTvl = 0
      .mockResolvedValueOnce(5_000_000_000n) // tvlCap = 5000 USDC
      .mockResolvedValueOnce(0n)             // allowance = 0 (insufficient!)
      .mockResolvedValueOnce(requiredAmount + 1_000_000n) // balance = sufficient
      .mockResolvedValueOnce(5n)             // settledCalls
      .mockResolvedValueOnce(0n);            // activeDuplicateHashes = no dup

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { ok: boolean; errors: Array<{ code: string }> };
    expect(body.ok).toBe(false);
    expect(body.errors.some((e) => e.code === 'insufficient_allowance')).toBe(true);
  });

  it('Test 4: returns 422 + insufficient_balance when USDC balance too low', async () => {
    const requiredAmount = MIN_STAKE + CREATION_FEE;

    mockReadContract
      .mockResolvedValueOnce(0n)             // currentTvl = 0
      .mockResolvedValueOnce(5_000_000_000n) // tvlCap = 5000 USDC
      .mockResolvedValueOnce(requiredAmount + 1_000_000n) // allowance = sufficient
      .mockResolvedValueOnce(0n)             // balance = 0 (insufficient!)
      .mockResolvedValueOnce(5n)             // settledCalls
      .mockResolvedValueOnce(0n);            // activeDuplicateHashes = no dup

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { ok: boolean; errors: Array<{ code: string }> };
    expect(body.ok).toBe(false);
    expect(body.errors.some((e) => e.code === 'insufficient_balance')).toBe(true);
  });

  it('Test 5: returns 422 + duplicate_call when activeDuplicateHashes returns non-zero', async () => {
    const requiredAmount = MIN_STAKE + CREATION_FEE;

    mockReadContract
      .mockResolvedValueOnce(0n)             // currentTvl = 0
      .mockResolvedValueOnce(5_000_000_000n) // tvlCap = 5000 USDC
      .mockResolvedValueOnce(requiredAmount + 1_000_000n) // allowance = sufficient
      .mockResolvedValueOnce(requiredAmount + 1_000_000n) // balance = sufficient
      .mockResolvedValueOnce(5n)             // settledCalls
      .mockResolvedValueOnce(99n);           // activeDuplicateHashes = 99 (existing call!)

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { ok: boolean; errors: Array<{ code: string; message: string }> };
    expect(body.ok).toBe(false);
    const dupError = body.errors.find((e) => e.code === 'duplicate_call');
    expect(dupError).toBeDefined();
    expect(dupError?.message).toContain('99');
  });

  it('Test 6: returns 422 Zod errors on invalid input (stake below minimum)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody({
        stake: '1', // Way below MIN_STAKE
      }),
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { ok: boolean; errors: Array<{ field: string }> };
    expect(body.ok).toBe(false);
    // Should have a Zod error for the stake field
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('Test 7: returns 401 without valid Privy session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: { 'content-type': 'application/json' },
      payload: makeValidBody(),
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('invalid_session');
  });

  it(`Test 8: suggestedConviction = ${CONVICTION_AUTOCAP} when settledCalls < ${CONVICTION_FLOOR_MIN_CALLS} AND conviction >= ${HIGH_CONVICTION_THRESHOLD}`, async () => {
    // settledCalls = 3 (below floor), conviction = 85 (at threshold)
    seedPassingOnChainReads(3n);

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody({
        conviction: HIGH_CONVICTION_THRESHOLD, // 85
        callerSettledCalls: 3, // below floor
      }),
    });

    // Conviction cap is non-blocking — the endpoint still returns 200
    // The contract emits ConvictionCapped and proceeds; same logic here
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; suggestedConviction: number };
    expect(body.ok).toBe(true);
    expect(body.suggestedConviction).toBe(CONVICTION_AUTOCAP); // 84
  });

  it(`Test 9: suggestedConviction passes through when settledCalls >= ${CONVICTION_FLOOR_MIN_CALLS}`, async () => {
    seedPassingOnChainReads(15n); // 15 settled calls — above the floor

    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/preflight',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: makeValidBody({
        conviction: HIGH_CONVICTION_THRESHOLD, // 85
        callerSettledCalls: 15,
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; suggestedConviction: number };
    expect(body.ok).toBe(true);
    // conviction passes through unchanged (caller has enough settled calls)
    expect(body.suggestedConviction).toBe(HIGH_CONVICTION_THRESHOLD); // 85
  });
});
