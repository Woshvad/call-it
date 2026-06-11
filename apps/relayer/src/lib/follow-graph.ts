/**
 * Follow-graph data layer (AUTH-14/15/17/18, D-11/D-12) — FEED wave.
 *
 * Viewer-only (AUTH-17): every function is keyed by the authenticated viewer's
 * `privyUserId`. There is NO parameter to fetch another user's graph — the relayer
 * never exposes another user's follow graph.
 *
 * getFollowGraph (D-12):
 *   - cache hit  (Redis follow:{x|fc}:{privyUserId}, <1h)  → return cached handles
 *   - miss/expire → fetch from X API / Neynar, overwrite Postgres follow_graph rows
 *     + Redis (1h TTL), return the set.
 *   - any fetch error / missing key → return an EMPTY set (never throws) so the
 *     "From your X / Farcaster" section degrades to empty and never blocks the
 *     main feed (Claude's Discretion, Pitfall 5). A quota (429) raises a Telegram
 *     alert via the existing alerts plumbing.
 *
 * crossReference (D-11):
 *   - given the viewer's followed handles/fids, return the subset linked to a Call
 *     It profile (matched against subgraph SocialIdentity.twitterHandle / farcaster
 *     handle), with handle normalization (lowercase, strip @).
 *
 * Requirements: AUTH-14, AUTH-15, AUTH-17, AUTH-18. Decisions: D-11, D-12.
 */

import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getDb } from '../db/client.js';
import { getCached, setCached } from './cache.js';
import { getLogger } from './logger.js';
import { followGraph } from '../db/schema.js';
import type * as schema from '../db/schema.js';
import { fetchTwitterFollowing, QuotaError } from './x-api-client.js';
import { fetchFarcasterFollowing } from './neynar-client.js';
import {
  queryLinkedProfilesByHandles,
  queryActiveCallsByCallers,
  type SubgraphLinkedProfile,
  type SubgraphActiveCall,
} from './subgraph-client.js';
import { sendAlertSafe } from '../workers/alerts.js';

type DrizzleDb = NodePgDatabase<typeof schema>;

/** Follow-graph platforms. */
export type FollowGraphPlatform = 'twitter' | 'farcaster';

/** 1-hour Redis cache TTL (D-12, AUTH-15). */
export const FOLLOW_GRAPH_CACHE_TTL_SECONDS = 60 * 60;

/** A single followed account in the viewer's graph (normalized). */
export interface FollowGraphEntry {
  /** Normalized followed handle (twitter: lowercased/@-stripped; farcaster: `fid:<fid>`). */
  handle: string;
  /** Stable id — X user id or Farcaster fid (as string). */
  id: string;
}

/** The viewer's follow graph + its provenance. */
export interface FollowGraphResult {
  entries: FollowGraphEntry[];
  /** 'cache' = served from Redis; 'live' = freshly fetched; 'empty' = no access / error. */
  source: 'cache' | 'live' | 'empty';
}

/** Normalize a handle for matching (Claude's Discretion): lowercase + strip a single leading '@'. */
export function normalizeFollowHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

/** Redis cache key for a viewer's follow graph (D-12) — matches social-link.ts. */
export function followCacheKey(platform: FollowGraphPlatform, privyUserId: string): string {
  return `follow:${platform === 'twitter' ? 'x' : 'fc'}:${privyUserId}`;
}

/** Dependencies (injectable for unit tests — no live external calls). */
export interface FollowGraphDeps {
  db?: DrizzleDb;
  /** Viewer's X user id (resolved from Privy by the route) — required for twitter fetch. */
  xUserId?: string;
  /** Viewer's Farcaster fid (resolved by the route) — required for farcaster fetch. */
  farcasterFid?: number;
  /** Override the X following fetcher (tests). */
  fetchTwitterFollowingImpl?: typeof fetchTwitterFollowing;
  /** Override the Farcaster following fetcher (tests). */
  fetchFarcasterFollowingImpl?: typeof fetchFarcasterFollowing;
}

