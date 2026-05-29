/**
 * Quote-stance routes — off-chain FADING/FOLLOWING annotation for quote-calls.
 *
 * Routes:
 *   GET  /api/calls/quote-stance?quoteCallId=X    — single { stance } for one quote-call
 *   GET  /api/calls/quote-stance?parentCallId=X   — ARRAY of quote-call entries for a
 *                                                   parent call (WR-04 — list mode)
 *   POST /api/calls/quote-stance                  — stores stance annotation
 *
 * Backing store: Fly Postgres `quote_stance` table (Drizzle ORM).
 * Keyed to the on-chain CallQuoted event (parentCallId + quoteCallId pair).
 * No auth gate on GET (public read). No auth gate on POST (relayer-internal write from
 * the frontend quote-call flow — authenticated at the transaction layer).
 *
 * Requirements: D-15, SOCIAL-43, SOCIAL-45
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { quoteStance } from '../db/schema.js';
import { getLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuoteStanceQuerystring {
  quoteCallId?: string;
  parentCallId?: string;
}

interface QuoteStanceBody {
  callId: number;
  quoteCallId: number;
  stance: 'following' | 'fading';
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function quoteStanceRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // ── GET /api/calls/quote-stance?quoteCallId=X ─────────────────────────────
  app.get<{ Querystring: QuoteStanceQuerystring }>(
    '/api/calls/quote-stance',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            quoteCallId: { type: 'string' },
            parentCallId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();
      const db = getDb();

      const { quoteCallId: quoteCallIdStr, parentCallId: parentCallIdStr } = request.query;

      // ── WR-04: list mode — quote-calls OF a parent call ───────────────────
      // The /call/[id] "Quote Calls" column wants the list of quote-calls for a
      // given parent call, and parses a JSON ARRAY of entries. Querying by
      // parentCallId returns that array, fixing the producer/consumer mismatch
      // where the old single-`{ stance }` object made `raw.map` throw.
      if (parentCallIdStr) {
        const parentCallId = parseInt(parentCallIdStr, 10);
        if (isNaN(parentCallId)) {
          return reply.status(400).send({ error: 'invalid_param', message: 'parentCallId must be numeric' });
        }
        try {
          const rows = await db
            .select()
            .from(quoteStance)
            .where(eq(quoteStance.callId, parentCallId));

          const entries = rows.map((r) => ({
            id: r.quoteCallId,
            quoteCallId: r.quoteCallId,
            parentCallId: r.callId,
            stance: r.stance,
            timestamp: Math.floor(r.createdAt.getTime() / 1000),
          }));

          logger.info(
            { event: 'quote_stance_list', parentCallId, count: entries.length },
            'Quote-call stances listed',
          );
          return reply.send(entries);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(
            { event: 'quote_stance_list_error', error: message, parentCallId },
            'Failed to list quote stances',
          );
          return reply.status(500).send({ error: 'db_error', message: 'Failed to list stances' });
        }
      }

      // ── Single-stance mode — stance for one quoteCallId (backward compat) ──
      if (!quoteCallIdStr) {
        return reply
          .status(400)
          .send({ error: 'missing_param', message: 'quoteCallId or parentCallId is required' });
      }

      const quoteCallId = parseInt(quoteCallIdStr, 10);
      if (isNaN(quoteCallId)) {
        return reply.status(400).send({ error: 'invalid_param', message: 'quoteCallId must be numeric' });
      }

      try {
        const rows = await db
          .select()
          .from(quoteStance)
          .where(eq(quoteStance.quoteCallId, quoteCallId))
          .limit(1);

        if (rows.length === 0) {
          logger.info({ event: 'quote_stance_not_found', quoteCallId }, 'No stance found');
          return reply.send({ stance: null });
        }

        logger.info({ event: 'quote_stance_found', quoteCallId, stance: rows[0].stance }, 'Stance returned');
        return reply.send({ stance: rows[0].stance });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ event: 'quote_stance_read_error', error: message, quoteCallId }, 'Failed to read quote stance');
        return reply.status(500).send({ error: 'db_error', message: 'Failed to read stance' });
      }
    },
  );

  // ── POST /api/calls/quote-stance ──────────────────────────────────────────
  app.post<{ Body: QuoteStanceBody }>(
    '/api/calls/quote-stance',
    {
      schema: {
        body: {
          type: 'object',
          required: ['callId', 'quoteCallId', 'stance'],
          properties: {
            callId: { type: 'integer' },
            quoteCallId: { type: 'integer' },
            stance: { type: 'string', enum: ['following', 'fading'] },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();
      const db = getDb();

      const { callId, quoteCallId, stance } = request.body;

      // Validate stance is one of the two allowed values (belt-and-suspenders beyond schema)
      if (stance !== 'following' && stance !== 'fading') {
        return reply.status(400).send({ error: 'invalid_stance', message: "stance must be 'following' or 'fading'" });
      }

      try {
        await db.insert(quoteStance).values({
          callId,
          quoteCallId,
          stance,
        });

        logger.info({ event: 'quote_stance_created', callId, quoteCallId, stance }, 'Quote stance stored');
        return reply.status(201).send({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'quote_stance_write_error', error: message, callId, quoteCallId, stance },
          'Failed to write quote stance',
        );
        return reply.status(500).send({ error: 'db_error', message: 'Failed to store stance' });
      }
    },
  );
}
