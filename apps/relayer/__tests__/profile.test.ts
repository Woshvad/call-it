/**
 * Profile route tests — Plan 01-09 Task 1
 *
 * Tests:
 *   1. ENS resolved — returns { handle: 'veda.eth', source: 'ens' }
 *   2. No ENS, all empty — returns truncated 0x address, source: truncated
 *   3. AUTH-35: displayHandle override takes highest priority over ENS
 *   4. Invalid address format returns 400
 *   5. Response includes profile counts from ProfileRegistry
 *   6. Response includes x-source header
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockResolveEns } = vi.hoisted(() => ({
  mockResolveEns: vi.fn(),
}));

const { mockReadContract } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
}));

const { mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

// Mock ens-resolver
vi.mock('../src/lib/ens-resolver.js', () => ({
  resolveEns: mockResolveEns,
}));

// Mock viem (for ProfileRegistry reads)
vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
  // quick-260611-co5: passthrough — production code wraps transports in fallback()
  fallback: vi.fn((transports: unknown[]) => transports[0]),
  http: vi.fn((url: string) => url),
  isAddress: vi.fn((addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr)),
}));

vi.mock('viem/chains', () => ({
  arbitrumSepolia: { id: 421614, name: 'Arbitrum Sepolia' },
}));

// Mock redis
vi.mock('../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
  })),
}));

// Mock logger
vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import { profileRoute } from '../src/routes/profile.js';
import { memoryCache } from '../src/lib/memory-cache.js';

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/profile/:address', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // quick-260611-h36: clear the in-process L1 (lib/cache.ts is L1-first) so a
    // prior test's cached profile can't short-circuit this test.
    memoryCache._clearAllForTesting();
    mockRedisGet.mockResolvedValue(null); // No cache by default
    mockRedisSet.mockResolvedValue('OK');

    // Default: no display handle, no settled calls
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'displayHandle': return Promise.resolve('');
        case 'settledCalls': return Promise.resolve(BigInt(0));
        default: return Promise.resolve(null);
      }
    });

    app = Fastify({ logger: false });
    await app.register(profileRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('Test 1: ENS resolved — handle from ENS, source: ens', async () => {
    mockResolveEns.mockResolvedValueOnce('veda.eth');

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ handle: string; source: string; ensName: string }>();
    expect(body.handle).toBe('veda.eth');
    expect(body.source).toBe('ens');
    expect(body.ensName).toBe('veda.eth');
  });

  it('Test 2: No ENS, all empty — truncated address, source: truncated', async () => {
    mockResolveEns.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ handle: string; source: string }>();
    expect(body.source).toBe('truncated');
    // Truncated format: 0x1234...5678
    expect(body.handle).toMatch(/^0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}$/);
    // AUTH-44: truncated form is NOT the raw full address
    expect(body.handle).not.toBe(TEST_ADDRESS);
  });

  it('Test 3: AUTH-35 — displayHandle override takes highest priority over ENS', async () => {
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'displayHandle': return Promise.resolve('mycustomhandle');
        case 'settledCalls': return Promise.resolve(BigInt(5));
        default: return Promise.resolve(null);
      }
    });
    mockResolveEns.mockResolvedValueOnce('veda.eth'); // ENS also resolves but loses

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ handle: string; source: string; displayHandle: string }>();
    expect(body.handle).toBe('mycustomhandle');
    expect(body.source).toBe('display_handle');
    expect(body.displayHandle).toBe('mycustomhandle');
  });

  it('Test 4: Invalid address format returns 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/profile/not-an-address',
    });

    expect(response.statusCode).toBe(400);
  });

  it('Test 5: Response includes profile counts from ProfileRegistry', async () => {
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'displayHandle': return Promise.resolve('');
        case 'settledCalls': return Promise.resolve(BigInt(5));
        default: return Promise.resolve(null);
      }
    });
    mockResolveEns.mockResolvedValueOnce('veda.eth');

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      address: string;
      settledCalls: number;
      globalRep: number;
    }>();
    expect(body.address).toBe(TEST_ADDRESS);
    expect(body.settledCalls).toBe(5);
    expect(body.globalRep).toBe(100); // REP-01 initial value
  });

  it('Test 6: Response includes x-source header', async () => {
    mockResolveEns.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });

    expect(response.headers['x-source']).toBeDefined();
  });

  it('Test 7: Cache hit — returns cached profile without calling resolveEns', async () => {
    const cachedBody = JSON.stringify({
      address: TEST_ADDRESS,
      handle: 'cached.eth',
      source: 'ens',
      displayHandle: '',
      ensName: 'cached.eth',
      twitterHandle: null,
      farcasterHandle: null,
      totalCalls: 3,
      settledCalls: 2,
      wins: 1,
      losses: 1,
      streak: 0,
      globalRep: 100,
      verifiedX: false,
      verifiedFc: false,
    });
    mockRedisGet.mockResolvedValueOnce(cachedBody);

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ handle: string }>();
    expect(body.handle).toBe('cached.eth');
    expect(mockResolveEns).not.toHaveBeenCalled();
  });
});
