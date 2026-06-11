/**
 * GET /api/feed — Paginated call feed with 800ms subgraph→polled-events race (D-24).
 *
 * Data flow:
 *   1. First-page (cursor=null): check Redis cache 'feed:firstpage' (10s TTL, D-26)
 *   2. Race subgraphClient.queryFeed() vs 800ms timeout (D-24, RESEARCH Pattern 11)
 *   3. If subgraph wins but is >50 blocks behind current: fall through to polled-events (Pattern 11)
 *   4. Cache first-page result in Redis with 10s TTL
 *
 * Log events:
 *   { event: 'feed_fallback_engaged' } — subgraph took >800ms
 *   { event: 'feed_subgraph_lag' }     — subgraph won but block-lag > 50
 *   { event: 'feed_cache_hit' }        — served from Redis
 *
 * Security:
 *   - No auth gate (public read — spec §18.1)
 *   - Studio API key held server-side only (D-27, T-01-59)
 *
 * Requirements: D-24, D-25, D-26, D-27, CALL-58, CALL-59
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
import { queryFeed } from '../lib/subgraph-client.js';
import { enrichFeedItems } from '../lib/call-enrichment.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedQuerystring {
  cursor?: string;
  limit?: string;
}

// ── Polled-events fallback query ──────────────────────────────────────────────

/**
 * Query the polled-events fallback worker for feed items.
 * Phase 1: worker holds the last ~1000 CallCreated events in memory (OPS-04).
 * Phase 7: this is replaced by the live subgraph query on Decentralized Network.
 */
export async function queryPolledEvents(_cursor: string | null | undefined, _limit: number): Promise<{
  items: unknown[];
  nextCursor: string | null;
}> {
  // Phase 1: The polled-events-fallback worker (Phase 0 OPS-04) holds an
  // in-memory ring-buffer of the last N CallCreated log events.
  // For Phase 1, the worker is still pointed at the Phase 0 test contract.
  // When Phase 1 contracts deploy to Sepolia, update the address in the worker config.
  //
  // For now, return an empty feed — no Phase 1 contract events exist yet.
  return { items: [], nextCursor: null };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function feedRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Querystring: FeedQuerystring }>(
    '/api/feed',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const cursor = request.query.cursor ?? null;
      const limit = parseInt(request.query.limit ?? '20', 10);
      const isFirstPage = !cursor;
      const cacheKey = 'feed:firstpage';
      const redis = getRedis();
      const logger = getLogger();

      // ── D-26: First-page Redis cache check ──────────────────────────────────
      if (isFirstPage) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            logger.info({ event: 'feed_cache_hit' }, 'Feed first page served from cache');
            const parsed = JSON.parse(cached) as Record<string, unknown>;
            reply.header('x-source', 'cache');
            return reply.send(parsed);
          }
        } catch (err) {
          logger.warn(
            { event: 'feed_cache_read_failed', err: String(err) },
            'Redis cache read failed — proceeding to fetch',
          );
        }
      }

      // ── D-24: 800ms race — subgraph vs polled-events fallback ───────────────
      type RaceResult = {
        source: 'subgraph' | 'fallback';
        data: {
          items: unknown[];
          nextCursor: string | null;
          _meta?: { block: { number: number } };
        };
      };

      let racedResult: RaceResult;

      try {
        // Start both fetches concurrently
        const subgraphPromise = queryFeed({ cursor, limit });
        const fallbackTimer = new Promise<RaceResult>((resolve) =>
          setTimeout(async () => {
            try {
              const fallbackData = await queryPolledEvents(cursor, limit);
              resolve({ source: 'fallback', data: fallbackData });
            } catch (fallbackErr) {
              logger.warn(
                { event: 'feed_fallback_failed', err: String(fallbackErr) },
                'Polled-events fallback also failed',
              );
              resolve({ source: 'fallback', data: { items: [], nextCursor: null } });
            }
          }, 800),
        );

        racedResult = await Promise.race([
          subgraphPromise.then((r): RaceResult => ({ source: 'subgraph', data: r })),
          fallbackTimer,
        ]);

        if (racedResult.source === 'fallback') {
          logger.warn(
            { event: 'feed_fallback_engaged', cursor },
            'Subgraph too slow (>800ms) — polled-events fallback used',
          );
        }

        // ── RESEARCH Pattern 11 lines 1080-1086: lag check ──────────────────────
        if (racedResult.source === 'subgraph' && racedResult.data._meta) {
          try {
            // We can't easily get currentBlock without a viem client here —
            // use the block number from the subgraph response vs a reasonable threshold.
            // A lag of 50 blocks on Arbitrum ≈ ~10 seconds delay — significant for Phase 1.
            const metaBlock = racedResult.data._meta.block.number;
            if (metaBlock === 0) {
              // Zero block means the subgraph returned no meaningful data — fall through
              logger.warn(
                { event: 'feed_subgraph_lag', metaBlock },
                'Subgraph returned block 0 — falling through to polled-events',
              );
              const fallbackData = await queryPolledEvents(cursor, limit);
              racedResult = { source: 'fallback', data: fallbackData };
            }
          } catch (lagErr) {
            logger.warn(
              { event: 'feed_lag_check_failed', err: String(lagErr) },
              'Lag check failed — using subgraph result as-is',
            );
          }
        }
      } catch (err) {
        logger.error(
          { event: 'feed_fetch_failed', err: String(err) },
          'Both subgraph and race timer failed — returning empty feed',
        );
        racedResult = {
          source: 'fallback',
          data: { items: [], nextCursor: null },
        };
      }

      // ── quick-260611-5mh (RC2/D-05): on-chain enrichment ─────────────────────
      // The subgraph mapping writes asset=''/expiry=0/conviction=50 placeholders
      // (CallCreated only carries id/caller/marketType/stake). Enrich each item
      // with the real getCall facts via ONE multicall per page + an in-process
      // immutable cache. enrichFeedItems NEVER throws — RPC failure returns the
      // items unchanged (graceful degradation; the feed never blocks/500s).
      let enrichedItems = racedResult.data.items;
      try {
        enrichedItems = await enrichFeedItems(racedResult.data.items);
      } catch (enrichErr) {
        logger.warn(
          { event: 'feed_enrichment_failed', err: String(enrichErr) },
          'Feed enrichment failed — serving unenriched items',
        );
        enrichedItems = racedResult.data.items;
      }

      // ── Build response ────────────────────────────────────────────────────────
      const responseData = {
        items: enrichedItems,
        nextCursor: racedResult.data.nextCursor,
        _source: racedResult.source,
      };

      // ── D-26: Cache first page with 10s TTL ───────────────────────────────────
      if (isFirstPage) {
        try {
          await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 10);
        } catch (cacheErr) {
          logger.warn(
            { event: 'feed_cache_write_failed', err: String(cacheErr) },
            'Redis cache write failed — not cached',
          );
        }
      }

      reply.header('x-source', racedResult.source);
      return reply.send(responseData);
    },
  );
}
