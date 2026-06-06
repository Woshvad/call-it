/**
 * AUTH-14/15/18 — "From your X / Farcaster" feed assembly + content rules.
 *
 * Asserts the AUTH-15 content rules on buildFromYourNetworkFeed (the shared assembly
 * behind both feed routes) with every external call injected/mocked:
 *  - ≤10 cap (FROM_YOUR_NETWORK_MAX).
 *  - recency order preserved (the subgraph query orders desc; the assembly must not reorder).
 *  - active duels INCLUDED (non-terminal status flows through).
 *  - empty on no-access (no follow graph) and on no matches (cross-ref empty) — never throws.
 *  - a query failure degrades to empty (Pitfall 5).
 *
 * Plus the EXCLUDE-settled rule at its true source — queryActiveCallsByCallers builds a
 * GraphQL query with `status_not_in: EXCLUDED_FEED_STATUSES` (mocked fetch transport).
 *
 * Requirements: AUTH-14, AUTH-15, AUTH-18.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildFromYourNetworkFeed,
  FROM_YOUR_NETWORK_MAX,
  type FollowGraphResult,
  type CrossReferencedMatch,
} from '../src/lib/follow-graph.js';
import type { SubgraphActiveCall } from '../src/lib/subgraph-client.js';
import { queryActiveCallsByCallers, EXCLUDED_FEED_STATUSES } from '../src/lib/subgraph-client.js';

const VIEWER = 'did:privy:viewer-1';
const ADDR = '0xabc0000000000000000000000000000000000001';

/** A follow graph with one entry (enough to reach cross-reference). */
function graph(source: FollowGraphResult['source'] = 'live'): FollowGraphResult {
  return { entries: [{ handle: 'satoshi', id: 'x-1' }], source };
}

/** One linked match (the followed handle resolves to a Call It profile). */
const MATCHES: CrossReferencedMatch[] = [{ address: ADDR, matchedHandle: 'satoshi' }];

/** Build N active calls in recency-desc order (createdAt descending), all for ADDR. */
function makeCalls(n: number, status = 'live'): SubgraphActiveCall[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(1000 - i), // recency desc: highest id first
    caller: ADDR,
    marketType: 0,
    asset: 'BTC',
    stake: '5000000',
    expiry: String(2_000_000 + i),
    conviction: 50,
    status,
    createdAt: String(1_700_000_000 - i),
  }));
}

describe('buildFromYourNetworkFeed — AUTH-15 content rules', () => {
  it('caps the section at FROM_YOUR_NETWORK_MAX (≤10) even when more match', async () => {
    const res = await buildFromYourNetworkFeed(VIEWER, 'twitter', {
      getFollowGraphImpl: vi.fn().mockResolvedValue(graph()) as never,
      crossReferenceImpl: vi.fn().mockResolvedValue(MATCHES) as never,
      queryActiveCallsImpl: vi.fn().mockResolvedValue(makeCalls(15)) as never,
    });
    expect(FROM_YOUR_NETWORK_MAX).toBe(10);
    expect(res.items).toHaveLength(10);
    expect(res.source).toBe('live');
  });

  it('preserves recency order from the query (no reorder in the assembly)', async () => {
    const calls = makeCalls(3); // ids 1000, 999, 998 (recency desc)
    const res = await buildFromYourNetworkFeed(VIEWER, 'twitter', {
      getFollowGraphImpl: vi.fn().mockResolvedValue(graph()) as never,
      crossReferenceImpl: vi.fn().mockResolvedValue(MATCHES) as never,
      queryActiveCallsImpl: vi.fn().mockResolvedValue(calls) as never,
    });
    expect(res.items.map((i) => i.callId)).toEqual(['1000', '999', '998']);
    // The matched followed handle is attached to each item.
    expect(res.items[0]).toMatchObject({ handle: 'satoshi', marketLine: 'BTC', status: 'live' });
  });

  it('includes active duels (non-terminal status flows through)', async () => {
    const calls = [...makeCalls(1, 'live'), ...makeCalls(1, 'active-duel')];
    const res = await buildFromYourNetworkFeed(VIEWER, 'twitter', {
      getFollowGraphImpl: vi.fn().mockResolvedValue(graph()) as never,
      crossReferenceImpl: vi.fn().mockResolvedValue(MATCHES) as never,
      queryActiveCallsImpl: vi.fn().mockResolvedValue(calls) as never,
    });
    expect(res.items.map((i) => i.status)).toContain('active-duel');
  });

  it('propagates the cache source when the follow graph was cached', async () => {
    const res = await buildFromYourNetworkFeed(VIEWER, 'twitter', {
      getFollowGraphImpl: vi.fn().mockResolvedValue(graph('cache')) as never,
      crossReferenceImpl: vi.fn().mockResolvedValue(MATCHES) as never,
      queryActiveCallsImpl: vi.fn().mockResolvedValue(makeCalls(2)) as never,
    });
    expect(res.source).toBe('cache');
  });
});

