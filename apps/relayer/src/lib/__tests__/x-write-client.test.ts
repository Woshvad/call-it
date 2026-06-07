/**
 * x-write-client.test.ts — unit tests for the key-gated X write client (D-02, SHARE-17).
 *
 * Mirrors the x-api-client degrade-to-empty discipline, but for the WRITE path the
 * contract is degrade-to-NO-OP (never throw): a missing key, a 429, a non-2xx, and a
 * network error all resolve to { posted:false, reason }. A present key drives exactly
 * one POST /2/tweets and returns { posted:true }.
 *
 * Requirements: SHARE-17, D-02. Threat: T-07-04-01 (token never logged / thrown).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { postTweet } from '../x-write-client.js';

const ORIGINAL_TOKEN = process.env.X_API_WRITE_TOKEN;

describe('x-write-client postTweet (D-02, SHARE-17)', () => {
  beforeEach(() => {
    delete process.env.X_API_WRITE_TOKEN;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.X_API_WRITE_TOKEN;
    else process.env.X_API_WRITE_TOKEN = ORIGINAL_TOKEN;
  });

  // ── Key-gate: missing token → no-op, NO throw, NO fetch (SHARE-17) ─────────────
  it('no-ops (no throw, no fetch) when X_API_WRITE_TOKEN is absent', async () => {
    const fetchImpl = vi.fn();

    const result = await postTweet({
      text: 'CALLED IT — @alice',
      url: 'https://callit.example/call/7',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.posted).toBe(false);
    expect(result.reason).toBe('no_key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // ── Present key → exactly ONE POST /2/tweets, posted:true ──────────────────────
  it('drives exactly one POST /2/tweets and returns posted:true when the key is present', async () => {
    process.env.X_API_WRITE_TOKEN = 'test-write-token';

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: '1881234567890' } }),
    } as unknown as Response);

    const result = await postTweet({
      text: 'CALLED IT — @alice: BTC above $100k',
      url: 'https://callit.example/call/7',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchImpl.mock.calls[0]!;
    expect(String(calledUrl)).toBe('https://api.twitter.com/2/tweets');
    expect((init as RequestInit).method).toBe('POST');
    // The body carries the text + receipt URL (X unfurls the OG card).
    const sentBody = JSON.parse(String((init as RequestInit).body)) as { text: string };
    expect(sentBody.text).toContain('CALLED IT — @alice');
    expect(sentBody.text).toContain('https://callit.example/call/7');
    // The token is sent as a Bearer header (never returned/logged).
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-write-token',
    });

    expect(result.posted).toBe(true);
    expect(result.tweetId).toBe('1881234567890');
  });

  // ── 429 → degrade to no-op (no throw) ──────────────────────────────────────────
  it('degrades to a no-op (no throw) on 429', async () => {
    process.env.X_API_WRITE_TOKEN = 'test-write-token';
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response);

    const result = await postTweet({
      text: 't',
      url: 'u',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.posted).toBe(false);
    expect(result.reason).toBe('rate_limited');
    expect(result.status).toBe(429);
  });

  // ── non-2xx → degrade to no-op (no throw) ──────────────────────────────────────
  it('degrades to a no-op (no throw) on a non-2xx error', async () => {
    process.env.X_API_WRITE_TOKEN = 'test-write-token';
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as unknown as Response);

    const result = await postTweet({
      text: 't',
      url: 'u',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.posted).toBe(false);
    expect(result.reason).toBe('http_error');
    expect(result.status).toBe(403);
  });

  // ── network error → degrade to no-op (no throw) ────────────────────────────────
  it('degrades to a no-op (no throw) on a network error', async () => {
    process.env.X_API_WRITE_TOKEN = 'test-write-token';
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    const result = await postTweet({
      text: 't',
      url: 'u',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.posted).toBe(false);
    expect(result.reason).toBe('network_error');
  });
});
