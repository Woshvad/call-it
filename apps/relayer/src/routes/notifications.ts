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
 *        The owner address is resolved SERVER-SIDE from the verified Privy
 *        session (CR-01) — any client-supplied `?user=` param is ignored.
 *
 * Security:
 *   - GET is public-readable by user address (no auth — per §18.1 design, the
 *     user can only read their own notifications if they know their address,
 *     and the address is public on-chain anyway). If tighter auth is needed,
 *     add privySessionPreHandler to GET and enforce req.privyUserId == user.
 *   - POST /mark-read requires Privy session auth to prevent unauthorized marking.
 *     The userAddress in the WHERE clause is resolved from the VERIFIED Privy
 *     session (linkedAccounts → embedded Ethereum wallet), NOT from any client
 *     input, so a user can only mark their own notifications (T-02-07-02, CR-01).
 *
 * Requirements: D-13, D-14, SOCIAL-24
 * Threat: T-02-07-01 (GET), T-02-07-02 (POST /mark-read)
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { eq, lt, isNull, sql, and, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { privySessionPreHandler, getPrivyClient } from '../lib/privy-auth.js';
import { getLogger } from '../lib/logger.js';

/**
 * Resolve the authenticated user's Ethereum wallet address from their verified
 * Privy session (CR-01). The address is derived server-side from Privy's
 * authoritative linkedAccounts — never from a client-supplied query param.
 *
 * Preference order: the embedded (`walletClientType === 'privy'`) Ethereum
 * wallet, falling back to the first linked Ethereum wallet. Returns null if the
 * user has no Ethereum wallet linked.
 */
async function resolveSessionWalletAddress(privyUserId: string): Promise<string | null> {
  const privyUser = await getPrivyClient().getUser(privyUserId);
  const linkedAccounts = privyUser.linkedAccounts ?? [];

  const ethWallets = linkedAccounts.filter(
    (acct): acct is typeof acct & { type: 'wallet'; address: string; chainType?: string; walletClientType?: string } =>
      acct.type === 'wallet' &&
      typeof (acct as { address?: unknown }).address === 'string' &&
      (acct as { chainType?: string }).chainType === 'ethereum',
  );

  // Prefer the Privy embedded wallet; fall back to the first linked Ethereum wallet.
  const embedded = ethWallets.find((w) => w.walletClientType === 'privy');
  const chosen = embedded ?? ethWallets[0];
  return chosen ? chosen.address.toLowerCase() : null;
}

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

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: 'invalid_body', message: 'ids must be a non-empty array' });
      }

      // CR-01: Resolve the wallet address from the VERIFIED Privy session
      // server-side. The client-supplied `?user=` param is the (former) trust
      // boundary and is now ignored entirely — any authenticated user could
      // otherwise pass `?user=<victim>` and mark another user's notifications.
      const privyUserId = request.privyUserId;
      if (!privyUserId) {
        // privySessionPreHandler should have rejected already; defensive guard.
        return reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
      }

      let normalizedAddress: string;
      try {
        const resolved = await resolveSessionWalletAddress(privyUserId);
        if (!resolved) {
          getLogger().warn(
            { event: 'notifications_mark_read_no_wallet', privyUserId },
            'Session has no linked Ethereum wallet — cannot resolve owner',
          );
          return reply.status(403).send({ error: 'no_wallet', message: 'no Ethereum wallet linked to session' });
        }
        normalizedAddress = resolved;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        getLogger().error(
          { event: 'notifications_mark_read_resolve_error', error: message, privyUserId },
          'Failed to resolve session wallet address',
        );
        return reply.status(502).send({ error: 'privy_error', message: 'Failed to resolve session identity' });
      }

      try {
        // WHERE clause is bound to the SESSION-derived address (T-02-07-02, CR-01).
        // This prevents marking another user's notifications.
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
