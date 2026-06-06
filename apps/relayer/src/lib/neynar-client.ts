/**
 * Neynar (Farcaster) API client for the follow-graph (AUTH-18, FEED wave).
 *
 * Single endpoint: GET /v2/farcaster/following?fid=<fid> (header x-api-key).
 * Raw `fetch()` — the Neynar SDK (@neynar/nodejs-sdk) is gated behind the operator
 * checkpoint (RESEARCH A4); raw fetch is leaner and avoids a transitive-dep surface.
 *
 * Graceful degradation (Claude's Discretion, AUTH-17):
 *   - Missing NEYNAR_API_KEY → throws QuotaError so the caller degrades to empty.
 *   - 401/402/429 / non-200 → throws QuotaError (the "From your Farcaster" section
 *     returns { items: [], source: 'empty' } and never blocks the main feed).
 *
 * Security (V7): structured pino logs `{ event: 'neynar_*' }`; never logs the key.
 *
 * Requirements: AUTH-18.
 */

import { getLogger } from './logger.js';
import { QuotaError } from './x-api-client.js';

/** Neynar v2 base — documented endpoint. */
const NEYNAR_API_BASE = 'https://api.neynar.com/v2/farcaster';

/** Default page size for the following endpoint. */
const FOLLOWING_PAGE_SIZE = 100;

/** A single followed Farcaster account. */
export interface FarcasterFollowedUser {
  /** Farcaster id (fid) of the followed account. */
  fid: number;
  /** Farcaster username (fname), without the leading @ — may be empty if absent. */
  username: string;
}

/**
 * Fetch the accounts a given Farcaster fid follows (AUTH-18).
 *
 * Neynar's `/following` response shape: { users: [{ user: { fid, username, ... } }],
 * next: { cursor } }. We extract { fid, username } and paginate up to maxFollowing.
 *
 * @param fid The viewer's verified Farcaster id.
 * @param opts.maxFollowing Cap the number of fetched accounts (default 1000).
 * @returns The list of followed accounts.
 * @throws QuotaError on missing key, auth/quota failure, or any non-200.
 */
export async function fetchFarcasterFollowing(
  fid: number,
  opts?: { maxFollowing?: number; fetchImpl?: typeof fetch },
): Promise<FarcasterFollowedUser[]> {
  const logger = getLogger();
  const apiKey = process.env.NEYNAR_API_KEY;

  if (!apiKey) {
    logger.warn({ event: 'neynar_no_key' }, 'NEYNAR_API_KEY not set — From your Farcaster degrades to empty');
    throw new QuotaError('neynar_no_key', { status: 0 });
  }

  const doFetch = opts?.fetchImpl ?? fetch;
  const maxFollowing = opts?.maxFollowing ?? 1000;
  const collected: FarcasterFollowedUser[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 20 && collected.length < maxFollowing; page += 1) {
    const params = new URLSearchParams({
      fid: String(fid),
      limit: String(Math.min(FOLLOWING_PAGE_SIZE, maxFollowing - collected.length)),
    });
    if (cursor) params.set('cursor', cursor);

    const url = `${NEYNAR_API_BASE}/following?${params.toString()}`;

    let res: Response;
    try {
      res = await doFetch(url, {
        method: 'GET',
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
      });
    } catch (err) {
      logger.warn(
        { event: 'neynar_network_error', err: err instanceof Error ? err.message : String(err) },
        'Neynar network error — degrading to empty',
      );
      throw new QuotaError('neynar_network_error', { status: 0 });
    }

    if (res.status === 429) {
      logger.warn({ event: 'neynar_quota', status: 429 }, 'Neynar rate-limited (429) — degrading to empty');
      throw new QuotaError('neynar_rate_limited', { quota: true, status: 429 });
    }
    if (!res.ok) {
      logger.warn({ event: 'neynar_error', status: res.status }, 'Neynar non-200 — degrading to empty');
      throw new QuotaError(`neynar_status_${res.status}`, { status: res.status });
    }

    const json = (await res.json().catch(() => null)) as
      | { users?: Array<{ user?: { fid?: number; username?: string } }>; next?: { cursor?: string | null } }
      | null;

    const users = json?.users ?? [];
    for (const entry of users) {
      const u = entry?.user;
      if (u?.fid) collected.push({ fid: u.fid, username: u.username ?? '' });
    }

    cursor = json?.next?.cursor ?? undefined;
    if (!cursor) break;
  }

  logger.info({ event: 'neynar_following_ok', count: collected.length }, 'Fetched Farcaster following');
  return collected.slice(0, maxFollowing);
}
