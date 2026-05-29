/**
 * GET /api/calls/:id/live-state
 *
 * Server-side proxy for FollowFadeMarket contract reads with Redis caching.
 *
 * Data flow:
 *   1. Check Redis cache key `livestate:{callId}` (4s TTL — shorter than 5s frontend poll)
 *   2. On cache miss: viem readContracts for followReserve, fadeReserve,
 *      followTotalShares, fadeTotalShares from FFM contract on Arbitrum Sepolia
 *   3. Compute followPct from reserves
 *   4. Cache result with 4s TTL
 *
 * Log events:
 *   { event: 'live_state_cache_hit' }   — served from Redis
 *   { event: 'live_state_cache_miss' }  — fetched from RPC
 *   { event: 'live_state_error' }       — RPC or cache failure
 *
 * Security:
 *   - No auth gate (public read — spec §18.1)
 *   - RPC URL held server-side only (T-02-07-05)
 *
 * Requirements: SOCIAL-23, SOCIAL-44, D-07
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
import { FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA } from '@call-it/shared';

// ── ABI — minimal slice for readContracts ─────────────────────────────────────

const FFM_ABI = [
  {
    type: 'function',
    name: 'followReserve',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fadeReserve',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'followTotalShares',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fadeTotalShares',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ── Cache config ──────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 4; // shorter than the 5s frontend poll interval

function cacheKey(callId: bigint): string {
  return `livestate:${callId.toString()}`;
}

// ── Response type ─────────────────────────────────────────────────────────────

interface LiveStateResponse {
  followReserve: string;
  fadeReserve: string;
  followTotalShares: string;
  fadeTotalShares: string;
  followPct: number;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function liveStateRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/api/calls/:id/live-state',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();
      const redis = getRedis();

      // Parse callId — BigInt for contract reads
      let callId: bigint;
      try {
        callId = BigInt(request.params.id);
      } catch {
        return reply.status(400).send({ error: 'invalid_call_id', message: 'callId must be a numeric string' });
      }

      const key = cacheKey(callId);

      // ── Cache check ───────────────────────────────────────────────────────
      try {
        const cached = await redis.get(key);
        if (cached) {
          logger.info({ event: 'live_state_cache_hit', callId: callId.toString() }, 'live-state served from cache');
          const parsed = JSON.parse(cached) as LiveStateResponse;
          reply.header('x-source', 'cache');
          return reply.send(parsed);
        }
      } catch (err) {
        logger.warn(
          { event: 'live_state_cache_read_failed', error: String(err), callId: callId.toString() },
          'Redis cache read failed — proceeding to RPC',
        );
      }

      // ── RPC fetch via viem readContracts ──────────────────────────────────
      logger.info({ event: 'live_state_cache_miss', callId: callId.toString() }, 'live-state cache miss — fetching from RPC');

      try {
        const rpcUrl = process.env.RPC_URL_ARBITRUM_SEPOLIA;
        const publicClient = createPublicClient({
          chain: arbitrumSepolia,
          transport: http(rpcUrl),
        });

        const ffmAddress = FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`;

        const [followReserveResult, fadeReserveResult, followSharesResult, fadeSharesResult] =
          await publicClient.multicall({
            contracts: [
              { address: ffmAddress, abi: FFM_ABI, functionName: 'followReserve', args: [callId] },
              { address: ffmAddress, abi: FFM_ABI, functionName: 'fadeReserve', args: [callId] },
              { address: ffmAddress, abi: FFM_ABI, functionName: 'followTotalShares', args: [callId] },
              { address: ffmAddress, abi: FFM_ABI, functionName: 'fadeTotalShares', args: [callId] },
            ],
            allowFailure: true,
          });

        const followReserveBn = (followReserveResult.result ?? 0n) as bigint;
        const fadeReserveBn = (fadeReserveResult.result ?? 0n) as bigint;
        const followTotalSharesBn = (followSharesResult.result ?? 0n) as bigint;
        const fadeTotalSharesBn = (fadeSharesResult.result ?? 0n) as bigint;

        const total = followReserveBn + fadeReserveBn;
        const followPct = total > 0n
          ? Number((followReserveBn * 10000n) / total) / 100
          : 50;

        const responseData: LiveStateResponse = {
          followReserve: followReserveBn.toString(),
          fadeReserve: fadeReserveBn.toString(),
          followTotalShares: followTotalSharesBn.toString(),
          fadeTotalShares: fadeTotalSharesBn.toString(),
          followPct,
        };

        // ── Cache result ────────────────────────────────────────────────────
        try {
          await redis.set(key, JSON.stringify(responseData), 'EX', CACHE_TTL_SECONDS);
        } catch (cacheErr) {
          logger.warn(
            { event: 'live_state_cache_write_failed', error: String(cacheErr), callId: callId.toString() },
            'Redis cache write failed — response not cached',
          );
        }

        reply.header('x-source', 'rpc');
        return reply.send(responseData);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'live_state_error', error: message, callId: callId.toString() },
          'Failed to fetch live state from RPC',
        );
        return reply.status(502).send({ error: 'rpc_error', message: 'Failed to fetch live state' });
      }
    },
  );
}
