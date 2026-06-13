/**
 * leaderboard-client resilience — retry + last-known-good stale fallback (Vitest).
 *
 * quick-260613-we4: the live Studio endpoint flaps ~20% (request 1 = HTTP 521
 * Cloudflare origin-down, requests 2–5 = HTTP 200 valid `profiles`), so ~1 in 5
 * Server-Component renders of /leaderboard showed the "Couldn't load the tape…"
 * error state. getLeaderboard() now:
 *   - retries up to 3× on 429 / 5xx (covers the observed 521) / network errors;
 *   - returns the module-level last-known-good board (stale, no throw) when all
 *     attempts fail BUT a prior successful fetch exists;
 *   - throws ONLY on a cold outage (all attempts failed AND lastGood === null).
 *
 * Mocking idiom mirrors subgraph-url-precedence.test.ts: vi.stubEnv / vi.stubGlobal
 * / vi.resetModules. Module-level `lastGood` is reset by re-importing a fresh module
 * (vi.resetModules() + dynamic import); Test B deliberately shares ONE module
 * instance across its prime + stale-read so lastGood survives between the two calls.
 *
 * Only the https://example.com placeholder URL is used — never a real endpoint,
 * never the gateway URL/key (commit rule).
 *
 * Requirements: UI-12, UI-13, D-06, D-27
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

/** A reusable success payload — one ranked caller. */
function successPayload() {
  return {
    data: {
      profiles: [
        {
          id: '0xabc0000000000000000000000000000000000abc',
          handle: 'alice',
          globalRep: 100,
          totalCalls: 5,
          settledCalls: 3,
          wins: 2,
        },
      ],
    },
  };
}

/** A 200 OK fetch response wrapping the given JSON body. */
function ok200(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/**
 * A 521 (Cloudflare origin-down) response. `.json` is exposed so a defensive read
 * can't crash even though the retry path should never reach it on a non-ok status.
 */
function resp521() {
  return { ok: false, status: 521, json: async () => ({}) };
}

describe('getLeaderboard resilience (retry + last-known-good)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('Test A — retries: a transient 521 then a 200 success resolves to the real rows', async () => {
    vi.resetModules(); // fresh module → lastGood starts null
    vi.stubEnv('SUBGRAPH_URL', 'https://example.com/subgraph');

    const mock = vi
      .fn()
      .mockResolvedValueOnce(resp521())
      .mockResolvedValueOnce(ok200(successPayload()));
    vi.stubGlobal('fetch', mock);

    const { getLeaderboard } = await import('@/lib/leaderboard-client');
    const result = await getLeaderboard();

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.handle).toBe('alice');
    expect(result.rows[0]!.rank).toBe(1);
    expect(result.windowedDataAvailable).toBe(false);
  });

  it('Test B — stale fallback: after priming lastGood, an all-521 outage returns the stale board (no throw)', async () => {
    vi.resetModules(); // fresh module for the prime
    vi.stubEnv('SUBGRAPH_URL', 'https://example.com/subgraph');

    // ONE module instance shared across both calls so lastGood survives.
    const { getLeaderboard } = await import('@/lib/leaderboard-client');

    // 1) Prime lastGood with a real success.
    const primeMock = vi.fn().mockResolvedValue(ok200(successPayload()));
    vi.stubGlobal('fetch', primeMock);
    const primed = await getLeaderboard();
    expect(primed.rows[0]!.handle).toBe('alice');

    // 2) Now every attempt 521s — must RESOLVE to the stale primed board, not throw.
    const outageMock = vi.fn().mockResolvedValue(resp521());
    vi.stubGlobal('fetch', outageMock);
    const stale = await getLeaderboard();
    expect(outageMock).toHaveBeenCalledTimes(3); // all retries exhausted
    expect(stale.rows).toHaveLength(1);
    expect(stale.rows[0]!.handle).toBe('alice');
    expect(stale.rows[0]!.rank).toBe(1);
  });

  it('Test C — cold outage: all attempts fail with NO prior good board → throws', async () => {
    vi.resetModules(); // fresh module → lastGood === null
    vi.stubEnv('SUBGRAPH_URL', 'https://example.com/subgraph');

    const mock = vi.fn().mockResolvedValue(resp521());
    vi.stubGlobal('fetch', mock);

    const { getLeaderboard } = await import('@/lib/leaderboard-client');
    await expect(getLeaderboard()).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(3);
  });
});
