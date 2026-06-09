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
 * NOTE: `marketLine` (the authoritative human-readable market statement, D-05) is
 * now served from the relayer call_statement store via resolveCallStatement, closing
 * the IN-03 omission. The remaining subgraph/IPFS display fields (handle, reasoning,
 * criteriaText, repScore) are not on-chain and remain Phase 7 subgraph wiring; the
 * client falls back to its defaults for those while all on-chain facts are real.
 * When no statement is stored, marketLine is omitted and the client/OG falls back to
 * the subgraph templated mirror (D-03 — no IPFS on the hot path).
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
import { resolveCallStatement } from '../db/criteria-store.js';
import { querySettledFields } from '../lib/subgraph-client.js';
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
// Outcome enum (ICallRegistry.sol, cross-checked 08-05): Pending=0, CallerWon=1,
// CallerLost=2. This MATCHES the /og/[callId] route's `callerWon = outcome === 1`
// convention so the page and the OG card never disagree (T-08-05-03).
const OUTCOME_LABELS = ['Pending', 'CallerWon', 'CallerLost'] as const;

function statusLabel(status: number): string {
  return CALL_STATUS_LABELS[status] ?? 'Live';
}

function categoryLabel(category: number): string {
  return CATEGORY_LABELS[category] ?? 'Majors';
}

function outcomeLabel(outcome: number): string {
  return OUTCOME_LABELS[outcome] ?? 'Pending';
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
  // The remaining subgraph/IPFS-sourced display fields (handle, reasoning,
  // criteriaText, repScore) are NOT on-chain and remain Phase 7 subgraph wiring;
  // they are intentionally omitted so the client uses its defaults for those,
  // while every on-chain fact below is now real instead of a placeholder.
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
  // marketLine: the authoritative human-readable market statement (D-05, IN-03
  // closure). Sourced from the relayer call_statement store via resolveCallStatement.
  // Omitted (undefined) when no statement has been stored yet — the client/OG then
  // falls back to the subgraph templated mirror (D-03; no IPFS on the hot path).
  marketLine?: string;
  // ── Settled outcome fields (08-05 — GAP 1, Core Value: truthful receipts) ──
  // ONLY present when status is Settled/Disputed AND the on-chain outcome is
  // non-Pending. These let the receipt PAGE drive getOutcomeWordResult from the
  // SAME data the /og card uses, so a settled LOSS renders/shares 'LOUD AND WRONG'
  // — never the old fabricated 'CALLED IT'. Omitted entirely for Live/non-settled
  // calls (the page's settled branch keys off `outcome` presence). repDelta and
  // fadeRealShare are subgraph-sourced (fail-safe: absent on a subgraph outage, so
  // the page degrades to neutral, NEVER to a fake win — T-08-05-02).
  outcome?: string;
  repDelta?: number;
  fadeRealShare?: number;
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
        // Prod injects RPC_URL_ARBITRUM_SEPOLIA (GCP/Fly secret); local .env.local
        // uses ARBITRUM_SEPOLIA_RPC_URL. Read both (undefined => viem public RPC).
        const rpcUrl =
          process.env.RPC_URL_ARBITRUM_SEPOLIA ?? process.env.ARBITRUM_SEPOLIA_RPC_URL;
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
          outcome: number;
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
              outcome: Number(raw['outcome']),
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

        // ── marketLine (D-05) — authoritative statement from the relayer store ──
        // FAIL-SAFE: a DB outage here must not 502 the whole live-state read (all the
        // on-chain facts above are still valid). On any error, leave marketLine
        // undefined so the client/OG falls back to the subgraph templated mirror (D-03).
        let marketLine: string | undefined;
        try {
          const stored = await resolveCallStatement(Number(callId));
          if (stored !== null) marketLine = stored;
        } catch (statementErr) {
          logger.warn(
            { event: 'live_state_statement_read_failed', error: String(statementErr), callId: callId.toString() },
            'call_statement read failed — marketLine omitted, client falls back to subgraph templated mirror (D-03)',
          );
        }

        // ── Settled outcome fields (08-05 — GAP 1, Core Value) ─────────────────
        // Surface the real outcome word + repDelta + fadeRealShare ONLY for a
        // SETTLED/DISPUTED call whose on-chain outcome is non-Pending. The receipt
        // PAGE reads these from /live-state and drives getOutcomeWordResult with
        // them, so a settled LOSS renders/shares 'LOUD AND WRONG' — never a fake
        // 'CALLED IT'. The on-chain outcome enum (CR.getCall) is the source of truth
        // for win/loss; the subgraph repDelta/fadeRealShare only refine the §14.1
        // word (CONTRARIAN HIT / COLD CALL) and the REP display.
        let outcome: string | undefined;
        let repDelta: number | undefined;
        let fadeRealShare: number | undefined;
        if (call) {
          const isSettledOrDisputed = call.status === 1 || call.status === 2;
          // Only emit `outcome` for a non-Pending settled/disputed call — a Live or
          // Pending call leaves it absent so the page's settled branch (keyed off
          // outcome presence) never fabricates a word (CRITICAL).
          if (isSettledOrDisputed && call.outcome !== 0) {
            outcome = outcomeLabel(call.outcome);
            // FAIL-SAFE: a subgraph outage here must NOT 502 the live-state read —
            // querySettledFields swallows all errors and returns null fields. The
            // page then shows neutral/known on-chain outcome, NEVER a fabricated win.
            try {
              const settled = await querySettledFields(callId.toString());
              if (settled.repDelta !== null) repDelta = settled.repDelta;
              if (settled.fadeRealShare !== null) fadeRealShare = settled.fadeRealShare;
            } catch (settledErr) {
              logger.warn(
                {
                  event: 'live_state_settled_fields_failed',
                  error: String(settledErr),
                  callId: callId.toString(),
                },
                'querySettledFields failed — repDelta/fadeRealShare omitted (page degrades to neutral, never a fake win)',
              );
            }
          }
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
          // marketLine (D-05) — only present when an authoritative statement is stored;
          // otherwise omitted so the spread keeps it undefined (subgraph fallback, D-03).
          ...(marketLine !== undefined ? { marketLine } : {}),
          // Settled outcome fields (08-05) — conditional spread keeps them absent for
          // Live/non-settled calls so the page never sees a phantom outcome (CRITICAL).
          ...(outcome !== undefined ? { outcome } : {}),
          ...(repDelta !== undefined ? { repDelta } : {}),
          ...(fadeRealShare !== undefined ? { fadeRealShare } : {}),
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
