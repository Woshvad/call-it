/**
 * Profile route — RC4 closure tests (quick-260611-5mh Task 2).
 *
 * Tests:
 *   1. CHECKSUMMED address accepted (lowercased before validation) — no 400
 *   2. Real subgraph stats passthrough (globalRep/totalCalls/settledCalls/wins/losses)
 *   3. Subgraph stats failure → previous hardcoded defaults (never 500)
 *   4. calls history array shape (id/status/outcome/stake/createdAt/statement)
 *   5. Socials resolution untouched (handle '@woshvad', source twitter, verifiedX)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockResolveEns } = vi.hoisted(() => ({ mockResolveEns: vi.fn() }));
const { mockReadContract } = vi.hoisted(() => ({ mockReadContract: vi.fn() }));
const { mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));
const { mockQueryProfileSocials, mockQueryProfileStats, mockQueryProfileCalls } = vi.hoisted(() => ({
  mockQueryProfileSocials: vi.fn(),
  mockQueryProfileStats: vi.fn(),
  mockQueryProfileCalls: vi.fn(),
}));

vi.mock('../src/lib/ens-resolver.js', () => ({ resolveEns: mockResolveEns }));

// Real viem isAddress semantics matter here (strict EIP-55 checksum check on
// mixed-case input is exactly the live RC4a bug) — mock everything EXCEPT
// isAddress, which we mirror: mixed-case input must checksum-verify, while
// all-lowercase passes on format alone. The route lowercases BEFORE validation,
// so only the lowercase path should ever reach isAddress.
vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
  // quick-260611-co5: passthrough — production code wraps transports in fallback()
  fallback: vi.fn((transports: unknown[]) => transports[0]),
  http: vi.fn((url: string) => url),
  // Mirrors strict viem semantics for this suite: any mixed-case input fails
  // (the live checksummed repro address has a non-verifying EIP-55 checksum),
  // all-lowercase passes on format alone. The fixed route lowercases BEFORE
  // validation, so mixed case must never reach isAddress.
  isAddress: vi.fn((addr: string) => addr === addr.toLowerCase() && /^0x[0-9a-f]{40}$/.test(addr)),
}));

vi.mock('viem/chains', () => ({
  arbitrumSepolia: { id: 421614, name: 'Arbitrum Sepolia' },
}));

vi.mock('../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({ get: mockRedisGet, set: mockRedisSet })),
}));

vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock('../src/lib/subgraph-client.js', () => ({
  queryProfileSocials: mockQueryProfileSocials,
  queryProfileStats: mockQueryProfileStats,
  queryProfileCalls: mockQueryProfileCalls,
}));

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import { profileRoute } from '../src/routes/profile.js';
import { memoryCache } from '../src/lib/memory-cache.js';

// ── Constants — live-verified truths (2026-06-11) ─────────────────────────────

/** Live repro: this CHECKSUMMED address 400'd before the fix. */
const CHECKSUMMED_ADDRESS = '0x7304A289Aa8d5a4DB23eb78c143E9aA376415CeD';
/** Subgraph truth: globalRep 98, totalCalls 2, settledCalls 2, wins 2. */
const STATS_ADDRESS = '0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5';
/** Twitter identity chain works for this address (handle @woshvad). */
const SOCIAL_ADDRESS = '0x8c311b8ce783034e501930b71958f1374ea8598b';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/profile/:address — RC4 (stats + checksummed + calls history)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // quick-260611-h36: clear the in-process L1 (lib/cache.ts is L1-first) so a
    // prior test's cached profile can't short-circuit this test.
    memoryCache._clearAllForTesting();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockResolveEns.mockResolvedValue(null);
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'displayHandle': return Promise.resolve('');
        case 'settledCalls': return Promise.resolve(BigInt(0));
        default: return Promise.resolve(null);
      }
    });
    mockQueryProfileSocials.mockResolvedValue({ twitterHandle: null, farcasterHandle: null });
    mockQueryProfileStats.mockResolvedValue(null);
    mockQueryProfileCalls.mockResolvedValue([]);

    app = Fastify({ logger: false });
    await app.register(profileRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('Test 1: CHECKSUMMED address returns 200 (lowercased before validation)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${CHECKSUMMED_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ address: string }>();
    // All downstream use takes the lowercased form
    expect(body.address).toBe(CHECKSUMMED_ADDRESS.toLowerCase());
    // Subgraph legs received the lowercased address
    expect(mockQueryProfileStats).toHaveBeenCalledWith(CHECKSUMMED_ADDRESS.toLowerCase());
  });

  it('Test 1b: all-lowercase input behavior unchanged (200, same address echo)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${STATS_ADDRESS}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ address: string }>().address).toBe(STATS_ADDRESS);
  });

  it('Test 1c: invalid address still 400', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/profile/not-an-address' });
    expect(response.statusCode).toBe(400);
  });

  it('Test 2: REAL subgraph stats passthrough (known-good truth)', async () => {
    mockQueryProfileStats.mockResolvedValueOnce({
      globalRep: 98,
      totalCalls: 2,
      settledCalls: 2,
      wins: 2,
      losses: 0,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${STATS_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      globalRep: number; totalCalls: number; settledCalls: number; wins: number; losses: number;
    }>();
    expect(body.globalRep).toBe(98);
    expect(body.totalCalls).toBe(2);
    expect(body.settledCalls).toBe(2);
    expect(body.wins).toBe(2);
    expect(body.losses).toBe(0);
  });

  it('Test 3: subgraph stats failure → previous hardcoded defaults (never 500)', async () => {
    mockQueryProfileStats.mockRejectedValueOnce(new Error('subgraph down'));
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'displayHandle': return Promise.resolve('');
        case 'settledCalls': return Promise.resolve(BigInt(5));
        default: return Promise.resolve(null);
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${STATS_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      globalRep: number; totalCalls: number; wins: number; losses: number; settledCalls: number;
    }>();
    expect(body.globalRep).toBe(100); // REP-01 fallback
    expect(body.totalCalls).toBe(0);
    expect(body.wins).toBe(0);
    expect(body.losses).toBe(0);
    // settledCalls falls back to the on-chain ProfileRegistry read
    expect(body.settledCalls).toBe(5);
  });

  it('Test 4: calls history array shape (subgraph rows passthrough)', async () => {
    mockQueryProfileCalls.mockResolvedValueOnce([
      {
        id: '14',
        marketType: 0,
        asset: '',
        stake: '5000000',
        expiry: '1780931059',
        conviction: 50,
        status: 'Settled',
        createdAt: '1780000000',
        outcome: 'CallerLost',
        statement: 'Price target call #14',
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${STATS_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ calls: Array<Record<string, unknown>> }>();
    expect(Array.isArray(body.calls)).toBe(true);
    expect(body.calls).toHaveLength(1);
    expect(body.calls[0]).toMatchObject({
      id: '14',
      status: 'Settled',
      outcome: 'CallerLost',
      stake: '5000000',
      createdAt: '1780000000',
      statement: 'Price target call #14',
    });
    expect(mockQueryProfileCalls).toHaveBeenCalledWith(STATS_ADDRESS, 0, 20);
  });

  it('Test 4b: calls history failure degrades to [] (D-07, never 500)', async () => {
    mockQueryProfileCalls.mockRejectedValueOnce(new Error('subgraph down'));

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${STATS_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ calls: unknown[] }>().calls).toEqual([]);
  });

  it('Test 5: socials resolution untouched — handle @woshvad, source twitter, verifiedX', async () => {
    mockQueryProfileSocials.mockResolvedValueOnce({ twitterHandle: 'woshvad', farcasterHandle: null });

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${SOCIAL_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      handle: string; source: string; verifiedX: boolean; verifiedFc: boolean; twitterHandle: string;
    }>();
    expect(body.handle).toBe('@woshvad');
    expect(body.source).toBe('twitter');
    expect(body.verifiedX).toBe(true);
    expect(body.verifiedFc).toBe(false);
    expect(body.twitterHandle).toBe('woshvad');
  });
});
