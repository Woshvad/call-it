/**
 * settlement-poller worker tests (quick-260611-h36 Task 4 — TDD RED).
 *
 * Driven via handle.tick() directly — no real timers. External modules
 * (pyth-adapter, subgraph-client, alerts, hermes) are fully mocked;
 * publicClient/walletClient are plain objects with vi.fn()s.
 *
 *   1. Frontier discovery: ascending getCall, stops at the zeroed tuple,
 *      never re-probes already-known ids.
 *   2. Pyth settle dispatch: expired Live Pyth call → settlePythCall once with
 *      the breaker-routed acceptedChallengeIds.
 *   3. Non-Pyth skip: structured skip log at most once per call, never settles.
 *   4. IDLE dry-run: no walletClient → would-settle logs, zero fetch/settle,
 *      single P1 startup alert.
 *   5. Attempt cap: 30th failed attempt → settle_failed P0 exactly once +
 *      10-min backoff (no immediate retry).
 *   6. Subgraph failure fallback: queryAcceptedChallengeIds rejects → settle
 *      proceeds with [] + warn.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockFetchAndVerify,
  mockSettlePythCall,
  mockQueryAcceptedChallengeIds,
  mockSendAlertSafe,
  logEvents,
} = vi.hoisted(() => ({
  mockFetchAndVerify: vi.fn(),
  mockSettlePythCall: vi.fn(),
  mockQueryAcceptedChallengeIds: vi.fn(),
  mockSendAlertSafe: vi.fn().mockResolvedValue(undefined),
  logEvents: [] as Array<{ level: string; obj: Record<string, unknown> }>,
}));

vi.mock('../oracle-adapters/pyth-adapter.js', () => ({
  PythAdapter: vi.fn().mockImplementation(() => ({ fetchAndVerify: mockFetchAndVerify })),
  PythAdapterStatus: {
    Success: 'Success',
    SettlementDelayed: 'SettlementDelayed',
    DisputeWindowOpened: 'DisputeWindowOpened',
  },
  settlePythCall: mockSettlePythCall,
}));

vi.mock('@pythnetwork/hermes-client', () => ({
  HermesClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../lib/subgraph-client.js', () => ({
  queryAcceptedChallengeIds: mockQueryAcceptedChallengeIds,
}));

vi.mock('../alerts.js', () => ({
  sendAlertSafe: mockSendAlertSafe,
}));

vi.mock('../../lib/logger.js', () => {
  const push = (level: string) => (obj: Record<string, unknown>) => {
    logEvents.push({ level, obj });
  };
  const fake = { info: push('info'), warn: push('warn'), error: push('error') };
  return { getLogger: () => fake, logger: fake };
});

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import { startSettlementPoller, type SettlementPollerHandle } from '../settlement-poller.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const CALLER = '0xaaaa000000000000000000000000000000000001';

const ZEROED_CALL = {
  caller: ZERO_ADDRESS,
  stake: 0n,
  virtualFadeSeed: 0n,
  createdAt: 0n,
  expiry: 0n,
  marketType: 0,
  eventSubtype: 0,
  category: 0,
  status: 0,
  conviction: 0,
  openToChallenges: false,
  callerExitedAt: 0n,
  outcome: 0,
  duplicateHash: `0x${'0'.repeat(64)}`,
  criteriaHash: `0x${'0'.repeat(64)}`,
  assetA: 0n,
  assetB: 0n,
  targetValue: 0n,
  parentCallId: 0n,
};

function makeCall(overrides: Partial<typeof ZEROED_CALL> = {}) {
  return {
    ...ZEROED_CALL,
    caller: CALLER,
    stake: 5_000_000n,
    createdAt: 1n,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400), // future by default
    conviction: 70,
    ...overrides,
  };
}

/** ETH/USD feed id as uint256 (matches priceId derivation in the watcher). */
const ETH_FEED = BigInt('0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace');
const ETH_PRICE_ID = ETH_FEED.toString(16).padStart(64, '0');