describe('buildFromYourNetworkFeed — graceful empty (Pitfall 5, AUTH-17)', () => {
  it('returns empty when the viewer has no follow graph (no access)', async () => {
    const queryCalls = vi.fn();
    const res = await buildFromYourNetworkFeed(VIEWER, 'twitter', {
      getFollowGraphImpl: vi.fn().mockResolvedValue({ entries: [], source: 'empty' }) as never,
      crossReferenceImpl: vi.fn() as never,
      queryActiveCallsImpl: queryCalls as never,
    });
    expect(res).toEqual({ items: [], source: 'empty' });
    expect(queryCalls).not.toHaveBeenCalled();
  });

  it('returns empty when no followed handle matches a Call It profile', async () => {
    const queryCalls = vi.fn();
    const res = await buildFromYourNetworkFeed(VIEWER, 'twitter', {
      getFollowGraphImpl: vi.fn().mockResolvedValue(graph()) as never,
      crossReferenceImpl: vi.fn().mockResolvedValue([]) as never,
      queryActiveCallsImpl: queryCalls as never,
    });
    expect(res).toEqual({ items: [], source: 'empty' });
    expect(queryCalls).not.toHaveBeenCalled();
  });

  it('degrades to empty when the active-calls query throws', async () => {
    const res = await buildFromYourNetworkFeed(VIEWER, 'twitter', {
      getFollowGraphImpl: vi.fn().mockResolvedValue(graph()) as never,
      crossReferenceImpl: vi.fn().mockResolvedValue(MATCHES) as never,
      queryActiveCallsImpl: vi.fn().mockRejectedValue(new Error('subgraph_down')) as never,
    });
    expect(res).toEqual({ items: [], source: 'empty' });
  });
});

describe('queryActiveCallsByCallers — EXCLUDE settled (AUTH-15)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.SUBGRAPH_STUDIO_URL;
  });

  it('builds a query with status_not_in: EXCLUDED_FEED_STATUSES (excludes settled)', async () => {
    process.env.SUBGRAPH_STUDIO_URL = 'https://example.test/subgraph';
    const captured: Array<{ query: string; variables: Record<string, unknown> }> = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      captured.push(JSON.parse((init as { body: string }).body));
      return { ok: true, json: async () => ({ data: { calls: [] } }) } as unknown as Response;
    }) as never;

    await queryActiveCallsByCallers([ADDR], 10);

    expect(captured).toHaveLength(1);
    expect(captured[0].query).toContain('status_not_in');
    expect(captured[0].variables.excluded).toEqual([...EXCLUDED_FEED_STATUSES]);
    expect(EXCLUDED_FEED_STATUSES).toContain('settled');
    expect(captured[0].variables.first).toBe(10);
  });

  it('returns [] without a network call when there are no callers', async () => {
    globalThis.fetch = vi.fn() as never;
    const res = await queryActiveCallsByCallers([], 10);
    expect(res).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
