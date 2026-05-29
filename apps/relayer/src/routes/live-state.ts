/**
 * GET /api/calls/:id/live-state
 *
 * Server-side proxy for FollowFadeMarket reserves + CallRegistry call metadata,
 * with Redis caching.
 *
 * Data flow:
 *   1. Check Redis cache key `livestate:{callId}` (4s TTL — shorter than 5s frontend poll)
 *   2. On cache miss:
 *      a. FFM reserves (followReserve/fadeReserve/follow|fadeTotalShares). Skipped
 *         when the FFM address is the zero placeholder (deferred deploy — WR-09).
 *      b. CallRegistry.getCall for real call metadata (caller, stake, conviction,
 *         expiry, createdAt, status, category, criteriaHash, callerExitedAt) — CR-04.
 *      c. statusVersion from Redis `status_version:{callId}` (OG cache-bust, D-09).
 *   3. Compute followPct from reserves
 *   4. Cache result with 4s TTL
 *
 * NOTE: subgraph/IPFS display fields (handle, marketLine, reasoning, criteriaText,
 * repScore) are not on-chain and remain Phase 7 subgraph wiring (IN-03); the client
 * falls back to its defaults for those while all on-chain facts are real.
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
import {
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

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

// ── CallRegistry.getCall slice (CR-04) ─────────────────────────────────────────
// Returns the full on-chain Call struct so /live-state can surface the real call
// metadata (status/expiry/stake/conviction/etc.) its consumers read, instead of
// returning only reserves and letting every metadata field fall back to a default.
const CALL_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getCall',
    stateMutability: 'view',
    inputs: [{ name: 'callId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'caller', type: 'address' },
          { name: 'stake', type: 'uint96' },
          { name: 'virtualFadeSeed', type: 'uint96' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'expiry', type: 'uint64' },
          { name: 'marketType', type: 'uint8' },
          { name: 'eventSubtype', type: 'uint8' },
          { name: 'category', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'conviction', type: 'uint8' },
          { name: 'openToChallenges', type: 'bool' },
          { name: 'callerExitedAt', type: 'uint64' },
          { name: 'outcome', type: 'uint8' },
          { name: 'duplicateHash', type: 'bytes32' },
          { name: 'criteriaHash', type: 'bytes32' },
          { name: 'assetA', type: 'uint256' },
          { name: 'assetB', type: 'uint256' },
          { name: 'targetValue', type: 'uint256' },
          { name: 'parentCallId', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

// Enum string maps mirroring the on-chain definitions (ICallRegistry.sol).
// CallStatus ordinals are stable: Live=0, Settled=1, Disputed=2, CallerExited=3
// (do NOT reorder — CallerExited is appended for ABI compat). Category ordinals:
// Majors=0, DeFi=1, Other=2.
const CALL_STATUS_LABELS = ['Live', 'Settled', 'Disputed', 'CallerExited'] as const;
const CATEGORY_LABELS = ['Majors', 'DeFi', 'Other'] as const;

function statusLabel(status: number): string {
  return CALL_STATUS_LABELS[status] ?? 'Live';
}

function categoryLabel(category: number): string {
  return CATEGORY_LABELS[category] ?? 'Majors';
}

// ── Cache config ──────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 4; // shorter than the 5s frontend poll interval

function cacheKey(callId: bigint): string {
  return `livestate:${callId.toString()}`;
}

// statusVersion Redis key — kept in sync with the notification fan-out worker
// (workers/notification-fanout.ts statusVersionKey). Used for OG cache-bust (D-09).
function statusVersionKey(callId: bigint): string {
  return `status_version:${callId.toString()}`;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ── Response type ─────────────────────────────────────────────────────────────

interface LiveStateResponse {
  // ── Reserves (FollowFadeMarket) ──
  followReserve: string;
  fadeReserve: string;
  followTotalShares: string;
  fadeTotalShares: string;
  followPct: number;
  // ── Call metadata (CallRegistry.getCall — CR-04) ──
  // These are the fields page.tsx#fetchCallData and layout.tsx#fetchCallMeta read.
  // Subgraph/IPFS-sourced display fields (handle, marketLine, reasoning,
  // criteriaText, repScore) are NOT on-chain and remain Phase 7 subgraph wiring
  // (IN-03); they are intentionally omitted so the client uses its defaults for
  // those, while every on-chain fact below is now real instead of a placeholder.
  id: string;
  caller: string;
  category: string;
  stake: string;
  conviction: number;
  expiry: string;
  createdAt: string;
  criteriaHash: string | null;
  status: string;
  callerExitedAt: string | null;
  // statusVersion drives the OG cache-bust (/og/{id}?v={statusVersion}, D-09).
  statusVersion: number;
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
        const callRegistryAddress = CALL_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`;

        // ── WR-09: short-circuit the known-zero FFM placeholder ───────────────
        // The FollowFadeMarket live deploy is deferred; its address is the zero
        // placeholder. Reading reserves against 0x0 is a guaranteed-useless RPC
        // round trip, so skip it and treat reserves as empty (50/50 split). Call
        // metadata still comes from the deployed CallRegistry below.
        const ffmDeployed = ffmAddress.toLowerCase() !== ZERO_ADDRESS;

        let followReserveBn = 0n;
        let fadeReserveBn = 0n;
        let followTotalSharesBn = 0n;
        let fadeTotalSharesBn = 0n;

        if (ffmDeployed) {
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

          followReserveBn = (followReserveResult.result ?? 0n) as bigint;
          fadeReserveBn = (fadeReserveResult.result ?? 0n) as bigint;
          followTotalSharesBn = (followSharesResult.result ?? 0n) as bigint;
          fadeTotalSharesBn = (fadeSharesResult.result ?? 0n) as bigint;
        } else {
          logger.info(
            { event: 'live_state_ffm_deferred', callId: callId.toString() },
            'FollowFadeMarket address is the zero placeholder — reserves default to empty (deferred deploy)',
          );
        }

        // ── CR-04: read real call metadata from the deployed CallRegistry ─────
        // getCall returns a zero-struct for out-of-range / nonexistent callIds.
        type CallStruct = {
          caller: `0x${string}`;
          stake: bigint;
          createdAt: bigint;
          expiry: bigint;
          category: number;
          status: number;
          conviction: number;
          callerExitedAt: bigint;
          criteriaHash: `0x${string}`;
        };

        let call: CallStruct | null = null;
        if (callRegistryAddress.toLowerCase() !== ZERO_ADDRESS) {
          try {
            const raw = (await publicClient.readContract({
              address: callRegistryAddress,
              abi: CALL_REGISTRY_ABI,
              functionName: 'getCall',
              args: [callId],
            })) as unknown as Record<string, unknown>;
            call = {
              caller: raw['caller'] as `0x${string}`,
              stake: raw['stake'] as bigint,
              createdAt: raw['createdAt'] as bigint,
              expiry: raw['expiry'] as bigint,
              category: Number(raw['category']),
              status: Number(raw['status']),
              conviction: Number(raw['conviction']),
              callerExitedAt: raw['callerExitedAt'] as bigint,
              criteriaHash: raw['criteriaHash'] as `0x${string}`,
            };
          } catch (callErr) {
            logger.warn(
              { event: 'live_state_getcall_failed', error: String(callErr), callId: callId.toString() },
              'CallRegistry.getCall failed — call metadata omitted from response',
            );
          }
        }

        // ── statusVersion (Redis) for OG cache-bust (D-09) ────────────────────
        let statusVersion = 0;
        try {
          const sv = await redis.get(statusVersionKey(callId));
          if (sv) statusVersion = parseInt(sv, 10) || 0;
        } catch (svErr) {
          logger.warn(
            { event: 'live_state_status_version_read_failed', error: String(svErr), callId: callId.toString() },
            'Redis statusVersion read failed — defaulting to 0',
          );
        }

        const total = followReserveBn + fadeReserveBn;
        const followPct = total > 0n
          ? Number((followReserveBn * 10000n) / total) / 100
          : 50;

        const criteriaHashHex = call?.criteriaHash;
        const hasCriteria =
          criteriaHashHex !== undefined &&
          criteriaHashHex !== '0x0000000000000000000000000000000000000000000000000000000000000000';

        const responseData: LiveStateResponse = {
          // reserves
          followReserve: followReserveBn.toString(),
          fadeReserve: fadeReserveBn.toString(),
          followTotalShares: followTotalSharesBn.toString(),
          fadeTotalShares: fadeTotalSharesBn.toString(),
          followPct,
          // call metadata (CR-04)
          id: callId.toString(),
          caller: call?.caller ?? '',
          category: call ? categoryLabel(call.category) : 'Majors',
          stake: (call?.stake ?? 0n).toString(),
          conviction: call?.conviction ?? 50,
          expiry: (call?.expiry ?? 0n).toString(),
          createdAt: (call?.createdAt ?? 0n).toString(),
          criteriaHash: hasCriteria ? (criteriaHashHex as string) : null,
          status: call ? statusLabel(call.status) : 'Live',
          callerExitedAt:
            call && call.callerExitedAt > 0n ? call.callerExitedAt.toString() : null,
          statusVersion,
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
