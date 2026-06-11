/**
 * Auto-post worker — the X/Warpcast share-loop driver (D-02, SHARE-16/17/18).
 *
 * Settle-triggered automation that closes critical-path step 9 (Share to X/FC) at
 * the automation layer. For each newly-settled call it:
 *   1. Runs the Pitfall-8 cache-warm sequence BEFORE posting:
 *        (a) redis.incr(status_version:{callId})           — bust the OG cache
 *        (b) GET  {OG_BASE}/og/{id}?v={sv}                 — force a regen
 *        (c) HEAD {OG_BASE}/og/{id}?v={sv} → assert 200
 *            + X-Variant ∈ {settled, caller-exited} + a stable ETag
 *      On a miss/stale it retries within a ≤30s budget (SHARE-03) before giving up.
 *   2. PITFALL-18 TRIGGER RECONCILIATION (D-07, BLOCKING — RESOLVED): the Phase-4
 *      runbook implemented NO on-chain claim-delay — claims occur during the 24h
 *      dispute window, and a dispute reversal affects UNCLAIMED funds only
 *      (04-RESEARCH.md:652-654). Per D-07 "if the runbook is silent, default-ON
 *      fires after cache-warm succeeds", so the trigger is default-ON and fires
 *      AFTER cache-warm, gated by a configurable post-settle delay
 *      (AUTO_POST_DELAY_MS) to absorb early disputes (PITFALLS.md:789 auto-post
 *      mitigation). Default AUTO_POST_DELAY_MS = 0 in dev/test; operators set a
 *      short delay (e.g. 30–60m) in the runbook to ride out instant disputes.
 *   3. Builds the post text via the shared buildShareText(...) (@call-it/shared —
 *      the SAME pure builders the web Share button uses) and posts via the
 *      key-gated postTweet(...) (no-op when X_API_WRITE_TOKEN is absent — SHARE-17).
 *   4. Constructs the Farcaster cast URL in parallel via warpcastComposeUrl(...)
 *      (SHARE-18 — Phase 7 CONSTRUCTS it; landing the cast is Phase 8).
 *   5. Records posted_receipts(callId) with onConflictDoNothing — idempotent
 *      "posted-once" dedup so a re-processed/replayed CallSettled never double-posts.
 *
 * Never-throw discipline: every per-call step is wrapped; the scan loop survives any
 * single failure (mirrors notification-fanout.ts). The X write token is read ONLY by
 * postTweet (x-write-client) and never reaches the pure builders.
 *
 * Triggers watched (via TWO subscriptions on the shared chain-scanner —
 * quick-260611-o5b: one merged getLogs per 30s tick replaces this worker's former
 * private scan loop, which issued 2 getLogs per window):
 *   - CallSettled(uint256 indexed callId, uint8 outcome, int256 priceDelta)  [SettlementManager]
 *   - CallerExited(uint256 indexed callId, address indexed caller, ...)      [FollowFadeMarket]
 *
 * Requirements: SHARE-16, SHARE-17, SHARE-18, SHARE-03 (D-02, D-07).
 */

import type { PublicClient, Address, Log } from 'viem';
import { parseAbiItem } from 'viem';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { postedReceipts } from '../db/schema.js';
import { postTweet } from '../lib/x-write-client.js';
import { buildShareText, warpcastComposeUrl } from '@call-it/shared';
import { createChainScanner, type ChainScannerHandle } from './chain-scanner.js';
import type * as schema from '../db/schema.js';

type DrizzleDb = NodePgDatabase<typeof schema>;

// ── Trigger event ABIs ─────────────────────────────────────────────────────────

/** CallSettled on SettlementManager — outcome: 0=Pending,1=CallerWon,2=CallerLost. */
const CALL_SETTLED_EVENT = parseAbiItem(
  'event CallSettled(uint256 indexed callId, uint8 outcome, int256 priceDelta)',
);

/** CallerExited on FollowFadeMarket (same event the notification fan-out watches). */
const CALLER_EXITED_EVENT = parseAbiItem(
  'event CallerExited(uint256 indexed callId, address indexed caller, uint64 timeElapsed, uint256 penaltyPaid, uint256 stakeReturned, int256 reputationDelta)',
);

