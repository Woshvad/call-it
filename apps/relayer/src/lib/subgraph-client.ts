/**
 * Subgraph Studio GraphQL client (D-27).
 *
 * The Studio API key is held server-side only — never exposed to the frontend.
 * Frontend hits the relayer proxy /api/feed which calls this internally.
 *
 * Phase 1 subgraph notes:
 * - Deployed to Subgraph Studio (Decentralized Network in Phase 7)
 * - Schema is Phase 0 scaffold: Call entity has id, caller, marketType, asset,
 *   stake, expiry, conviction, status, createdAt, outcome
 * - ProfileRegistry social-link events indexed from Phase 1 Plan 02 deploy
 *
 * Cursor pagination: (createdAt DESC, id) per D-25.
 *
 * Requirements: D-24, D-25, D-26, D-27
 * Security: T-01-59 (Subgraph key leak to frontend bundle — mitigated by server-only proxy)
 */

import { getLogger } from './logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubgraphFeedItem {
  id: string;
  caller: string;
  marketType: number;
  asset: string;
  stake: string;
  expiry: string;
  conviction: number;
  status: string;
  createdAt: string;
  outcome?: string | null;
}

export interface SubgraphFeedResponse {
  items: SubgraphFeedItem[];
  nextCursor: string | null;
  _meta: {
    block: {
      number: number;
    };
  };
}

export interface SubgraphProfileCall {
  id: string;
  marketType: number;
  asset: string;
  stake: string;
  expiry: string;
  conviction: number;
  status: string;
  createdAt: string;
}

/** Social verification handles for a single Profile (D-08). */
export interface SubgraphProfileSocials {
  twitterHandle: string | null;
  farcasterHandle: string | null;
}

/** A linked Call It profile matched during follow-graph cross-reference (D-11). */
export interface SubgraphLinkedProfile {
  /** Profile id = lowercased on-chain address. */
  id: string;
  /** Normalized twitter handle on the profile (lowercased), or null. */
  twitterHandle: string | null;
  /** Farcaster handle on the profile (e.g. `fid:123` in the CORE wave), or null. */
  farcasterHandle: string | null;
}

/** An active "From your X / Farcaster" feed item (AUTH-15 content rules). */
export interface SubgraphActiveCall {
  /** Call id (on-chain callId). */
  id: string;
  /** Caller address (lowercased). */
  caller: string;
  marketType: number;
  asset: string;
  stake: string;
  expiry: string;
  conviction: number;
  status: string;
  createdAt: string;
}

// ── GraphQL Queries ───────────────────────────────────────────────────────────

const FEED_QUERY = `
query Feed($first: Int!, $cursor_time: BigInt, $cursor_id: ID) {
  calls(
    first: $first,
    orderBy: createdAt,
    orderDirection: desc,
    where: {
      status_not: "draft"
    }
  ) {
    id
    caller
    marketType
    asset
    stake
    expiry
    conviction
    status
    createdAt
    outcome
  }
  _meta {
    block {
      number
    }
  }
}
`;

const PROFILE_SOCIALS_QUERY = `
query ProfileSocials($id: ID!) {
  profile(id: $id) {
    twitterHandle
    farcasterHandle
  }
}
`;

const PROFILE_CALLS_QUERY = `
query ProfileCalls($caller: Bytes!, $first: Int!, $skip: Int!) {
  calls(
    first: $first,
    skip: $skip,
    orderBy: createdAt,
    orderDirection: desc,
    where: { caller: $caller }
  ) {
    id
    marketType
    asset
    stake
    expiry
    conviction
    status
    createdAt
  }
}
`;

/**
 * Cross-reference query (D-11): find linked Call It profiles whose twitterHandle
 * is in the viewer's followed-handle set. Handle matching is case-normalized at
 * link time (the relayer stores lowercased handles) — we pass lowercased handles.
 */
const LINKED_PROFILES_BY_TWITTER_QUERY = `
query LinkedProfilesByTwitter($handles: [String!]!, $first: Int!) {
  profiles(first: $first, where: { twitterHandle_in: $handles }) {
    id
    twitterHandle
    farcasterHandle
  }
}
`;

