/**
 * Notification fan-out worker.
 *
 * Watches CallerExited events from the FollowFadeMarket contract via viem getLogs
 * (polling every 30s). For each CallerExited event:
 *   1. Queries subgraph for current position holders (followers/faders) of the callId
 *   2. Batch-inserts one notification row per holder into Fly Postgres
 *   3. Bumps statusVersion Redis key for that callId (OG cache-bust — D-09)
 *   4. Fires a P1 Telegram alert (caller_exited_broadcast — SOCIAL-23)
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
 *   { event: 'notification_fanout_error' }
 *
 * Security:
 *   T-02-07-03: subgraph queries paginated (limit 100 per batch) to avoid DoS on
 *     high-follower calls; if subgraph fails, log + skip + retry on next tick.
 *   T-02-07-04: statusVersion bump in same tick as notification insert; if Redis
 *     fails, log error — OG card falls back to v=0 (slightly stale but not wrong).
 *
 * Requirements: D-13, D-14, SOCIAL-23, SOCIAL-24
 */

import type { PublicClient, Address, Log } from 'viem';
import { parseAbiItem } from 'viem';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { notifications } from '../db/schema.js';
import { sendAlert } from './alerts.js';
import type * as schema from '../db/schema.js';

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

  // 2. Batch-insert notification rows
  if (holders.length > 0) {
    const payload = {
      callerHandle: caller,
      penaltyPaid: (args.penaltyPaid ?? 0n).toString(),
      stakeReturned: (args.stakeReturned ?? 0n).toString(),
      reputationDelta: (args.reputationDelta ?? 0n).toString(),
    };

    const rows = holders.map((position) => ({
      userAddress: position.user.id.toLowerCase(),
      eventType: 'caller_exited' as const,
      callId: parseInt(callId, 10),
      payload,
    }));

    try {
      // Insert in batches of 100 to avoid query size limits
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await config.db.insert(notifications).values(batch);
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
  try {
    await sendAlert('caller_exited_broadcast', {
      callId,
      caller,
      holderCount: holders.length,
      penaltyPaid: (args.penaltyPaid ?? 0n).toString(),
      stakeReturned: (args.stakeReturned ?? 0n).toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: 'notification_fanout_error', error: message, callId, phase: 'alert' },
      'Failed to send caller_exited_broadcast alert — continuing',
    );
    // Non-fatal — alert failure must not block notification fan-out
  }
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

  let lastBlockSeen: bigint = 0n;
  let totalEventsProcessed = 0;
  let errors = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  // Initialize lastBlockSeen to current head at startup
  const initPromise = (async () => {
    try {
      lastBlockSeen = await publicClient.getBlockNumber();
      logger.info(
        { event: 'notification_fanout_started', lastBlockSeen: lastBlockSeen.toString(), ffmAddress },
        'Notification fan-out worker started',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'notification_fanout_error', error: message, phase: 'init' });
      errors++;
      lastBlockSeen = 0n;
    }
  })();

  /**
   * One polling tick: fetch CallerExited logs since lastBlockSeen and fan out.
   */
  async function tick(): Promise<void> {
    if (stopped) return;

    // Wait for initialization to complete
    await initPromise;

    logger.info(
      { event: 'notification_fanout_tick', lastBlockSeen: lastBlockSeen.toString() },
      'Notification fan-out tick',
    );

    try {
      const fromBlock = lastBlockSeen === 0n ? 1n : lastBlockSeen + 1n;

      const logs = await publicClient.getLogs({
        address: ffmAddress,
        event: CALLER_EXITED_EVENT,
        fromBlock,
        toBlock: 'latest',
      });

      // Advance lastBlockSeen regardless of whether logs were found
      try {
        const currentBlock = await publicClient.getBlockNumber();
        if (currentBlock > lastBlockSeen) {
          lastBlockSeen = currentBlock;
        }
      } catch {
        // Non-fatal — advance will happen on next tick
      }

      // Process each CallerExited event
      for (const log of logs) {
        if (stopped) break;
        try {
          await processCallerExitedEvent(log, config);
          totalEventsProcessed++;

          // Track highest block seen
          if (log.blockNumber !== null && log.blockNumber !== undefined) {
            if (log.blockNumber > lastBlockSeen) {
              lastBlockSeen = log.blockNumber;
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(
            { event: 'notification_fanout_error', error: message, phase: 'event_processing' },
            'Error processing CallerExited event — skipping',
          );
          errors++;
          // Do NOT throw — interval must keep running
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          event: 'notification_fanout_error',
          error: message,
          lastBlockSeen: lastBlockSeen.toString(),
          phase: 'get_logs',
        },
        'getLogs failed — will retry next tick',
      );
      errors++;
      // Do NOT throw — the interval must keep running through transient RPC errors
    }
  }

  // Start polling interval
  intervalId = setInterval(() => {
    tick().catch((err) => {
      // tick() catches all errors internally; this is a final safety net
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'notification_fanout_error', error: message, phase: 'interval-catch' });
      errors++;
    });
  }, intervalMs);

  return {
    stop(): void {
      stopped = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    getStats(): { lastBlockSeen: bigint; totalEventsProcessed: number; errors: number } {
      return { lastBlockSeen, totalEventsProcessed, errors };
    },
  };
}
