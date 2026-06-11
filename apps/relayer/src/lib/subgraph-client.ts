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

import { createHash } from 'node:crypto';
import { getLogger } from './logger.js';
import { MemoryCache } from './memory-cache.js';

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
  /**
   * quick-260611-h36: true when this response was served from the circuit
   * breaker's last-known-good snapshot (<=1h old) instead of a live query.
   * The feed route maps this to `_source: 'stale'` + `x-source: stale` and
   * strips the flag from the wire body.
   */
  _stale?: boolean;
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
  /** Settled outcome ('CallerWon' | 'CallerLost') — null while Live (quick-260611-5mh). */
  outcome?: string | null;
  /** Templated market-statement mirror (D-05/D-03) — nullable pre-v0.9.0 rows. */
  statement?: string | null;
}

/** Real Profile entity stats (RC4 closure — quick-260611-5mh). */
export interface SubgraphProfileStats {
  globalRep: number;
  totalCalls: number;
  settledCalls: number;
  wins: number;
  losses: number;
}

/** A single FollowFadeMarket position for a call (quick-260611-5mh A5). */
export interface SubgraphCallPosition {
  user: string;
  side: string;
  usdcDeposited: string;
  sharesHeld: string;
  entryTime: string;
  exitedAt: string | null;
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
    outcome
    statement
  }
}
`;

// Real Profile stats (RC4 closure — quick-260611-5mh). Entity id = lowercased
// address; fields per schema.graphql Profile (globalRep/totalCalls/settledCalls/
// wins/losses are all non-nullable Int!).
const PROFILE_STATS_QUERY = `
query ProfileStats($id: ID!) {
  profile(id: $id) {
    globalRep
    totalCalls
    settledCalls
    wins
    losses
  }
}
`;

// Positions for a single call (quick-260611-5mh A5 — GET /api/calls/:id/positions).
// Position.callId is a String field (FFM handler id shape) — pass the numeric
// callId as a string. Mirrors the SETTLED_FIELDS_QUERY positions selection.
const CALL_POSITIONS_QUERY = `
query CallPositions($callIdStr: String!) {
  positions(first: 1000, where: { callId: $callIdStr }) {
    user
    side
    usdcDeposited
    sharesHeld
    entryTime
    exitedAt
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

// quick-260610-sr0: bound EVERY subgraph fetch — undici's default header
// timeout is minutes, which lets a stalled Studio endpoint hang consumers
// (feed, profiles, settled fields) indefinitely.
const SUBGRAPH_FETCH_TIMEOUT_MS = 10_000;

/**
 * Deterministic, non-infrastructure subgraph failure (review WR-04b):
 * GraphQL validation/query errors, missing endpoint config, and non-429 4xx
 * responses. These are CODE/CONFIG bugs — they rethrow straight through the
 * circuit breaker WITHOUT opening it, so a schema typo can't masquerade as a
 * 120s outage and silently serve up-to-1h-stale data for every query.
 */
export class SubgraphNonInfraError extends Error {}

/**
 * Execute a raw GraphQL query against the Subgraph Studio endpoint.
 * Adds Authorization header with the API key (D-27).
 *
 * quick-260611-h36: renamed from executeQuery (body unchanged) — all calls
 * now route through the circuit breaker in executeQueryWithMeta below.
 *
 * Failure classification (WR-04b): infra-class failures (network/timeout,
 * HTTP 429/5xx, missing-data body) throw plain Error and may open the
 * breaker; deterministic failures throw SubgraphNonInfraError and bypass it.
 */
async function executeQueryUpstream<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const endpoint = process.env.SUBGRAPH_STUDIO_URL ?? '';
  const apiKey = process.env.SUBGRAPH_STUDIO_API_KEY ?? '';

  if (!endpoint) {
    throw new SubgraphNonInfraError('SUBGRAPH_STUDIO_URL is not configured');
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // D-27: Authorization header held server-side only
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SUBGRAPH_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const message = `Subgraph request failed: ${res.status} ${res.statusText}`;
    // WR-04b: only rate-limit / server-side failures are outages; any other
    // 4xx is a deterministic request bug that must surface, not trip the breaker.
    if (res.status === 429 || res.status >= 500) throw new Error(message);
    throw new SubgraphNonInfraError(message);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };

  if (json.errors && json.errors.length > 0) {
    // WR-04b: a 200-with-errors body is a GraphQL validation/query bug, not an outage.
    throw new SubgraphNonInfraError(
      `Subgraph GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`,
    );
  }

  if (!json.data) {
    throw new Error('Subgraph returned no data');
  }

  return json.data;
}

// ── Circuit breaker + last-known-good snapshots (quick-260611-h36) ────────────
//
// LIVE OUTAGE context (2026-06-11): with Redis caching dead (Upstash quota),
// every request hammered the rate-limited Studio endpoint, which 429-stormed —
// feed/profile/positions rendered EMPTY. The breaker caps the blast radius:
// after ANY failure (network, 429, GraphQL errors, timeout) queries
// short-circuit for a cooldown window, serving last-known-good snapshots
// (<=1h old) where available. Half-open is implicit: once the cooldown
// elapses, the next call IS the probe.
//
// The subgraph stays UNTRUSTED INPUT — the contract remains the authority
// (T-h36-04: stale data is marked `_stale`, and receipts' outcome truth stays
// on-chain via querySettledFields' fail-safe-neutral contract).

/** Default breaker cooldown (ms). Override: SUBGRAPH_BREAKER_COOLDOWN_MS env. */
const SUBGRAPH_BREAKER_COOLDOWN_MS = 120_000;

/** Epoch ms until which the circuit is OPEN (0 = closed). */
let breakerOpenUntil = 0;

/**
 * WR-04a: true while a half-open probe is in flight. Exactly ONE caller may
 * probe upstream when the cooldown lapses — concurrent callers take the
 * stale path instead of thundering-herding the recovering (rate-limited)
 * Studio endpoint at the exact moment it comes back.
 */
let probeInFlight = false;

/**
 * Last-known-good snapshots keyed by hash(query + variables). DEDICATED
 * instance (never the shared memoryCache) so feed-route keys can't evict
 * snapshots. The 30s "fresh" TTL is irrelevant — getStale's 1h horizon
 * governs servability.
 */
const lastGood = new MemoryCache(200);

/** Stale-serve hard horizon: snapshots older than 1h are never served. */
const LAST_GOOD_STALE_HORIZON_MS = 3_600_000;

/** @internal Test isolation: closes the breaker + clears all snapshots. */
export function _resetBreakerForTesting(): void {
  breakerOpenUntil = 0;
  probeInFlight = false;
  lastGood._clearAllForTesting();
}

function breakerCooldownMs(): number {
  // Read per-call so tests can vary it without re-importing the module.
  const raw = Number(process.env.SUBGRAPH_BREAKER_COOLDOWN_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : SUBGRAPH_BREAKER_COOLDOWN_MS;
}

function snapshotKey(query: string, variables: Record<string, unknown>): string {
  return createHash('sha1').update(query + JSON.stringify(variables)).digest('hex');
}

/**
 * Breaker-wrapped query with staleness metadata.
 *
 * - Circuit OPEN: serve the last-good snapshot (<=1h) as `{ stale: true }`,
 *   else throw 'subgraph circuit open' so every caller's existing
 *   catch/degrade path fires exactly as today.
 * - Circuit CLOSED (or half-open probe): attempt upstream. Success stores the
 *   snapshot + closes the breaker. Failure opens the breaker for the cooldown
 *   and falls back to the stale path (rethrowing the ORIGINAL error when no
 *   servable snapshot exists).
 */
async function executeQueryWithMeta<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: T; stale: boolean; ageMs?: number }> {
  const logger = getLogger();
  const key = snapshotKey(query, variables);

  const serveStale = (): { data: T; stale: true; ageMs: number } | null => {
    const snapshot = lastGood.getStale<T>(key, LAST_GOOD_STALE_HORIZON_MS);
    if (!snapshot) return null;
    logger.warn(
      { event: 'subgraph_breaker_stale_served', key, ageMs: snapshot.ageMs },
      'Subgraph circuit open — serving last-known-good snapshot',
    );
    return { data: snapshot.value, stale: true, ageMs: snapshot.ageMs };
  };

  // ── Circuit OPEN: short-circuit to the snapshot (or throw) ─────────────────
  if (Date.now() < breakerOpenUntil) {
    const stale = serveStale();
    if (stale) return stale;
    throw new Error('subgraph circuit open — no last-good snapshot');
  }

  // ── Half-open single-probe gate (WR-04a) ───────────────────────────────────
  // breakerOpenUntil !== 0 here means the cooldown lapsed but no success has
  // closed the circuit yet — exactly ONE caller probes upstream; concurrent
  // callers get the stale path (or the circuit-open throw).
  const halfOpen = breakerOpenUntil !== 0;
  if (halfOpen && probeInFlight) {
    const stale = serveStale();
    if (stale) return stale;
    throw new Error('subgraph circuit open — half-open probe in flight');
  }

  if (halfOpen) probeInFlight = true;
  try {
    const data = await executeQueryUpstream<T>(query, variables);
    lastGood.set(key, data, 30_000);
    breakerOpenUntil = 0;
    return { data, stale: false };
  } catch (err) {
    // WR-04b: deterministic non-infra failures (GraphQL validation, missing
    // config, non-429 4xx) surface as bugs — never open the breaker for them
    // and never mask them with stale data.
    if (err instanceof SubgraphNonInfraError) throw err;
    const cooldownMs = breakerCooldownMs();
    breakerOpenUntil = Date.now() + cooldownMs;
    logger.warn(
      {
        event: 'subgraph_breaker_opened',
        cooldownMs,
        err: err instanceof Error ? err.message : String(err),
      },
      'Subgraph query failed — circuit breaker opened',
    );
    const stale = serveStale();
    if (stale) return stale;
    throw err;
  } finally {
    if (halfOpen) probeInFlight = false;
  }
}

/**
 * Execute a GraphQL query through the circuit breaker (data only).
 * Zero churn for the existing callers — staleness is dropped here; queryFeed
 * uses executeQueryWithMeta directly to surface `_stale`.
 */
async function executeQuery<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  return (await executeQueryWithMeta<T>(query, variables)).data;
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

  // quick-260611-h36: with-meta variant so a breaker-served snapshot is
  // surfaced to the feed route as `_stale: true` (→ `_source: 'stale'`).
  const { data, stale } = await executeQueryWithMeta<FeedData>(FEED_QUERY, variables);

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
    ...(stale ? { _stale: true } : {}),
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

/**
 * Query a Profile's REAL stats from the subgraph (RC4 — quick-260611-5mh).
 *
 * Entity id = lowercased address. Returns null when no Profile entity exists
 * (address never interacted). THROWS on network/GraphQL errors — callers wrap
 * and degrade to the previous hardcoded defaults (never 500 the profile read).
 *
 * @param userAddress Ethereum address of the profile owner
 */
export async function queryProfileStats(
  userAddress: string,
): Promise<SubgraphProfileStats | null> {
  type ProfileStatsData = {
    profile: {
      globalRep: number;
      totalCalls: number;
      settledCalls: number;
      wins: number;
      losses: number;
    } | null;
  };

  const data = await executeQuery<ProfileStatsData>(PROFILE_STATS_QUERY, {
    id: userAddress.toLowerCase(),
  });

  if (!data.profile) return null;
  return {
    globalRep: data.profile.globalRep,
    totalCalls: data.profile.totalCalls,
    settledCalls: data.profile.settledCalls,
    wins: data.profile.wins,
    losses: data.profile.losses,
  };
}

/**
 * Query all positions for a single call (quick-260611-5mh A5).
 *
 * Backs GET /api/calls/:id/positions (the web's FINAL POSITIONS block).
 * THROWS on network/GraphQL errors — the route wraps and degrades to [].
 *
 * @param callId The on-chain call id (numeric string).
 */
export async function queryCallPositions(
  callId: string,
): Promise<SubgraphCallPosition[]> {
  type CallPositionsData = {
    positions: SubgraphCallPosition[];
  };

  const data = await executeQuery<CallPositionsData>(CALL_POSITIONS_QUERY, {
    callIdStr: String(callId),
  });

  return data.positions ?? [];
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

// ── Accepted challenge ids (quick-260611-h36 — settlement-poller path) ────────

const ACCEPTED_CHALLENGES_QUERY = `
query AcceptedChallenges($callId: String!) {
  challenges(where: { callId: $callId, status: "Accepted" }) {
    challengeId
  }
}
`;

/**
 * Query accepted challenge IDs for a call THROUGH the circuit breaker
 * (Studio endpoint + Bearer key + last-good snapshots).
 *
 * Same GraphQL as settlement-watcher's getAcceptedChallengeIds, but THROWS on
 * failure — the settlement-poller wraps it with a []-fallback + warn (the
 * subgraph stays untrusted input: SettlementManager validates each id
 * on-chain via ce.getChallenge()). Settlement-watcher's own raw-fetch copy is
 * untouched (gated BullMQ path).
 *
 * @param callId The on-chain call id.
 */
export async function queryAcceptedChallengeIds(callId: bigint): Promise<bigint[]> {
  type AcceptedData = { challenges: { challengeId: string }[] };

  // WR-03: with-meta variant so a breaker-served snapshot is NEVER silently
  // treated as fresh for settle-time duel discovery — a duel accepted AFTER
  // the snapshot would be omitted from settle(...) and go unsettled in this
  // tx. The warn carries the snapshot age for the operator; the return shape
  // stays bigint[] (the poller passes ids straight through, and the contract
  // validates every id on-chain via ce.getChallenge regardless).
  const { data, stale, ageMs } = await executeQueryWithMeta<AcceptedData>(
    ACCEPTED_CHALLENGES_QUERY,
    { callId: callId.toString() },
  );

  if (stale) {
    getLogger().warn(
      { event: 'accepted_challenge_ids_stale', callId: callId.toString(), ageMs },
      `queryAcceptedChallengeIds served a STALE snapshot (${ageMs}ms old) — duels accepted after the snapshot will NOT settle in this tx`,
    );
  }

  return (data.challenges ?? []).map((c) => BigInt(c.challengeId));
}

// ── Settled-fields read (08-05 GAP 1 — Core Value: receipts must be truthful) ──
//
// Mirrors the web getSettledFields query (apps/web/lib/relayer-client.ts) so the
// relayer /live-state route can surface the SAME repDelta + fadeRealShare that the
// (already-correct) /og/[callId] card derives. This closes the fake-outcome gap:
// the receipt PAGE drives its outcome word from /live-state, so /live-state must
// carry these fields for the page's getOutcomeWordResult to return the TRUE §15.7
// word (CALLED IT / LOUD AND WRONG / CONTRARIAN HIT / COLD CALL) instead of falling
// back to a fabricated win.

/** Subgraph-sourced settled fields for a single call (08-05). */
export interface SubgraphSettledFields {
  /** RepEvent.delta for the caller (signed integer); null on absence/error. */
  repDelta: number | null;
  /**
   * Real (non-virtual) fade share of the settled fade+follow pool, range [0,1].
   * Computed from subgraph Position deposits (fade / (fade+follow)). Drives the
   * CONTRARIAN HIT threshold (D-08: >= 0.5). Null on any error.
   */
  fadeRealShare: number | null;
}

const SETTLED_FIELDS_QUERY = `
query SettledFields($callId: ID!, $callIdStr: String!) {
  repEvents(first: 1, where: { callId: $callId }, orderBy: timestamp, orderDirection: desc) {
    delta
    fallback
  }
  positions(first: 1000, where: { callId: $callIdStr }) {
    side
    usdcDeposited
  }
}
`;

/**
 * Query the subgraph for a call's settled repDelta + real fade share (08-05).
 *
 * FAIL-SAFE: returns `{ repDelta: null, fadeRealShare: null }` on ANY error (missing
 * Studio URL, network failure, GraphQL errors, malformed data) and NEVER throws.
 * A subgraph outage must therefore degrade the receipt page to a neutral state — it
 * must NEVER surface a fabricated win word (Core Value, T-08-05-02).
 *
 * Studio key stays server-side via executeQuery (D-27). The on-chain outcome enum
 * remains the source of truth for win/loss; these subgraph fields only refine the
 * §14.1 word (CONTRARIAN HIT / COLD CALL) and the REP delta display.
 *
 * @param callId The on-chain call id (numeric string).
 */
export async function querySettledFields(callId: string): Promise<SubgraphSettledFields> {
  const empty: SubgraphSettledFields = { repDelta: null, fadeRealShare: null };
  try {
    type SettledData = {
      repEvents?: Array<{ delta?: number | null; fallback?: boolean | null }>;
      positions?: Array<{ side?: string | null; usdcDeposited?: string | null }>;
    };
    // call(id:) is ID!, Position.callId is String — pass both forms (mirrors web).
    const data = await executeQuery<SettledData>(SETTLED_FIELDS_QUERY, {
      callId: String(callId),
      callIdStr: String(callId),
    });

    const repEvent = data.repEvents?.[0];

    // Real fade share from subgraph Position deposits (fade / (fade+follow)).
    // BigInt accumulation avoids float drift on raw 6-dp USDC amounts; malformed
    // entries are skipped so a bad value can never throw out of the success path.
    let fadeSum = 0n;
    let followSum = 0n;
    for (const p of data.positions ?? []) {
      const raw = p?.usdcDeposited;
      if (typeof raw !== 'string' || raw.trim().length === 0) continue;
      let amount: bigint;
      try {
        amount = BigInt(raw);
      } catch {
        continue; // non-parseable usdcDeposited — skip, never throw
      }
      if (p.side === 'fade') fadeSum += amount;
      else if (p.side === 'follow') followSum += amount;
    }
    const denom = fadeSum + followSum;
    const fadeRealShare = denom > 0n ? Number(fadeSum) / Number(denom) : null;

    return {
      repDelta: typeof repEvent?.delta === 'number' ? repEvent.delta : null,
      fadeRealShare,
    };
  } catch {
    // FAIL-SAFE — never throw; the route degrades to neutral, never a fake win.
    return empty;
  }
}
