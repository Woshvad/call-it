/**
 * subgraph-resilience — shared retry + bounded last-known-good util, plus the two
 * settled/duel OG reads that now route through it (Vitest, quick-260614-1co).
 *
 * The live Studio endpoint flaps ~20% (request 1 = HTTP 521 Cloudflare origin-down,
 * requests 2–5 = 200). resilientSubgraphFetch():
 *   - retries up to maxAttempts on 429 / 5xx (covers 521) / network / GraphQL-error;
 *   - serves the module-level last-known-good for the cacheKey when exhausted-with-cache;
 *   - returns fallback() when exhausted-no-cache-with-fallback;
 *   - throws the last error when exhausted-no-cache-no-fallback;
 *   - a non-retryable 4xx stops the loop immediately.
 *
 * Settled/duel cases prove getSettledFields/getDuelSettledFields keep their
 * never-throw SHARE-10 contract (fallback:()=>empty) AND gain retry + cache.
 *
 * Mocking idiom mirrors subgraph-url-precedence.test.ts / leaderboard-client.test.ts:
 * vi.stubGlobal / response objects shaped { ok, status, json }. __resetSubgraphCache()
 * between cases. Only https://example.com placeholder URLs (commit rule).
 *
 * Requirements: D-03, D-06, D-27, SHARE-10
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  resilientSubgraphFetch,
  __resetSubgraphCache,
} from '@/lib/subgraph-resilience';

const URL = 'https://example.com/subgraph';

/** A 200 OK fetch response wrapping the given JSON body. */
function ok200(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** A non-ok response with the given status; `.json` is exposed defensively. */
function err(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body };
}

// ─── util-level ───────────────────────────────────────────────────────────────

describe('resilientSubgraphFetch (util)', () => {
  beforeEach(() => {
    __resetSubgraphCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('retry-then-success: one 521 then a 200+data resolves to parse(data); fetch called twice', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(err(521))
      .mockResolvedValueOnce(ok200({ data: { value: 42 } }));
    vi.stubGlobal('fetch', mock);

    const result = await resilientSubgraphFetch<number>({
      url: URL,
      query: 'q',
      variables: {},
      cacheKey: 'k:retry',
      parse: (d) => d.value as number,
    });

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result).toBe(42);
  });

  it('last-known-good: prime one success, then all-521 resolves to the cached result (not fallback, not throw)', async () => {
    // 1) Prime the cache under the SAME cacheKey.
    const primeMock = vi.fn().mockResolvedValue(ok200({ data: { value: 7 } }));
    vi.stubGlobal('fetch', primeMock);
    const primed = await resilientSubgraphFetch<number>({
      url: URL,
      query: 'q',
      variables: {},
      cacheKey: 'k:cached',
      parse: (d) => d.value as number,
      fallback: () => -1,
    });
    expect(primed).toBe(7);

    // 2) All-521 → must resolve to the cached 7, NOT the fallback (-1), NOT throw.
    const outageMock = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', outageMock);
    const stale = await resilientSubgraphFetch<number>({
      url: URL,
      query: 'q',
      variables: {},
      cacheKey: 'k:cached',
      parse: (d) => d.value as number,
      fallback: () => -1,
    });
    expect(outageMock).toHaveBeenCalledTimes(3); // maxAttempts hit
    expect(stale).toBe(7);
  });

  it('throw on exhausted-no-fallback-no-cache: all-521 rejects with the last error', async () => {
    const mock = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', mock);

    await expect(
      resilientSubgraphFetch<number>({
        url: URL,
        query: 'q',
        variables: {},
        cacheKey: 'k:throw',
        parse: (d) => d.value as number,
      }),
    ).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('return fallback on exhausted-with-fallback-no-cache: all-521 resolves to fallback()', async () => {
    const mock = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', mock);

    const result = await resilientSubgraphFetch<string>({
      url: URL,
      query: 'q',
      variables: {},
      cacheKey: 'k:fallback',
      parse: () => 'real',
      fallback: () => 'fallback',
    });
    expect(mock).toHaveBeenCalledTimes(3);
    expect(result).toBe('fallback');
  });

  it('non-retryable 4xx: a single 404 stops retrying immediately (fetch once) → fallback', async () => {
    const mock = vi.fn().mockResolvedValue(err(404));
    vi.stubGlobal('fetch', mock);

    const result = await resilientSubgraphFetch<string>({
      url: URL,
      query: 'q',
      variables: {},
      cacheKey: 'k:404',
      parse: () => 'real',
      fallback: () => 'fallback',
    });
    expect(mock).toHaveBeenCalledTimes(1); // stopped immediately, no extra attempts
    expect(result).toBe('fallback');
  });

  it('cache eviction bound: inserting >256 distinct keys evicts the oldest (no stale serve)', async () => {
    // Prime 257 distinct keys with successes (each value = its index).
    const okMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { variables: { i: number } };
      return ok200({ data: { value: body.variables.i } });
    });
    vi.stubGlobal('fetch', okMock as unknown as typeof fetch);

    const total = 257; // CACHE_CAP (256) + 1 → key 0 should be evicted
    for (let i = 0; i < total; i++) {
      await resilientSubgraphFetch<number>({
        url: URL,
        query: 'q',
        variables: { i },
        cacheKey: `evict:${i}`,
        parse: (d) => d.value as number,
      });
    }

    // Now an outage on the OLDEST key (0) must NOT serve a stale value — it was
    // evicted, so with a fallback we get the fallback, not the old cached 0.
    const outageMock = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', outageMock);
    const evicted = await resilientSubgraphFetch<number>({
      url: URL,
      query: 'q',
      variables: { i: 0 },
      cacheKey: 'evict:0',
      parse: (d) => d.value as number,
      fallback: () => -999,
    });
    expect(evicted).toBe(-999); // oldest key evicted → fallback, not stale 0

    // A still-cached recent key (256) DOES serve its stale value through an outage.
    const outageMock2 = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', outageMock2);
    const stillCached = await resilientSubgraphFetch<number>({
      url: URL,
      query: 'q',
      variables: { i: 256 },
      cacheKey: 'evict:256',
      parse: (d) => d.value as number,
      fallback: () => -999,
    });
    expect(stillCached).toBe(256);
  });
});

