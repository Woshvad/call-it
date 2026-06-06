/**
 * AUTH-14/15/17 / D-11/D-12 — follow-graph data layer.
 *
 * Asserts:
 *  - cache hit (<1h): a populated Redis key returns { source: 'cache' } without fetching.
 *  - miss → fetch → overwrite: a cache miss fetches from the (mocked) X API, normalizes
 *    handles, overwrites Postgres follow_graph rows + Redis, and returns { source: 'live' }.
 *  - cross-reference (D-11): only followed handles linked to a Call It profile match,
 *    with handle normalization (lowercase / @-strip) on both sides.
 *  - graceful-empty (Pitfall 5, AUTH-17): a fetcher error returns an EMPTY set, never throws.
 *  - viewer-only (AUTH-17): the cache key is derived from the viewer's privyUserId only.
 *
 * External calls (X API / Neynar / Postgres) are fully mocked — no live calls.
 *
 * Requirements: AUTH-14, AUTH-15, AUTH-17. Decisions: D-11, D-12.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Redis (ioredis-mock) — shared instance, flushed per test ───────────────────
vi.mock('../src/lib/redis.js', () => {
  const RedisMock = require('ioredis-mock');
  const redisMock = new RedisMock();
  return { getRedis: () => redisMock };
});

import { getRedis } from '../src/lib/redis.js';
import {
  getFollowGraph,
  crossReference,
  normalizeFollowHandle,
  followCacheKey,
  type FollowGraphEntry,
  type CrossReferencedMatch,
} from '../src/lib/follow-graph.js';
import type { SubgraphLinkedProfile } from '../src/lib/subgraph-client.js';

const VIEWER = 'did:privy:viewer-1';

/** Minimal drizzle-shaped fake: records delete/insert calls (viewer-only overwrite). */
function makeFakeDb() {
  const calls = { del: 0, insert: 0 };
  const db = {
    delete: () => ({ where: async () => { calls.del++; } }),
    insert: () => ({ values: async () => { calls.insert++; } }),
  };
  return { db: db as never, calls };
}

beforeEach(async () => {
  // ioredis-mock supports flushall — reset cache state between tests.
  await (getRedis() as unknown as { flushall: () => Promise<void> }).flushall();
});

describe('getFollowGraph — cache hit', () => {
  it('returns { source: "cache" } from a populated Redis key without fetching', async () => {
    const cached: FollowGraphEntry[] = [{ handle: 'satoshi', id: 'x-1' }];
    await getRedis().set(followCacheKey('twitter', VIEWER), JSON.stringify(cached));

    const fetchTwitterFollowingImpl = vi.fn();
    const { db } = makeFakeDb();

    const res = await getFollowGraph(VIEWER, 'twitter', {
      db,
      xUserId: 'x-viewer',
      fetchTwitterFollowingImpl: fetchTwitterFollowingImpl as never,
    });

    expect(res.source).toBe('cache');
    expect(res.entries).toEqual(cached);
    expect(fetchTwitterFollowingImpl).not.toHaveBeenCalled();
  });
});

describe('getFollowGraph — miss → fetch → overwrite', () => {
  it('fetches, normalizes, overwrites Postgres + Redis, returns { source: "live" }', async () => {
    const fetchTwitterFollowingImpl = vi
      .fn()
      .mockResolvedValue([
        { id: 'x-1', username: '@Satoshi' },
        { id: 'x-2', username: 'Hal' },
      ]);
    const { db, calls } = makeFakeDb();

    const res = await getFollowGraph(VIEWER, 'twitter', {
      db,
      xUserId: 'x-viewer',
      fetchTwitterFollowingImpl: fetchTwitterFollowingImpl as never,
    });

    expect(fetchTwitterFollowingImpl).toHaveBeenCalledWith('x-viewer');
    expect(res.source).toBe('live');
    // Handles normalized (lowercase, @-stripped).
    expect(res.entries).toEqual([
      { handle: 'satoshi', id: 'x-1' },
      { handle: 'hal', id: 'x-2' },
    ]);
    // Viewer-only overwrite: delete-then-insert + Redis populated for next read.
    expect(calls.del).toBe(1);
    expect(calls.insert).toBe(1);
    const cached = await getRedis().get(followCacheKey('twitter', VIEWER));
    expect(JSON.parse(cached as string)).toEqual(res.entries);
  });

  it('returns empty (no identity) when the viewer has no linked X id', async () => {
    const fetchTwitterFollowingImpl = vi.fn();
    const { db } = makeFakeDb();
    const res = await getFollowGraph(VIEWER, 'twitter', {
      db,
      // no xUserId
      fetchTwitterFollowingImpl: fetchTwitterFollowingImpl as never,
    });
    expect(res).toEqual({ entries: [], source: 'empty' });
    expect(fetchTwitterFollowingImpl).not.toHaveBeenCalled();
  });
});

