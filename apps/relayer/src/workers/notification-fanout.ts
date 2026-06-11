/**
 * Notification fan-out worker.
 *
 * Watches CallerExited events from the FollowFadeMarket contract by subscribing to
 * the shared chain-scanner (quick-260611-o5b — one merged getLogs per 30s tick
 * replaces this worker's former private scan loop). For each CallerExited event:
 *   1. Queries subgraph for current position holders (followers/faders) of the callId
 *   2. Batch-inserts one notification row per holder into Fly Postgres
 *   3. Bumps statusVersion Redis key for that callId (OG cache-bust — D-09)
 *   4. Fires a P1 Telegram alert (caller_exited_broadcast — SOCIAL-23)
 *
 * Phase 3 extension — challenge event notifications (SOCIAL-40, SOCIAL-41, SOCIAL-42):
 *   On each tick, also queries subgraph for new challenge events (ChallengeProposed,
 *   ChallengeAccepted, ChallengeRejected) created in the last polling window and
 *   inserts notification rows using ON CONFLICT DO NOTHING for idempotency.
 *     - ChallengeProposed  → notify the call.caller (they got challenged)
 *     - ChallengeAccepted  → notify the challenger (their challenge was accepted)
 *     - ChallengeRejected  → notify the challenger (their challenge was rejected)
 *
 * NO on-chain loops — all off-chain via subgraph query (gas/DoS safety — D-13).
 *
 * Log events:
 *   { event: 'notification_fanout_started' }
 *   { event: 'notification_fanout_tick' }
 *   { event: 'notification_fanout_caller_exited' }
 *   { event: 'notification_fanout_holders_resolved' }
 *   { event: 'notification_fanout_notifications_inserted' }
 *   { event: 'notification_fanout_status_version_bumped' }
 *   { event: 'notification_fanout_challenge_notifications' }
 *   { event: 'notification_fanout_error' }
 *
 * Security:
 *   T-02-07-03: subgraph queries paginated (limit 100 per batch) to avoid DoS on
 *     high-follower calls; if subgraph fails, log + skip + retry on next tick.
 *   T-02-07-04: statusVersion bump in same tick as notification insert; if Redis
 *     fails, log error — OG card falls back to v=0 (slightly stale but not wrong).
 *
 * Requirements: D-13, D-14, SOCIAL-23, SOCIAL-24, SOCIAL-40, SOCIAL-41, SOCIAL-42
 */