/**
 * Get the viewer's follow graph (D-12, viewer-only AUTH-17).
 *
 * Cache hit (<1h) returns immediately. On miss/expire, fetch from X API / Neynar,
 * overwrite the Postgres follow_graph rows + Redis (1h TTL), and return the set.
 * Any error or missing key returns an EMPTY result (never throws).
 *
 * @param privyUserId The authenticated viewer's Privy DID (the ONLY identity input — AUTH-17).
 * @param platform 'twitter' | 'farcaster'.
 * @param deps Injectable db + identity + fetchers (tests mock external calls).
 */
export async function getFollowGraph(
  privyUserId: string,
  platform: FollowGraphPlatform,
  deps: FollowGraphDeps = {},
): Promise<FollowGraphResult> {
  const logger = getLogger();
  const cacheKey = followCacheKey(platform, privyUserId);

  // 1. Cache hit (<1h) — L1-first (quick-260611-h36); getCached never throws.
  {
    const cached = await getCached<FollowGraphEntry[]>(cacheKey, FOLLOW_GRAPH_CACHE_TTL_SECONDS);
    if (cached) {
      logger.info(
        { event: 'follow_graph_cache_hit', platform, count: cached.length },
        'Follow graph served from cache',
      );
      return { entries: cached, source: 'cache' };
    }
  }

  // 2. Miss/expired → fetch from the external API (graceful-empty on any error).
  let entries: FollowGraphEntry[];
  try {
    if (platform === 'twitter') {
      if (!deps.xUserId) {
        logger.warn({ event: 'follow_graph_no_identity', platform }, 'No X user id for viewer — empty');
        return { entries: [], source: 'empty' };
      }
      const fetcher = deps.fetchTwitterFollowingImpl ?? fetchTwitterFollowing;
      const following = await fetcher(deps.xUserId);
      entries = following.map((u) => ({ handle: normalizeFollowHandle(u.username), id: u.id }));
    } else {
      if (!deps.farcasterFid) {
        logger.warn({ event: 'follow_graph_no_identity', platform }, 'No Farcaster fid for viewer — empty');
        return { entries: [], source: 'empty' };
      }
      const fetcher = deps.fetchFarcasterFollowingImpl ?? fetchFarcasterFollowing;
      const following = await fetcher(deps.farcasterFid);
      // CORE-wave on-chain Farcaster handle shape is `fid:<fid>` (01.5-02) — match on that.
      entries = following.map((u) => ({ handle: `fid:${u.fid}`, id: String(u.fid) }));
    }
  } catch (err) {
    // Graceful degradation — never throw into the feed (Pitfall 5, AUTH-17).
    if (err instanceof QuotaError && err.quota) {
      // Quota (429) → raise a Telegram alert via existing plumbing (swallows on missing env).
      await sendAlertSafe('tvl_approach', {
        category: 'external_api_quota',
        subsystem: platform === 'twitter' ? 'x-api' : 'neynar',
        message: `${platform} follow-graph quota hit (429) — section degraded to empty`,
      });
    }
    logger.warn(
      {
        event: 'follow_graph_fetch_failed',
        platform,
        err: err instanceof Error ? err.message : String(err),
      },
      'Follow-graph fetch failed — degrading to empty section',
    );
    return { entries: [], source: 'empty' };
  }

  // 3. Overwrite Postgres follow_graph rows + Redis (1h TTL) — best-effort, never throws.
  const db = deps.db ?? getDb();
  try {
    // Viewer-only overwrite: delete this viewer+platform rows, then re-insert the set.
    await db
      .delete(followGraph)
      .where(and(eq(followGraph.privyUserId, privyUserId), eq(followGraph.platform, platform)));
    if (entries.length > 0) {
      await db.insert(followGraph).values(
        entries.map((e) => ({
          privyUserId,
          platform,
          followedHandle: e.handle.slice(0, 64),
          followedId: e.id.slice(0, 64),
        })),
      );
    }
  } catch (err) {
    logger.warn(
      { event: 'follow_graph_persist_failed', platform, err: String(err) },
      'Follow-graph Postgres overwrite failed — continuing (cache + response still valid)',
    );
  }

  // L1 + best-effort Redis (quick-260611-h36) — setCached never throws.
  await setCached(cacheKey, entries, FOLLOW_GRAPH_CACHE_TTL_SECONDS);

  logger.info(
    { event: 'follow_graph_fetched', platform, count: entries.length },
    'Follow graph fetched + overwritten',
  );
  return { entries, source: 'live' };
}

