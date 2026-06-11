/**
 * Profile route deadline regression tests — quick-260610-sr0.
 *
 * Proves GET /api/profile/:address is hang-proof:
 *   A. A single hung leg (displayHandle never settles) → per-leg timeout fires,
 *      route responds fast with the NORMAL degraded chain (200, source
 *      'truncated', NO x-degraded header).
 *   B. EVERY upstream hangs forever → route deadline fires, route responds
 *      200 with the deadline-degraded body (x-degraded: deadline, identical
 *      ProfileResponseBody shape, degraded body never cached — asserted AFTER
 *      the abandoned background resolution settles, WR-03).
 *   C. Malformed timeout env vars (empty string → 0, "5s" → NaN) fall back to
 *      sane defaults instead of instantly degrading every response (WR-02).
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

// Shared logger spies (single object returned by every getLogger() call) so
// tests can observe the BACKGROUND resolveProfile settling (WR-03): the
// abandoned resolution logs 'profile_resolved' after its legs time out, which
// is the signal that the cache-write decision has been made.
const { mockLoggerInfo, mockLoggerWarn, mockLoggerError } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
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

// Mock logger — every getLogger() call returns the SAME spies so assertions
// can see calls from the background (post-response) resolution block.
vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  })),
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

// Mock subgraph-client (NOT mocked in profile.test.ts — that suite relies on
// the real queryProfileSocials fast-throwing on missing SUBGRAPH_STUDIO_URL)
// quick-260611-5mh: the route grew stats + calls-history legs; mock them as
// fast no-data resolutions so this suite keeps testing ONLY the deadline paths.
vi.mock('../src/lib/subgraph-client.js', () => ({
  queryProfileSocials: mockQueryProfileSocials,
  queryProfileStats: vi.fn(async () => null),
  queryProfileCalls: vi.fn(async () => []),
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
  // quick-260611-5mh A3c: ADDITIVE calls-history array (intentional shape
  // change — degraded body carries calls: []).
  'calls',
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
    // WR-03 hygiene: each test awaits its background resolution before exiting,
    // so clearing here guarantees no late mock calls leak into later tests.
    vi.clearAllMocks();
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

    // CR-01: a leg timed out, so this partial body must NOT reach the 60s
    // cache (it silently drops the on-chain displayHandle). resolveProfile
    // completed in-band here (response is the live body), so the cache-write
    // decision has already been made — assertion is deterministic.
    const profileCacheWrites = mockRedisSet.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.startsWith('profile:'),
    );
    expect(profileCacheWrites).toHaveLength(0);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'profile_cache_skipped_degraded' }),
      expect.any(String),
    );
  });

  it('Test B: route deadline catches a total hang — 200 deadline-degraded, shape intact, not cached', async () => {
    // WR-03: leg timeout (400ms) must be LOW so the abandoned background
    // resolveProfile settles within this test (awaited below), but still above
    // the 200ms deadline so the deadline-degraded path is what responds.
    process.env.PROFILE_LEG_TIMEOUT_MS = '400';
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

    // Shape drift fails loudly: exact ProfileResponseBody key set (16 fields)
    expect(Object.keys(body).sort()).toEqual([...EXPECTED_BODY_KEYS].sort());

    // WR-03: the response above raced AHEAD of the abandoned resolveProfile
    // (its legs are still pending until ~400ms). Asserting "never cached"
    // before that block settles would pass even against a cache-poisoning
    // implementation. Wait for the background resolution to finish — it logs
    // 'profile_resolved' AFTER the cache-write decision — then assert.
    await vi.waitFor(
      () => {
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'profile_resolved' }),
          expect.any(String),
        );
      },
      { timeout: 2_000 },
    );

    // CR-01: every leg timed out, so NEITHER the deadline path NOR the
    // background resolveProfile may write the degraded body to the 60s cache.
    const profileCacheWrites = mockRedisSet.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.startsWith('profile:'),
    );
    expect(profileCacheWrites).toHaveLength(0);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'profile_cache_skipped_degraded' }),
      expect.any(String),
    );

    expect(elapsed).toBeLessThan(10_000);
  });

  it('Test C: malformed timeout env vars fall back to defaults — response fully resolved, not instantly degraded (WR-02)', async () => {
    // Empty string → Number('') === 0; '5s' → NaN. Pre-WR-02 both made
    // setTimeout fire immediately, timing out every leg on every request.
    process.env.PROFILE_LEG_TIMEOUT_MS = '';
    process.env.PROFILE_DEADLINE_MS = '5s';

    // ENS resolves after a small REAL delay (50ms) — with a 0ms/NaN leg
    // timeout this leg would lose the race and degrade; with the 5000ms
    // default it resolves fine.
    mockResolveEns.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('vitalik.eth'), 50)),
    );
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'displayHandle': return Promise.resolve('');
        case 'settledCalls': return Promise.resolve(BigInt(3));
        default: return Promise.resolve(null);
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/profile/${TEST_ADDRESS}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-degraded']).toBeUndefined();
    expect(response.headers['x-source']).toBe('live');

    const body = response.json<{ source: string; handle: string; settledCalls: number }>();
    expect(body.source).toBe('ens');
    expect(body.handle).toBe('vitalik.eth');
    expect(body.settledCalls).toBe(3);

    // Fully resolved (no leg timed out) → the 60s cache IS written
    const profileCacheWrites = mockRedisSet.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.startsWith('profile:'),
    );
    expect(profileCacheWrites).toHaveLength(1);
  });
});
