/**
 * ENS Reverse-Record Resolver with 24h Redis cache (D-13).
 *
 * Resolution is server-side only — never happens in the browser.
 * Uses a dedicated Mainnet RPC (ENS_MAINNET_RPC_URL) separate from the
 * Arbitrum RPC. This is a hard requirement since ENS lives on Ethereum mainnet.
 *
 * Cache strategy:
 *   - Positive hit: stores the ENS name with 24h TTL
 *   - Negative hit: stores '::null::' sentinel with 24h TTL
 *     (avoids hammering the RPC for addresses with no ENS name)
 *   - RPC failure: returns null WITHOUT caching (retry on next request)
 *
 * RESEARCH Pattern 12 — lines 1097-1122.
 *
 * Requirements: D-13, AUTH-11
 * Security: T-01-60 (ENS cache poisoning — mitigated by dedicated Mainnet RPC + 24h TTL)
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import type { Redis } from 'ioredis';
import { getLogger } from './logger.js';

// ── Mainnet client (ENS is on Ethereum mainnet, NOT Arbitrum) ────────────────

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ENS_MAINNET_RPC_URL ?? 'https://eth-mainnet.g.alchemy.com/v2/demo'),
});

/**
 * Resolve the ENS reverse-record for an address.
 *
 * Priority: Redis cache → viem getEnsName on Mainnet.
 * Negative-cache sentinel '::null::' prevents repeat RPC calls for non-ENS addresses.
 *
 * @param address - Ethereum address (checksummed or lowercased, both accepted)
 * @param redis - ioredis client for cache reads/writes
 * @returns ENS name string or null (no name / RPC error)
 */
export async function resolveEns(
  address: `0x${string}`,
  redis: Redis,
): Promise<string | null> {
  const cacheKey = `ens:${address.toLowerCase()}`;

  // Check cache first
  const cached = await redis.get(cacheKey);

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

    // Cache the result (positive or negative) for 24h
    await redis.set(cacheKey, name ?? '::null::', 'EX', 86400);

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
