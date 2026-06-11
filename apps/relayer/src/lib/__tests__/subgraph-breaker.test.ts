/**
 * Subgraph circuit breaker + last-known-good snapshot tests
 * (quick-260611-h36 Task 3 — TDD RED).
 *
 * Exercises the breaker through the exported queryFeed (every exported query
 * routes through the single executeQuery choke point):
 *   1. Opens on failure — a failed query opens the circuit; the immediately
 *      following query short-circuits (no fetch) and throws (no snapshot yet).
 *   2. Stale served while open — last-good data is returned WITHOUT fetch and
 *      the feed response carries _stale: true.
 *   3. Half-open probe after cooldown — past SUBGRAPH_BREAKER_COOLDOWN_MS the
 *      next query DOES fetch; success closes the breaker (fresh result).
 *   4. Stale horizon — a snapshot older than 1h is NOT served; the query
 *      throws exactly as the no-snapshot case.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stable logger capture (review fixes WR-03/WR-04 assert on structured warns).
const logged = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));
vi.mock('../logger.js', () => {
  const push = (obj: Record<string, unknown>) => {
    logged.events.push(obj);
  };
  const fake = { info: push, warn: push, error: push };
  return { getLogger: vi.fn(() => fake), logger: fake };
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  queryFeed,
  queryAcceptedChallengeIds,
  _resetBreakerForTesting,
} from '../subgraph-client.js';

const FEED_ITEM = {
  id: '1',
  caller: '0xabc',
  marketType: 0,
  asset: 'ETH',
  stake: '5000000',
  expiry: '1800000000',
  conviction: 70,
  status: 'Live',
  createdAt: '1748000000',
};

function okResponse(blockNumber = 100) {
  return {
    ok: true,
    json: async () => ({
      data: {
        calls: [FEED_ITEM],
        _meta: { block: { number: blockNumber } },
      },
    }),
  };
}

describe('subgraph circuit breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetBreakerForTesting();
    mockFetch.mockReset();
    logged.events.length = 0;
    process.env.SUBGRAPH_STUDIO_URL = 'https://studio.example/subgraph/v1';
    delete process.env.SUBGRAPH_BREAKER_COOLDOWN_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test 1: opens on failure — next query short-circuits without fetch and throws (no snapshot)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(queryFeed({ cursor: null })).rejects.toThrow('ECONNREFUSED');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Breaker is now OPEN — the next query must NOT hit fetch and must throw
    // (there is no last-good snapshot yet).
    await expect(queryFeed({ cursor: null })).rejects.toThrow(/circuit open/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('Test 1b: a 429 non-ok response also opens the breaker', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' });

    await expect(queryFeed({ cursor: null })).rejects.toThrow(/429/);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await expect(queryFeed({ cursor: null })).rejects.toThrow(/circuit open/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('Test 2: stale served while open — last-good returned without fetch, _stale: true', async () => {
    // 1. Successful query stores the last-good snapshot.
    mockFetch.mockResolvedValueOnce(okResponse());
    const fresh = await queryFeed({ cursor: null });
    expect(fresh.items).toEqual([FEED_ITEM]);
    expect(fresh._stale).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 2. A failure opens the breaker — the failing query itself degrades to
    //    the snapshot instead of throwing.
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const degraded = await queryFeed({ cursor: null });
    expect(degraded.items).toEqual([FEED_ITEM]);
    expect(degraded._stale).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // 3. While OPEN, the next identical query serves the snapshot WITHOUT fetch.
    const stale = await queryFeed({ cursor: null });
    expect(stale.items).toEqual([FEED_ITEM]);
    expect(stale._stale).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('Test 3: half-open probe after cooldown — success closes the breaker (fresh result)', async () => {
    // Store a snapshot, then open the breaker.
    mockFetch.mockResolvedValueOnce(okResponse());
    await queryFeed({ cursor: null });
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    await queryFeed({ cursor: null }); // opens (serves stale)
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Still open before the cooldown elapses — no fetch.
    vi.advanceTimersByTime(119_000);
    await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Past the 120s default cooldown the next query IS the probe.
    vi.advanceTimersByTime(2_000);
    mockFetch.mockResolvedValueOnce(okResponse(200));
    const probed = await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(probed._stale).toBeUndefined(); // fresh
    expect(probed._meta.block.number).toBe(200);

    // Breaker closed — subsequent queries fetch normally.
    mockFetch.mockResolvedValueOnce(okResponse(201));
    await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('Test 3b: half-open probe failure re-opens — subsequent query short-circuits again', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    await queryFeed({ cursor: null });
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    await queryFeed({ cursor: null }); // opens
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(121_000);

    // Probe fails → re-opens; snapshot (age ~121s < 1h) is served stale.
    mockFetch.mockRejectedValueOnce(new Error('still down'));
    const probe = await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(probe._stale).toBe(true);

    // Re-opened — short-circuits again without fetch.
    await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('Test 4: stale horizon — last-good older than 1h is NOT served', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Age the snapshot past the 1h hard horizon.
    vi.advanceTimersByTime(3_700_000);

    // Failure: breaker opens, but the >1h snapshot must NOT be served — the
    // original upstream error propagates exactly as the no-snapshot case.
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(queryFeed({ cursor: null })).rejects.toThrow('ECONNRESET');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // While open with no servable snapshot → circuit-open throw, no fetch.
    await expect(queryFeed({ cursor: null })).rejects.toThrow(/circuit open/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('Test 5 (WR-04b): GraphQL validation errors do NOT open the breaker — next query still fetches', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: 'Type `Call` has no field `foo`' }] }),
    });

    await expect(queryFeed({ cursor: null })).rejects.toThrow(/GraphQL errors/);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Breaker must still be CLOSED: a deterministic query bug is not an
    // outage — the next query fetches upstream instead of short-circuiting.
    mockFetch.mockResolvedValueOnce(okResponse());
    const fresh = await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(fresh._stale).toBeUndefined();
  });

  it('Test 5b (WR-04b): a non-429 4xx response does NOT open the breaker', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, statusText: 'Bad Request' });

    await expect(queryFeed({ cursor: null })).rejects.toThrow(/400/);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValueOnce(okResponse());
    await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('Test 6 (WR-04a): half-open allows exactly ONE probe — concurrent callers get the stale path', async () => {
    // Store a snapshot, then open the breaker.
    mockFetch.mockResolvedValueOnce(okResponse());
    await queryFeed({ cursor: null });
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    await queryFeed({ cursor: null }); // opens (serves stale)
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(121_000); // cooldown lapsed → half-open

    // The probe hangs; a concurrent caller must NOT fetch — it gets the snapshot.
    let resolveProbe!: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { resolveProbe = resolve; }));
    const probePromise = queryFeed({ cursor: null }); // becomes THE probe
    const concurrent = await queryFeed({ cursor: null });
    expect(concurrent._stale).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3); // only the probe fetched

    // The probe succeeds → fresh result, breaker closed.
    resolveProbe(okResponse(300));
    const probed = await probePromise;
    expect(probed._stale).toBeUndefined();
    expect(probed._meta.block.number).toBe(300);

    // Closed: subsequent queries fetch normally (no probe gate).
    mockFetch.mockResolvedValueOnce(okResponse(301));
    await queryFeed({ cursor: null });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('Test 7 (WR-03): queryAcceptedChallengeIds served stale → explicit warn with ageMs (never silently fresh)', async () => {
    const challengesResponse = {
      ok: true,
      json: async () => ({ data: { challenges: [{ id: '7' }] } }),
    };

    // 1. Fresh query stores the snapshot — no stale warn.
    mockFetch.mockResolvedValueOnce(challengesResponse);
    expect(await queryAcceptedChallengeIds(15n)).toEqual([7n]);
    expect(logged.events.find((e) => e['event'] === 'accepted_challenge_ids_stale')).toBeUndefined();

    // 2. Upstream failure → breaker opens, the snapshot is served stale…
    vi.advanceTimersByTime(5_000);
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await queryAcceptedChallengeIds(15n)).toEqual([7n]);

    // …and the stale serve is loudly flagged with the snapshot age.
    const warn = logged.events.find((e) => e['event'] === 'accepted_challenge_ids_stale');
    expect(warn).toBeDefined();
    expect(warn!['callId']).toBe('15');
    expect(warn!['ageMs']).toBe(5_000);
  });
});