/** The two settled-card variants the HEAD probe accepts before posting (Pitfall 8). */
const ACCEPTED_VARIANTS = new Set(['settled', 'caller-exited']);

// ── Redis key helper (shared with notification-fanout) ─────────────────────────

function statusVersionKey(callId: string): string {
  return `status_version:${callId}`;
}

// ── Config / handle ────────────────────────────────────────────────────────────

export interface AutoPostWorkerConfig {
  /** viem PublicClient for getLogs/getBlockNumber. */
  publicClient: PublicClient;
  /** SettlementManager address (CallSettled source). */
  settlementManagerAddress: Address;
  /** FollowFadeMarket address (CallerExited source). */
  ffmAddress: Address;
  /** Drizzle ORM database client (Fly Postgres) — posted_receipts dedup. */
  db: DrizzleDb;
  /** OG/web base URL, e.g. https://callit.app (no trailing slash needed). */
  ogBaseUrl: string;
  /** Polling interval in ms. Default 30000. */
  intervalMs?: number;
  /**
   * Shared chain-scanner (quick-260611-o5b). When provided, this worker
   * registers its TWO subscriptions (SettlementManager/CallSettled +
   * FFM/CallerExited) on it and creates NO interval of its own. When absent
   * (unit tests / back-compat), a private scanner is created and owned here.
   */
  scanner?: ChainScannerHandle;
  /**
   * Post-settle delay before posting (Pitfall-18 mitigation). Fires AFTER
   * cache-warm succeeds. Default reads AUTO_POST_DELAY_MS env (0 if unset).
   */
  postDelayMs?: number;
  /** Cache-warm retry budget in ms (SHARE-03). Default 30000 (≤30s). */
  cacheWarmBudgetMs?: number;
  /** Delay between cache-warm retries in ms. Default 3000. */
  cacheWarmRetryDelayMs?: number;
  // ── Test seams ──────────────────────────────────────────────────────────────
  /** Injected fetch (GET/HEAD probes). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected sleep (delays). Defaults to setTimeout-based. Lets tests fake the clock. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Injected handle resolver (caller @handle). Defaults to address passthrough. */
  resolveHandle?: (caller: string) => Promise<string>;
}

export interface AutoPostWorkerHandle {
  stop(): void;
  getStats(): { lastBlockSeen: bigint; totalPosted: number; errors: number };
  /** Exposed for tests/operators — process a single trigger end-to-end. */
  processCall(input: ProcessCallInput): Promise<ProcessCallResult>;
}

export interface ProcessCallInput {
  callId: string;
  /** The expected OG card variant for the HEAD assertion. */
  expectedVariant: 'settled' | 'caller-exited';
  /** Caller-centric outcome word for buildShareText (e.g. "CALLED IT"). */
  outcomeWord: string;
  /** Caller address/handle (resolved to @handle for the post). */
  caller: string;
}

export interface ProcessCallResult {
  /** true when postTweet returned posted:true (real tweet). */
  posted: boolean;
  /** true when the call was already in posted_receipts (no second post). */
  alreadyPosted: boolean;
  /** true when the Pitfall-8 cache-warm gate passed (200 + matching X-Variant). */
  cacheWarmOk: boolean;
  /** The constructed Farcaster cast URL (SHARE-18 — always built in parallel). */
  warpcastUrl?: string;
  /** Why the post did not happen, when applicable. */
  reason?: string;
}

const DEFAULT_SLEEP = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ── Cache-warm (Pitfall 8) ───────────────────────────────────────────────────

interface CacheWarmResult {
  ok: boolean;
  etag?: string;
  variant?: string | null;
}

/**
 * Run the cache-warm sequence for one call and assert the regenerated settled card
 * is live (Pitfall 8): bump statusVersion → GET regen → HEAD asserting 200 +
 * X-Variant ∈ {settled, caller-exited} + a stable ETag. Retries within
 * cacheWarmBudgetMs (≤30s, SHARE-03). Never throws — returns { ok:false } on
 * exhaustion so the worker stays never-throw.
 */
