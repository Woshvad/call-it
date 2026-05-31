/**
 * GET /api/profile/:address — server-side profile resolution + ENS lookup.
 *
 * Reads:
 *   - ENS reverse-record via resolveEns() (D-13, RESEARCH Pattern 12)
 *   - ProfileRegistry.displayHandle(address) via viem readContract
 *   - ProfileRegistry.settledCalls(address) via viem readContract
 *   - Social handles from ProfileRegistry._socials (via individual reads)
 *
 * Handle priority (AUTH-11):
 *   1. displayHandle (on-chain override, AUTH-35) — highest priority
 *   2. ENS reverse-record
 *   3. Twitter handle (from _socials mapping, Phase 1.5 wires the link)
 *   4. Farcaster handle (from _socials mapping)
 *   5. Truncated 0x address (fallback)
 *
 * Response cache: Redis profile:{address.toLowerCase()} with 60s TTL.
 *
 * Security:
 *   - Public read (no auth gate needed)
 *   - ENS_MAINNET_RPC_URL secret stays server-side
 *   - AUTH-44: address NEVER rendered as the handle field (truncated format is not display)
 *
 * Requirements: AUTH-11, AUTH-35, AUTH-44, D-13, REP-17, REP-18
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createPublicClient, http, isAddress } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
import { resolveEns } from '../lib/ens-resolver.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HandleSource = 'display_handle' | 'ens' | 'twitter' | 'farcaster' | 'truncated';

export interface ProfileResponseBody {
  address: string;
  handle: string;
  source: HandleSource;
  displayHandle: string;
  ensName: string | null;
  twitterHandle: string | null;
  farcasterHandle: string | null;
  totalCalls: number;
  settledCalls: number;
  wins: number;
  losses: number;
  streak: number;
  globalRep: number;
  verifiedX: boolean;
  verifiedFc: boolean;
}

// ── Viem client for Arbitrum (ProfileRegistry reads) ─────────────────────────

// Phase 1: reads against Sepolia (staging). Phase 7: switch to mainnet.
const arbitrumClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(
    process.env.RPC_URL_ARBITRUM_SEPOLIA ??
    process.env.ARBITRUM_SEPOLIA_RPC_URL ??
    process.env.NEXT_PUBLIC_SUBGRAPH_URL?.replace('/subgraphs', '') ??
    'https://sepolia-rollup.arbitrum.io/rpc'
  ),
});

// ProfileRegistry address from env or constants
function getProfileRegistryAddress(): `0x${string}` {
  return (
    (process.env.NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS as `0x${string}`) ??
    '0x0000000000000000000000000000000000000000'
  );
}

// ── Minimal ProfileRegistry ABI for reads ────────────────────────────────────

const PROFILE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'displayHandle',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'settledCalls',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ── Handle truncation helper (AUTH-44) ────────────────────────────────────────

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function profileRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Params: { address: string } }>(
    '/api/profile/:address',
    {
      schema: {
        params: {
          type: 'object',
          required: ['address'],
          properties: {
            address: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { address } = request.params;
      const logger = getLogger();
      const redis = getRedis();

      // Validate address format (must be 0x + 40 hex chars)
      if (!isAddress(address)) {
        return reply.status(400).send({
          error: 'invalid_address',
          message: 'Address must be a valid Ethereum address (0x + 40 hex chars)',
        });
      }

      const normalizedAddress = address.toLowerCase() as `0x${string}`;
      const cacheKey = `profile:${normalizedAddress}`;

      // ── 60s Redis cache ────────────────────────────────────────────────────
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger.info({ event: 'profile_cache_hit', address: normalizedAddress }, 'Profile served from cache');
          const parsed = JSON.parse(cached) as ProfileResponseBody;
          reply.header('x-source', 'cache');
          return reply.send(parsed);
        }
      } catch (cacheErr) {
        logger.warn({ event: 'profile_cache_read_failed', err: String(cacheErr) }, 'Cache read failed');
      }

      // ── Concurrent reads: ENS + ProfileRegistry ─────────────────────────────
      const [ensName, displayHandle, settledCallsRaw] = await Promise.allSettled([
        resolveEns(address as `0x${string}`, redis),
        (async () => {
          try {
            return await arbitrumClient.readContract({
              address: getProfileRegistryAddress(),
              abi: PROFILE_REGISTRY_ABI,
              functionName: 'displayHandle',
              args: [address as `0x${string}`],
            });
          } catch {
            return '';
          }
        })(),
        (async () => {
          try {
            return await arbitrumClient.readContract({
              address: getProfileRegistryAddress(),
              abi: PROFILE_REGISTRY_ABI,
              functionName: 'settledCalls',
              args: [address as `0x${string}`],
            });
          } catch {
            return BigInt(0);
          }
        })(),
      ]);

      const resolvedEns = ensName.status === 'fulfilled' ? ensName.value : null;
      const resolvedDisplayHandle = displayHandle.status === 'fulfilled' ? (displayHandle.value as string) : '';
      const resolvedSettledCalls = settledCallsRaw.status === 'fulfilled' ? Number(settledCallsRaw.value as bigint) : 0;

      // Phase 1: social handles are not yet stored on-chain (Phase 1.5 wires linkTwitter/linkFarcaster)
      // The _socials mapping is not yet readable from this route.
      // For Phase 1, twitter/farcaster handles come from Privy OAuth links in the future.
      const twitterHandle: string | null = null;
      const farcasterHandle: string | null = null;

      // ── AUTH-11 handle priority chain ────────────────────────────────────────
      let handle: string;
      let source: HandleSource;

      if (resolvedDisplayHandle && resolvedDisplayHandle.length > 0) {
        // AUTH-35: on-chain display handle override takes highest priority
        handle = resolvedDisplayHandle;
        source = 'display_handle';
      } else if (resolvedEns) {
        handle = resolvedEns;
        source = 'ens';
      } else if (twitterHandle) {
        handle = `@${twitterHandle}`;
        source = 'twitter';
      } else if (farcasterHandle) {
        handle = `@${farcasterHandle}`;
        source = 'farcaster';
      } else {
        // AUTH-44: truncated format is not the wallet address — it's a display alias
        handle = truncateAddress(address);
        source = 'truncated';
      }

      const responseBody: ProfileResponseBody = {
        address,
        handle,
        source,
        displayHandle: resolvedDisplayHandle,
        ensName: resolvedEns,
        twitterHandle,
        farcasterHandle,
        totalCalls: 0, // Phase 1: not yet indexed (Phase 7 reads from subgraph)
        settledCalls: resolvedSettledCalls,
        wins: 0,       // Phase 4: settlement manager writes wins/losses
        losses: 0,
        streak: 0,
        globalRep: 100, // Phase 1 initial value (REP-01)
        verifiedX: false,   // Phase 1.5 wires onchain social link verification
        verifiedFc: false,
      };

      // ── Cache the response ────────────────────────────────────────────────────
      try {
        await redis.set(cacheKey, JSON.stringify(responseBody), 'EX', 60);
      } catch (cacheErr) {
        logger.warn({ event: 'profile_cache_write_failed', err: String(cacheErr) }, 'Cache write failed');
      }

      logger.info(
        { event: 'profile_resolved', address: normalizedAddress, source, handle },
        'Profile resolved',
      );

      reply.header('x-source', 'live');
      return reply.send(responseBody);
    },
  );
}
