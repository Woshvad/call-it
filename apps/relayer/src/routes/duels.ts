/**
 * GET /api/duels
 *
 * Duels tab feed — active challenges merged with trending pins, sorted by
 * pot desc (trending first). Cached in Redis for 10s.
 *
 * Data flow:
 *   1. Check Redis cache key `duels_list:{queryHash}` (10s TTL)
 *   2. On cache miss:
 *      a. Query Postgres trending_duels WHERE trending_until > now()
 *      b. Query subgraph for active challenges (Proposed/Accepted) — paginated at 100/batch
 *      c. Merge: trending challenges annotated with isTrending:true surfaced first,
 *         then remaining active by pot desc; apply optional limit
 *   3. Cache merged result for 10s
 *   4. Return { duels: [...], count: N }
 *
 * Query params:
 *   status  — filter by status string (e.g. 'Accepted', 'Proposed')
 *   sort    — sort hint (reserved; currently pot desc is always used)
 *   limit   — max duels to return (default: 50)
 *
 * Log events:
 *   { event: 'duels_route_hit' }   — served from cache
 *   { event: 'duels_route_fetch' } — fetching from subgraph + Postgres
 *   { event: 'duels_route_error' } — unhandled failure
 *
 * Security:
 *   - No auth gate (public read — spec §18.1; T-03-05-05)
 *   - Query params are strings only — no injection surface (read-only GET)
 *
 * Requirements: SOCIAL-41, SOCIAL-48
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
import { getDb } from '../db/client.js';
import { trendingDuels, duelKings } from '../db/schema.js';
import { gt } from 'drizzle-orm';

// ── Cache config ──────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 10; // Duels tab is not live-polled at the 5s duel-live-state rate

function cacheKey(params: Record<string, string | undefined>): string {
  // Stable JSON key from query params
  const stable = JSON.stringify({
    status: params['status'] ?? '',
    sort: params['sort'] ?? '',
    limit: params['limit'] ?? '',
  });
  return `duels_list:${stable}`;
}

// ── Subgraph types ────────────────────────────────────────────────────────────

interface SubgraphChallenge {
  id: string;
  challengerStake: string;
  callerStake: string;
  status: string;
  proposedAt: string;
  acceptedAt: string | null;
  challenger: string;
  caller: string;
}

interface SubgraphChallengesResponse {
  data?: {
    challenges?: SubgraphChallenge[];
  };
  errors?: Array<{ message: string }>;
}

// ── Subgraph fetch (paginated) ────────────────────────────────────────────────

async function fetchActiveChallenges(
  subgraphUrl: string,
  statusFilter?: string,
): Promise<SubgraphChallenge[]> {
  if (!subgraphUrl) {
    return [];
  }

  const all: SubgraphChallenge[] = [];
  let skip = 0;
  const first = 100;

  // Status filter: default to Proposed + Accepted (active duels)
  const statusValues =
    statusFilter && statusFilter !== ''
      ? [statusFilter]
      : ['Proposed', 'Accepted'];

  while (true) {
    const query = `
      query GetActiveChallenges($statuses: [String!]!, $first: Int!, $skip: Int!) {
        challenges(
          where: { status_in: $statuses }
          first: $first
          skip: $skip
          orderBy: proposedAt
          orderDirection: desc
        ) {
          id
          challengerStake
          callerStake
          status
          proposedAt
          acceptedAt
          challenger
          caller
        }
      }
    `;

    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { statuses: statusValues, first, skip },
      }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph HTTP error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as SubgraphChallengesResponse;

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Subgraph query error: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    const challenges = json.data?.challenges ?? [];
    all.push(...challenges);

    if (challenges.length < first) break;
    skip += first;
  }

  return all;
}

// ── Compute pot from challenge stakes ─────────────────────────────────────────

function computePot(callerStake: string, challengerStake: string): bigint {
  try {
    const a = BigInt(callerStake);
    const b = BigInt(challengerStake);
    const matched = a < b ? a : b;
    return matched * 2n;
  } catch {
    return 0n;
  }
}

// ── Duel response shape ───────────────────────────────────────────────────────

interface DuelEntry {
  challengeId: string;
  challengerStake: string;
  callerStake: string;
  pot: string;
  status: string;
  proposedAt: string;
  acceptedAt: string | null;
  challenger: string;
  caller: string;
  isTrending: boolean;
  trendingUntil: string | null;
}

interface DuelKingEntry {
  winnerAddress: string;
  winStreak: number;
  highestPotUsdc: string;
  lastWinAt: string | null;
  weekAnchor: string;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function duelsRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Querystring: { status?: string; sort?: string; limit?: string } }>(
    '/api/duels',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            sort: { type: 'string' },
            limit: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();
      const redis = getRedis();
      const db = getDb();

      const { status, sort, limit: limitStr } = request.query;
      const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);

      const key = cacheKey({ status, sort, limit: limitStr });

      // ── Cache check ───────────────────────────────────────────────────────
      try {
        const cached = await redis.get(key);
        if (cached) {
          logger.info({ event: 'duels_route_hit' }, 'duels served from cache');
          const parsed = JSON.parse(cached) as { duels: DuelEntry[]; count: number; duelKing: DuelKingEntry | null };
          reply.header('x-source', 'cache');
          return reply.send(parsed);
        }
      } catch (err) {
        logger.warn({ event: 'duels_route_cache_read_failed', error: String(err) }, 'Redis cache read failed — fetching live');
      }

      logger.info({ event: 'duels_route_fetch' }, 'duels cache miss — fetching from subgraph + Postgres');

      try {
        const subgraphUrl =
          process.env.RELAYER_SUBGRAPH_URL ??
          process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
          '';

        // ── 1. Trending pins from Postgres ────────────────────────────────────
        const trendingRows = await db
          .select()
          .from(trendingDuels)
          .where(gt(trendingDuels.trendingUntil, new Date()));

        const trendingSet = new Set(trendingRows.map((r) => r.challengeId.toString()));
        const trendingByChallenge = new Map(trendingRows.map((r) => [r.challengeId.toString(), r]));

        // ── 2. Active challenges from subgraph ────────────────────────────────
        let subgraphChallenges: SubgraphChallenge[] = [];
        try {
          subgraphChallenges = await fetchActiveChallenges(subgraphUrl, status);
        } catch (err) {
          logger.warn({ event: 'duels_route_subgraph_failed', error: String(err) }, 'Subgraph fetch failed — returning trending pins only');
        }

        // ── 3. Build duel entries ──────────────────────────────────────────────
        const allDuels: DuelEntry[] = subgraphChallenges.map((c) => {
          const isTrending = trendingSet.has(c.id);
          const trendingRow = trendingByChallenge.get(c.id);
          return {
            challengeId: c.id,
            challengerStake: c.challengerStake,
            callerStake: c.callerStake,
            pot: computePot(c.callerStake, c.challengerStake).toString(),
            status: c.status,
            proposedAt: c.proposedAt,
            acceptedAt: c.acceptedAt ?? null,
            challenger: c.challenger,
            caller: c.caller,
            isTrending,
            trendingUntil: trendingRow ? trendingRow.trendingUntil.toISOString() : null,
          };
        });

        // ── 4. Sort: trending first, then by pot desc ─────────────────────────
        allDuels.sort((a, b) => {
          if (a.isTrending && !b.isTrending) return -1;
          if (!a.isTrending && b.isTrending) return 1;
          // Secondary sort: pot desc
          const potDiff = BigInt(b.pot) - BigInt(a.pot);
          if (potDiff > 0n) return 1;
          if (potDiff < 0n) return -1;
          return 0;
        });

        const limited = allDuels.slice(0, limit);

        // ── 5. Current Duel King (for banner) ─────────────────────────────────
        // Read the most recent duel_kings row (placeholder until Phase 4 settlement)
        let duelKing: DuelKingEntry | null = null;
        try {
          const kingRows = await db
            .select()
            .from(duelKings)
            .orderBy(duelKings.weekAnchor)
            .limit(1);
          if (kingRows.length > 0) {
            const king = kingRows[0]!;
            duelKing = {
              winnerAddress: king.winnerAddress,
              winStreak: king.winStreak,
              highestPotUsdc: king.highestPotUsdc,
              lastWinAt: king.lastWinAt ? king.lastWinAt.toISOString() : null,
              weekAnchor: king.weekAnchor.toISOString(),
            };
          }
        } catch (err) {
          logger.warn({ event: 'duels_route_king_failed', error: String(err) }, 'duelKings query failed — omitting from response');
        }

        const responseData = {
          duels: limited,
          count: limited.length,
          duelKing,
        };

        // ── Cache result ──────────────────────────────────────────────────────
        try {
          await redis.set(key, JSON.stringify(responseData), 'EX', CACHE_TTL_SECONDS);
        } catch (cacheErr) {
          logger.warn({ event: 'duels_route_cache_write_failed', error: String(cacheErr) }, 'Redis cache write failed');
        }

        reply.header('x-source', 'live');
        return reply.send(responseData);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ event: 'duels_route_error', error: message }, 'Failed to fetch duels');
        return reply.status(503).send({ error: 'duels_fetch_error', message: 'Failed to fetch duels' });
      }
    },
  );
}
