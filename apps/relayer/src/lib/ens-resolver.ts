/**
 * ENS Reverse-Record Resolver — cache-only request path + background warm
 * (stale-while-revalidate, quick-260611-qbg).
 *
 * Resolution is server-side only — never happens in the browser.
 * Uses a dedicated Mainnet RPC (ENS_MAINNET_RPC_URL) separate from the
 * Arbitrum RPC. This is a hard requirement since ENS lives on Ethereum mainnet.
 *
 * Request path (quick-260611-qbg): a profile request NEVER awaits an ENS RPC.
 * `resolveEns` is cache-only — a cache hit returns the cached value (sentinels
 * read as null); a cache miss kicks a fire-and-forget background resolve and
 * returns null immediately. Worst case for the caller is the 2s Redis read
 * bound inside getCached, never an RPC. A dead/hanging ENS_MAINNET_RPC_URL can
 * therefore never slow /api/profile again, and the route's 60s profile cache
 * can always fill. Honest D-07 degrade: the first-ever view of an ENS-named
 * address shows the fallback handle; the name appears from the next view
 * (within the unchanged D-13 ≤24h staleness envelope).
 *
 * Unconfigured = honest null (quick-260611-p9a): when ENS_MAINNET_RPC_URL is
 * unset, resolveEns returns null immediately — no cache read, no background
 * kick, no RPC attempt. Previously `http(undefined)` fell through to viem's
 * default public mainnet RPC, which hangs/throttles from Fly, burning the
 * full 5s leg timeout on every uncached profile request. When the env IS set,
 * the bounded transport + public failover below stays.
 *
 * Background warm (resolveEnsInBackground, exported for deterministic tests):
 *   - In-flight dedup: a module-level Map keyed by lowercased address ensures
 *     concurrent cache-misses for the same address share exactly ONE RPC
 *     attempt. Map growth is bounded by promise settlement — transports are
 *     5s timeout × 1 retry × 2 fallback legs, so every promise settles and
 *     deletes its entry in finally.
 *   - The background promise NEVER produces an unhandled rejection: all
 *     failures are caught internally and recorded as the failure sentinel.
 *
 * Cache strategy (quick-260611-h36: L1-first via lib/cache.ts — survives a
 * dead Redis on the single-Fly-machine relayer):
 *   - Positive hit: stores the ENS name with 24h TTL (D-13)
 *   - Negative hit: stores '::null::' sentinel with 24h TTL
 *     (avoids hammering the RPC for addresses with no ENS name)
 *   - RPC failure: stores '::fail::' sentinel with 300s TTL — a dead or
 *     throttled endpoint is retried within minutes (not 24h) and never
 *     hammered per-request (Alchemy CU protection). A '::fail::' cache hit
 *     reads as null WITHOUT kicking a new background resolve — the cooldown
 *     is the point.
 *
 * Accepted edge (do not redesign around it): resolveEns reads with
 * `getCached<string>(key, ENS_CACHE_TTL_SECONDS)`; if the process restarts
 * inside a 300s '::fail::' cooldown window and Redis still holds the
 * sentinel, the L1 backfill stores '::fail::' with the 24h backfill TTL.
 * Impact: that one address shows the fallback handle for up to 24h —
 * identical to a negative-cache hit, inside the D-13 staleness envelope,
 * self-heals on next restart/L1 eviction. Accepted.
 *
 * NOTE: values persist through the JSON cache helper, so the Redis-side
 * representation is the JSON string (e.g. `"::null::"`, `"::fail::"`). This
 * is safe: the cache is ephemeral, and legacy non-JSON entries fail
 * JSON.parse inside getCached and simply read as misses (one background
 * resolve, then re-cached).
 *
 * RESEARCH Pattern 12 — lines 1097-1122.
 * Prior fixes: quick-260611-p9a (unconfigured skip), quick-260611-h36
 * (L1-first cache helper), quick-260610-sr0 (bounded transport + Redis
 * degradation invariants).
 *
 * Requirements: D-13, AUTH-11
 * Security: T-01-60 (ENS cache poisoning — mitigated by dedicated Mainnet RPC + 24h TTL)
 */