/** A linked Call It user matched during cross-reference. */
export interface CrossReferencedMatch {
  /** Lowercased on-chain address of the linked Call It profile. */
  address: string;
  /** The followed handle that matched (normalized). */
  matchedHandle: string;
}

/**
 * Cross-reference the viewer's followed handles against linked Call It profiles (D-11).
 *
 * Returns the matched profiles — the on-chain addresses whose linked handle is in the
 * viewer's followed set. Twitter handles are normalized (lowercase, @-stripped) on both
 * sides before matching; Farcaster matches on the `fid:<fid>` handle shape.
 *
 * @param followed The viewer's follow-graph entries.
 * @param platform 'twitter' | 'farcaster'.
 * @param queryImpl Override the subgraph cross-reference query (tests).
 * @returns The matched linked profiles — empty if none.
 */
export async function crossReference(
  followed: FollowGraphEntry[],
  platform: FollowGraphPlatform,
  queryImpl: typeof queryLinkedProfilesByHandles = queryLinkedProfilesByHandles,
): Promise<CrossReferencedMatch[]> {
  const logger = getLogger();
  if (followed.length === 0) return [];

  // Normalize the followed handles for matching (twitter: lowercase/@-strip;
  // farcaster: already `fid:<fid>`). De-dupe.
  const normalized = Array.from(
    new Set(
      followed.map((e) =>
        platform === 'twitter' ? normalizeFollowHandle(e.handle) : e.handle.toLowerCase(),
      ),
    ),
  );

  let profiles: SubgraphLinkedProfile[];
  try {
    profiles = await queryImpl(normalized, platform);
  } catch (err) {
    // Graceful — a subgraph failure degrades to no matches (empty section), never throws.
    logger.warn(
      { event: 'follow_graph_crossref_failed', platform, err: String(err) },
      'Cross-reference query failed — no matches',
    );
    return [];
  }

  const followedSet = new Set(normalized);
  const matches: CrossReferencedMatch[] = [];
  for (const p of profiles) {
    const profileHandle = platform === 'twitter' ? p.twitterHandle : p.farcasterHandle;
    if (!profileHandle) continue;
    const normalizedProfileHandle =
      platform === 'twitter' ? normalizeFollowHandle(profileHandle) : profileHandle.toLowerCase();
    // Only count profiles whose linked handle is actually in the viewer's followed set.
    if (followedSet.has(normalizedProfileHandle)) {
      matches.push({ address: p.id.toLowerCase(), matchedHandle: normalizedProfileHandle });
    }
  }

  logger.info(
    { event: 'follow_graph_crossref_ok', platform, matches: matches.length },
    'Cross-referenced followed handles to linked Call It profiles',
  );
  return matches;
}

// ── "From your X / Farcaster" feed assembly (AUTH-14/15/18) ─────────────────────

/** Max items per "From your X / Farcaster" section (AUTH-15: ≤10). */
export const FROM_YOUR_NETWORK_MAX = 10;