/**
 * Cross-reference query (D-11): find linked Call It profiles whose farcasterHandle
 * is in the viewer's followed-fid set. The CORE wave stores Farcaster handles as
 * `fid:<fid>` (01.5-02), so the caller passes `fid:<fid>` strings.
 */
const LINKED_PROFILES_BY_FARCASTER_QUERY = `
query LinkedProfilesByFarcaster($handles: [String!]!, $first: Int!) {
  profiles(first: $first, where: { farcasterHandle_in: $handles }) {
    id
    twitterHandle
    farcasterHandle
  }
}
`;

/**
 * Active calls + active duels for a set of caller addresses (AUTH-15 content rules).
 * EXCLUDES settled — status_not_in filters terminal states. Recency desc; capped.
 */
const ACTIVE_CALLS_BY_CALLERS_QUERY = `
query ActiveCallsByCallers($callers: [Bytes!]!, $excluded: [String!]!, $first: Int!) {
  calls(
    first: $first,
    orderBy: createdAt,
    orderDirection: desc,
    where: { caller_in: $callers, status_not_in: $excluded }
  ) {
    id
    caller
    marketType
    asset
    stake
    expiry
    conviction
    status
    createdAt
  }
}
`;

// ── GraphQL client ────────────────────────────────────────────────────────────

/**
 * Execute a raw GraphQL query against the Subgraph Studio endpoint.
 * Adds Authorization header with the API key (D-27).
 */
async function executeQuery<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const endpoint = process.env.SUBGRAPH_STUDIO_URL ?? '';
  const apiKey = process.env.SUBGRAPH_STUDIO_API_KEY ?? '';

  if (!endpoint) {
    throw new Error('SUBGRAPH_STUDIO_URL is not configured');
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // D-27: Authorization header held server-side only
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Subgraph request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Subgraph GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
  }

  if (!json.data) {
    throw new Error('Subgraph returned no data');
  }

  return json.data;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Query the feed from the subgraph.
 * Cursor-paginated recency-desc (D-25).
 *
 * @param cursor - opaque base64 cursor from previous response (null for first page)
 * @param limit - number of items to fetch (default 20)
 */
export async function queryFeed({
  cursor,
  limit = 20,
}: {
  cursor?: string | null;
  limit?: number;
}): Promise<SubgraphFeedResponse> {
  // Decode cursor if provided
  let cursorTime: string | null = null;
  let cursorId: string | null = null;

  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const parts = decoded.split(':');
      cursorTime = parts[0] ?? null;
      cursorId = parts[1] ?? null;
    } catch {
      getLogger().warn({ event: 'feed_cursor_decode_failed', cursor }, 'Invalid cursor');
    }
  }

  const variables: Record<string, unknown> = {
    first: limit,
    ...(cursorTime ? { cursor_time: cursorTime } : {}),
    ...(cursorId ? { cursor_id: cursorId } : {}),
  };

  type FeedData = {
    calls: SubgraphFeedItem[];
    _meta: { block: { number: number } };
  };

  const data = await executeQuery<FeedData>(FEED_QUERY, variables);

  const items = data.calls ?? [];

  // Build next cursor from last item
  let nextCursor: string | null = null;
  if (items.length === limit && items.length > 0) {
    const last = items[items.length - 1];
    if (last) {
      const cursorStr = `${last.createdAt}:${last.id}`;
      nextCursor = Buffer.from(cursorStr).toString('base64');
    }
  }

  return {
    items,
    nextCursor,
    _meta: data._meta ?? { block: { number: 0 } },
  };
}

/**
 * Query a single Profile's social verification handles (D-08).
 *
 * The Profile entity is keyed by the lowercased hex address (subgraph mapping
 * sets id = event.params.user.toHexString()). twitterHandle/farcasterHandle are
 * set on SocialLinked and cleared (null) on SocialUnlinked — so a null handle
 * correctly reflects an unlinked / never-linked state.
 *
 * @param userAddress Ethereum address of the profile owner
 * @returns { twitterHandle, farcasterHandle } — both null if no Profile / not linked
 */
