/**
 * ENS Resolver tests — Plan 01-09 Task 1, migrated to the cache-only +
 * background-warm contract (quick-260611-qbg, intentional contract change
 * per D-15: resolveEns no longer awaits the RPC; a cache miss returns null
 * immediately and a deduped background resolve warms the cache).
 *
 * Tests:
 *   1. Cache hit — returns cached name without calling viem (fast path, unchanged)
 *   2. Cache miss — returns null WITHOUT awaiting the RPC (no-await proof),
 *      concurrent calls dedup to ONE RPC, success warms the cache 24h, and a
 *      second call serves the name from L1
 *   3. Cache miss + RPC failure — background caches '::fail::' with 300s TTL;
 *      a follow-up call returns null WITHOUT a new background kick
 *   4. Negative cache sentinel — returns null when cached value is '::null::'
 *   5. Background resolve returns null (no ENS name) — caches '::null::' 24h;
 *      follow-up returns null without a new RPC
 *   6. Cache key uses lowercased address (read + background write)
 *   7. redis.get rejects (quota) — degrades to miss → null + background still
 *      resolves; L1 holds the name for the second call (quick-260610-sr0)
 *   8. redis.set rejects — background L1 write still lands; the resolved name
 *      is served on the second call (quick-260610-sr0)
 *   9. Failure-cooldown sentinel read — cached '::fail::' returns null with
 *      no RPC, no cache write, no background kick
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks (vi.mock is hoisted to top before imports) ─────────────────

const { mockGetEnsName } = vi.hoisted(() => ({
  mockGetEnsName: vi.fn(),
}));

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({ getEnsName: mockGetEnsName })),
  // quick-260611-co5: passthrough — production code wraps transports in fallback()
  fallback: vi.fn((transports: unknown[]) => transports[0]),
  http: vi.fn((url: string) => url),
}));

vi.mock('viem/chains', () => ({
  mainnet: { id: 1, name: 'Ethereum', network: 'homestead' },
}));

// Shared logger instance so tests can assert ens_resolved / ens_resolve_failed
// events emitted from the background worker (quick-260611-qbg).
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

// ── Redis mock ────────────────────────────────────────────────────────────────
// quick-260611-h36: resolveEns caches through the L1-first lib/cache.ts
// helper (which calls getRedis() itself) — so the redis MODULE is mocked and
// the legacy injected-client parameter is ignored. Values stored via the
// helper are JSON-serialized (e.g. '"alice.eth"', '"::null::"', '"::fail::"').

const { mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));
const mockRedis = {
  get: mockRedisGet,
  set: mockRedisSet,
};

vi.mock('../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => mockRedis),
}));

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import {
  resolveEns,
  resolveEnsInBackground,
  _clearInFlightForTesting,
} from '../src/lib/ens-resolver.js';
import { memoryCache } from '../src/lib/memory-cache.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

const ORIGINAL_ENS_RPC = process.env.ENS_MAINNET_RPC_URL;

describe('resolveEns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // quick-260611-h36: clear the in-process L1 so a prior test's cached name
    // can't short-circuit this test's Redis/RPC path.
    memoryCache._clearAllForTesting();
    // quick-260611-qbg: clear the background-resolve dedup Map so a failed
    // test cannot leak an in-flight entry into the next test.
    _clearInFlightForTesting();
    mockRedisSet.mockResolvedValue('OK');
    // quick-260611-p9a: resolveEns early-returns null when
    // ENS_MAINNET_RPC_URL is unset (honest D-07 degrade) — these tests
    // exercise the CONFIGURED cache/RPC path, so set the env per test.
    // The unconfigured path is covered in src/lib/__tests__/ens-resolver.test.ts.
    process.env.ENS_MAINNET_RPC_URL = 'https://eth-mainnet.example/test';
  });

  afterEach(() => {
    if (ORIGINAL_ENS_RPC === undefined) delete process.env.ENS_MAINNET_RPC_URL;
    else process.env.ENS_MAINNET_RPC_URL = ORIGINAL_ENS_RPC;
  });

  it('Test 1: Cache hit — returns cached ENS name without calling viem', async () => {
    // Helper-stored values are JSON-serialized (quick-260611-h36).
    mockRedisGet.mockResolvedValueOnce(JSON.stringify('veda.eth'));

    const result = await resolveEns(
      '0x1234567890abcdef1234567890abcdef12345678',
      mockRedis as never,
    );

    expect(result).toBe('veda.eth');
    expect(mockRedisGet).toHaveBeenCalledWith(
      'ens:0x1234567890abcdef1234567890abcdef12345678',
    );
    expect(mockGetEnsName).not.toHaveBeenCalled();
  });

  it('Test 2: Cache miss — null without awaiting RPC, deduped background resolve warms cache 24h, second call serves name (quick-260611-qbg)', async () => {
    const addr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const;
    mockRedisGet.mockResolvedValueOnce(null);

    // Deferred RPC: provably PENDING while we assert the no-await contract.
    let resolveRpc!: (name: string) => void;
    mockGetEnsName.mockImplementationOnce(
      () => new Promise((res) => { resolveRpc = res; }),
    );

    // (A) No-await: cache miss resolves null immediately while RPC is pending.
    const result = await resolveEns(addr, mockRedis as never);
    expect(result).toBeNull();
    expect(mockGetEnsName).toHaveBeenCalledTimes(1); // kicked synchronously
    expect(mockRedisSet).not.toHaveBeenCalled(); // nothing cached yet — RPC still pending

    // (B) Dedup: joining while in-flight does NOT invoke getEnsName again,
    // and returns the SAME promise instance.
    const bg = resolveEnsInBackground(addr);
    expect(mockGetEnsName).toHaveBeenCalledTimes(1);
    expect(resolveEnsInBackground(addr)).toBe(bg);

    // (C) Success warm (D-13): settle the RPC, await background completion.
    resolveRpc('alice.eth');
    await bg;

    expect(mockRedisSet).toHaveBeenCalledWith(
      'ens:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      JSON.stringify('alice.eth'),
      'EX',
      86400,
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ens_resolved', name: 'alice.eth' }),
      expect.any(String),
    );

    // Second call serves the warmed name (from L1 — no further RPC).
    const second = await resolveEns(addr, mockRedis as never);
    expect(second).toBe('alice.eth');
    expect(mockGetEnsName).toHaveBeenCalledTimes(1);
  });

  it('Test 3: RPC failure — caches ::fail:: cooldown sentinel (300s); follow-up returns null with NO new background kick (quick-260611-qbg)', async () => {
    // INTENTIONAL CONTRACT CHANGE (D-15): the old contract asserted "does NOT
    // cache" on failure. The new contract INVERTS that — failure caches the
    // '::fail::' sentinel with a 300s TTL so a dead/throttled endpoint is
    // retried in minutes, never hammered per-request (Alchemy CU protection).
    const addr = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as const;
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockRejectedValueOnce(new Error('RPC connection refused'));

    const result = await resolveEns(addr, mockRedis as never);
    expect(result).toBeNull();

    // Await the background failure path deterministically (no sleeps).
    await vi.waitFor(() => {
      expect(mockRedisSet).toHaveBeenCalledWith(
        'ens:0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        JSON.stringify('::fail::'),
        'EX',
        300,
      );
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ens_resolve_failed' }),
      expect.stringContaining('::fail::'),
    );

    // Cooldown read: '::fail::' hit (from L1) is null WITHOUT a new RPC kick.
    const second = await resolveEns(addr, mockRedis as never);
    expect(second).toBeNull();
    expect(mockGetEnsName).toHaveBeenCalledTimes(1);
  });

  it('Test 4: Negative cache sentinel — returns null for "::null::"', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify('::null::'));

    const result = await resolveEns(
      '0x1111111111111111111111111111111111111111',
      mockRedis as never,
    );

    expect(result).toBeNull();
    expect(mockGetEnsName).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it('Test 5: background resolve returns null (no ENS name) — caches ::null:: 24h; follow-up is null without a new RPC (quick-260611-qbg)', async () => {
    const addr = '0x2222222222222222222222222222222222222222' as const;
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockResolvedValueOnce(null);

    // New contract (D-15): first call is null (cache-only request path) —
    // the no-name result lands in the cache via the background worker.
    const result = await resolveEns(addr, mockRedis as never);
    expect(result).toBeNull();

    await vi.waitFor(() => {
      expect(mockRedisSet).toHaveBeenCalledWith(
        'ens:0x2222222222222222222222222222222222222222',
        JSON.stringify('::null::'),
        'EX',
        86400,
      );
    });

    // '::null::' now in L1 — second call is null with no further RPC.
    const second = await resolveEns(addr, mockRedis as never);
    expect(second).toBeNull();
    expect(mockGetEnsName).toHaveBeenCalledTimes(1);
  });

  it('Test 6: Cache key uses lowercased address', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockResolvedValueOnce(null);

    await resolveEns(
      '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
      mockRedis as never,
    );

    // Cache key must use lowercase address (read path).
    expect(mockRedisGet).toHaveBeenCalledWith(
      'ens:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );

    // Await background settlement before exiting the test (quick-260611-qbg)
    // and assert the WRITE key is lowercased too.
    await vi.waitFor(() => {
      expect(mockRedisSet).toHaveBeenCalledWith(
        'ens:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        JSON.stringify('::null::'),
        'EX',
        86400,
      );
    });
  });

  it('Test 7: redis.get rejects (quota) — miss → null + background still resolves; L1 serves the name on the second call (quick-260610-sr0)', async () => {
    const addr = '0x3333333333333333333333333333333333333333' as const;
    mockRedisGet.mockRejectedValueOnce(new Error('ERR max requests limit exceeded'));
    mockGetEnsName.mockResolvedValueOnce('bob.eth');

    // Quota rejection on cache read is a cache miss → null + background kick
    // (new contract per D-15: the request never awaits the RPC).
    const result = await resolveEns(addr, mockRedis as never);
    expect(result).toBeNull();
    expect(mockGetEnsName).toHaveBeenCalledTimes(1);

    // Background resolve completes and the L1 write lands.
    await vi.waitFor(() => {
      expect(mockRedisSet).toHaveBeenCalledWith(
        'ens:0x3333333333333333333333333333333333333333',
        JSON.stringify('bob.eth'),
        'EX',
        86400,
      );
    });

    // L1 holds the name — second call serves it without another RPC.
    const second = await resolveEns(addr, mockRedis as never);
    expect(second).toBe('bob.eth');
    expect(mockGetEnsName).toHaveBeenCalledTimes(1);
  });

  it('Test 8: redis.set rejects — background L1 write still lands; resolved name is NOT discarded (quick-260610-sr0)', async () => {
    const addr = '0x4444444444444444444444444444444444444444' as const;
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockResolvedValueOnce('carol.eth');
    mockRedisSet.mockRejectedValueOnce(new Error('ERR max requests limit exceeded'));

    // New contract (D-15): first call null; the background worker resolves
    // and setCached writes L1 FIRST — the Redis rejection is best-effort and
    // must NOT discard the successfully resolved name.
    const result = await resolveEns(addr, mockRedis as never);
    expect(result).toBeNull();

    await vi.waitFor(() => {
      expect(mockRedisSet).toHaveBeenCalledTimes(1);
    });

    // L1 holds 'carol.eth' despite the Redis write failure.
    const second = await resolveEns(addr, mockRedis as never);
    expect(second).toBe('carol.eth');
    expect(mockGetEnsName).toHaveBeenCalledTimes(1);
  });

  it('Test 9: cooldown sentinel read — cached "::fail::" returns null with no RPC, no cache write, no background kick (quick-260611-qbg)', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify('::fail::'));

    const result = await resolveEns(
      '0x5555555555555555555555555555555555555555',
      mockRedis as never,
    );

    expect(result).toBeNull();
    expect(mockGetEnsName).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});