/** A single "From your network" feed item (the section response shape). */
export interface NetworkFeedItem {
  /** On-chain callId. */
  callId: string;
  /** The followed handle (twitter) / `fid:<fid>` (farcaster) that made this call. */
  handle: string;
  /** Human-readable market line. */
  marketLine: string;
  /** Call status (live / active-duel — never settled, excluded upstream). */
  status: string;
  /** Call expiry (deadline). */
  deadline: string;
}

/** The section payload (AUTH-15 / Pitfall 5 graceful degradation). */
export interface FromYourNetworkResult {
  items: NetworkFeedItem[];
  /** 'live' = fresh, 'cache' = follow-graph served from Redis, 'empty' = no access/matches. */
  source: 'live' | 'cache' | 'empty';
}

/** Injectable deps for the assembly (tests mock every external call). */
export interface FromYourNetworkDeps extends FollowGraphDeps {
  getFollowGraphImpl?: typeof getFollowGraph;
  crossReferenceImpl?: typeof crossReference;
  queryActiveCallsImpl?: typeof queryActiveCallsByCallers;
}

/** Build the market line for a feed item — asset when present, else a stable fallback. */
function buildMarketLine(call: SubgraphActiveCall): string {
  const asset = call.asset?.trim();
  return asset && asset.length > 0 ? asset : `Call #${call.id}`;
}

/**
 * Build the "From your X / Farcaster" feed for a viewer (AUTH-14/15/18, D-11).
 *
 * Composes: getFollowGraph (viewer-only) → crossReference (linked Call It profiles)
 * → active calls + active duels for the matched callers (EXCLUDES settled, recency
 * desc, capped at FROM_YOUR_NETWORK_MAX). Every failure path degrades to an empty
 * section ({ items: [], source: 'empty' }) so the main feed never blocks (Pitfall 5,
 * AUTH-17). A declined opt-in is enforced at the render layer (AUTH-16, 01.5-04).
 *
 * @param privyUserId The authenticated viewer's Privy DID (the ONLY identity input — AUTH-17).
 * @param platform 'twitter' | 'farcaster'.
 * @param deps Injectable identity + impls (tests mock all external calls).
 */
export async function buildFromYourNetworkFeed(
  privyUserId: string,
  platform: FollowGraphPlatform,
  deps: FromYourNetworkDeps = {},
): Promise<FromYourNetworkResult> {
  const getFG = deps.getFollowGraphImpl ?? getFollowGraph;
  const xref = deps.crossReferenceImpl ?? crossReference;
  const queryCalls = deps.queryActiveCallsImpl ?? queryActiveCallsByCallers;

  // 1. Viewer's follow graph (cache/live/empty) — never throws.
  const graph = await getFG(privyUserId, platform, deps);
  if (graph.entries.length === 0) return { items: [], source: 'empty' };

  // 2. Cross-reference to linked Call It profiles (D-11) — never throws.
  const matches = await xref(graph.entries, platform);
  if (matches.length === 0) return { items: [], source: 'empty' };

  const handleByAddress = new Map<string, string>();
  for (const m of matches) handleByAddress.set(m.address.toLowerCase(), m.matchedHandle);

  // 3. Active calls + active duels for the matched callers (EXCLUDES settled,
  //    recency desc, capped) — a query failure degrades to empty (Pitfall 5).
  let calls: SubgraphActiveCall[];
  try {
    calls = await queryCalls(
      matches.map((m) => m.address),
      FROM_YOUR_NETWORK_MAX,
    );
  } catch {
    return { items: [], source: 'empty' };
  }

  const items: NetworkFeedItem[] = calls.slice(0, FROM_YOUR_NETWORK_MAX).map((c) => ({
    callId: c.id,
    handle: handleByAddress.get(c.caller.toLowerCase()) ?? '',
    marketLine: buildMarketLine(c),
    status: c.status,
    deadline: c.expiry,
  }));

  if (items.length === 0) return { items: [], source: 'empty' };
  return { items, source: graph.source === 'cache' ? 'cache' : 'live' };
}
