/**
 * POST /api/calls/preflight — server-side gate check before user signs userOp (Plan 08, D-28).
 *
 * Purpose: The publish modal calls this endpoint BEFORE asking the user to sign.
 * If any gate fails, field-level errors are returned (D-31) and the form shows
 * inline errors WITHOUT the user wasting a signature.
 *
 * Gate sequence (mirrors CallRegistry._executeCreate):
 *   Gate Zod:   Parse via createCallSchemaStrict (D-29 — same schema as RHF form)
 *   Gate 6.1:   Stake bounds — [MIN_STAKE, MAX_STAKE] in USDC base units
 *   Gate 6.2:   Duplicate hash — activeDuplicateHashes(hash) === 0 (CALL-25/26)
 *   Gate 6.3:   Conviction floor — if settledCalls < 10 AND conviction >= 85 → suggestedConviction = 84
 *   CALL-34:    TVL cap — currentTvl + stake + CREATION_FEE <= tvlCap
 *   CALL-35/36: USDC pre-checks — allowance(user, CallRegistry) >= stake+fee, balance(user) >= stake+fee
 *
 * Auth: Privy session required (privySessionPreHandler).
 *       The user's wallet address is obtained from the Privy session userId by mapping
 *       via the request body's `callerAddress` field (user-provided, not trusted as auth).
 *       The session just proves the user is authenticated — the on-chain reads use the
 *       user-supplied callerAddress.
 *
 * D-29: createCallSchemaStrict is imported from @call-it/shared — the same source as the
 * RHF form's zodResolver. Parity is structural (same module, same parse logic).
 *
 * Requirement: CALL-25, CALL-34, CALL-35, CALL-36, D-28, D-29, D-31
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { createPublicClient, http, keccak256, toBytes } from 'viem';
import { arbitrum } from 'viem/chains';
import { privySessionPreHandler } from '../lib/privy-auth.js';
import { getLogger } from '../lib/logger.js';
import {
  createCallSchemaStrict,
  computeDuplicateHash,
  dayBucketUtc,
  MARKET_TYPE_TO_UINT,
  EVENT_SUBTYPE_TO_UINT,
  CREATION_FEE,
  HIGH_CONVICTION_THRESHOLD,
  CONVICTION_AUTOCAP,
  CONVICTION_FLOOR_MIN_CALLS,
} from '@call-it/shared';

// ─── JSON-safe body schema (strings → bigints for HTTP transport) ─────────────
// JSON cannot carry BigInt natively. The frontend serializes bigint fields as strings.
// This wrapper schema coerces strings to BigInt before createCallSchemaStrict.

const httpBodyPreprocessSchema = z.object({
  marketType: z.string(),
  eventSubtype: z.string().optional(),
  category: z.string(),
  assetA: z.string(),
  assetB: z.string().optional(),
  // Bigint fields arrive as strings over HTTP
  targetValue: z.union([z.string(), z.bigint()]).transform((v) => BigInt(v)),
  expiry: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
  stake: z.union([z.string(), z.bigint()]).transform((v) => BigInt(v)),
  conviction: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  criteriaText: z.string().optional(),
  openToChallenges: z.union([z.boolean(), z.string()]).transform((v) =>
    typeof v === 'string' ? v === 'true' : v,
  ),
  parentCallId: z.union([z.string(), z.bigint()]).transform((v) => BigInt(v)).optional(),
  callerSettledCalls: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  // callerAddress is extra (not in createCallSchema) — used for on-chain reads
  callerAddress: z.string().optional(),
});

// ─── Minimal ABIs for on-chain reads ─────────────────────────────────────────

const callRegistryPreflightAbi = [
  {
    type: 'function',
    name: 'currentTvl',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tvlCap',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'activeDuplicateHashes',
    inputs: [{ name: 'hash', type: 'bytes32' }],
    outputs: [{ name: 'callId', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const usdcPreflightAbi = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const profileRegistryPreflightAbi = [
  {
    type: 'function',
    name: 'settledCalls',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ─── Error structure (D-31 field-level errors) ────────────────────────────────

interface PreflightFieldError {
  field: string;
  code: string;
  message: string;
}

interface PreflightSuccessResponse {
  ok: true;
  hash: string;
  settledCalls: number;
  suggestedConviction: number;
  criteriaHash: string;
}

interface PreflightFailResponse {
  ok: false;
  errors: PreflightFieldError[];
}

// ─── Helper: asset identifier → uint256 ──────────────────────────────────────

function assetToUint256(assetA: string): bigint {
  const trimmed = assetA.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return BigInt(trimmed);
  }
  if (/^\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  return 0n;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function callsPreflightRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.post<{ Body: unknown }>(
    '/api/calls/preflight',
    {
      preHandler: privySessionPreHandler,
    },
    async (request, reply) => {
      const logger = getLogger();
      const errors: PreflightFieldError[] = [];

      // ─── 1. Parse body — first preprocess (string→bigint), then strict schema ──
      const rawBody = request.body as Record<string, unknown>;

      const preProcessed = httpBodyPreprocessSchema.safeParse(rawBody);
      if (!preProcessed.success) {
        const zodErrors: PreflightFieldError[] = preProcessed.error.errors.map((issue) => ({
          field: issue.path.join('.') || 'root',
          code: issue.code,
          message: issue.message,
        }));
        return reply.status(422).send({
          ok: false,
          errors: zodErrors,
        } satisfies PreflightFailResponse);
      }

      // Now validate through createCallSchemaStrict (D-29 parity)
      const { callerAddress: rawCallerAddress, ...callInput } = preProcessed.data;
      const callerAddress = rawCallerAddress ?? '';

      const parsed = createCallSchemaStrict.safeParse(callInput);
      if (!parsed.success) {
        // Filter out conviction warning issues (isWarning: true) — these are non-blocking
        const blockingErrors = parsed.error.errors.filter(
          (issue) =>
            // Skip conviction-cap warning (it's informational, handled in suggestedConviction below)
            !(
              issue.path[0] === 'conviction' &&
              (issue as { params?: { isWarning?: boolean } }).params?.isWarning === true
            ),
        );

        if (blockingErrors.length > 0) {
          const zodErrors: PreflightFieldError[] = blockingErrors.map((issue) => ({
            field: issue.path.join('.') || 'root',
            code: issue.code,
            message: issue.message,
          }));
          return reply.status(422).send({
            ok: false,
            errors: zodErrors,
          } satisfies PreflightFailResponse);
        }
      }

      // Use preProcessed data (which has the same fields as createCallSchemaStrict input)
      const input = callInput;

      // ─── 2. Compute duplicate hash (PITFALL-12: UTC day bucket) ───────
      const marketType = input.marketType as import('@call-it/shared').MarketType;
      const eventSubtype = (input.eventSubtype ?? 'none') as import('@call-it/shared').EventSubtype;
      const marketTypeUint = MARKET_TYPE_TO_UINT[marketType];
      const assetAUint = assetToUint256(input.assetA);
      const metricUint = BigInt(EVENT_SUBTYPE_TO_UINT[eventSubtype]);
      const deadlineDay = dayBucketUtc(input.expiry);

      const hash = computeDuplicateHash({
        marketType: marketTypeUint,
        assetA: assetAUint,
        metric: metricUint,
        targetValue: BigInt(input.targetValue),
        deadlineDay,
      });

      // Compute criteriaHash (keccak256 of the criteria text, or bytes32(0) if none)
      const criteriaHash =
        input.criteriaText && input.criteriaText.length > 0
          ? keccak256(toBytes(input.criteriaText))
          : ('0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`);

      // ─── 3. On-chain reads (parallel where possible) ──────────────────
      const callRegistryAddress = (
        process.env['NEXT_PUBLIC_CALL_REGISTRY_ADDRESS'] ??
        process.env['CALL_REGISTRY_ADDRESS'] ??
        '0x0000000000000000000000000000000000000000'
      ) as `0x${string}`;

      const profileRegistryAddress = (
        process.env['NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS'] ??
        process.env['PROFILE_REGISTRY_ADDRESS'] ??
        '0x0000000000000000000000000000000000000000'
      ) as `0x${string}`;

      // Native USDC on Arbitrum One
      const usdcAddress = (
        process.env['NEXT_PUBLIC_USDC_ADDRESS'] ??
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
      ) as `0x${string}`;

      const rpcUrl = process.env['ALCHEMY_RPC_URL'] ?? process.env['ARBITRUM_RPC_URL'];
      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(rpcUrl),
      });

      const contractsDeployed =
        callRegistryAddress !== '0x0000000000000000000000000000000000000000';

      let currentTvl = 0n;
      let tvlCap = 5_000_000_000n; // 5000 USDC default
      let usdcAllowance = 0n;
      let usdcBalance = 0n;
      let settledCallsRaw = 0n;
      let existingCallId = 0n;

      if (contractsDeployed && callerAddress && callerAddress.startsWith('0x')) {
        try {
          const results = await Promise.allSettled([
            publicClient.readContract({
              address: callRegistryAddress,
              abi: callRegistryPreflightAbi,
              functionName: 'currentTvl',
            }),
            publicClient.readContract({
              address: callRegistryAddress,
              abi: callRegistryPreflightAbi,
              functionName: 'tvlCap',
            }),
            publicClient.readContract({
              address: usdcAddress,
              abi: usdcPreflightAbi,
              functionName: 'allowance',
              args: [callerAddress as `0x${string}`, callRegistryAddress],
            }),
            publicClient.readContract({
              address: usdcAddress,
              abi: usdcPreflightAbi,
              functionName: 'balanceOf',
              args: [callerAddress as `0x${string}`],
            }),
            publicClient.readContract({
              address: profileRegistryAddress,
              abi: profileRegistryPreflightAbi,
              functionName: 'settledCalls',
              args: [callerAddress as `0x${string}`],
            }),
            publicClient.readContract({
              address: callRegistryAddress,
              abi: callRegistryPreflightAbi,
              functionName: 'activeDuplicateHashes',
              args: [hash],
            }),
          ]);

          if (results[0].status === 'fulfilled') currentTvl = results[0].value as bigint;
          if (results[1].status === 'fulfilled') tvlCap = results[1].value as bigint;
          if (results[2].status === 'fulfilled') usdcAllowance = results[2].value as bigint;
          if (results[3].status === 'fulfilled') usdcBalance = results[3].value as bigint;
          if (results[4].status === 'fulfilled') settledCallsRaw = results[4].value as bigint;
          if (results[5].status === 'fulfilled') existingCallId = results[5].value as bigint;
        } catch (err) {
          logger.warn(
            { event: 'preflight_rpc_error', err: String(err) },
            'RPC error during preflight on-chain reads — proceeding with defaults',
          );
        }
      } else if (!contractsDeployed) {
        logger.warn(
          { event: 'preflight_no_contract', callRegistryAddress },
          'CallRegistry not deployed — skipping on-chain reads',
        );
      }

      const settledCalls = Number(settledCallsRaw);
      const requiredAmount = BigInt(input.stake) + CREATION_FEE;

      // ─── 4. Gate checks (push D-31 field errors) ──────────────────────

      // CALL-34: TVL cap check
      if (contractsDeployed) {
        const tvlAfter = currentTvl + requiredAmount;
        if (tvlAfter > tvlCap) {
          errors.push({
            field: 'stake',
            code: 'tvl_cap_reached',
            message: `The protocol's TVL cap would be exceeded. Available headroom: ${tvlCap - currentTvl} base units USDC.`,
          });
        }

        // CALL-35: USDC allowance check
        if (usdcAllowance < requiredAmount) {
          errors.push({
            field: 'stake',
            code: 'insufficient_allowance',
            message: `Insufficient USDC allowance. Need ${requiredAmount} but have ${usdcAllowance}.`,
          });
        }

        // CALL-36: USDC balance check
        if (usdcBalance < requiredAmount) {
          errors.push({
            field: 'stake',
            code: 'insufficient_balance',
            message: `Insufficient USDC balance. Need ${requiredAmount} but have ${usdcBalance}.`,
          });
        }

        // Gate 6.2: Duplicate hash check (CALL-25/26)
        if (existingCallId > 0n) {
          errors.push({
            field: 'root',
            code: 'duplicate_call',
            message: `A nearly identical call already exists (ID: ${existingCallId}). Quote it instead.`,
          });
        }
      }

      // ─── 5. Return 422 if any errors ──────────────────────────────────
      if (errors.length > 0) {
        logger.info(
          {
            event: 'preflight_fail',
            errorCodes: errors.map((e) => e.code),
            privyUserId: request.privyUserId,
          },
          'preflight gate failed',
        );
        return reply.status(422).send({
          ok: false,
          errors,
        } satisfies PreflightFailResponse);
      }

      // ─── 6. Conviction cap suggestion (Gate 6.3 — not a block, informational) ──
      const convictionVal = Number(input.conviction);
      const suggestedConviction =
        convictionVal >= HIGH_CONVICTION_THRESHOLD &&
        settledCalls < CONVICTION_FLOOR_MIN_CALLS
          ? CONVICTION_AUTOCAP
          : convictionVal;

      logger.info(
        {
          event: 'preflight_pass',
          hash,
          settledCalls,
          suggestedConviction,
          privyUserId: request.privyUserId,
        },
        'preflight all gates passed',
      );

      return reply.status(200).send({
        ok: true,
        hash,
        settledCalls,
        suggestedConviction,
        criteriaHash,
      } satisfies PreflightSuccessResponse);
    },
  );
}
