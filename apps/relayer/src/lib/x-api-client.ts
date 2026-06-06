/**
 * X (Twitter) API client for the follow-graph (AUTH-14, FEED wave).
 *
 * Single endpoint: GET /2/users/:id/following (requires the `follows.read` scope).
 * Raw `fetch()` with a Bearer token — NO npm SDK (RESEARCH anti-pattern: do NOT
 * auto-install an unverified `twitter-api-*` package; the X API client is left
 * unpinned and we use a thin fetch wrapper instead).
 *
 * Graceful degradation (Claude's Discretion, Pitfall 4, AUTH-17):
 *   - Missing X_API_BEARER_TOKEN → throws QuotaError so the caller degrades to empty.
 *   - 401/403/429 / non-200 → throws QuotaError (the "From your X" section then
 *     returns { items: [], source: 'empty' } and never blocks the main feed).
 *   - The X API pricing model changed 2026-02-06 (Basic legacy-only; pay-per-use
 *     default). The project's actual tier is confirmed by the FEED-wave operator
 *     checkpoint (Task 1); until then this client degrades to empty on any error.
 *
 * Security (V7): structured pino logs `{ event: 'x_api_*' }`; never logs the token.
 *
 * Requirements: AUTH-14.
 */

import { getLogger } from './logger.js';

/** X API base — public, documented endpoint. */
const X_API_BASE = 'https://api.twitter.com/2';

/** Default page size for the following endpoint (X API max is 1000). */
const FOLLOWING_PAGE_SIZE = 1000;

/** A single followed account as returned by the X API. */
export interface XFollowedUser {
  /** Stable X user id. */
  id: string;
  /** X username/handle (without the leading @). */
  username: string;
}

/**
 * Typed error the follow-graph layer catches to degrade to an empty section.
 * Covers a missing key, an auth/quota failure (401/403/429), and any non-200.
 * `quota` is true for 429 specifically so a quota alert can be raised.
 */
export class QuotaError extends Error {
  readonly code = 'x_api_quota';
  /** true when the failure was a rate-limit / quota response (HTTP 429). */
  readonly quota: boolean;
  /** HTTP status when available (0 = network / missing key). */
  readonly status: number;
  constructor(message: string, opts?: { quota?: boolean; status?: number }) {
    super(message);
    this.name = 'QuotaError';
    this.quota = opts?.quota ?? false;
    this.status = opts?.status ?? 0;
  }
}

/**
 * Fetch the accounts a given X user follows (AUTH-14).
 *
 * Paginates through the `following` endpoint up to `maxFollowing` accounts (the
 * follow-graph cross-reference only needs the handle set, not the full graph).
 *
 * @param userId The viewer's stable X user id (NOT the handle — the endpoint is keyed by id).
 * @param opts.maxFollowing Cap the number of fetched accounts (default 1000).
 * @returns The list of followed accounts.
 * @throws QuotaError on missing key, auth/quota failure, or any non-200.
 */
export async function fetchTwitterFollowing(
  userId: string,
  opts?: { maxFollowing?: number; fetchImpl?: typeof fetch },
): Promise<XFollowedUser[]> {
  const logger = getLogger();
  const token = process.env.X_API_BEARER_TOKEN;

  // Missing key → degrade to empty (the section never blocks the main feed).
  if (!token) {
    logger.warn({ event: 'x_api_no_key' }, 'X_API_BEARER_TOKEN not set — From your X degrades to empty');
    throw new QuotaError('x_api_no_key', { status: 0 });
  }

  const doFetch = opts?.fetchImpl ?? fetch;
  const maxFollowing = opts?.maxFollowing ?? FOLLOWING_PAGE_SIZE;
  const collected: XFollowedUser[] = [];
  let paginationToken: string | undefined;

  // Bounded pagination — at most a handful of pages for a sane follow graph.
  for (let page = 0; page < 10 && collected.length < maxFollowing; page += 1) {
    const params = new URLSearchParams({
      max_results: String(Math.min(FOLLOWING_PAGE_SIZE, maxFollowing - collected.length)),
    });
    if (paginationToken) params.set('pagination_token', paginationToken);

    const url = `${X_API_BASE}/users/${encodeURIComponent(userId)}/following?${params.toString()}`;

    let res: Response;
    try {
      res = await doFetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // Network failure → degrade to empty.
      logger.warn(
        { event: 'x_api_network_error', err: err instanceof Error ? err.message : String(err) },
        'X API network error — degrading to empty',
      );
      throw new QuotaError('x_api_network_error', { status: 0 });
    }

    if (res.status === 429) {
      logger.warn({ event: 'x_api_quota', status: 429 }, 'X API rate-limited (429) — degrading to empty');
      throw new QuotaError('x_api_rate_limited', { quota: true, status: 429 });
    }
    if (!res.ok) {
      // 401/403 (not enrolled / wrong tier / scope) or any other non-200.
      logger.warn({ event: 'x_api_error', status: res.status }, 'X API non-200 — degrading to empty');
      throw new QuotaError(`x_api_status_${res.status}`, { status: res.status });
    }

    const json = (await res.json().catch(() => null)) as
      | { data?: Array<{ id: string; username: string }>; meta?: { next_token?: string } }
      | null;

    const data = json?.data ?? [];
    for (const u of data) {
      if (u?.id && u?.username) collected.push({ id: u.id, username: u.username });
    }

    paginationToken = json?.meta?.next_token;
    if (!paginationToken) break;
  }

  logger.info({ event: 'x_api_following_ok', count: collected.length }, 'Fetched X following');
  return collected.slice(0, maxFollowing);
}
