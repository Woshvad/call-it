/**
 * auto-post-worker.test.ts — GREEN (Plan 07-04) for the X/Warpcast auto-post worker (SC2).
 *
 * This was the Wave-0 RED scaffold (Plan 07-01, 6 it.todo). Plan 07-04 turns it GREEN
 * with real assertions for the 5 SC2 behaviors:
 *   (a) HEAD-verifies the OG card is cache-warm (200) + X-Variant matches BEFORE posting
 *   (b) ≤30s retry on a cache-warm miss/stale (fake clock) — never posts a 404/misrender
 *   (c) key-absent → no-op no-throw (degrade until X keys are budgeted, SHARE-17)
 *   (d) Pitfall-18 gate: posts only AFTER cache-warm + the post-settle delay (D-07)
 *   (e) re-processed/replayed settle does not double-post (posted_receipts dedup)
 * plus: constructs the post via the shared @call-it/shared builders (no token reaches them).
 *
 * Requirements: SHARE-16, SHARE-17, SHARE-18, SHARE-03 (D-02, D-07).
 * Threat: T-07-01-02 (token never reaches the pure builders), T-07-04-02/03/04.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startAutoPostWorker, type AutoPostWorkerConfig } from '../auto-post-worker.js';

const ORIGINAL_TOKEN = process.env.X_API_WRITE_TOKEN;

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** A HEAD/GET fetch mock that returns the given variant + status for /og HEAD probes. */
function makeOgFetch(opts: {
  variant?: string | null;
  status?: number;
  /** Number of initial HEAD misses before the card warms (for the retry test). */
  missesBeforeWarm?: number;
  /** Records POST /2/tweets calls. */
  onTweet?: (init: RequestInit) => void;
}): typeof fetch {
  let headCalls = 0;
  const missesBeforeWarm = opts.missesBeforeWarm ?? 0;
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (u.includes('/2/tweets')) {
      opts.onTweet?.(init ?? {});
      return { ok: true, status: 201, json: async () => ({ data: { id: 'tw_1' } }), headers: new Headers() } as unknown as Response;
    }

    if (u.includes('/og/')) {
      if (method === 'HEAD') {
        headCalls += 1;
        const warm = headCalls > missesBeforeWarm;
        const headers = new Headers();
        if (warm) {
          headers.set('X-Variant', opts.variant ?? 'settled');
          headers.set('ETag', '"abc123"');
        }
        return { ok: warm, status: warm ? (opts.status ?? 200) : 404, headers } as unknown as Response;
      }
      // GET regen
      return { ok: true, status: 200, headers: new Headers() } as unknown as Response;
    }

    return { ok: true, status: 200, headers: new Headers() } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** A drizzle-db mock: select(…).from().where().limit() dedup + insert/onConflictDoNothing chain. */
function makeDbMock(opts?: { alreadyPosted?: boolean }) {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  // select(...).from(...).where(...).limit(n) → rows[]
  const limit = vi.fn().mockResolvedValue(opts?.alreadyPosted ? [{ callId: 7 }] : []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return {
    db: {
      insert,
      select,
    } as unknown as AutoPostWorkerConfig['db'],
    insert,
    values,
    onConflictDoNothing,
    select,
    limit,
  };
}

const baseConfig = (over: Partial<AutoPostWorkerConfig>): AutoPostWorkerConfig => ({
  publicClient: { getBlockNumber: vi.fn().mockResolvedValue(100n), getLogs: vi.fn().mockResolvedValue([]) } as unknown as AutoPostWorkerConfig['publicClient'],
  settlementManagerAddress: '0x0000000000000000000000000000000000000001',
  ffmAddress: '0x0000000000000000000000000000000000000002',
  db: makeDbMock().db,
  ogBaseUrl: 'https://callit.test',
  intervalMs: 1_000_000, // never auto-tick during unit tests
  postDelayMs: 0,
  cacheWarmBudgetMs: 30_000,
  cacheWarmRetryDelayMs: 3_000,
  sleepImpl: async () => undefined, // fake clock: instant
  resolveHandle: async (c: string) => (c ? c : 'caller'),
  ...over,
});

describe('SC2: auto-post worker (Plan 07-04 GREEN)', () => {
  beforeEach(() => {
    delete process.env.X_API_WRITE_TOKEN;
    vi.clearAllMocks();
  });
  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.X_API_WRITE_TOKEN;
    else process.env.X_API_WRITE_TOKEN = ORIGINAL_TOKEN;
  });

  // ── (a) HEAD-verifies cache-warm 200 + X-Variant before posting ────────────────
  it('HEAD-verifies the OG card is cache-warm (200) and X-Variant matches before posting', async () => {
    process.env.X_API_WRITE_TOKEN = 'tok';
    let tweetPosted = false;
    const fetchImpl = makeOgFetch({ variant: 'settled', onTweet: () => { tweetPosted = true; } });
    const worker = startAutoPostWorker(baseConfig({ fetchImpl }));

    const res = await worker.processCall({ callId: '7', expectedVariant: 'settled', outcomeWord: 'CALLED IT', caller: '' });
    worker.stop();

    expect(res.cacheWarmOk).toBe(true);
    expect(res.posted).toBe(true);
    expect(tweetPosted).toBe(true);
    // The HEAD probe ran before the tweet (cache-warm gate).
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => `${String((c[1] as RequestInit)?.method ?? 'GET')} ${String(c[0])}`);
    const headIdx = calls.findIndex((c) => c.startsWith('HEAD') && c.includes('/og/'));
    const tweetIdx = calls.findIndex((c) => c.includes('/2/tweets'));
    expect(headIdx).toBeGreaterThanOrEqual(0);
    expect(tweetIdx).toBeGreaterThan(headIdx);
  });

  it('does NOT post when the HEAD X-Variant does not match the expected settled variant', async () => {
    process.env.X_API_WRITE_TOKEN = 'tok';
    let tweetPosted = false;
    // Card reports a 'live' variant — wrong for a settled trigger; budget exhausts.
    const fetchImpl = makeOgFetch({ variant: 'live', status: 200, onTweet: () => { tweetPosted = true; } });
    const worker = startAutoPostWorker(baseConfig({ fetchImpl, cacheWarmBudgetMs: 9_000, cacheWarmRetryDelayMs: 3_000 }));

    const res = await worker.processCall({ callId: '7', expectedVariant: 'settled', outcomeWord: 'CALLED IT', caller: '' });
    worker.stop();

    expect(res.cacheWarmOk).toBe(false);
    expect(res.posted).toBe(false);
    expect(tweetPosted).toBe(false);
  });

  // ── (b) ≤30s retry on cache-warm miss/stale (fake clock) ───────────────────────
  it('retries the cache-warm HEAD within a ≤30s budget before posting (SHARE-03)', async () => {
    process.env.X_API_WRITE_TOKEN = 'tok';
    const sleeps: number[] = [];
    // 2 HEAD misses, then warm on the 3rd.
    const fetchImpl = makeOgFetch({ variant: 'settled', missesBeforeWarm: 2 });
    const worker = startAutoPostWorker(baseConfig({
      fetchImpl,
      cacheWarmBudgetMs: 30_000,
      cacheWarmRetryDelayMs: 3_000,
      sleepImpl: async (ms: number) => { sleeps.push(ms); },
    }));

    const res = await worker.processCall({ callId: '7', expectedVariant: 'settled', outcomeWord: 'CALLED IT', caller: '' });
    worker.stop();

    expect(res.cacheWarmOk).toBe(true);
    expect(res.posted).toBe(true);
    // Retried (slept) at least twice, all within the ≤30s budget.
    expect(sleeps.length).toBeGreaterThanOrEqual(2);
    expect(sleeps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(30_000);
  });

  it('gives up (no post) when the cache-warm budget is exhausted', async () => {
    process.env.X_API_WRITE_TOKEN = 'tok';
    let tweetPosted = false;
    // Always misses — card never warms within budget.
    const fetchImpl = makeOgFetch({ variant: 'settled', missesBeforeWarm: 1000, onTweet: () => { tweetPosted = true; } });
    const worker = startAutoPostWorker(baseConfig({ fetchImpl, cacheWarmBudgetMs: 9_000, cacheWarmRetryDelayMs: 3_000 }));

    const res = await worker.processCall({ callId: '7', expectedVariant: 'settled', outcomeWord: 'CALLED IT', caller: '' });
    worker.stop();

    expect(res.cacheWarmOk).toBe(false);
    expect(res.posted).toBe(false);
    expect(tweetPosted).toBe(false);
  });

  // ── (c) Key-absent → no-op, NO throw (SHARE-17) ────────────────────────────────
  it('no-ops (no post, no throw) when X_API_WRITE_TOKEN is absent — degrades cleanly', async () => {
    // Token deliberately unset (beforeEach deletes it).
    const fetchImpl = makeOgFetch({ variant: 'settled' });
    const worker = startAutoPostWorker(baseConfig({ fetchImpl }));

    const res = await worker.processCall({ callId: '7', expectedVariant: 'settled', outcomeWord: 'CALLED IT', caller: '' });
    worker.stop();

    // Cache-warm still runs and passes, but the post degrades to a no-op.
    expect(res.cacheWarmOk).toBe(true);
    expect(res.posted).toBe(false);
    expect(res.reason).toBe('no_key');
    // SHARE-18: the Farcaster cast URL is still constructed (Phase 7 constructs it).
    expect(res.warpcastUrl).toContain('warpcast.com/~/compose');
  });

  // ── (d) Pitfall-18 gate: posts AFTER cache-warm + post-settle delay (D-07) ──────
  it('fires the post only AFTER cache-warm succeeds, gated by the post-settle delay', async () => {
    process.env.X_API_WRITE_TOKEN = 'tok';
    const order: string[] = [];
    const fetchImpl = makeOgFetch({ variant: 'settled', onTweet: () => order.push('tweet') });
    const worker = startAutoPostWorker(baseConfig({
      fetchImpl,
      postDelayMs: 60_000,
      sleepImpl: async (ms: number) => { order.push(`delay:${ms}`); },
    }));

    const res = await worker.processCall({ callId: '7', expectedVariant: 'settled', outcomeWord: 'CALLED IT', caller: '' });
    worker.stop();

    expect(res.posted).toBe(true);
    // The post-settle delay was applied, and it happened before the tweet.
    const delayIdx = order.findIndex((o) => o === 'delay:60000');
    const tweetIdx = order.findIndex((o) => o === 'tweet');
    expect(delayIdx).toBeGreaterThanOrEqual(0);
    expect(tweetIdx).toBeGreaterThan(delayIdx);
  });

  // ── (e) Dedup: re-processed/replayed settle does not double-post ───────────────
  it('does not double-post a call already in posted_receipts (idempotent dedup)', async () => {
    process.env.X_API_WRITE_TOKEN = 'tok';
    let tweetCount = 0;
    const fetchImpl = makeOgFetch({ variant: 'settled', onTweet: () => { tweetCount += 1; } });
    const dbMock = makeDbMock({ alreadyPosted: true });
    const worker = startAutoPostWorker(baseConfig({ fetchImpl, db: dbMock.db }));

    const res = await worker.processCall({ callId: '7', expectedVariant: 'settled', outcomeWord: 'CALLED IT', caller: '' });
    worker.stop();

    expect(res.alreadyPosted).toBe(true);
    expect(res.posted).toBe(false);
    expect(tweetCount).toBe(0); // no tweet on a replayed/duplicate event
  });

  it('writes posted_receipts with onConflictDoNothing after a (no-op) post', async () => {
    // No token → key-gated no-op, but the dedup row must still be written so a later
    // key-budget does not retroactively re-post historical settled calls.
    const fetchImpl = makeOgFetch({ variant: 'settled' });
    const dbMock = makeDbMock({ alreadyPosted: false });
    const worker = startAutoPostWorker(baseConfig({ fetchImpl, db: dbMock.db }));

    await worker.processCall({ callId: '7', expectedVariant: 'settled', outcomeWord: 'CALLED IT', caller: '' });
    worker.stop();

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(dbMock.values).toHaveBeenCalledWith({ callId: 7 });
    expect(dbMock.onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  // ── caller-exited trigger uses the caller-exited X-Variant ─────────────────────
  it('uses the caller-exited X-Variant for a CallerExited trigger', async () => {
    process.env.X_API_WRITE_TOKEN = 'tok';
    const fetchImpl = makeOgFetch({ variant: 'caller-exited' });
    const worker = startAutoPostWorker(baseConfig({ fetchImpl }));

    const res = await worker.processCall({
      callId: '9',
      expectedVariant: 'caller-exited',
      outcomeWord: 'CALLER EXITED',
      caller: '0xabc',
    });
    worker.stop();

    expect(res.cacheWarmOk).toBe(true);
    expect(res.posted).toBe(true);
  });
});