async function runCacheWarm(
  callId: string,
  expectedVariant: 'settled' | 'caller-exited',
  config: AutoPostWorkerConfig,
): Promise<CacheWarmResult> {
  const doFetch = config.fetchImpl ?? fetch;
  const sleep = config.sleepImpl ?? DEFAULT_SLEEP;
  const budgetMs = config.cacheWarmBudgetMs ?? 30_000;
  const retryDelayMs = config.cacheWarmRetryDelayMs ?? 3_000;
  const base = config.ogBaseUrl.replace(/\/$/, '');

  // 1. Bump statusVersion (OG cache-bust). Non-fatal on Redis failure.
  let sv = 0;
  try {
    sv = await getRedis().incr(statusVersionKey(callId));
  } catch (err) {
    logger.warn(
      { event: 'auto_post_status_version_failed', callId, err: err instanceof Error ? err.message : String(err) },
      'statusVersion bump failed — proceeding with v=0 (cache may be slightly stale)',
    );
  }

  const ogUrl = `${base}/og/${callId}?v=${sv}`;
  let lastEtag: string | undefined;
  let lastVariant: string | null | undefined;
  let elapsed = 0;

  // Retry loop bounded by the ≤30s budget (SHARE-03).
  for (let attempt = 0; ; attempt += 1) {
    // 2. GET to force regen of the freshly-invalidated card.
    try {
      await doFetch(ogUrl, { method: 'GET' });
    } catch (err) {
      logger.warn(
        { event: 'auto_post_cache_warm_get_error', callId, attempt, err: err instanceof Error ? err.message : String(err) },
        'cache-warm GET failed — will retry within budget',
      );
    }

    // 3. HEAD probe: assert 200 + X-Variant + ETag.
    try {
      const head = await doFetch(ogUrl, { method: 'HEAD' });
      const variant = head.headers.get('X-Variant');
      const etag = head.headers.get('ETag') ?? undefined;
      lastVariant = variant;
      lastEtag = etag;

      if (head.status === 200 && variant && ACCEPTED_VARIANTS.has(variant) && variant === expectedVariant) {
        logger.info(
          { event: 'auto_post_cache_warm_ok', callId, variant, attempt },
          'OG card is cache-warm (200 + matching X-Variant) — clear to post',
        );
        return { ok: true, etag, variant };
      }

      logger.warn(
        { event: 'auto_post_cache_warm_miss', callId, status: head.status, variant, expectedVariant, attempt },
        'OG card not yet warm / variant mismatch — retrying within budget',
      );
    } catch (err) {
      logger.warn(
        { event: 'auto_post_cache_warm_head_error', callId, attempt, err: err instanceof Error ? err.message : String(err) },
        'cache-warm HEAD failed — will retry within budget',
      );
    }

    // Budget check: stop once another retry would exceed ≤30s (SHARE-03).
    elapsed += retryDelayMs;
    if (elapsed >= budgetMs) {
      logger.error(
        { event: 'auto_post_cache_warm_exhausted', callId, expectedVariant, lastVariant: lastVariant ?? null },
        'cache-warm budget exhausted — NOT posting (never post a card that 404s/misrenders on X)',
      );
      return { ok: false, etag: lastEtag, variant: lastVariant };
    }
    await sleep(retryDelayMs);
  }
}

// ── Single-call processing (cache-warm → delay → key-gated post → dedup) ────────