// ─── relayer-client settled/duel through the util ──────────────────────────────

/** A real settled payload for getSettledFields. */
function settledPayload() {
  return {
    data: {
      call: { statement: 'BTC > 100k by EOY' },
      settlements: [{ finalPrice: '105000', priceDelta: '5000' }],
      repEvents: [{ delta: 12, fallback: false }],
      positions: [
        { side: 'fade', usdcDeposited: '300' },
        { side: 'follow', usdcDeposited: '100' },
      ],
      callerExits: [{ penaltyApplied: '50' }],
    },
  };
}

/** A real duel payload for getDuelSettledFields. */
function duelPayload() {
  return {
    data: {
      call: { statement: 'ETH flips SOL', asset: 'ETH' },
      callerRep: [{ delta: 8 }],
      challengerRep: [{ delta: -8 }],
    },
  };
}

describe('getSettledFields through resilientSubgraphFetch', () => {
  beforeEach(() => {
    __resetSubgraphCache();
    vi.resetModules();
    vi.stubEnv('SUBGRAPH_URL', 'https://example.com/subgraph');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('retry-then-200: one 521 then a real settlement resolves real fields incl. fadeRealShare', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(err(521))
      .mockResolvedValueOnce(ok200(settledPayload()));
    vi.stubGlobal('fetch', mock);

    const { getSettledFields } = await import('@/lib/relayer-client');
    const result = await getSettledFields(42);

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result.statement).toBe('BTC > 100k by EOY');
    expect(result.finalPrice).toBe('105000');
    expect(result.repDelta).toBe(12);
    expect(result.repFallback).toBe(false);
    expect(result.exitPenalty).toBe('50');
    // fade 300 / (300+100) = 0.75 via the BigInt loop.
    expect(result.fadeRealShare).toBeCloseTo(0.75, 10);
  });

  it('all-521 WITH a prior good read → resolves the cached real fields, NOT empty', async () => {
    // Prime under cacheKey settled:42.
    const primeMock = vi.fn().mockResolvedValue(ok200(settledPayload()));
    vi.stubGlobal('fetch', primeMock);
    const { getSettledFields } = await import('@/lib/relayer-client');
    const primed = await getSettledFields(42);
    expect(primed.statement).toBe('BTC > 100k by EOY');

    // Now all-521 — must serve the cached real fields, not the empty object.
    const outageMock = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', outageMock);
    const stale = await getSettledFields(42);
    expect(outageMock).toHaveBeenCalledTimes(3);
    expect(stale.statement).toBe('BTC > 100k by EOY');
    expect(stale.repDelta).toBe(12);
  });

  it('all-521 with NO prior good → resolves the empty SettledFields (never throws — SHARE-10)', async () => {
    const mock = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', mock);

    const { getSettledFields } = await import('@/lib/relayer-client');
    const result = await getSettledFields(999);

    expect(mock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      statement: null,
      finalPrice: null,
      priceDelta: null,
      repDelta: null,
      repFallback: null,
      fadeRealShare: null,
      exitPenalty: null,
    });
  });
});

describe('getDuelSettledFields through resilientSubgraphFetch', () => {
  beforeEach(() => {
    __resetSubgraphCache();
    vi.resetModules();
    vi.stubEnv('SUBGRAPH_URL', 'https://example.com/subgraph');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const CALLER = '0xCALLER0000000000000000000000000000000abc';
  const CHALLENGER = '0xCHALLENGER00000000000000000000000000def0';

  it('retry-then-200: one 521 then real fields resolve', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(err(521))
      .mockResolvedValueOnce(ok200(duelPayload()));
    vi.stubGlobal('fetch', mock);

    const { getDuelSettledFields } = await import('@/lib/relayer-client');
    const result = await getDuelSettledFields(7, CALLER, CHALLENGER);

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result.statement).toBe('ETH flips SOL');
    expect(result.asset).toBe('ETH');
    expect(result.callerRepDelta).toBe(8);
    expect(result.challengerRepDelta).toBe(-8);
  });

  it('all-521 WITH a prior good read → resolves the cached real fields, NOT empty', async () => {
    const primeMock = vi.fn().mockResolvedValue(ok200(duelPayload()));
    vi.stubGlobal('fetch', primeMock);
    const { getDuelSettledFields } = await import('@/lib/relayer-client');
    const primed = await getDuelSettledFields(7, CALLER, CHALLENGER);
    expect(primed.statement).toBe('ETH flips SOL');

    const outageMock = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', outageMock);
    const stale = await getDuelSettledFields(7, CALLER, CHALLENGER);
    expect(outageMock).toHaveBeenCalledTimes(3);
    expect(stale.asset).toBe('ETH');
    expect(stale.callerRepDelta).toBe(8);
  });

  it('all-521 with NO prior good → resolves the empty DuelSettledFields (never throws — SHARE-10)', async () => {
    const mock = vi.fn().mockResolvedValue(err(521));
    vi.stubGlobal('fetch', mock);

    const { getDuelSettledFields } = await import('@/lib/relayer-client');
    const result = await getDuelSettledFields(998, CALLER, CHALLENGER);

    expect(mock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      statement: null,
      asset: null,
      callerRepDelta: null,
      challengerRepDelta: null,
    });
  });
});