export async function queryProfileSocials(
  userAddress: string,
): Promise<SubgraphProfileSocials> {
  type ProfileSocialsData = {
    profile: { twitterHandle: string | null; farcasterHandle: string | null } | null;
  };

  const data = await executeQuery<ProfileSocialsData>(PROFILE_SOCIALS_QUERY, {
    id: userAddress.toLowerCase(),
  });

  return {
    twitterHandle: data.profile?.twitterHandle ?? null,
    farcasterHandle: data.profile?.farcasterHandle ?? null,
  };
}

/**
 * Query calls for a specific profile address.
 * Used by the profile route for the "recent calls" list.
 *
 * @param userAddress - Ethereum address of the caller
 * @param offset - pagination offset
 * @param limit - number of results to return
 */
export async function queryProfileCalls(
  userAddress: string,
  offset: number,
  limit: number,
): Promise<SubgraphProfileCall[]> {
  type ProfileCallsData = {
    calls: SubgraphProfileCall[];
  };

  const data = await executeQuery<ProfileCallsData>(PROFILE_CALLS_QUERY, {
    caller: userAddress.toLowerCase(),
    first: limit,
    skip: offset,
  });

  return data.calls ?? [];
}

/** Status values EXCLUDED from the "From your X / Farcaster" feed (AUTH-15: exclude settled). */
export const EXCLUDED_FEED_STATUSES = ['settled', 'Settled', 'draft', 'Draft'] as const;

/**
 * Cross-reference followed handles against linked Call It profiles (D-11, AUTH-14).
 *
 * Given the viewer's followed handle/fid set, returns the Call It profiles that are
 * linked to those handles. The relayer stores normalized (lowercased, @-stripped)
 * twitter handles on-chain, so the caller MUST pass normalized handles for twitter;
 * for farcaster the caller passes `fid:<fid>` strings (CORE-wave handle shape).
 *
 * @param handles The viewer's followed handles (twitter: normalized; farcaster: `fid:<fid>`).
 * @param platform 'twitter' | 'farcaster' — selects which Profile field to match.
 * @returns The matched linked profiles (id = lowercased address) — empty if none.
 */
export async function queryLinkedProfilesByHandles(
  handles: string[],
  platform: 'twitter' | 'farcaster',
): Promise<SubgraphLinkedProfile[]> {
  if (handles.length === 0) return [];

  type LinkedData = { profiles: SubgraphLinkedProfile[] };
  const query =
    platform === 'twitter'
      ? LINKED_PROFILES_BY_TWITTER_QUERY
      : LINKED_PROFILES_BY_FARCASTER_QUERY;

  const data = await executeQuery<LinkedData>(query, {
    // De-dupe + cap to keep the GraphQL `_in` list bounded.
    handles: Array.from(new Set(handles)).slice(0, 1000),
    first: 1000,
  });

  return data.profiles ?? [];
}

/**
 * Query active calls + active duels for a set of caller addresses (AUTH-15).
 *
 * EXCLUDES settled (and draft) calls via status_not_in; orders by recency desc;
 * caps at `limit` (the route slices to ≤10). Active duels are included because a
 * challenged-but-not-settled call keeps a non-terminal status.
 *
 * @param callerAddresses Lowercased addresses of the matched linked profiles.
 * @param limit Max items to fetch (the route enforces the ≤10 cap).
 * @returns Active calls for those callers — empty if none / no callers.
 */
export async function queryActiveCallsByCallers(
  callerAddresses: string[],
  limit: number,
): Promise<SubgraphActiveCall[]> {
  if (callerAddresses.length === 0) return [];

  type ActiveData = { calls: SubgraphActiveCall[] };
  const data = await executeQuery<ActiveData>(ACTIVE_CALLS_BY_CALLERS_QUERY, {
    callers: Array.from(new Set(callerAddresses.map((a) => a.toLowerCase()))),
    excluded: [...EXCLUDED_FEED_STATUSES],
    first: limit,
  });

  return data.calls ?? [];
}
