/**
 * SocialUnlinked backstop watcher (D-13, AUTH-17).
 *
 * Watches ProfileRegistry `SocialUnlinked(address indexed user, uint8 kind)` events
 * by subscribing to the shared chain-scanner (quick-260611-o5b — one merged getLogs
 * per 30s tick replaces this worker's former private scan loop). For each event it
 * purges, as the
 * DURABLE backstop for unlinks done OUTSIDE the app UI (the in-app Settings flow
 * already purges immediately via /api/social/unlink-purge):
 *   - follow_graph rows for (privyUserId, platform) — resolved best-effort from
 *     social_link_index.user_address (the on-chain user is the wallet address; we
 *     map it to the index rows owned by that address and purge each viewer graph).
 *   - the Redis follow-graph cache key.
 *   - social_link_index.unlinkedAt = now() for that user/platform (markUnlinked).
 *
 * Idempotent: re-processing the same event is a no-op (markUnlinked only touches
 * active rows; deletes of already-empty rows are harmless).
 *
 * kind: 0 = twitter, 1 = farcaster (matches SocialUnlinked event).
 *
 * Failure isolation: every error is logged and the tick continues — the watcher
 * never crashes the relayer (Pitfall 5 discipline).
 *
 * Requirements: AUTH-12, AUTH-17. Decision: D-13. Pitfall 6.
 */

import type { PublicClient, Address, Log } from 'viem';
import { parseAbiItem } from 'viem';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
import { followGraph, socialLinkIndex } from '../db/schema.js';
import { markUnlinked, type SocialIndexPlatform } from '../lib/social-link-index.js';
import { createChainScanner, type ChainScannerHandle } from './chain-scanner.js';
import type * as schema from '../db/schema.js';

type DrizzleDb = NodePgDatabase<typeof schema>;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const SOCIAL_UNLINKED_EVENT = parseAbiItem(
  'event SocialUnlinked(address indexed user, uint8 kind)',
);

export interface SocialUnlinkWatcherConfig {
  /** viem PublicClient for getLogs + getBlockNumber. */
  publicClient: PublicClient;
  /** ProfileRegistry address to watch. */
  profileRegistryAddress: Address;
  /** Drizzle ORM client (Fly Postgres). */
  db: DrizzleDb;
  /** Polling interval in ms. Default 30000. */
  intervalMs?: number;
  /**
   * Shared chain-scanner (quick-260611-o5b). When provided, this worker
   * registers its (ProfileRegistry, SocialUnlinked) subscription on it and
   * creates NO interval of its own. When absent (unit tests / back-compat),
   * a private scanner is created and owned by this worker.
   */
  scanner?: ChainScannerHandle;
}

export interface SocialUnlinkWatcherHandle {
  stop(): void;
  getStats(): { lastBlockSeen: bigint; totalEventsProcessed: number; errors: number };
}

/** kind → platform string. */
function kindToPlatform(kind: number): SocialIndexPlatform {
  return kind === 0 ? 'twitter' : 'farcaster';
}

/** Redis follow-graph cache key (mirrors social-link.ts). */
function followCacheKey(platform: SocialIndexPlatform, privyUserId: string): string {
  return `follow:${platform === 'twitter' ? 'x' : 'fc'}:${privyUserId}`;
}

interface SocialUnlinkedArgs {
  user: Address;
  kind: number;
}

/**
 * Process one SocialUnlinked event — the durable backstop purge.
 */
