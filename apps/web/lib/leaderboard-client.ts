/**
 * leaderboard-client.ts — dedicated server-side fetch for the Leaderboard page.
 *
 * D-06 (leaderboard data source): the All-time board is sorted from the subgraph
 * `Profile.globalRep` field at READ time (descending). The 7D / 30D toggles ship
 * WIRED but are backed by the SAME All-time `globalRep` data — a documented v1
 * limitation surfaced in the client copy. The `LeaderboardEntry` entity exists in
 * the schema but is UNPOPULATED, so this module deliberately does NOT depend on it.
 *
 * D-27 (gateway key stays server-side): the production Graph gateway URL embeds the
 * API key in its path (`.../api/<KEY>/subgraphs/id/<ID>`) — the key IS the URL. It
 * therefore lives ONLY in the server-only `SUBGRAPH_URL` env var, read here from the
 * Leaderboard Server Component. The `NEXT_PUBLIC_SUBGRAPH_URL` fallback is LEGACY
 * (keyless Studio URL only — keeps the current deploy working until the Vercel env
 * lands). NEVER put a gateway URL in any `NEXT_PUBLIC_*` var: Next.js inlines those
 * into every browser bundle. (Same posture as `relayer-client.ts getSettledFields`.)
 *
 * This is a DEDICATED module (not relayer-client.ts) to avoid a Wave-2 file-overlap
 * with Plan 07-03.
 *
 * Requirements: UI-12, UI-13, D-06, D-27
 */

import { resilientSubgraphFetch } from './subgraph-resilience';

const SUBGRAPH_URL = (
  process.env['SUBGRAPH_URL'] ??
  process.env['NEXT_PUBLIC_SUBGRAPH_URL'] ??
  ''
).replace(/\/$/, '');

/** A single ranked caller on the leaderboard (sourced from Profile.globalRep, D-06). */
export interface LeaderboardRow {
  /** Caller wallet address (the subgraph Profile id, lowercased). */
  address: string;
  /** Resolved display handle (handle → displayHandle → truncated address). */
  handle: string;
  /** Global reputation — the All-time D-06 sort key. */
  globalRep: number;
  /** Total calls made (for the row's secondary stat). */
  totalCalls: number;
  /** Settled calls (for the row's secondary stat). */
  settledCalls: number;
  /** Wins (for the row's secondary stat). */
  wins: number;
  /** 1-indexed rank after the globalRep DESC sort. */
  rank: number;
}

/** The leaderboard window toggle. All three are backed by All-time data (D-06). */
export type LeaderboardWindow = '7d' | '30d' | 'all';

export interface LeaderboardData {
  rows: LeaderboardRow[];
  /**
   * D-06 limitation flag — true means the returned rows are All-time `globalRep`
   * regardless of the requested window. The client renders the documented note.
   */
  windowedDataAvailable: false;
}

const LEADERBOARD_QUERY = `
query Leaderboard($first: Int!) {
  profiles(first: $first, orderBy: globalRep, orderDirection: desc, where: { globalRep_gt: 0 }) {
    id
    handle
    displayHandle
    globalRep
    totalCalls
    settledCalls
    wins
  }
}
`;

function truncate(address: string): string {
  if (!address || address.length < 10) return address || '...';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function resolveHandle(p: {
  id: string;
  handle?: string | null;
  displayHandle?: string | null;
}): string {
  if (p.handle && p.handle.trim().length > 0) return p.handle;
  if (p.displayHandle && p.displayHandle.trim().length > 0) return p.displayHandle;
  return truncate(p.id);
}

type SubgraphProfile = {
  id: string;
  handle?: string | null;
  displayHandle?: string | null;
  globalRep?: number | null;
  totalCalls?: number | null;
  settledCalls?: number | null;
  wins?: number | null;
};

/**
 * Pure parse+map+sort: builds the LeaderboardData from a profiles array. Extracted
 * (quick-260613-we4) to keep the retry loop clean; the happy-path output is
 * byte-equivalent to the pre-retry inline implementation.
 *
 * C9 (quick-260611-5mh): The Graph `orderBy` is SINGLE-field — multi-key ordering
 * happens here in JS after the fetch: globalRep desc, then settledCalls desc, then
 * wins desc. Rank is assigned AFTER the full sort.
 */
function buildLeaderboard(profiles: SubgraphProfile[]): LeaderboardData {
  const rows: LeaderboardRow[] = profiles
    .map((p) => ({
      address: p.id,
      handle: resolveHandle(p),
      globalRep: typeof p.globalRep === 'number' ? p.globalRep : 0,
      totalCalls: typeof p.totalCalls === 'number' ? p.totalCalls : 0,
      settledCalls: typeof p.settledCalls === 'number' ? p.settledCalls : 0,
      wins: typeof p.wins === 'number' ? p.wins : 0,
      rank: 0,
    }))
    .sort(
      (a, b) =>
        b.globalRep - a.globalRep ||
        b.settledCalls - a.settledCalls ||
        b.wins - a.wins,
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));

  return { rows, windowedDataAvailable: false };
}

/**
 * Fetch the leaderboard, sorted by `Profile.globalRep` DESC (D-06).
 *
 * The `window` argument is accepted so the page can pass through the active toggle,
 * but per D-06 all windows are backed by the All-time `globalRep` data — the
 * returned `windowedDataAvailable: false` tells the client to render the limitation
 * note. Server-side only (the Leaderboard page is a Server Component); the
 * server-only `SUBGRAPH_URL` env var keeps the gateway key out of the bundle (D-27).
 *
 * Resilience (quick-260614-1co): the fetch is delegated to the shared
 * `resilientSubgraphFetch` util (apps/web/lib/subgraph-resilience.ts), which
 * retries up to 3× on a transient failure — a thrown network error, HTTP 429, or
 * any 5xx (covers the observed Cloudflare 521 origin-down flap) — and likewise when
 * the response carries GraphQL `errors` / no `data`. On exhausted retries it serves
 * the util's module-level last-known-good board (stale, no throw) under
 * `leaderboard:${first}` if a prior fetch ever succeeded, so the Server Component
 * keeps rendering the board through a blip. NO `fallback` is passed here, so a cold
 * outage — all attempts failed AND no prior good board cached — still THROWS, and
 * page.tsx renders the UI-SPEC error state ("Couldn't load the tape…") in that one
 * unavoidable case. Returns an EMPTY (not throwing) result when the subgraph simply
 * has no ranked callers yet, and when no subgraph URL is configured.
 */
export async function getLeaderboard(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- accepted for API parity; D-06 backs all windows with All-time data
  _window: LeaderboardWindow = 'all',
  first = 100,
): Promise<LeaderboardData> {
  if (!SUBGRAPH_URL) {
    // No subgraph configured (local/dev without env) — empty board, not an error.
    return { rows: [], windowedDataAvailable: false };
  }

  return resilientSubgraphFetch<LeaderboardData>({
    url: SUBGRAPH_URL,
    query: LEADERBOARD_QUERY,
    variables: { first },
    cacheKey: `leaderboard:${first}`,
    parse: (d) => buildLeaderboard((d.profiles as SubgraphProfile[]) ?? []),
    // Always fetch fresh — the board reflects live globalRep at read time (D-06).
    // Freshness across blips is governed by the util's last-known-good cache.
    fetchInit: { cache: 'no-store' },
    // NO fallback: a cold outage with no cached board must still throw so
    // page.tsx renders the UI-SPEC error state.
  });
}
