/**
 * POST /api/calls/dup-check — duplicate-hash pre-check endpoint (Plan 08, D-22).
 *
 * Purpose: Before the user finishes composing a call, the frontend debounces
 * (400ms) and calls this endpoint to check if a near-identical call already exists.
 * Prevents the DuplicateCall(existingCallId) contract revert at the UX layer.
 *
 * Hash computation mirrors DuplicateHashLib.compute() exactly (D-29 parity):
 *   computeDuplicateHash({ marketType, assetA, metric, targetValue, deadlineDay })
 *   where deadlineDay = dayBucketUtc(expiry)
 *
 * PITFALL-12: The hash bucket is UTC-day-floored, NOT user-local-day.
 * A user picking "11:32 PM PST" is actually "2026-05-23 07:32:00 UTC" — different day bucket.
 * The frontend DeadlinePicker surfaces this via inline label; this endpoint uses it canonically.
 *
 * Redis cache: dup-check:{hash} with 60s TTL — prevents hot-path RPC spam during
 * debounced typing storms (T-01-53).
 *
 * Auth: Privy session required (privySessionPreHandler).
 *
 * Requirement: CALL-25, CALL-26, CALL-49, D-22
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { createPublicClient } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { privySessionPreHandler } from '../lib/privy-auth.js';
import { makeSepoliaTransport } from '../lib/sepolia-transport.js';
import { getCached, setCached } from '../lib/cache.js';
import { getLogger } from '../lib/logger.js';
import {
  computeDuplicateHash,
  dayBucketUtc,
  MARKET_TYPES,
  EVENT_SUBTYPES,
  MARKET_TYPE_TO_UINT,
  EVENT_SUBTYPE_TO_UINT,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

// ─── Request/Response types ───────────────────────────────────────────────────

const dupCheckBodySchema = z.object({
  /** Market type string (e.g. 'priceTarget', 'spreadVs', 'event') */
  marketType: z.enum(MARKET_TYPES),
  /** Primary asset identifier — Pyth feed key as hex string or numeric string */
  assetA: z.string().min(1, { message: 'assetA is required' }),
  /**
   * EventSubtype string (required when marketType === 'event').
   * For priceTarget / spreadVs, pass 'none' or omit.
   */
  eventSubtype: z.enum(EVENT_SUBTYPES).optional().default('none'),
  /** Target value as string (bigint representation) */
  targetValue: z
    .string()
    .min(1, { message: 'targetValue is required' })
    .regex(/^\d+$/, { message: 'targetValue must be a non-negative integer string' }),
  /** Expiry as Unix timestamp in seconds (number) */
  expiry: z.number().int().positive({ message: 'expiry must be a positive integer' }),
});

type DupCheckBody = z.output<typeof dupCheckBodySchema>;

interface DupCheckResponse {
  exists: boolean;
  existingCallId?: number;
  hash?: string;
}

// ─── Minimal ERC-20-like ABI for activeDuplicateHashes view ──────────────────