import type { PublicClient, Address, Log } from 'viem';
import { parseAbiItem } from 'viem';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { notifications } from '../db/schema.js';
import { sendAlertSafe } from './alerts.js';
import { PROFILE_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared';
import { createChainScanner, type ChainScannerHandle } from './chain-scanner.js';
import type * as schema from '../db/schema.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ── ProfileRegistry.displayHandle slice (WR-06) ────────────────────────────────
const PROFILE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'displayHandle',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

/**
 * Resolve a caller's display handle from the deployed ProfileRegistry (WR-06).
 * Falls back to the lowercased 0x address when no handle is set or the read
 * fails — never throws.
 */
async function resolveCallerHandle(
  publicClient: PublicClient,
  caller: string,
): Promise<string> {
  if ((PROFILE_REGISTRY_ARBITRUM_SEPOLIA as string).toLowerCase() === ZERO_ADDRESS) {
    return caller;
  }
  try {
    const handle = (await publicClient.readContract({
      address: PROFILE_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`,
      abi: PROFILE_REGISTRY_ABI,
      functionName: 'displayHandle',
      args: [caller as `0x${string}`],
    })) as string;
    return handle && handle.length > 0 ? handle : caller;
  } catch {
    return caller;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DrizzleDb = NodePgDatabase<typeof schema>;

export interface NotificationFanoutConfig {
  /** viem PublicClient for getLogs calls */
  publicClient: PublicClient;
  /** FollowFadeMarket contract address */
  ffmAddress: Address;
  /** Drizzle ORM database client (Fly Postgres) */
  db: DrizzleDb;
  /** Subgraph URL for querying current position holders */
  subgraphUrl: string;
  /** Polling interval in milliseconds. Default: 30000 (30s) per D-13/A4 */
  intervalMs?: number;
  /**
   * Shared chain-scanner (quick-260611-o5b). When provided, this worker
   * registers its (FFM, CallerExited) subscription + challenge onTick pass on it
   * and creates NO interval of its own. When absent (unit tests / back-compat),
   * a private scanner is created and owned by this worker.
   */
  scanner?: ChainScannerHandle;
}

export interface NotificationFanoutHandle {
  /** Stop the polling interval */
  stop(): void;
  /** Returns diagnostic stats */
  getStats(): { lastBlockSeen: bigint; totalEventsProcessed: number; errors: number };
}

// ── CallerExited event ABI ────────────────────────────────────────────────────

const CALLER_EXITED_EVENT = parseAbiItem(
  'event CallerExited(uint256 indexed callId, address indexed caller, uint64 timeElapsed, uint256 penaltyPaid, uint256 stakeReturned, int256 reputationDelta)',
);

// ── Redis key helpers ─────────────────────────────────────────────────────────

function statusVersionKey(callId: string): string {
  return `status_version:${callId}`;
}

// ── Subgraph query ────────────────────────────────────────────────────────────

interface SubgraphPosition {
  id: string;
  user: { id: string };
  side: string;
  usdcDeposited: string;
  sharesHeld: string;
}

interface SubgraphPositionsResponse {
  data?: {
    positions?: SubgraphPosition[];
  };
  errors?: Array<{ message: string }>;
}

/**
 * Query subgraph for current position holders of a callId.
 * Paginated at 100 per batch (T-02-07-03).
 */
async function queryHolders(
  subgraphUrl: string,
  callId: string,
): Promise<SubgraphPosition[]> {
  const allPositions: SubgraphPosition[] = [];
  let skip = 0;
  const first = 100;

  while (true) {
    const query = `
      query GetHolders($callId: String!, $first: Int!, $skip: Int!) {
        positions(
          where: { callId: $callId, exitedAt: null }
          first: $first
          skip: $skip
          orderBy: id
          orderDirection: asc
        ) {
          id
          user { id }
          side
          usdcDeposited
          sharesHeld
        }
      }
    `;

    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { callId, first, skip } }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph HTTP error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as SubgraphPositionsResponse;

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Subgraph query error: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    const positions = json.data?.positions ?? [];
    allPositions.push(...positions);

    // If fewer than `first` results were returned, we've reached the end
    if (positions.length < first) {
      break;
    }

    skip += first;
  }

  return allPositions;
}

// ── Event processing ──────────────────────────────────────────────────────────

interface CallerExitedEventArgs {
  callId: bigint;
  caller: Address;
  timeElapsed: bigint;
  penaltyPaid: bigint;
  stakeReturned: bigint;
  reputationDelta: bigint;
}

async function processCallerExitedEvent(
  log: Log,
  config: NotificationFanoutConfig,
): Promise<void> {
  // Cast to typed log to access args — getLogs with event parameter returns typed args
  const typedLog = log as unknown as { args?: CallerExitedEventArgs };
  const args = typedLog.args;
  if (!args || args.callId === undefined) return;

  const callId = args.callId.toString();
  const caller = (args.caller ?? '').toLowerCase();

  logger.info(
    { event: 'notification_fanout_caller_exited', callId, caller },
    'Processing CallerExited event',
  );

  // 1. Query subgraph for current holders (paginated, T-02-07-03)
  let holders: SubgraphPosition[] = [];
  try {
    holders = await queryHolders(config.subgraphUrl, callId);
    logger.info(
      { event: 'notification_fanout_holders_resolved', callId, holderCount: holders.length },
      'Resolved position holders from subgraph',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { event: 'notification_fanout_error', error: message, callId, phase: 'subgraph_query' },
      'Subgraph query failed — skipping fan-out for this event',
    );
    // Log and skip — retry on next tick (T-02-07-03)
    return;
  }

  // WR-06: exclude the caller's own address from the holder set — a caller who
  // also holds a follow/fade position must not be told "you exited your own call".
  const recipientHolders = holders.filter(
    (position) => position.user.id.toLowerCase() !== caller,
  );

  // WR-06: resolve the caller's display handle (never the raw 0x address) so the
  // UI renders @handle. Falls back to the address when no handle is set.
  const callerHandle = await resolveCallerHandle(config.publicClient, caller);

  // 2. Batch-insert notification rows
  if (recipientHolders.length > 0) {
    const payload = {
      callerHandle,
      penaltyPaid: (args.penaltyPaid ?? 0n).toString(),
      stakeReturned: (args.stakeReturned ?? 0n).toString(),
      reputationDelta: (args.reputationDelta ?? 0n).toString(),
    };

    const rows = recipientHolders.map((position) => ({
      userAddress: position.user.id.toLowerCase(),
      eventType: 'caller_exited' as const,
      callId: parseInt(callId, 10),
      payload,
    }));

    try {
      // Insert in batches of 100 to avoid query size limits.
      // WR-05: ON CONFLICT DO NOTHING on the (user_address, event_type, call_id)
      // unique index makes fan-out idempotent — a re-processed CallerExited event
      // (capped-range overlap, restart, RPC retry) cannot create duplicate rows.
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await config.db
          .insert(notifications)
          .values(batch)
          .onConflictDoNothing({
            target: [notifications.userAddress, notifications.eventType, notifications.callId],
          });
      }
      logger.info(
        { event: 'notification_fanout_notifications_inserted', callId, count: rows.length },
        'Notification rows inserted',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { event: 'notification_fanout_error', error: message, callId, phase: 'db_insert' },
        'Failed to insert notification rows',
      );
      // Continue to statusVersion bump even if DB insert fails
    }
  }

  // 3. Bump statusVersion in Redis for OG cache-bust (D-09, T-02-07-04)
  try {
    const redis = getRedis();
    await redis.incr(statusVersionKey(callId));
    logger.info(
      { event: 'notification_fanout_status_version_bumped', callId },
      'statusVersion bumped in Redis',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { event: 'notification_fanout_error', error: message, callId, phase: 'redis_bump' },
      'Failed to bump statusVersion in Redis — OG card may serve stale variant',
    );
    // Non-fatal (T-02-07-04 — OG falls back to v=0)
  }

  // 4. Fire P1 informational alert (D-13 public broadcast)
  // WR-03: sendAlertSafe swallows-and-logs (including getBot() throwing on missing
  // Telegram env in staging), so this can never crash the fan-out tick.
  await sendAlertSafe('caller_exited_broadcast', {
    callId,
    caller,
    holderCount: recipientHolders.length,
    penaltyPaid: (args.penaltyPaid ?? 0n).toString(),
    stakeReturned: (args.stakeReturned ?? 0n).toString(),
  });
}

// ── Challenge event notification processing (Phase 3 — SOCIAL-40/41/42) ────────

interface SubgraphChallengeEvent {
  id: string;
  status: string;
  call: string;
  challenger: string;
  caller: string;
  proposedAt: string;
  acceptedAt: string | null;
}

interface SubgraphChallengeEventsResponse {
  data?: {
    challenges?: SubgraphChallengeEvent[];
  };
  errors?: Array<{ message: string }>;
}

/**
 * Query subgraph for challenges with recent status changes and fan out notifications.
 *
 * Uses proposedAt timestamp as a proxy for "recently proposed". To avoid replaying
 * old events, only challenges proposed/updated in the last 2× polling intervals
 * (2 × 30s = 60s) are queried — safely wider than one tick but narrow enough to
 * avoid re-notifying settled old challenges.
 *
 * Idempotency: ON CONFLICT DO NOTHING on (user_address, event_type, call_id) unique
 * index guarantees exactly-once delivery even if the same challenge is returned on
 * multiple consecutive ticks.
 *
 * Non-fatal: errors logged and skipped — does not affect CallerExited fan-out.
 */
async function processChallengeNotifications(config: NotificationFanoutConfig): Promise<void> {
  // Look back 60s to overlap with polling interval safely
  const cutoffSec = Math.floor((Date.now() - 60_000) / 1000).toString();

  const query = `
    query GetRecentChallenges($since: String!) {
      challenges(
        where: { proposedAt_gt: $since }
        first: 100
        orderBy: proposedAt
        orderDirection: desc
      ) {
        id
        status
        call
        challenger
        caller
        proposedAt
        acceptedAt
      }
    }
  `;

  const response = await fetch(config.subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { since: cutoffSec } }),
  });

  if (!response.ok) {
    throw new Error(`Subgraph HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as SubgraphChallengeEventsResponse;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Subgraph error: ${json.errors.map((e) => e.message).join(', ')}`);
  }

  const challenges = json.data?.challenges ?? [];
  if (challenges.length === 0) return;

  // Build notification rows for each relevant status
  const rows: {
    userAddress: string;
    eventType: 'challenge_proposed' | 'challenge_accepted' | 'challenge_rejected';
    callId: number;
    payload: Record<string, unknown>;
  }[] = [];

  for (const c of challenges) {
    const callIdNum = parseInt(c.call, 10);
    if (isNaN(callIdNum)) continue;

    const challengeIdStr = c.id;
    const payload = { challengeId: challengeIdStr };

    if (c.status === 'Proposed' && c.caller) {
      // Notify the call.caller — they got challenged
      rows.push({
        userAddress: c.caller.toLowerCase(),
        eventType: 'challenge_proposed',
        callId: callIdNum,
        payload,
      });
    } else if (c.status === 'Accepted' && c.challenger) {
      // Notify the challenger — their challenge was accepted
      rows.push({
        userAddress: c.challenger.toLowerCase(),
        eventType: 'challenge_accepted',
        callId: callIdNum,
        payload,
      });
    } else if (c.status === 'Rejected' && c.challenger) {
      // Notify the challenger — their challenge was rejected
      rows.push({
        userAddress: c.challenger.toLowerCase(),
        eventType: 'challenge_rejected',
        callId: callIdNum,
        payload,
      });
    }
  }

  if (rows.length === 0) return;

  // Insert with ON CONFLICT DO NOTHING for idempotency (WR-05 pattern)
  const BATCH_SIZE = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await config.db
      .insert(notifications)
      .values(batch)
      .onConflictDoNothing({
        target: [notifications.userAddress, notifications.eventType, notifications.callId],
      });
    inserted += batch.length;
  }

  logger.info(
    { event: 'notification_fanout_challenge_notifications', count: inserted, statuses: challenges.map((c) => c.status) },
    'Challenge notifications fanned out',
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Start the notification fan-out worker.
 *
 * @param config - worker configuration
 * @returns handle with stop() and getStats()
 */
export function startNotificationFanout(config: NotificationFanoutConfig): NotificationFanoutHandle {
  const { publicClient, ffmAddress, intervalMs = 30_000 } = config;

  // NOTE (quick-260611-o5b): the chunking tunables (blockSpan/maxWindowsPerTick)
  // moved to the shared chain-scanner together with the scan loop — see
  // chain-scanner.ts for the env fallback ladder and the corrected Alchemy
  // free-tier rationale (10K-block RANGE for filtered queries, not 10 blocks
  // per request).
  let totalEventsProcessed = 0;
  // Worker-level errors count THIS worker's per-event processing failures only;
  // scan-level errors (get_head/get_logs/init) now live in scanner.getStats().
  let errors = 0;

  // Shared scanner when injected (production); private fallback otherwise
  // (unit tests / back-compat) — the private scanner is owned + started here.
  const ownsScanner = !config.scanner;
  const scanner =
    config.scanner ?? createChainScanner({ publicClient, intervalMs });

  // ONE (FFM, CallerExited) subscription — the existing per-event try/catch body
  // moved into the handler unchanged (never-throw discipline preserved).
  const unregisterLog = scanner.register({
    name: 'notification-fanout',
    address: ffmAddress,
    event: CALLER_EXITED_EVENT,
    onLog: async (log: Log) => {
      try {
        await processCallerExitedEvent(log, config);
        totalEventsProcessed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'notification_fanout_error', error: message, phase: 'event_processing' },
          'Error processing CallerExited event — skipping',
        );
        errors++;
        // Do NOT throw — the scanner isolates handlers anyway, but the existing
        // error taxonomy/counters stay worker-local.
      }
    },
  });

  // ── Phase 3: Challenge event notifications ────────────────────────────
  // Runs at the end of EVERY initialized scanner tick — including the
  // get_head-failure path (subgraph/time-windowed, independent of block range).
  // Skipped if subgraphUrl is empty (dev without subgraph); errors are non-fatal.
  const unregisterTick = scanner.onTick('notification-fanout-challenges', async () => {
    if (!config.subgraphUrl) return;
    try {
      await processChallengeNotifications(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { event: 'notification_fanout_error', error: message, phase: 'challenge_notifications' },
        'Challenge notification processing failed — will retry next tick',
      );
      // Non-fatal — do NOT increment errors that block the worker
    }
  });

  if (ownsScanner) scanner.start();

  logger.info(
    { event: 'notification_fanout_started', ffmAddress, sharedScanner: !ownsScanner },
    'Notification fan-out worker started',
  );

  return {
    stop(): void {
      unregisterLog();
      unregisterTick();
      if (ownsScanner) scanner.stop();
    },

    getStats(): { lastBlockSeen: bigint; totalEventsProcessed: number; errors: number } {
      return { lastBlockSeen: scanner.getStats().lastBlockSeen, totalEventsProcessed, errors };
    },
  };
}
