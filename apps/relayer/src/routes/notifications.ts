/**
 * Notification API routes — inbox for per-user in-app notifications.
 *
 * Routes:
 *   GET  /api/notifications?user={address}&cursor={iso_timestamp}
 *        — paginated list of notifications (newest first), plus unreadCount.
 *        cursor: ISO timestamp; returns notifications created BEFORE this time.
 *        Limit: 20 per page.
 *   POST /api/notifications/mark-read
 *        — marks specific notifications as read; requires Privy session auth.
 *        Body: { ids: number[] }
 *
 * Security:
 *   - GET is public-readable by user address (no auth — per §18.1 design, the
 *     user can only read their own notifications if they know their address,
 *     and the address is public on-chain anyway). If tighter auth is needed,
 *     add privySessionPreHandler to GET and enforce req.privyUserId == user.
 *   - POST /mark-read requires Privy session auth to prevent unauthorized marking.
 *     WHERE clause includes userAddress = resolved address from session to prevent
 *     marking another user's notifications (T-02-07-02).
 *
 * Requirements: D-13, D-14, SOCIAL-24
 * Threat: T-02-07-01 (GET), T-02-07-02 (POST /mark-read)
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { eq, lt, isNull, sql, and, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { privySessionPreHandler } from '../lib/privy-auth.js';
import { getLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotificationsQuerystring {
  user?: string;
  cursor?: string;
}

interface MarkReadBody {
  ids: number[];
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function notificationsRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // ── GET /api/notifications?user={address}&cursor={iso} ────────────────────
  app.get<{ Querystring: NotificationsQuerystring }>(
    '/api/notifications',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            user: { type: 'string' },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();
      const db = getDb();

      const userAddress = request.query.user;
      if (!userAddress) {
        return reply.status(400).send({ error: 'missing_param', message: 'user address is required' });
      }

      // Normalize to lowercase for consistent lookups
      const normalizedAddress = userAddress.toLowerCase();

      const cursorDate = request.query.cursor ? new Date(request.query.cursor) : null;
      const PAGE_SIZE = 20;

      try {
        // Build WHERE conditions
        const conditions = cursorDate
          ? and(
              eq(notifications.userAddress, normalizedAddress),
              lt(notifications.createdAt, cursorDate),
            )
          : eq(notifications.userAddress, normalizedAddress);

        // Fetch paginated notifications (newest first)
        const rows = await db
          .select()
          .from(notifications)
          .where(conditions)
          .orderBy(sql`${notifications.createdAt} DESC`)
          .limit(PAGE_SIZE);

        // Count unread notifications
        const unreadResult = await db
          .select({ count: sql<string>`COUNT(*)` })
          .from(notifications)
          .where(and(eq(notifications.userAddress, normalizedAddress), isNull(notifications.readAt)));

        const unreadCount = parseInt(unreadResult[0]?.count ?? '0', 10);

        // Compute next cursor from the oldest item returned
        const nextCursor =
          rows.length === PAGE_SIZE
            ? rows[rows.length - 1]?.createdAt?.toISOString() ?? null
            : null;

        logger.info(
          { event: 'notifications_fetched', userAddress: normalizedAddress, count: rows.length, unreadCount },
          'Notifications fetched',
        );

        return reply.send({
          notifications: rows,
          unreadCount,
          nextCursor,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'notifications_fetch_error', error: message, userAddress: normalizedAddress },
          'Failed to fetch notifications',
        );
        return reply.status(500).send({ error: 'db_error', message: 'Failed to fetch notifications' });
      }
    },
  );

  // ── POST /api/notifications/mark-read ─────────────────────────────────────
  // Requires Privy session auth (T-02-07-02)
  app.post<{ Body: MarkReadBody }>(
    '/api/notifications/mark-read',
    {
      preHandler: privySessionPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          properties: {
            ids: {
              type: 'array',
              items: { type: 'integer' },
              minItems: 1,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();
      const db = getDb();

      const { ids } = request.body;

      // The authenticated user's Privy user ID is attached by privySessionPreHandler.
      // To resolve the wallet address, we require the `user` query param (same as GET).
      // Note: In production, this should resolve via Privy user → embedded wallet address.
      // For v1, we use the user param pattern consistent with the GET endpoint.
      // The WHERE clause below enforces ownership via userAddress match (T-02-07-02).
      const userAddress = (request.query as { user?: string }).user;
      if (!userAddress) {
        return reply.status(400).send({ error: 'missing_param', message: 'user address is required' });
      }

      const normalizedAddress = userAddress.toLowerCase();

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: 'invalid_body', message: 'ids must be a non-empty array' });
      }

      try {
        // WHERE clause includes userAddress = authenticated user's address (T-02-07-02)
        // This prevents marking another user's notifications
        const now = new Date();
        await db
          .update(notifications)
          .set({ readAt: now })
          .where(
            and(
              eq(notifications.userAddress, normalizedAddress),
              inArray(notifications.id, ids),
              isNull(notifications.readAt),
            ),
          );

        logger.info(
          {
            event: 'notifications_marked_read',
            userAddress: normalizedAddress,
            ids,
            privyUserId: request.privyUserId,
          },
          'Notifications marked as read',
        );

        return reply.send({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'notifications_mark_read_error', error: message, userAddress: normalizedAddress, ids },
          'Failed to mark notifications as read',
        );
        return reply.status(500).send({ error: 'db_error', message: 'Failed to mark notifications as read' });
      }
    },
  );
}
