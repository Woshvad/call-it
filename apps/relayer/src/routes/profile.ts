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
import { queryProfileSocials } from '../lib/subgraph-client.js';
import { withTimeout, TimeoutError } from '../lib/with-timeout.js';

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
// quick-260610-sr0: bounded transport — the public-RPC fallback tarpit-
// throttles, and viem's default timeout/retries never settle the read legs.
const arbitrumClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(
    process.env.RPC_URL_ARBITRUM_SEPOLIA ??
    process.env.ARBITRUM_SEPOLIA_RPC_URL ??
    process.env.NEXT_PUBLIC_SUBGRAPH_URL?.replace('/subgraphs', '') ??
    'https://sepolia-rollup.arbitrum.io/rpc',
    { timeout: 5_000, retryCount: 1 },
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

// ── Env timeout parsing (quick-260610-sr0, WR-02) ─────────────────────────────
// Number('') === 0 and Number('5s') === NaN — both make setTimeout fire
// immediately, instantly degrading every response. Guard with isFinite + > 0.

function parseTimeout(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── Deadline-degraded fallback body (quick-260610-sr0) ───────────────────────
// Shape is IDENTICAL to ProfileResponseBody's truncated path so the web's
// getProfile keeps rendering consistently; globalRep 100 matches the REP-01
// initial value the normal truncated path returns.

function buildDegradedBody(address: string): ProfileResponseBody {
  return {
    address,
    handle: truncateAddress(address),
    source: 'truncated',
    displayHandle: '',
    ensName: null,
    twitterHandle: null,
    farcasterHandle: null,
    totalCalls: 0,
    settledCalls: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    globalRep: 100,
    verifiedX: false,
    verifiedFc: false,
  };
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
      // quick-260610-sr0: the initial cache read runs BEFORE the route deadline
      // starts, so it gets its own 2s bound (a stalled Redis must not push the
      // worst case past ~deadline + 2s). A timeout rejects into the catch below
      // and is treated as a cache miss.
      try {
        const cached = await withTimeout(redis.get(cacheKey), 2_000, 'profile-cache-read');
        if (cached) {
          logger.info({ event: 'profile_cache_hit', address: normalizedAddress }, 'Profile served from cache');
          const parsed = JSON.parse(cached) as ProfileResponseBody;
          reply.header('x-source', 'cache');
          return reply.send(parsed);
        }
      } catch (cacheErr) {
        logger.warn({ event: 'profile_cache_read_failed', err: String(cacheErr) }, 'Cache read failed');
      }

      // quick-260610-sr0: env-tunable timeouts, read PER REQUEST so tests can
      // tune them without re-importing the module. Malformed values (NaN, 0,
      // negative) fall back to defaults instead of instantly degrading (WR-02).
      const legTimeoutMs = parseTimeout(process.env.PROFILE_LEG_TIMEOUT_MS, 5_000);
      const deadlineMs = parseTimeout(process.env.PROFILE_DEADLINE_MS, 8_000);

      // ── Bounded resolution block (quick-260610-sr0) ─────────────────────────
      // By construction this function cannot reject: allSettled absorbs every
      // leg rejection (including withTimeout timeouts — the existing fulfilled-
      // status mapping degrades them to fallback values) and the cache write is
      // guarded.
      const resolveProfile = async (): Promise<ProfileResponseBody> => {
        // ── Concurrent reads: ENS + ProfileRegistry + subgraph socials ────────
        const [ensName, displayHandle, settledCallsRaw, socials] = await Promise.allSettled([
          withTimeout(resolveEns(address as `0x${string}`, redis), legTimeoutMs, 'ens'),
          withTimeout(
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
            legTimeoutMs,
            'displayHandle',
          ),
          withTimeout(
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
            legTimeoutMs,
            'settledCalls',
          ),
          // D-08: social verification handles from the subgraph Profile entity.
          // Wrapped so a subgraph failure degrades to null (never breaks the public
          // profile read — Pitfall 5).
          withTimeout(
            (async () => {
              try {
                return await queryProfileSocials(address);
              } catch (socialsErr) {
                logger.warn(
                  { event: 'profile_socials_read_failed', address: normalizedAddress, err: String(socialsErr) },
                  'Subgraph social read failed — degrading verifiedX/verifiedFc to false',
                );
                return { twitterHandle: null, farcasterHandle: null };
              }
            })(),
            legTimeoutMs,
            'socials',
          ),
        ]);

        const resolvedEns = ensName.status === 'fulfilled' ? ensName.value : null;
        const resolvedDisplayHandle = displayHandle.status === 'fulfilled' ? (displayHandle.value as string) : '';
        const resolvedSettledCalls = settledCallsRaw.status === 'fulfilled' ? Number(settledCallsRaw.value as bigint) : 0;

        // D-08: social handles derived from the subgraph (set on SocialLinked, cleared
        // to null on SocialUnlinked — so unlink correctly flips verified flags to false).
        const resolvedSocials =
          socials.status === 'fulfilled'
            ? socials.value
            : { twitterHandle: null, farcasterHandle: null };
        const twitterHandle: string | null = resolvedSocials.twitterHandle;
        const farcasterHandle: string | null = resolvedSocials.farcasterHandle;

        // ── AUTH-11 handle priority chain ──────────────────────────────────────
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
          // D-08: verification flags derived from the subgraph-linked handles.
          // null handle (never linked / unlinked) → false; AUTH-10 zero mechanical effect.
          verifiedX: !!twitterHandle,
          verifiedFc: !!farcasterHandle,
        };

        // ── Cache the response — ONLY if fully resolved (CR-01) ────────────────
        // If ANY leg settled as a withTimeout TimeoutError, the body is degraded
        // or partial (e.g. a tarpit-throttled displayHandle read silently drops
        // the user's on-chain identity). Caching it would serve the wrong
        // profile for 60s with x-source: cache and no degraded marker — so a
        // timed-out resolution is never cached.
        const anyLegTimedOut = [ensName, displayHandle, settledCallsRaw, socials].some(
          (r) => r.status === 'rejected' && r.reason instanceof TimeoutError,
        );

        if (anyLegTimedOut) {
          logger.warn(
            { event: 'profile_cache_skipped_degraded', address: normalizedAddress },
            'Leg timeout — not caching degraded/partial profile body',
          );
        } else {
          try {
            await redis.set(cacheKey, JSON.stringify(responseBody), 'EX', 60);
          } catch (cacheErr) {
            logger.warn({ event: 'profile_cache_write_failed', err: String(cacheErr) }, 'Cache write failed');
          }
        }

        logger.info(
          { event: 'profile_resolved', address: normalizedAddress, source, handle },
          'Profile resolved',
        );

        return responseBody;
      };

      // ── Hard route-level deadline (defense-in-depth) ─────────────────────────
      // Per-leg timeouts bound each leg; this deadline bounds the whole block
      // even if a leg timeout somehow fails. Degraded bodies are NEVER cached
      // (a transient stall must not poison the 60s cache): the deadline path
      // below doesn't write, and the still-running resolveProfile skips its own
      // cache write whenever any leg timed out (CR-01) — only fully-resolved
      // profiles ever reach the 60s cache.
      try {
        const responseBody = await withTimeout(resolveProfile(), deadlineMs, 'profile_deadline');
        reply.header('x-source', 'live');
        return reply.send(responseBody);
      } catch {
        logger.warn(
          { event: 'profile_deadline_degraded', address: normalizedAddress, deadlineMs },
          'Profile resolution exceeded route deadline — responding with degraded truncated body',
        );
        reply.header('x-source', 'live');
        reply.header('x-degraded', 'deadline');
        return reply.send(buildDegradedBody(address));
      }
    },
  );
}
