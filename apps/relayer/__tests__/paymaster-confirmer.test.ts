/**
 * paymaster-confirmer worker tests (Plan 07, Task 1 — TDD GREEN).
 *
 * Tests:
 *   1. handleUserOperationEvent increments counter for known sender
 *   2. SETNX idempotency: replaying same event does NOT double-count
 *   3. Returns alreadyCounted: true on replay
 *   4. Fires telegram alert when count crosses 5 (5th increment, not 6th policy call)
 *   5. No-ops when paymaster does not match OUR_PAYMASTER
 *   6. No-ops when sender has no privyUserId mapping
 *
 * Mock strategy:
 *   - ioredis-mock for Redis
 *   - workers/alerts.js mocked — telegram assertions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// ─── Test helpers ─────────────────────────────────────────────────────────────

import { handleUserOperationEvent } from '../src/workers/paymaster-confirmer.js';
import { registerSenderMapping, getPaymasterCount } from '../src/lib/upstash-counter.js';
import * as alertsMod from '../src/workers/alerts.js';

const OUR_PAYMASTER = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const OTHER_PAYMASTER = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const SENDER_1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USER_ID_1 = 'did:privy:confirmer-test-user-1';

function makeEvent(opts: {
  userOpHash: string;
  sender: string;
  paymaster: string;
  success?: boolean;
}) {
  return {
    args: {
      userOpHash: opts.userOpHash,
      sender: opts.sender,
      paymaster: opts.paymaster,
      success: opts.success ?? true,
      actualGasCost: 1000000n,
    },
  };
}

describe('handleUserOperationEvent', () => {
  beforeEach(async () => {
    await redisMock.flushall();
    vi.mocked(alertsMod.sendAlert).mockClear();
    // Set our paymaster address env
    process.env.ALCHEMY_PAYMASTER_ADDRESS = OUR_PAYMASTER;
  });

  it('Test 1: increments counter for known sender on first event', async () => {
    await registerSenderMapping(SENDER_1, USER_ID_1);

    await handleUserOperationEvent(makeEvent({
      userOpHash: '0xhash001',
      sender: SENDER_1,
      paymaster: OUR_PAYMASTER,
    }));

    const count = await getPaymasterCount(USER_ID_1);
    expect(count).toBe(1);
  });

  it('Test 2: SETNX idempotency — replaying same event does NOT double-count', async () => {
    await registerSenderMapping(SENDER_1, USER_ID_1);

    const event = makeEvent({
      userOpHash: '0xhash002',
      sender: SENDER_1,
      paymaster: OUR_PAYMASTER,
    });

    // First call
    await handleUserOperationEvent(event);
    const countAfterFirst = await getPaymasterCount(USER_ID_1);
    expect(countAfterFirst).toBe(1);

    // Replay — should be idempotent
    await handleUserOperationEvent(event);
    const countAfterReplay = await getPaymasterCount(USER_ID_1);
    expect(countAfterReplay).toBe(1);  // still 1, not 2
  });

  it('Test 3: replay returns alreadyCounted behavior (counter unchanged)', async () => {
    await registerSenderMapping(SENDER_1, USER_ID_1);

    // Pre-count manually via INCRBY to start at 2
    await redisMock.set(`paymaster:user:${USER_ID_1}:count`, '2');

    const event = makeEvent({
      userOpHash: '0xhash003-replay',
      sender: SENDER_1,
      paymaster: OUR_PAYMASTER,
    });

    // First call — sets idempotency key, increments to 3
    await handleUserOperationEvent(event);
    const countAfterFirst = await getPaymasterCount(USER_ID_1);
    expect(countAfterFirst).toBe(3);

    // Replay
    await handleUserOperationEvent(event);
    const countAfterReplay = await getPaymasterCount(USER_ID_1);
    expect(countAfterReplay).toBe(3);  // still 3
  });

  it('Test 4: fires telegram alert (user_paymaster_cap_reached) when count crosses 5', async () => {
    await registerSenderMapping(SENDER_1, USER_ID_1);

    // Pre-set counter to 4 (next increment = 5 = cap crossed)
    await redisMock.set(`paymaster:user:${USER_ID_1}:count`, '4');

    await handleUserOperationEvent(makeEvent({
      userOpHash: '0xhash-cap-cross',
      sender: SENDER_1,
      paymaster: OUR_PAYMASTER,
    }));

    const count = await getPaymasterCount(USER_ID_1);
    expect(count).toBe(5);

    // Alert must have been called
    const mockSendAlert = vi.mocked(alertsMod.sendAlert);
    expect(mockSendAlert).toHaveBeenCalledOnce();
    const [event, payload] = mockSendAlert.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe('user_paymaster_cap_reached');
    expect(payload.privyUserId).toBe(USER_ID_1);
    expect(payload.count).toBe(5);
  });

  it('Test 5: no-ops when paymaster does not match OUR_PAYMASTER', async () => {
    await registerSenderMapping(SENDER_1, USER_ID_1);

    await handleUserOperationEvent(makeEvent({
      userOpHash: '0xhash005',
      sender: SENDER_1,
      paymaster: OTHER_PAYMASTER,  // different paymaster
    }));

    const count = await getPaymasterCount(USER_ID_1);
    expect(count).toBe(0);
  });

  it('Test 6: no-ops when sender has no privyUserId mapping', async () => {
    const unknownSender = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    // No registerSenderMapping call for unknownSender

    await handleUserOperationEvent(makeEvent({
      userOpHash: '0xhash006',
      sender: unknownSender,
      paymaster: OUR_PAYMASTER,
    }));

    // No crash, no increment for any user
    const count = await getPaymasterCount(USER_ID_1);
    expect(count).toBe(0);
  });

  it('Test 7: reverted-but-included userOps count toward cap (RESEARCH A9)', async () => {
    await registerSenderMapping(SENDER_1, USER_ID_1);

    // success: false but paymaster matches — must still count (operator paid gas)
    await handleUserOperationEvent(makeEvent({
      userOpHash: '0xhash007-reverted',
      sender: SENDER_1,
      paymaster: OUR_PAYMASTER,
      success: false,  // reverted!
    }));

    const count = await getPaymasterCount(USER_ID_1);
    expect(count).toBe(1);  // counted despite revert
  });
});