function makeProcessCall(config: AutoPostWorkerConfig): (input: ProcessCallInput) => Promise<ProcessCallResult> {
  const sleep = config.sleepImpl ?? DEFAULT_SLEEP;
  const postDelayMs =
    config.postDelayMs ??
    (() => {
      const raw = process.env.AUTO_POST_DELAY_MS;
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    })();
  const resolveHandle = config.resolveHandle ?? (async (c: string) => c);
  const base = config.ogBaseUrl.replace(/\/$/, '');

  return async function processCall(input: ProcessCallInput): Promise<ProcessCallResult> {
    const { callId, expectedVariant, outcomeWord, caller } = input;

    // The public receipt URL (carries OG meta) is what gets shared/embedded.
    const receiptUrl = `${base}/call/${callId}`;

    // SHARE-18: the Farcaster cast URL is ALWAYS constructed in parallel (Phase 7
    // constructs; Phase 8 lands the cast). Built via the shared pure builder.
    const handle = await resolveHandle(caller).catch(() => caller);
    const text = buildShareText({ outcomeWord, handle, statement: undefined });
    const warpcastUrl = warpcastComposeUrl(receiptUrl, text);

    // Idempotent dedup pre-check (select … where call_id = …) — never double-post a
    // re-processed/replayed event. The onConflictDoNothing write below is the
    // authoritative guard; this pre-check just avoids the redundant cache-warm + post.
    try {
      const existing = await config.db
        .select({ callId: postedReceipts.callId })
        .from(postedReceipts)
        .where(eq(postedReceipts.callId, parseInt(callId, 10)))
        .limit(1);
      if (existing.length > 0) {
        logger.info({ event: 'auto_post_already_posted', callId }, 'posted_receipts row exists — skipping (dedup)');
        return { posted: false, alreadyPosted: true, cacheWarmOk: true, warpcastUrl, reason: 'already_posted' };
      }
    } catch (err) {
      // DB select unavailable (e.g. dev without DB) — fall through to the
      // onConflictDoNothing write below, which is the authoritative idempotency guard.
      logger.warn(
        { event: 'auto_post_dedup_check_failed', callId, err: err instanceof Error ? err.message : String(err) },
        'posted_receipts dedup pre-check failed — relying on onConflictDoNothing write',
      );
    }

    // 1. Pitfall-8 cache-warm gate — MUST pass before any post (T-07-04-02).
    const warm = await runCacheWarm(callId, expectedVariant, config);
    if (!warm.ok) {
      return { posted: false, alreadyPosted: false, cacheWarmOk: false, warpcastUrl, reason: 'cache_warm_failed' };
    }

    // 2. Pitfall-18 post-settle delay (D-07) — fires AFTER cache-warm succeeds, to
    //    absorb early disputes (the runbook documents reversal affects unclaimed
    //    funds only; 04-RESEARCH.md:652-654).
    if (postDelayMs > 0) {
      logger.info({ event: 'auto_post_settle_delay', callId, postDelayMs }, 'Post-settle delay before posting (Pitfall-18)');
      await sleep(postDelayMs);
    }

    // 3. Key-gated post (SHARE-17). postTweet never throws — no-op without keys.
    const result = await postTweet({ text, url: receiptUrl, fetchImpl: config.fetchImpl });

    // 4. Record posted_receipts (idempotent). Written even on a key-gated no-op so a
    //    later key-budget does not retroactively re-post historical settled calls.
    try {
      await config.db
        .insert(postedReceipts)
        .values({ callId: parseInt(callId, 10) })
        .onConflictDoNothing({ target: postedReceipts.callId });
    } catch (err) {
      logger.error(
        { event: 'auto_post_dedup_write_failed', callId, err: err instanceof Error ? err.message : String(err) },
        'Failed to record posted_receipts — a future tick may retry (post is idempotent at the row level)',
      );
    }

    if (result.posted) {
      logger.info({ event: 'auto_post_posted', callId, tweetId: result.tweetId }, 'Auto-posted settled receipt to X');
    } else {
      logger.info(
        { event: 'auto_post_no_op', callId, reason: result.reason },
        'Auto-post degraded to no-op (key-gated / rate-limited / error) — mechanism ready when keys land',
      );
    }

    return {
      posted: result.posted,
      alreadyPosted: false,
      cacheWarmOk: true,
      warpcastUrl,
      reason: result.reason,
    };
  };
}

// ── Outcome-word mapping (caller-centric, on-chain enum) ────────────────────────

/**
 * Map the on-chain CallSettled outcome enum to a caller-centric outcome word for
 * the public post (the per-viewer FADED CORRECTLY / lozenge variants are a web
 * render concern — the worker posts the caller-centric word).
 *   1 = CallerWon → "CALLED IT"   2 = CallerLost → "LOUD AND WRONG"
 */
function settledOutcomeWord(outcome: number): string {
  return outcome === 1 ? 'CALLED IT' : 'LOUD AND WRONG';
}

