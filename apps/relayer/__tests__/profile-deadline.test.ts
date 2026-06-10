/**
 * Profile route deadline regression tests — quick-260610-sr0.
 *
 * Proves GET /api/profile/:address is hang-proof:
 *   A. A single hung leg (displayHandle never settles) → per-leg timeout fires,
 *      route responds fast with the NORMAL degraded chain (200, source
 *      'truncated', NO x-degraded header).
 *   B. EVERY upstream hangs forever → route deadline fires, route responds
 *      200 with the deadline-degraded body (x-degraded: deadline, identical
 *      ProfileResponseBody shape, degraded body never cached).
 *
 * Lives in its own file (not profile.test.ts) because the existing suite
 * deliberately does NOT mock subgraph-client and its mock topology must not
 * change. Uses real timers with low env-configured timeouts — fake timers are
 * fragile across fastify inject + Promise.allSettled.
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

const { mockQueryProfileSocials } = vi.hoisted(() => ({
  mockQueryProfileSocials: vi.fn(),
}));

// Mock ens-resolver
vi.mock('../src/lib/ens-resolver.js', () => ({
  resolveEns: mockResolveEns,
}));

// Mock viem (for ProfileRegistry reads)
vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
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

// Mock subgraph-client (NOT mocked in profile.test.ts — that suite relies on
// the real queryProfileSocials fast-throwing on missing SUBGRAPH_STUDIO_URL)
vi.mock('../src/lib/subgraph-client.js', () => ({
  queryProfileSocials: mockQueryProfileSocials,
}));

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import { profileRoute } from '../src/routes/profile.js';

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_ADDRESS = '0x0000000000000000000000000000000000000001';

const EXPECTED_BODY_KEYS = [
  'address',
  'handle',
  'source',
  'displayHandle',
  'ensName',
  'twitterHandle',
  'farcasterHandle',
  'totalCalls',
  'settledCalls',
  'wins',
  'losses',
  'streak',
  'globalRep',
  'verifiedX',
  'verifiedFc',
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/profile/:address — deadline regression (quick-260610-sr0)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null); // no cache by default
    mockRedisSet.mockResolvedValue('OK');
    mockQueryProfileSocials.mockResolvedValue({ twitterHandle: null, farcasterHandle: null });

    app = Fastify({ logger: false });
    await app.register(profileRoute);
    await app.ready();
  });

  afterEach(async () => {
    delete process.env.PROFILE_LEG_TIMEOUT_MS;
    delete process.env.PROFILE_DEADLINE_MS;
    await app.close();
  });

  it('Test A: per-leg timeout bounds a hung dependency — fast 200 truncated, no x-degraded', async () => {
    process.env.PROFILE_LEG_TIMEOUT_MS = '120';
    process.env.PROFILE_DEADLINE_MS = '8000';

    mockResolveEns.mockResolvedValue(null);
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'displayHandle': return new Promise(() => {}); // hangs forever
        case 'settledCalls': return Promise.resolve(BigInt(0));
        default: return Promise.resolve(null);
      }
    });

    const started = Date.now();
    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });
    const elapsed = Date.now() - started;

    expect(response.statusCode).toBe(200);
    const body = response.json<{ source: string }>();
    expect(body.source).toBe('truncated');
    expect(response.headers['x-degraded']).toBeUndefined();
    expect(response.headers['x-source']).toBe('live');
    // Per-leg timeout (120ms) bounds the hung leg — comfortably under suite timeout
    expect(elapsed).toBeLessThan(10_000);
  });

  it('Test B: route deadline catches a total hang — 200 deadline-degraded, shape intact, not cached', async () => {
    process.env.PROFILE_LEG_TIMEOUT_MS = '5000';
    process.env.PROFILE_DEADLINE_MS = '200';

    // EVERY upstream hangs forever
    mockResolveEns.mockImplementation(() => new Promise(() => {}));
    mockReadContract.mockImplementation(() => new Promise(() => {}));
    mockQueryProfileSocials.mockImplementation(() => new Promise(() => {}));

    const started = Date.now();
    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });
    const elapsed = Date.now() - started;

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-degraded']).toBe('deadline');
    expect(response.headers['x-source']).toBe('live');

    const body = response.json<Record<string, unknown>>();
    expect(body.source).toBe('truncated');
    expect(body.handle).toMatch(/^0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}$/);
    expect(body.verifiedX).toBe(false);
    expect(body.verifiedFc).toBe(false);
    expect(body.settledCalls).toBe(0);

    // Shape drift fails loudly: exact ProfileResponseBody key set (15 fields)
    expect(Object.keys(body).sort()).toEqual([...EXPECTED_BODY_KEYS].sort());

    // Deadline-degraded body must NEVER be written to the 60s profile cache
    const profileCacheWrites = mockRedisSet.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.startsWith('profile:'),
    );
    expect(profileCacheWrites).toHaveLength(0);

    expect(elapsed).toBeLessThan(10_000);
  });
});