function countEvents(event: string): number {
  return logEvents.filter((e) => e.obj['event'] === event).length;
}

// ── Test harness ──────────────────────────────────────────────────────────────

describe('settlement-poller', () => {
  let calls: Map<string, ReturnType<typeof makeCall>>;
  let adapterType: number;
  let mockReadContract: ReturnType<typeof vi.fn>;
  let publicClient: { readContract: ReturnType<typeof vi.fn> };
  let walletClient: { writeContract: ReturnType<typeof vi.fn> };
  let handle: SettlementPollerHandle | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    logEvents.length = 0;
    calls = new Map();
    adapterType = 0;

    mockReadContract = vi.fn(async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
      if (functionName === 'getCall') {
        const id = (args[0] as bigint).toString();
        return calls.get(id) ?? ZEROED_CALL;
      }
      if (functionName === 'adapterMap') {
        return adapterType;
      }
      throw new Error(`unexpected readContract: ${functionName}`);
    });
    publicClient = { readContract: mockReadContract };
    walletClient = { writeContract: vi.fn() };

    mockQueryAcceptedChallengeIds.mockResolvedValue([]);
    mockFetchAndVerify.mockResolvedValue({ status: 'Success', updateData: ['0xdead'] });
    mockSettlePythCall.mockResolvedValue('0xtxhash');
  });

  afterEach(() => {
    handle?.stop();
    handle = undefined;
  });

  function start(withSigner = true): SettlementPollerHandle {
    handle = startSettlementPoller({
      publicClient: publicClient as never,
      ...(withSigner ? { walletClient: walletClient as never } : {}),
      intervalMs: 3_600_000, // never fires during the test — tick() driven
    });
    return handle;
  }

  it('Test 1: frontier discovery — stops at the zeroed tuple, no re-probe of known ids', async () => {
    calls.set('1', makeCall());
    calls.set('2', makeCall());
    calls.set('3', makeCall());

    const h = start();
    await h.tick();

    // Exactly 4 getCall probes (ids 1..4; id 4 returns the zeroed tuple).
    const getCallArgs = mockReadContract.mock.calls
      .filter(([p]) => (p as { functionName: string }).functionName === 'getCall')
      .map(([p]) => ((p as { args: unknown[] }).args[0] as bigint).toString());
    expect(getCallArgs).toEqual(['1', '2', '3', '4']);
    expect(h.getStats().known).toBe(3);
    expect(h.getStats().frontier).toBe('4');

    // Next tick: ids 1..3 are NOT re-probed for discovery (only the frontier id 4).
    await h.tick();
    const getCallArgs2 = mockReadContract.mock.calls
      .filter(([p]) => (p as { functionName: string }).functionName === 'getCall')
      .map(([p]) => ((p as { args: unknown[] }).args[0] as bigint).toString());
    expect(getCallArgs2.filter((a) => a === '1')).toHaveLength(1);
    expect(getCallArgs2.filter((a) => a === '2')).toHaveLength(1);
    expect(getCallArgs2.filter((a) => a === '3')).toHaveLength(1);
    expect(h.getStats().frontier).toBe('4');
  });

  it('Test 2: expired Live Pyth call → settlePythCall dispatched once with challenge ids', async () => {
    const expired = BigInt(Math.floor(Date.now() / 1000) - 3600);
    calls.set('1', makeCall({ expiry: expired, assetA: ETH_FEED }));
    mockQueryAcceptedChallengeIds.mockResolvedValue([7n]);

    const h = start();
    await h.tick();

    expect(mockFetchAndVerify).toHaveBeenCalledTimes(1);
    expect(mockFetchAndVerify).toHaveBeenCalledWith({ priceId: ETH_PRICE_ID, callId: 1n });
    expect(mockSettlePythCall).toHaveBeenCalledTimes(1);
    expect(mockSettlePythCall).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 1n,
        updateData: ['0xdead'],
        acceptedChallengeIds: [7n],
        walletClient,
        publicClient,
      }),
    );
    // settlementManagerAddress is wired through (default Sepolia constant).
    const params = mockSettlePythCall.mock.calls[0]![0] as { settlementManagerAddress: string };
    expect(params.settlementManagerAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // Settled → terminal: a second tick must NOT settle again.
    await h.tick();
    expect(mockSettlePythCall).toHaveBeenCalledTimes(1);
  });

  it('Test 3: non-Pyth adapter → skip logged at most once across ticks, never settles', async () => {
    const expired = BigInt(Math.floor(Date.now() / 1000) - 3600);
    calls.set('1', makeCall({ expiry: expired }));
    adapterType = 2; // DefiLlama

    const h = start();
    await h.tick();
    await h.tick();

    expect(mockSettlePythCall).not.toHaveBeenCalled();
    expect(mockFetchAndVerify).not.toHaveBeenCalled();
    expect(countEvents('settlement_poller_skip_non_pyth')).toBe(1);
    expect(mockSendAlertSafe).not.toHaveBeenCalled();
  });

  it('Test 4: IDLE mode (no walletClient) — dry-run logs, zero fetch/settle, single P1 alert', async () => {
    const expired = BigInt(Math.floor(Date.now() / 1000) - 3600);
    calls.set('1', makeCall({ expiry: expired, assetA: ETH_FEED }));
    calls.set('2', makeCall({ expiry: expired, assetA: ETH_FEED }));

    const h = start(false);

    // Single P1 startup alert (infra payload pattern — AlertEvent union untouched).
    expect(mockSendAlertSafe).toHaveBeenCalledTimes(1);
    expect(mockSendAlertSafe).toHaveBeenCalledWith(
      'tvl_approach',
      expect.objectContaining({ category: 'infra', subsystem: 'settlement-poller' }),
    );

    await h.tick();
    await h.tick();

    expect(countEvents('settlement_poller_would_settle')).toBeGreaterThanOrEqual(2);
    expect(mockFetchAndVerify).not.toHaveBeenCalled();
    expect(mockSettlePythCall).not.toHaveBeenCalled();
    // No additional alerts beyond the single startup P1.
    expect(mockSendAlertSafe).toHaveBeenCalledTimes(1);
  });

  it('Test 5: 30 failed attempts → settle_failed P0 exactly once + 10-min backoff', async () => {
    const expired = BigInt(Math.floor(Date.now() / 1000) - 3600);
    calls.set('1', makeCall({ expiry: expired, assetA: ETH_FEED }));
    mockFetchAndVerify.mockResolvedValue({ status: 'SettlementDelayed', reason: 'wide' });

    const h = start();
    for (let i = 0; i < 30; i++) {
      await h.tick();
    }

    expect(mockFetchAndVerify).toHaveBeenCalledTimes(30);
    const settleFailedCalls = mockSendAlertSafe.mock.calls.filter(([event]) => event === 'settle_failed');
    expect(settleFailedCalls).toHaveLength(1);
    expect(settleFailedCalls[0]![1]).toEqual(
      expect.objectContaining({ callId: '1', reason: 'poller_max_attempts', attempts: 30 }),
    );

    // In backoff — the next immediate tick must NOT retry.
    await h.tick();
    expect(mockFetchAndVerify).toHaveBeenCalledTimes(30);
    expect(mockSendAlertSafe.mock.calls.filter(([event]) => event === 'settle_failed')).toHaveLength(1);
  });

  it('Test 6: queryAcceptedChallengeIds rejects → settle proceeds with [] + warn', async () => {
    const expired = BigInt(Math.floor(Date.now() / 1000) - 3600);
    calls.set('1', makeCall({ expiry: expired, assetA: ETH_FEED }));
    mockQueryAcceptedChallengeIds.mockRejectedValue(new Error('subgraph circuit open'));

    const h = start();
    await h.tick();

    expect(mockSettlePythCall).toHaveBeenCalledTimes(1);
    expect(mockSettlePythCall).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 1n, acceptedChallengeIds: [] }),
    );
    expect(countEvents('settlement_poller_challenge_ids_failed')).toBe(1);
  });
});
