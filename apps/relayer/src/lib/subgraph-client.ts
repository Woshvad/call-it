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