describe('getFollowGraph — graceful degradation (Pitfall 5, AUTH-17)', () => {
  it('returns an EMPTY set (never throws) when the fetcher errors', async () => {
    const fetchTwitterFollowingImpl = vi.fn().mockRejectedValue(new Error('x_api_down'));
    const { db } = makeFakeDb();

    const res = await getFollowGraph(VIEWER, 'twitter', {
      db,
      xUserId: 'x-viewer',
      fetchTwitterFollowingImpl: fetchTwitterFollowingImpl as never,
    });

    expect(res).toEqual({ entries: [], source: 'empty' });
  });
});

describe('crossReference — D-11 linked-profile matching', () => {
  it('returns only followed handles linked to a Call It profile (normalized)', async () => {
    const followed: FollowGraphEntry[] = [
      { handle: 'satoshi', id: 'x-1' },
      { handle: 'hal', id: 'x-2' },
      { handle: 'nobody', id: 'x-3' },
    ];
    // Subgraph returns one matching profile (Satoshi, mixed-case) and one unrelated.
    const queryImpl = vi.fn().mockResolvedValue([
      { id: '0xAbC0000000000000000000000000000000000001', twitterHandle: 'Satoshi', farcasterHandle: null },
      { id: '0xDdD0000000000000000000000000000000000002', twitterHandle: 'someoneelse', farcasterHandle: null },
    ] satisfies SubgraphLinkedProfile[]);

    const matches: CrossReferencedMatch[] = await crossReference(followed, 'twitter', queryImpl as never);

    expect(matches).toEqual([
      { address: '0xabc0000000000000000000000000000000000001', matchedHandle: 'satoshi' },
    ]);
  });

  it('returns [] without querying when the viewer follows no one', async () => {
    const queryImpl = vi.fn();
    const matches = await crossReference([], 'twitter', queryImpl as never);
    expect(matches).toEqual([]);
    expect(queryImpl).not.toHaveBeenCalled();
  });

  it('degrades to no matches (never throws) when the subgraph query errors', async () => {
    const followed: FollowGraphEntry[] = [{ handle: 'satoshi', id: 'x-1' }];
    const queryImpl = vi.fn().mockRejectedValue(new Error('subgraph_down'));
    const matches = await crossReference(followed, 'twitter', queryImpl as never);
    expect(matches).toEqual([]);
  });
});

describe('normalizeFollowHandle + followCacheKey (viewer-only, AUTH-17)', () => {
  it('normalizes handles (lowercase, strip leading @)', () => {
    expect(normalizeFollowHandle('@Satoshi')).toBe('satoshi');
    expect(normalizeFollowHandle('  HAL  ')).toBe('hal');
  });

  it('derives the cache key from the viewer privyUserId only (no target param)', () => {
    expect(followCacheKey('twitter', VIEWER)).toBe(`follow:x:${VIEWER}`);
    expect(followCacheKey('farcaster', VIEWER)).toBe(`follow:fc:${VIEWER}`);
    // Distinct viewers → distinct keys (no cross-viewer leakage).
    expect(followCacheKey('twitter', 'did:privy:other')).not.toBe(followCacheKey('twitter', VIEWER));
  });
});
