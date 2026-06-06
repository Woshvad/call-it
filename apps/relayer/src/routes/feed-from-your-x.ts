/**
 * GET /api/feed/from-your-x — "From your X" feed section (AUTH-14, AUTH-15).
 *
 * Session-gated (privySessionPreHandler — viewer = request.privyUserId, AUTH-17).
 * Resolves the viewer's OWN X user id from Privy's verified linkedAccounts (never a
 * request param — viewer-only), builds the follow-graph → cross-reference → active
 * calls assembly (≤10, recency desc, EXCLUDES settled, includes active duels), and
 * returns { items, source }.
 *
 * Graceful degradation (Pitfall 5, AUTH-17): a missing X link, a missing/disabled
 * X API key, a quota/outage, or a subgraph failure all return
 * { items: [], source: 'empty' } — the section NEVER throws or blocks the main feed.
 * The X API tier (follows.read) is confirmed by the FEED-wave operator checkpoint
 * (01.5-05 Task 1); until then this route degrades to empty.
 *
 * Requirements: AUTH-14, AUTH-15, AUTH-17.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { privySessionPreHandler, getPrivyClient } from '../lib/privy-auth.js';
import { getLogger } from '../lib/logger.js';
import { buildFromYourNetworkFeed, type FromYourNetworkResult } from '../lib/follow-graph.js';

/** A Privy linked account as returned by getUser().linkedAccounts. */
interface PrivyLinkedAccount {
  type: string;
  subject?: string | null;
  fid?: number | null;
}

const EMPTY: FromYourNetworkResult = { items: [], source: 'empty' };

/**
 * Resolve the viewer's stable X user id from Privy's verified linkedAccounts.
 * Viewer-only (AUTH-17) — derived from the session user, never a request param.
 * Returns undefined (→ empty section) on any error or when no X account is linked.
 */
export async function resolveViewerXUserId(privyUserId: string): Promise<string | undefined> {
  try {
    const privy = getPrivyClient();
    const user = (await privy.getUser(privyUserId)) as unknown as {
      linkedAccounts?: PrivyLinkedAccount[];
    };
    const twitter = (user.linkedAccounts ?? []).find((a) => a.type === 'twitter_oauth');
    return twitter?.subject ?? undefined;
  } catch (err) {
    getLogger().warn(
      { event: 'from_your_x_identity_failed', err: err instanceof Error ? err.message : String(err) },
      'Could not resolve viewer X id — From your X degrades to empty',
    );
    return undefined;
  }
}

/** GET /api/feed/from-your-x — session-gated "From your X" feed section. */
export async function feedFromYourXRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get('/api/feed/from-your-x', { preHandler: privySessionPreHandler }, async (request, reply) => {
    const privyUserId = request.privyUserId;
    if (!privyUserId) {
      return reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
    }
    try {
      const xUserId = await resolveViewerXUserId(privyUserId);
      const result = await buildFromYourNetworkFeed(privyUserId, 'twitter', { xUserId });
      return reply.send(result);
    } catch (err) {
      // Belt-and-suspenders: buildFromYourNetworkFeed already degrades internally.
      getLogger().warn(
        { event: 'from_your_x_failed', err: err instanceof Error ? err.message : String(err) },
        'From your X failed — returning empty (main feed never blocks)',
      );
      return reply.send(EMPTY);
    }
  });
}
