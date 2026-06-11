/**
 * ENS Reverse-Record Resolver with 24h cache (D-13).
 *
 * Resolution is server-side only — never happens in the browser.
 * Uses a dedicated Mainnet RPC (ENS_MAINNET_RPC_URL) separate from the
 * Arbitrum RPC. This is a hard requirement since ENS lives on Ethereum mainnet.
 *
 * Unconfigured = honest null (quick-260611-p9a): when ENS_MAINNET_RPC_URL is
 * unset, resolveEns returns null immediately — no cache read, no RPC attempt.
 * Previously `http(undefined)` fell through to viem's default public mainnet
 * RPC, which hangs/throttles from Fly, burning the full 5s leg timeout on
 * every uncached profile request; combined with CR-01 (timed-out legs are
 * never cached) the 60s profile cache could never fill, so every profile
 * click paid ~6s. Honest D-07 degrade: ENS not configured = no ENS name.
 * When the env IS set, behavior is unchanged (bounded transport + public
 * failover below stays).
 *
 * Cache strategy (quick-260611-h36: L1-first via lib/cache.ts — survives a
 * dead Redis on the single-Fly-machine relayer):
 *   - Positive hit: stores the ENS name with 24h TTL
 *   - Negative hit: stores '::null::' sentinel with 24h TTL
 *     (avoids hammering the RPC for addresses with no ENS name)
 *   - RPC failure: returns null WITHOUT caching (retry on next request)
 *
 * NOTE: values now persist through the JSON cache helper, so the Redis-side
 * representation is the JSON string (e.g. `"::null::"`). This is safe: the
 * cache is ephemeral, and legacy non-JSON entries fail JSON.parse inside
 * getCached and simply read as misses (one extra RPC resolve, then re-cached).
 *
 * RESEARCH Pattern 12 — lines 1097-1122.
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

/** 24h cache TTL (seconds). */
const ENS_CACHE_TTL_SECONDS = 86400;

/**
 * Resolve the ENS reverse-record for an address.
 *
 * Priority: L1 memory cache → Redis (guarded) → viem getEnsName on Mainnet.
 * Negative-cache sentinel '::null::' prevents repeat RPC calls for non-ENS addresses.
 *
 * @param address - Ethereum address (checksummed or lowercased, both accepted)
 * @param _redis - DEPRECATED (quick-260611-h36): kept for call-site signature
 *   compatibility; caching now flows through the L1-first lib/cache.ts helper.
 * @returns ENS name string or null (no name / RPC error)
 */
export async function resolveEns(
  address: `0x${string}`,
  _redis?: Redis,
): Promise<string | null> {
  // quick-260611-p9a: configured-check guard — read PER CALL (matches the
  // repo's testable env pattern; a module-scope read would freeze the value
  // at first import). Unconfigured ENS = immediate honest null: no cache
  // read, no RPC attempt, no per-request logging (this is the common path on
  // Fly today — log spam would be worse than silence).
  const ensConfigured = Boolean(process.env.ENS_MAINNET_RPC_URL);
  if (!ensConfigured) {
    return null;
  }

  const cacheKey = `ens:${address.toLowerCase()}`;

  // Check cache first — getCached never throws (quick-260611-h36): a Redis
  // quota rejection (Upstash free tier exhausted) degrades to the in-process
  // L1, then to a cache miss — never a failure.
  const cached = await getCached<string>(cacheKey, ENS_CACHE_TTL_SECONDS);

  if (cached !== null) {
    // Negative-cache hit: sentinel means "we tried and there was no ENS name"
    if (cached === '::null::') {
      return null;
    }
    return cached;
  }

  // Cache miss — resolve via Mainnet RPC
  try {
    const name = await mainnetClient.getEnsName({ address });

    // Cache the result (positive or negative) for 24h — setCached never
    // throws (quick-260610-sr0 invariant preserved): a cache-write rejection
    // must NOT discard a successfully resolved name.
    await setCached(cacheKey, name ?? '::null::', ENS_CACHE_TTL_SECONDS);

    getLogger().info(
      { event: 'ens_resolved', address: address.toLowerCase(), name: name ?? null },
      name ? 'ENS name resolved' : 'No ENS name for address',
    );

    return name ?? null;
  } catch (err) {
    // RPC failure — return null but do NOT cache (let it retry on next request)
    getLogger().warn(
      {
        event: 'ens_resolve_failed',
        address: address.toLowerCase(),
        err: err instanceof Error ? err.message : String(err),
      },
      'ENS resolution failed — not caching',
    );
    return null;
  }
}
