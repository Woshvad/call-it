/**
 * GET /api/feed/from-your-farcaster — "From your Farcaster" feed section (AUTH-18).
 *
 * Mirrors /api/feed/from-your-x via Neynar/fid (AUTH-18). Session-gated
 * (privySessionPreHandler — viewer = request.privyUserId, AUTH-17). Resolves the
 * viewer's OWN Farcaster fid from Privy's verified linkedAccounts (never a request
 * param — viewer-only), builds follow-graph → cross-reference → active calls (≤10,
 * recency desc, EXCLUDES settled, includes active duels), returns { items, source }.
 *
 * Graceful degradation (Pitfall 5, AUTH-17): a missing FC link, a missing Neynar
 * key, a quota/outage, or a subgraph failure all return
 * { items: [], source: 'empty' } — the section NEVER throws or blocks the main feed.
 *
 * Requirements: AUTH-15, AUTH-17, AUTH-18.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { privySessionPreHandler, getPrivyClient } from '../lib/privy-auth.js';
import { getLogger } from '../lib/logger.js';
import { buildFromYourNetworkFeed, type FromYourNetworkResult } from '../lib/follow-graph.js';

/** A Privy linked account as returned by getUser().linkedAccounts. */
interface PrivyLinkedAccount {
  type: string;
  fid?: number | null;
}

const EMPTY: FromYourNetworkResult = { items: [], source: 'empty' };

/**
 * Resolve the viewer's Farcaster fid from Privy's verified linkedAccounts.
 * Viewer-only (AUTH-17) — derived from the session user, never a request param.
 * Returns undefined (→ empty section) on any error or when no FC account is linked.
 */
export async function resolveViewerFid(privyUserId: string): Promise<number | undefined> {
  try {
    const privy = getPrivyClient();
    const user = (await privy.getUser(privyUserId)) as unknown as {
      linkedAccounts?: PrivyLinkedAccount[];
    };
    const farcaster = (user.linkedAccounts ?? []).find((a) => a.type === 'farcaster');
    const fid = farcaster?.fid;
    return typeof fid === 'number' && fid > 0 ? fid : undefined;
  } catch (err) {
    getLogger().warn(
      { event: 'from_your_fc_identity_failed', err: err instanceof Error ? err.message : String(err) },
      'Could not resolve viewer fid — From your Farcaster degrades to empty',
    );
    return undefined;
  }
}

/** GET /api/feed/from-your-farcaster — session-gated "From your Farcaster" section. */
export async function feedFromYourFarcasterRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get(
    '/api/feed/from-your-farcaster',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const privyUserId = request.privyUserId;
      if (!privyUserId) {
        return reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
      }
      try {
        const farcasterFid = await resolveViewerFid(privyUserId);
        const result = await buildFromYourNetworkFeed(privyUserId, 'farcaster', { farcasterFid });
        return reply.send(result);
      } catch (err) {
        getLogger().warn(
          { event: 'from_your_fc_failed', err: err instanceof Error ? err.message : String(err) },
          'From your Farcaster failed — returning empty (main feed never blocks)',
        );
        return reply.send(EMPTY);
      }
    },
  );
}
