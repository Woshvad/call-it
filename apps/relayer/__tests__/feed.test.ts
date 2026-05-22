/**
 * Feed route tests — Plan 01-09 Task 1
 *
 * Tests:
 *   1. Subgraph responds fast (<800ms) — returns subgraph data, _source: 'subgraph'
 *   2. Subgraph slow (>800ms) — fallback fires, returns polled-events, _source: 'fallback'
 *   3. First-page request caches in Redis 'feed:firstpage' with 10s TTL
 *   4. Non-first-page (cursor set) skips Redis cache
 *   5. Cache hit on first page — returns cached data immediately
 *   6. Response includes x-source header
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockQueryFeed } = vi.hoisted(() => ({
  mockQueryFeed: vi.fn(),
}));

const { mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

// Mock subgraph client
vi.mock('../src/lib/subgraph-client.js', () => ({
  queryFeed: mockQueryFeed,
  queryProfileCalls: vi.fn(),
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

// ── Test data ─────────────────────────────────────────────────────────────────

const SUBGRAPH_ITEMS = [
  { id: 'call-001', caller: '0xabc', marketType: 0, asset: 'BTC', stake: '10000000', expiry: '1800000000', conviction: 75, status: 'live', createdAt: '1748000000' },
  { id: 'call-002', caller: '0xdef', marketType: 0, asset: 'ETH', stake: '5000000', expiry: '1800000001', conviction: 60, status: 'settled', createdAt: '1748000001' },
];

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import { feedRoute } from '../src/routes/feed.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/feed', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null); // No cache by default
    mockRedisSet.mockResolvedValue('OK');
    app = Fastify({ logger: false });
    await app.register(feedRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('Test 1: Subgraph responds fast — returns subgraph data, _source: subgraph', async () => {
    mockQueryFeed.mockResolvedValueOnce({
      items: SUBGRAPH_ITEMS,
      nextCursor: null,
      _meta: { block: { number: 1000000 } },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: unknown[]; _source: string }>();
    expect(body._source).toBe('subgraph');
    expect(body.items).toEqual(SUBGRAPH_ITEMS);
  });

  it('Test 2: Subgraph slow (>800ms) — fallback fires, _source: fallback', async () => {
    vi.useFakeTimers();

    // Subgraph hangs
    mockQueryFeed.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({
        items: SUBGRAPH_ITEMS,
        nextCursor: null,
        _meta: { block: { number: 1000000 } },
      }), 2000))
    );

    const injectPromise = app.inject({ method: 'GET', url: '/api/feed' });

    // Advance past 800ms timeout
    await vi.advanceTimersByTimeAsync(900);

    const response = await injectPromise;
    vi.useRealTimers();

    expect(response.statusCode).toBe(200);
    const body = response.json<{ _source: string }>();
    expect(body._source).toBe('fallback');
  }, 10000);

  it('Test 3: First-page request caches in Redis feed:firstpage with 10s TTL', async () => {
    mockQueryFeed.mockResolvedValueOnce({
      items: SUBGRAPH_ITEMS,
      nextCursor: null,
      _meta: { block: { number: 1000000 } },
    });

    await app.inject({ method: 'GET', url: '/api/feed' });

    expect(mockRedisSet).toHaveBeenCalledWith(
      'feed:firstpage',
      expect.any(String),
      'EX',
      10,
    );
  });

  it('Test 4: Non-first-page (cursor set) skips Redis cache', async () => {
    mockQueryFeed.mockResolvedValueOnce({
      items: SUBGRAPH_ITEMS,
      nextCursor: null,
      _meta: { block: { number: 1000000 } },
    });

    await app.inject({ method: 'GET', url: '/api/feed?cursor=abc123' });

    // Should NOT call Redis get/set for paginated requests
    expect(mockRedisGet).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it('Test 5: Cache hit on first page — returns cached data immediately', async () => {
    const cachedPayload = JSON.stringify({
      items: SUBGRAPH_ITEMS,
      nextCursor: null,
      _source: 'cache',
    });
    mockRedisGet.mockResolvedValueOnce(cachedPayload);

    const response = await app.inject({ method: 'GET', url: '/api/feed' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ _source: string }>();
    expect(body._source).toBe('cache');
    // Should NOT call subgraph when cache hits
    expect(mockQueryFeed).not.toHaveBeenCalled();
  });

  it('Test 6: Response includes x-source header', async () => {
    mockQueryFeed.mockResolvedValueOnce({
      items: SUBGRAPH_ITEMS,
      nextCursor: null,
      _meta: { block: { number: 1000000 } },
    });

    const response = await app.inject({ method: 'GET', url: '/api/feed' });

    expect(response.headers['x-source']).toBeDefined();
    expect(['subgraph', 'fallback', 'cache']).toContain(response.headers['x-source']);
  });
});
