/**
 * X (Twitter) write client — the auto-post share-loop mutation (D-02, SHARE-17).
 *
 * Single endpoint: POST /2/tweets (the ONLY X account mutation in the product).
 * Raw `fetch()` with a Bearer token — NO npm SDK (mirrors x-api-client.ts; the
 * RESEARCH anti-pattern: do NOT auto-install an unverified `twitter-api-*`
 * package — a thin fetch wrapper is the audited surface).
 *
 * CREDENTIAL CAVEAT (07-RESEARCH A2): POST /2/tweets requires a USER-CONTEXT
 * OAuth credential (OAuth 2.0 user access token or OAuth 1.0a user tokens), NOT
 * the app-only Bearer token used for read endpoints. `X_API_WRITE_TOKEN` is the
 * relayer-held user-context access token. The exact OAuth flow (refresh, consumer
 * secret) is provisioned at the FEED/auto-post operator checkpoint when X write
 * keys are budgeted. Until then this client degrades to a clean no-op.
 *
 * KEY-GATE / DEGRADE-TO-NO-OP (SHARE-17, differs from x-api-client):
 *   - Missing X_API_WRITE_TOKEN → log { event: 'x_write_no_key' } (token value
 *     NEVER logged) and RETURN { posted: false, reason: 'no_key' } — does NOT
 *     throw. The full mechanism ships and activates with zero code change once the
 *     key lands. (x-api-client throws QuotaError on the read path; the WRITE path
 *     must never throw so the auto-post worker stays never-throw.)
 *   - 429 / non-2xx / network error → log + RETURN a degraded result (no throw).
 *
 * Security (V7, T-07-04-01): structured pino logs `{ event: 'x_write_*' }` carry
 * status/ids but NEVER the token; X_API_WRITE_TOKEN is on the pino redact list.
 *
 * Requirements: SHARE-17, D-02.
 */

import { getLogger } from './logger.js';

/** X API base — public, documented endpoint. */
const X_API_BASE = 'https://api.twitter.com/2';

/** Result of an auto-post attempt. Never throws — always a structured outcome. */
export interface PostTweetResult {
  /** true only when a tweet was actually created (HTTP 2xx with an id). */
  posted: boolean;
  /**
   * Why the post did not happen (absent on success):
   *   - 'no_key'   → X_API_WRITE_TOKEN absent (degrade-to-no-op, SHARE-17)
   *   - 'rate_limited' → 429
   *   - 'http_error'   → non-2xx
   *   - 'network_error' → fetch threw
   */
  reason?: 'no_key' | 'rate_limited' | 'http_error' | 'network_error';
  /** The created tweet id, when available (success only). */
  tweetId?: string;
  /** HTTP status when a response was received (0 = no-key / network). */
  status?: number;
}

/** Input for a single auto-post: the public text + the receipt URL to embed. */
export interface PostTweetInput {
  /** The constructed post body (built by the shared buildShareText — token-free). */
  text: string;
  /** The receipt/OG URL; appended to the text so X renders the OG card preview. */
  url: string;
  /** Test seam — inject a fetch impl; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Post a single tweet for a settled receipt (the only X mutation, SHARE-17).
 *
 * NEVER throws: a missing key, a rate-limit, a non-2xx, or a network error all
 * resolve to a structured `{ posted: false, reason }`. The caller (auto-post
 * worker) relies on this so its per-call loop is never-throw and the share loop
 * activates with zero code change once `X_API_WRITE_TOKEN` is budgeted.
 *
 * @returns A PostTweetResult — posted:true only on a real 2xx tweet creation.
 */
export async function postTweet({ text, url, fetchImpl }: PostTweetInput): Promise<PostTweetResult> {
  const logger = getLogger();
  const token = process.env.X_API_WRITE_TOKEN;

  // KEY-GATE (SHARE-17): missing token → clean no-op, never throw. The token
  // value is NEVER logged (only the event name).
  if (!token) {
    logger.info(
      { event: 'x_write_no_key' },
      'X_API_WRITE_TOKEN not set — auto-post degrades to a no-op (activates with no code change once keys land)',
    );
    return { posted: false, reason: 'no_key', status: 0 };
  }

  // The receipt URL is appended to the body so X unfurls the OG card; the X API
  // does not take a separate embed field for v2 /2/tweets (unlike Warpcast).
  const body = url ? `${text} ${url}` : text;
  const doFetch = fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(`${X_API_BASE}/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: body }),
    });
  } catch (err) {
    logger.warn(
      { event: 'x_write_network_error', err: err instanceof Error ? err.message : String(err) },
      'X write network error — auto-post degraded to no-op',
    );
    return { posted: false, reason: 'network_error', status: 0 };
  }

  if (res.status === 429) {
    logger.warn({ event: 'x_write_rate_limited', status: 429 }, 'X write rate-limited (429) — degraded to no-op');
    return { posted: false, reason: 'rate_limited', status: 429 };
  }

  if (!res.ok) {
    // 401/403 (wrong tier / not user-context / scope) or any other non-2xx.
    logger.warn({ event: 'x_write_error', status: res.status }, 'X write non-2xx — degraded to no-op');
    return { posted: false, reason: 'http_error', status: res.status };
  }

  const json = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
  const tweetId = json?.data?.id;

  logger.info({ event: 'x_write_ok', status: res.status, tweetId }, 'Tweet posted');
  return { posted: true, tweetId, status: res.status };
}