const callRegistryDupCheckAbi = [
  {
    type: 'function',
    name: 'activeDuplicateHashes',
    inputs: [{ name: 'hash', type: 'bytes32' }],
    outputs: [{ name: 'callId', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Convert an asset identifier string to a uint256 bigint.
 * - If hex (0x…), parse directly
 * - If numeric string, parse as decimal
 * - Otherwise hash the string (bytes32 keccak256 → treat as uint256)
 */
function assetToUint256(assetA: string): bigint {
  const trimmed = assetA.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return BigInt(trimmed);
  }
  if (/^\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  // For symbol strings (e.g. "BTC"), use a deterministic numeric encoding.
  // The frontend always sends the Pyth feed key (bytes32 hex) for price targets.
  // For event-type calls, assetA may be a symbol string — encode as 0 in that case.
  // This matches the contract which uses the uint256 feedId, not the symbol.
  return 0n;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function callsDupCheckRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.post<{ Body: DupCheckBody }>(
    '/api/calls/dup-check',
    {
      preHandler: privySessionPreHandler,
    },
    async (request, reply) => {
      const logger = getLogger();

      // ─── 1. Parse body ────────────────────────────────────────────────
      const parsed = dupCheckBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'invalid_request',
          message: 'Invalid dup-check request body',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const { marketType, assetA, eventSubtype, targetValue, expiry } = parsed.data;

      // ─── 2. Compute duplicate hash ────────────────────────────────────
      const marketTypeUint = MARKET_TYPE_TO_UINT[marketType];
      const assetAUint = assetToUint256(assetA);
      const metricUint = BigInt(EVENT_SUBTYPE_TO_UINT[eventSubtype ?? 'none']);
      const targetValueBig = BigInt(targetValue);
      // PITFALL-12: Use UTC-day bucket for the expiry (not user-local-day)
      const deadlineDay = dayBucketUtc(BigInt(expiry));

      const hash = computeDuplicateHash({
        marketType: marketTypeUint,
        assetA: assetAUint,
        metric: metricUint,
        targetValue: targetValueBig,
        deadlineDay,
      });

      // ─── 3. Cache check (TTL 60s — D-22; L1-first, quick-260611-h36) ──
      // Previously an UNGUARDED redis.get — a dead Redis hard-500'd the
      // route. getCached never throws: a Redis outage skips the cache and
      // proceeds straight to the on-chain activeDuplicateHashes read below
      // (which already fail-opens; the contract is the enforcement backstop).
      const cacheKey = `dup-check:${hash}`;

      const cachedResult = await getCached<DupCheckResponse>(cacheKey, 60);
      if (cachedResult !== null) {
        logger.info(
          {
            event: 'dup_check_cache_hit',
            hash,
            exists: cachedResult.exists,
          },
          'dup-check served from Redis cache',
        );
        return reply.status(200).send(cachedResult);
      }

      // ─── 4. On-chain read via viem ────────────────────────────────────
      // quick-260613: Arbitrum Sepolia is where the relayer + CallRegistry live.
      // RPC resolution + failover owned by makeSepoliaTransport (quick-260613-r3u);
      // CallRegistry address resolved from @call-it/shared (env override retained
      // for test/local pinning). Previously this read the wrong chain (Arbitrum
      // One) with never-set RPC env vars — a silent no-op dup check.
      const callRegistryAddress = (
        process.env['NEXT_PUBLIC_CALL_REGISTRY_ADDRESS'] ??
        process.env['CALL_REGISTRY_ADDRESS'] ??
        CALL_REGISTRY_ARBITRUM_SEPOLIA
      ) as `0x${string}`;

      const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: makeSepoliaTransport(),
      });

      let response: DupCheckResponse;

      try {
        const existingCallId = await publicClient.readContract({
          address: callRegistryAddress,
          abi: callRegistryDupCheckAbi,
          functionName: 'activeDuplicateHashes',
          args: [hash],
        });

        if (existingCallId > 0n) {
          response = {
            exists: true,
            existingCallId: Number(existingCallId),
            hash,
          };
        } else {
          response = { exists: false, hash };
        }
      } catch (err) {
        // If the contract address is a zero address (not yet deployed), return not-exists
        if (
          callRegistryAddress === '0x0000000000000000000000000000000000000000'
        ) {
          logger.warn(
            { event: 'dup_check_no_contract', callRegistryAddress },
            'CallRegistry not deployed — dup-check returning not-exists',
          );
          response = { exists: false, hash };
        } else {
          logger.error(
            { event: 'dup_check_rpc_error', err: String(err) },
            'RPC error reading activeDuplicateHashes',
          );
          // Fail-open: surface as not-exists (contract will enforce as backstop)
          response = { exists: false, hash };
        }
      }

      // ─── 5. Cache result (60s TTL — L1 + best-effort Redis) ──────────
      await setCached(cacheKey, response, 60);

      logger.info(
        {
          event: 'dup_check_result',
          hash,
          exists: response.exists,
          existingCallId: response.existingCallId,
        },
        'dup-check complete',
      );

      return reply.status(200).send(response);
    },
  );
}