// ── Main export ─────────────────────────────────────────────────────────────────

export function startAutoPostWorker(config: AutoPostWorkerConfig): AutoPostWorkerHandle {
  const { publicClient, settlementManagerAddress, ffmAddress, intervalMs = 30_000 } = config;
  const processCall = makeProcessCall(config);

  // NOTE (quick-260611-o5b): the chunking tunables and scan loop moved to the
  // shared chain-scanner — see chain-scanner.ts for the env fallback ladder.
  // The legacy AUTO_POST_BLOCK_SPAN env is retired with the private loop.
  let totalPosted = 0;
  // Worker-level errors count THIS worker's per-event processing failures only;
  // scan-level errors (get_head/get_logs/init) now live in scanner.getStats().
  let errors = 0;

  // Shared scanner when injected (production); private fallback otherwise
  // (unit tests / back-compat) — the private scanner is owned + started here.
  const ownsScanner = !config.scanner;
  const scanner =
    config.scanner ?? createChainScanner({ publicClient, intervalMs });

  // ORDERING NOTE: settled/exited logs now arrive in chain order (block, logIndex)
  // interleaved across addresses — the old loop processed settledLogs then
  // exitedLogs per window. Per-call processing is independent and idempotent
  // (posted_receipts dedup), so ordering is immaterial.

  // Subscription 1: (SettlementManager, CallSettled) — the kind='settled' branch
  // of the old processLogs, per-event try/catch unchanged.
  const unregisterSettled = scanner.register({
    name: 'auto-post:settled',
    address: settlementManagerAddress,
    event: CALL_SETTLED_EVENT,
    onLog: async (log: Log) => {
      try {
        const typed = log as unknown as { args?: { callId?: bigint; outcome?: number } };
        const args = typed.args;
        if (!args || args.callId === undefined) return;
        const callId = args.callId.toString();

        const outcome = Number(args.outcome ?? 0);
        // Only settled wins/losses post; a Pending (0) CallSettled should not occur
        // but is skipped defensively.
        if (outcome !== 1 && outcome !== 2) return;
        const res = await processCall({
          callId,
          expectedVariant: 'settled',
          outcomeWord: settledOutcomeWord(outcome),
          caller: '', // resolved via resolveHandle if configured; empty → address-less head
        });
        if (res.posted) totalPosted++;
      } catch (err) {
        errors++;
        logger.error(
          { event: 'auto_post_error', error: err instanceof Error ? err.message : String(err), phase: 'event_processing', kind: 'settled' },
          'Error processing trigger event — skipping (scan keeps running)',
        );
      }
    },
  });

  // Subscription 2: (FFM, CallerExited) — the kind='caller-exited' branch,
  // per-event try/catch unchanged.
  const unregisterExited = scanner.register({
    name: 'auto-post:caller-exited',
    address: ffmAddress,
    event: CALLER_EXITED_EVENT,
    onLog: async (log: Log) => {
      try {
        const typed = log as unknown as { args?: { callId?: bigint; caller?: string } };
        const args = typed.args;
        if (!args || args.callId === undefined) return;
        const callId = args.callId.toString();

        const res = await processCall({
          callId,
          expectedVariant: 'caller-exited',
          outcomeWord: 'CALLER EXITED',
          caller: (args.caller ?? '').toLowerCase(),
        });
        if (res.posted) totalPosted++;
      } catch (err) {
        errors++;
        logger.error(
          { event: 'auto_post_error', error: err instanceof Error ? err.message : String(err), phase: 'event_processing', kind: 'caller-exited' },
          'Error processing trigger event — skipping (scan keeps running)',
        );
      }
    },
  });

  if (ownsScanner) scanner.start();

  logger.info(
    { event: 'auto_post_worker_started', settlementManagerAddress, ffmAddress, sharedScanner: !ownsScanner },
    'Auto-post worker started',
  );

  return {
    stop(): void {
      unregisterSettled();
      unregisterExited();
      if (ownsScanner) scanner.stop();
    },
    getStats() {
      return { lastBlockSeen: scanner.getStats().lastBlockSeen, totalPosted, errors };
    },
    processCall,
  };
}
