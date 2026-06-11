/**
 * GET /api/duels/:id/live-state
 *
 * Server-side proxy for ChallengeEscrow state + FollowFadeMarket reserves,
 * with Redis caching. Mirrors live-state.ts structure exactly.
 *
 * Data flow:
 *   1. Check Redis cache key `duel_livestate:{challengeId}` (4s TTL — shorter than 5s frontend poll)
 *   2. On cache miss:
 *      a. ChallengeEscrow.getChallenge(challengeId) — caller, challenger, stakes, status, winner
 *      b. FFM.followReserve(callId) + FFM.fadeReserve(callId) — backer pool depth
 *      c. CallRegistry.getCall(callId).expiry — challenge expiry from parent call
 *   3. Compute pot = min(callerStake, challengerStake) * 2
 *   4. Cache result with 4s TTL
 *
 * NOTE: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA is the zero address (placeholder pending
 * 03-03 operator deploy). The zero-address guard skips RPC reads against 0x0 and
 * returns a zeroed placeholder response rather than throwing — consistent with the
 * WR-09 pattern in live-state.ts for the FFM placeholder. See addresses.ts for the
 * deploy note and STATE.md "Deferred Live Infra (Phase 3)" item 1.
 *
 * Log events:
 *   { event: 'duel_live_state_cache_hit' }    — served from Redis
 *   { event: 'duel_live_state_cache_miss' }   — fetched from RPC
 *   { event: 'duel_live_state_error' }        — RPC or cache failure
 *   { event: 'duel_live_state_ce_deferred' }  — ChallengeEscrow is the zero placeholder
 *
 * Security:
 *   - No auth gate (public read — spec §18.1)
 *   - RPC URL held server-side only (T-03-05-06)
 *   - challengeId parsed to BigInt before use in cache key (T-03-05-01)
 *
 * Requirements: SOCIAL-40, SOCIAL-42
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { fallback, createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { getCached, setCached } from '../lib/cache.js';
import { getLogger } from '../lib/logger.js';
import {
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

// ── ABI — ChallengeEscrow.getChallenge ───────────────────────────────────────

const CHALLENGE_ESCROW_ABI = [
  {
    type: 'function',
    name: 'getChallenge',
    stateMutability: 'view',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'callId', type: 'uint256' },
          { name: 'caller', type: 'address' },
          { name: 'challenger', type: 'address' },
          { name: 'callerStake', type: 'uint96' },
          { name: 'challengerStake', type: 'uint96' },
          { name: 'proposedAt', type: 'uint64' },
          { name: 'winner', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'callerClaimed', type: 'bool' },
          { name: 'challengerClaimed', type: 'bool' },
          { name: 'overageClaimed', type: 'bool' },
        ],
      },
    ],
  },
] as const;

// ── ABI — FollowFadeMarket reserves slice ─────────────────────────────────────

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
] as const;

// ── ABI — CallRegistry.getCall (expiry field only needed here) ────────────────

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

// ── Challenge status ordinals (mirror ChallengeEscrow.sol ChallengeStatus enum) ─
// Proposed=0, Accepted=1, Rejected=2, Refunded=3, Settled=4
const CHALLENGE_STATUS_LABELS = ['Proposed', 'Accepted', 'Rejected', 'Refunded', 'Settled'] as const;

function challengeStatusLabel(status: number): string {
  return CHALLENGE_STATUS_LABELS[status] ?? 'Proposed';
}

// ── Cache config ──────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 4; // shorter than the 5s frontend poll interval

function cacheKey(challengeId: bigint): string {
  return `duel_livestate:${challengeId.toString()}`;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ── Response type ─────────────────────────────────────────────────────────────

interface DuelLiveStateResponse {
  challengeId: string;
  callId: string;
  caller: string;
  challenger: string;
  callerStake: string;
  challengerStake: string;
  /** Effective pot: min(callerStake, challengerStake) * 2 (USDC micro-units) */
  pot: string;
  status: string;
  winner: string | null;
  followReserve: string;
  fadeReserve: string;
  /** Parent call expiry (unix seconds) */
  expiry: string;
  /** True when ChallengeEscrow address is the zero placeholder — Phase 3 pre-deploy state */
  deferred: boolean;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function duelLiveStateRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/api/duels/:id/live-state',
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

      // T-03-05-01: parse challengeId to BigInt before any string interpolation
      let challengeId: bigint;
      try {
        challengeId = BigInt(request.params.id);
      } catch {
        return reply.status(400).send({ error: 'invalid_challenge_id', message: 'challengeId must be a numeric string' });
      }

      const key = cacheKey(challengeId);

      // ── Cache check (L1-first — quick-260611-h36; never throws) ────────────
      {
        const cached = await getCached<DuelLiveStateResponse>(key, CACHE_TTL_SECONDS);
        if (cached) {
          logger.info({ event: 'duel_live_state_cache_hit', challengeId: challengeId.toString() }, 'duel-live-state served from cache');
          reply.header('x-source', 'cache');
          return reply.send(cached);
        }
      }

      // ── Cache miss: fetch from RPC ─────────────────────────────────────────
      logger.info({ event: 'duel_live_state_cache_miss', challengeId: challengeId.toString() }, 'duel-live-state cache miss — fetching from RPC');

      try {
        const rpcUrl =
          process.env.RPC_URL_ARBITRUM_SEPOLIA ?? process.env.ARBITRUM_SEPOLIA_RPC_URL;
        const publicClient = createPublicClient({
          chain: arbitrumSepolia,
          transport: fallback([http(rpcUrl), http()]),
        });

        const ceAddress = CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`;
        const ffmAddress = FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`;
        const crAddress = CALL_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`;

        // ── Zero-address guard: ChallengeEscrow pending 03-03 operator deploy ─
        // Mirrors the WR-09 FFM guard in live-state.ts. Reading against 0x0 is a
        // guaranteed-useless RPC round trip; return a zeroed placeholder so the
        // frontend can render a "not yet deployed" state rather than a 503.
        const ceDeployed = ceAddress.toLowerCase() !== ZERO_ADDRESS;

        if (!ceDeployed) {
          logger.info(
            { event: 'duel_live_state_ce_deferred', challengeId: challengeId.toString() },
            'ChallengeEscrow address is the zero placeholder — returning deferred placeholder (03-03 deploy pending)',
          );

          const deferredResponse: DuelLiveStateResponse = {
            challengeId: challengeId.toString(),
            callId: '0',
            caller: ZERO_ADDRESS,
            challenger: ZERO_ADDRESS,
            callerStake: '0',
            challengerStake: '0',
            pot: '0',
            status: 'Proposed',
            winner: null,
            followReserve: '0',
            fadeReserve: '0',
            expiry: '0',
            deferred: true,
          };

          await setCached(key, deferredResponse, CACHE_TTL_SECONDS);

          reply.header('x-source', 'deferred');
          return reply.send(deferredResponse);
        }

        // ── RPC reads: ChallengeEscrow.getChallenge ───────────────────────────
        type ChallengeStruct = {
          callId: bigint;
          caller: `0x${string}`;
          challenger: `0x${string}`;
          callerStake: bigint;
          challengerStake: bigint;
          proposedAt: bigint;
          winner: `0x${string}`;
          status: number;
          callerClaimed: boolean;
          challengerClaimed: boolean;
          overageClaimed: boolean;
        };

        const raw = (await publicClient.readContract({
          address: ceAddress,
          abi: CHALLENGE_ESCROW_ABI,
          functionName: 'getChallenge',
          args: [challengeId],
        })) as unknown as Record<string, unknown>;

        const challenge: ChallengeStruct = {
          callId: raw['callId'] as bigint,
          caller: raw['caller'] as `0x${string}`,
          challenger: raw['challenger'] as `0x${string}`,
          callerStake: raw['callerStake'] as bigint,
          challengerStake: raw['challengerStake'] as bigint,
          proposedAt: raw['proposedAt'] as bigint,
          winner: raw['winner'] as `0x${string}`,
          status: Number(raw['status']),
          callerClaimed: raw['callerClaimed'] as boolean,
          challengerClaimed: raw['challengerClaimed'] as boolean,
          overageClaimed: raw['overageClaimed'] as boolean,
        };

        const callId = challenge.callId;

        // ── RPC reads: FFM reserves + CR expiry (parallel) ───────────────────
        const ffmDeployed = ffmAddress.toLowerCase() !== ZERO_ADDRESS;
        const crDeployed = crAddress.toLowerCase() !== ZERO_ADDRESS;

        let followReserveBn = 0n;
        let fadeReserveBn = 0n;
        let expiry = 0n;

        if (ffmDeployed && crDeployed) {
          const [followResult, fadeResult, callResult] = await Promise.allSettled([
            publicClient.readContract({
              address: ffmAddress,
              abi: FFM_ABI,
              functionName: 'followReserve',
              args: [callId],
            }),
            publicClient.readContract({
              address: ffmAddress,
              abi: FFM_ABI,
              functionName: 'fadeReserve',
              args: [callId],
            }),
            publicClient.readContract({
              address: crAddress,
              abi: CALL_REGISTRY_ABI,
              functionName: 'getCall',
              args: [callId],
            }),
          ]);

          if (followResult.status === 'fulfilled') followReserveBn = followResult.value as bigint;
          if (fadeResult.status === 'fulfilled') fadeReserveBn = fadeResult.value as bigint;
          if (callResult.status === 'fulfilled') {
            const callRaw = callResult.value as unknown as Record<string, unknown>;
            expiry = (callRaw['expiry'] as bigint) ?? 0n;
          }
        } else if (!ffmDeployed) {
          logger.info(
            { event: 'duel_live_state_ffm_deferred', challengeId: challengeId.toString() },
            'FollowFadeMarket address is the zero placeholder — reserves default to empty',
          );
        }

        // ── pot = min(callerStake, challengerStake) * 2 ───────────────────────
        const callerStake = challenge.callerStake;
        const challengerStake = challenge.challengerStake;
        const matchedStake = callerStake < challengerStake ? callerStake : challengerStake;
        const pot = matchedStake * 2n;

        const winnerAddress = challenge.winner;
        const hasWinner =
          winnerAddress !== undefined &&
          winnerAddress.toLowerCase() !== ZERO_ADDRESS;

        const responseData: DuelLiveStateResponse = {
          challengeId: challengeId.toString(),
          callId: callId.toString(),
          caller: challenge.caller,
          challenger: challenge.challenger,
          callerStake: callerStake.toString(),
          challengerStake: challengerStake.toString(),
          pot: pot.toString(),
          status: challengeStatusLabel(challenge.status),
          winner: hasWinner ? winnerAddress : null,
          followReserve: followReserveBn.toString(),
          fadeReserve: fadeReserveBn.toString(),
          expiry: expiry.toString(),
          deferred: false,
        };

        // ── Cache result (L1 + best-effort Redis) ─────────────────────────────
        await setCached(key, responseData, CACHE_TTL_SECONDS);

        reply.header('x-source', 'rpc');
        return reply.send(responseData);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'duel_live_state_error', error: message, challengeId: challengeId.toString() },
          'Failed to fetch duel live state from RPC',
        );
        return reply.status(503).send({ error: 'rpc_error', message: 'Failed to fetch duel live state' });
      }
    },
  );
}