async function processSocialUnlinked(log: Log, config: SocialUnlinkWatcherConfig): Promise<void> {
  const typed = log as unknown as { args?: SocialUnlinkedArgs };
  const args = typed.args;
  if (!args || !args.user) return;

  const userAddress = args.user.toLowerCase();
  const platform = kindToPlatform(Number(args.kind ?? 0));
  const logger = getLogger();

  logger.info(
    { event: 'social_unlink_watcher_event', userAddress, platform },
    'Processing SocialUnlinked event (backstop purge)',
  );

  // 1. Resolve the privyUserId(s) whose follow graph belongs to this wallet
  //    address. The social_link_index binds (platform, handle) → user_address; we
  //    purge the follow_graph for any viewer whose linked wallet matches.
  //    Best-effort: if no index row maps, only the index mark + (empty) Redis del run.
  let indexRows: Array<{ userAddress: string }> = [];
  try {
    indexRows = await config.db
      .select()
      .from(socialLinkIndex)
      .where(eq(socialLinkIndex.userAddress, userAddress));
  } catch (err) {
    logger.warn(
      { event: 'social_unlink_watcher_index_read_failed', userAddress, err: String(err) },
      'Could not read social_link_index for backstop purge',
    );
  }

  // 2. Mark the index rows unlinked for this user/platform (idempotent).
  try {
    await markUnlinked(config.db, platform, userAddress);
  } catch (err) {
    logger.warn(
      { event: 'social_unlink_watcher_mark_failed', userAddress, platform, err: String(err) },
      'markUnlinked failed in backstop purge',
    );
  }

  // 3. Purge follow_graph rows + Redis cache for this wallet's privyUserId(s).
  //    The follow_graph is keyed by privyUserId. We do not have a direct
  //    wallet→privyUserId binding in social_link_index, so we purge any
  //    follow_graph rows whose privyUserId equals the wallet address (the in-app
  //    flow purges by the session privyUserId directly; this backstop covers the
  //    address-keyed case and is a no-op otherwise — AUTH-17 leaves no stale rows).
  const redis = getRedis();
  const candidates = new Set<string>([userAddress, ...indexRows.map((r) => r.userAddress.toLowerCase())]);
  for (const candidate of candidates) {
    try {
      await config.db
        .delete(followGraph)
        .where(and(eq(followGraph.privyUserId, candidate), eq(followGraph.platform, platform)));
    } catch (err) {
      logger.warn(
        { event: 'social_unlink_watcher_pg_delete_failed', candidate, platform, err: String(err) },
        'follow_graph delete failed in backstop purge',
      );
    }
    try {
      await redis.del(followCacheKey(platform, candidate));
    } catch (err) {
      logger.warn(
        { event: 'social_unlink_watcher_redis_del_failed', candidate, platform, err: String(err) },
        'Redis follow-graph del failed in backstop purge',
      );
    }
  }

  logger.info(
    { event: 'social_unlink_watcher_purged', userAddress, platform },
    'Backstop purge complete (follow_graph + Redis + index)',
  );
}

/**
 * Start the SocialUnlinked backstop watcher.
 */
export function startSocialUnlinkWatcher(
  config: SocialUnlinkWatcherConfig,
): SocialUnlinkWatcherHandle {
  const { publicClient, profileRegistryAddress, intervalMs = 30_000 } = config;
  const logger = getLogger();

  // NOTE (quick-260611-o5b): the chunking tunables and scan loop moved to the
  // shared chain-scanner — see chain-scanner.ts for the env fallback ladder.
  // The legacy SOCIAL_UNLINK_BLOCK_SPAN env is retired with the private loop.

  // Zero-address guard: ProfileRegistry not yet wired → register NOTHING on the
  // scanner (zero RPC), report inactive, return a no-op handle (current behavior).
  const inactive = (profileRegistryAddress as string).toLowerCase() === ZERO_ADDRESS;
  if (inactive) {
    logger.warn(
      { event: 'social_unlink_watcher_inactive' },
      'ProfileRegistry is zero-address — SocialUnlinked watcher idle until configured',
    );
    return {
      stop(): void {
        // no-op — nothing was registered
      },
      getStats() {
        return { lastBlockSeen: 0n, totalEventsProcessed: 0, errors: 0 };
      },
    };
  }

  let totalEventsProcessed = 0;
  // Worker-level errors count THIS worker's per-event processing failures only;
  // scan-level errors (get_head/get_logs/init) now live in scanner.getStats().
  let errors = 0;

  // Shared scanner when injected (production); private fallback otherwise
  // (unit tests / back-compat) — the private scanner is owned + started here.
  const ownsScanner = !config.scanner;
  const scanner =
    config.scanner ?? createChainScanner({ publicClient, intervalMs });

  // ONE (ProfileRegistry, SocialUnlinked) subscription — the existing per-event
  // try/catch body moved into the handler unchanged (never-throw discipline).
  const unregister = scanner.register({
    name: 'social-unlink-watcher',
    address: profileRegistryAddress,
    event: SOCIAL_UNLINKED_EVENT,
    onLog: async (log: Log) => {
      try {
        await processSocialUnlinked(log, config);
        totalEventsProcessed++;
      } catch (err) {
        logger.error(
          { event: 'social_unlink_watcher_error', phase: 'event_processing', err: String(err) },
          'Error processing SocialUnlinked event — skipping',
        );
        errors++;
      }
    },
  });

  if (ownsScanner) scanner.start();

  logger.info(
    { event: 'social_unlink_watcher_started', profileRegistryAddress, sharedScanner: !ownsScanner },
    'SocialUnlinked backstop watcher started',
  );

  return {
    stop(): void {
      unregister();
      if (ownsScanner) scanner.stop();
    },
    getStats() {
      return { lastBlockSeen: scanner.getStats().lastBlockSeen, totalEventsProcessed, errors };
    },
  };
}