import { fallback, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import type { Redis } from 'ioredis';
import { getCached, setCached } from './cache.js';
import { getLogger } from './logger.js';

// ── Mainnet client (ENS is on Ethereum mainnet, NOT Arbitrum) ────────────────

const mainnetClient = createPublicClient({
  chain: mainnet,
  // quick-260610-sr0: bounded transport — the demo-key fallback 429s/hangs
  // when ENS_MAINNET_RPC_URL is unset; never let a lookup stall the caller.
  transport: fallback([
    http(process.env.ENS_MAINNET_RPC_URL, { timeout: 5_000, retryCount: 1 }),
    http(undefined, { timeout: 5_000, retryCount: 1 }), // viem mainnet default — public failover
  ]),
});

/** 24h cache TTL (seconds) — D-13. */
const ENS_CACHE_TTL_SECONDS = 86400;

/** Failure-cooldown sentinel (quick-260611-qbg): cached on RPC failure. */
const ENS_FAIL_SENTINEL = '::fail::';

/** Failure-cooldown TTL (seconds): retry a dead endpoint within minutes, not 24h. */
const ENS_FAIL_TTL_SECONDS = 300;

/**
 * In-flight background resolves, keyed by lowercased address. Concurrent
 * cache-misses for the same address join the same promise (ONE RPC attempt).
 * Entries are deleted in `finally`, so the Map is bounded by promise
 * settlement (transports are 5s timeout × 1 retry × 2 legs — always settles).
 */
const inFlight = new Map<string, Promise<void>>();

/** Test hook — clears the dedup Map so a failed test cannot leak an in-flight entry. */
export function _clearInFlightForTesting(): void {
  inFlight.clear();
}

/**
 * Resolve the ENS reverse-record for an address — CACHE-ONLY request path.
 *
 * Hit: returns the cached name ('::null::' / '::fail::' sentinels → null).
 * Miss: kicks a fire-and-forget background resolve and returns null
 * immediately — the caller NEVER awaits an RPC (quick-260611-qbg).
 *
 * @param address - Ethereum address (checksummed or lowercased, both accepted)
 * @param _redis - DEPRECATED (quick-260611-h36): kept for call-site signature
 *   compatibility; caching now flows through the L1-first lib/cache.ts helper.
 * @returns cached ENS name string or null (uncached / no name / cooldown)
 */
export async function resolveEns(
  address: `0x${string}`,
  _redis?: Redis,
): Promise<string | null> {
  // quick-260611-p9a: configured-check guard — read PER CALL (matches the
  // repo's testable env pattern; a module-scope read would freeze the value
  // at first import). Unconfigured ENS = immediate honest null: no cache
  // read, no background kick, no per-request logging (this is the common
  // path on Fly today — log spam would be worse than silence).
  const ensConfigured = Boolean(process.env.ENS_MAINNET_RPC_URL);
  if (!ensConfigured) {
    return null;
  }

  const cacheKey = `ens:${address.toLowerCase()}`;

  // Check cache — getCached never throws (quick-260611-h36): a Redis quota
  // rejection (Upstash free tier exhausted) degrades to the in-process L1,
  // then to a cache miss — never a failure.
  const cached = await getCached<string>(cacheKey, ENS_CACHE_TTL_SECONDS);

  if (cached !== null) {
    // Negative-cache hit: "we tried and there was no ENS name".
    if (cached === '::null::') {
      return null;
    }
    // Failure-cooldown hit: explicitly NO new background kick — the 300s
    // cooldown caps the RPC rate against a dead/throttled endpoint.
    if (cached === ENS_FAIL_SENTINEL) {
      return null;
    }
    return cached;
  }

  // Cache miss — fire-and-forget background warm; the request never waits.
  void resolveEnsInBackground(address);
  return null;
}

/**
 * Background ENS resolve worker (exported for deterministic tests).
 *
 * Deduped per lowercased address: while a resolve is in flight, callers get
 * the SAME promise instance. Success caches the name (or '::null::') for 24h;
 * failure caches '::fail::' for 300s. The returned promise never rejects.
 */
export function resolveEnsInBackground(address: `0x${string}`): Promise<void> {
  const key = address.toLowerCase();

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const cacheKey = `ens:${key}`;

  const task = (async (): Promise<void> => {
    try {
      const name = await mainnetClient.getEnsName({ address });

      // Cache the result (positive or negative) for 24h — setCached never
      // throws (quick-260610-sr0 invariant preserved): a cache-write
      // rejection must NOT discard a successfully resolved name (the L1
      // write always lands first).
      await setCached(cacheKey, name ?? '::null::', ENS_CACHE_TTL_SECONDS);

      getLogger().info(
        { event: 'ens_resolved', address: key, name: name ?? null },
        name ? 'ENS name resolved' : 'No ENS name for address',
      );
    } catch (err) {
      // RPC failure — cache the cooldown sentinel so a dead endpoint is
      // retried in minutes, never hammered per-request.
      getLogger().warn(
        {
          event: 'ens_resolve_failed',
          address: key,
          err: err instanceof Error ? err.message : String(err),
        },
        'ENS resolution failed — caching ::fail:: cooldown sentinel (retry in 300s)',
      );
      await setCached(cacheKey, ENS_FAIL_SENTINEL, ENS_FAIL_TTL_SECONDS);
    }
  })()
    // setCached/getLogger are never-throw by contract, but wrap defensively —
    // the stored promise must NEVER produce an unhandled rejection.
    .catch(() => {})
    .finally(() => {
      inFlight.delete(key);
    });

  // Store the fully-chained promise so awaiting it observes settlement AFTER
  // the dedup-map cleanup.
  inFlight.set(key, task);
  return task;
}
