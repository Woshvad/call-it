/**
 * ENS Resolver tests — Plan 01-09 Task 1
 *
 * Tests:
 *   1. Cache hit — returns cached name without calling viem
 *   2. Cache miss + RPC success — calls viem, caches result, returns name
 *   3. Cache miss + RPC failure — returns null, does NOT cache (retry on next request)
 *   4. Negative cache sentinel — returns null when cached value is '::null::'
 *   5. Cache miss + viem returns null (no ENS name) — caches '::null::' sentinel
 *   6. Cache key uses lowercased address
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// ── Redis mock ────────────────────────────────────────────────────────────────
// quick-260611-h36: resolveEns now caches through the L1-first lib/cache.ts
// helper (which calls getRedis() itself) — so the redis MODULE is mocked and
// the legacy injected-client parameter is ignored. Values stored via the
// helper are JSON-serialized (e.g. '"alice.eth"', '"::null::"').

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

import { resolveEns } from '../src/lib/ens-resolver.js';
import { memoryCache } from '../src/lib/memory-cache.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveEns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // quick-260611-h36: clear the in-process L1 so a prior test's cached name
    // can't short-circuit this test's Redis/RPC path.
    memoryCache._clearAllForTesting();
    mockRedisSet.mockResolvedValue('OK');
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

  it('Test 2: Cache miss + RPC success — calls viem, caches 24h, returns name', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockResolvedValueOnce('alice.eth');

    const result = await resolveEns(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      mockRedis as never,
    );

    expect(result).toBe('alice.eth');
    expect(mockRedisSet).toHaveBeenCalledWith(
      'ens:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      JSON.stringify('alice.eth'),
      'EX',
      86400,
    );
  });

  it('Test 3: Cache miss + RPC failure — returns null, does NOT cache', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockRejectedValueOnce(new Error('RPC connection refused'));

    const result = await resolveEns(
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      mockRedis as never,
    );

    expect(result).toBeNull();
    expect(mockRedisSet).not.toHaveBeenCalled();
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

  it('Test 5: viem returns null (no ENS name) — caches ::null:: sentinel', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockResolvedValueOnce(null);

    const result = await resolveEns(
      '0x2222222222222222222222222222222222222222',
      mockRedis as never,
    );

    expect(result).toBeNull();
    expect(mockRedisSet).toHaveBeenCalledWith(
      'ens:0x2222222222222222222222222222222222222222',
      JSON.stringify('::null::'),
      'EX',
      86400,
    );
  });

  it('Test 6: Cache key uses lowercased address', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockResolvedValueOnce(null);

    await resolveEns(
      '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
      mockRedis as never,
    );

    // Cache key must use lowercase address
    expect(mockRedisGet).toHaveBeenCalledWith(
      'ens:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
  });

  it('Test 7: redis.get rejects (quota) — degrades to cache miss, still returns resolved name (quick-260610-sr0)', async () => {
    mockRedisGet.mockRejectedValueOnce(new Error('ERR max requests limit exceeded'));
    mockGetEnsName.mockResolvedValueOnce('bob.eth');

    const result = await resolveEns(
      '0x3333333333333333333333333333333333333333',
      mockRedis as never,
    );

    // Quota rejection on cache read is a cache miss, not a failure
    expect(result).toBe('bob.eth');
    expect(mockGetEnsName).toHaveBeenCalledTimes(1);
  });

  it('Test 8: redis.set rejects — cache-write failure does NOT discard the resolved name (quick-260610-sr0)', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetEnsName.mockResolvedValueOnce('carol.eth');
    mockRedisSet.mockRejectedValueOnce(new Error('ERR max requests limit exceeded'));

    const result = await resolveEns(
      '0x4444444444444444444444444444444444444444',
      mockRedis as never,
    );

    // Previously this fell into the outer catch and returned null even though
    // the RPC resolution SUCCEEDED — the Task 1 fix guards the write separately
    expect(result).toBe('carol.eth');
  });
});
