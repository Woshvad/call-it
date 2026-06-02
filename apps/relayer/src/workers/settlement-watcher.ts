/**
 * Settlement watcher — BullMQ expiry queue (D-04).
 *
 * Watches for call expiries and enqueues delayed BullMQ jobs per call.
 * Each job:
 *   1. Fetches call details from CallRegistry
 *   2. Fetches acceptedChallengeIds from subgraph (no enumerator on-chain — Blocker 3 fix)
 *   3. Dispatches to oracle adapter (Pyth for price-target calls)
 *   4. Retries up to 30×60s for wide Pyth confidence (SETTLE-10)
 *   5. After 30 retries → opens dispute window + Telegram alert (SETTLE-11)
 *   6. Alerts Telegram if settlement stuck > 25 minutes (OPS-15)
 *
 * Architecture:
 *   - CallRegistry and ChallengeEscrow are UNCHANGED (keystone invariant)
 *   - acceptedChallengeIds are sourced from the subgraph (indexed events)
 *   - If subgraph unavailable → falls back to [] (settlement proceeds, no duels settled)
 *
 * Spec: CALL_IT_SPEC1.md §13.1, §13.9
 * Requirements: SETTLE-07 through SETTLE-12, OPS-15
 */

import type { PublicClient, WalletClient, Address } from 'viem';
import type { RedisOptions } from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
import { getLogger } from '../lib/logger.js';
import { sendAlertSafe } from './alerts.js';
import {
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';
import { HermesClient } from '@pythnetwork/hermes-client';
import {
  PythAdapter,
  PythAdapterStatus,
  settlePythCall,
} from './oracle-adapters/pyth-adapter.js';
import { NftTwapAdapter } from './oracle-adapters/nft-twap-adapter.js';
import { DefiLlamaAdapter } from './oracle-adapters/defillama-adapter.js';
import { RpcMetricsAdapter } from './oracle-adapters/rpc-metrics-adapter.js';
import { SnapshotAdapter } from './oracle-adapters/snapshot-adapter.js';
import { TallyAdapter } from './oracle-adapters/tally-adapter.js';
import { CexAdapter } from './oracle-adapters/cex/cex-adapter.js';
import {
  SUBMIT_ATTESTATION_ABI,
} from './oracle-adapters/oracle-attestation.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum Pyth retries before opening dispute window (SETTLE-10, SETTLE-11) */
const MAX_PYTH_RETRIES = 30;

/** Interval between Pyth retries in ms (60s per spec) */
const PYTH_RETRY_INTERVAL_MS = 60_000;

/** Settlement stuck threshold in minutes (OPS-15) */
const SETTLEMENT_STUCK_THRESHOLD_MINUTES = 25;

/** BullMQ queue name */
const SETTLEMENT_QUEUE_NAME = 'settlement';

// ── Minimal ABIs ──────────────────────────────────────────────────────────────

/**
 * Canonical 19-field Call struct ABI — mirrors ICallRegistry.sol:130-157 exactly.
 * Field names and types must match the deployed contract; any drift causes wrong ABI decode.
 */
const CALL_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getCall',
    inputs: [{ name: 'callId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'caller',           type: 'address' },
          { name: 'stake',            type: 'uint96'  },
          { name: 'virtualFadeSeed', type: 'uint96'  },
          { name: 'createdAt',        type: 'uint64'  },
          { name: 'expiry',           type: 'uint64'  },
          { name: 'marketType',       type: 'uint8'   },
          { name: 'eventSubtype',     type: 'uint8'   },
          { name: 'category',         type: 'uint8'   },
          { name: 'status',           type: 'uint8'   },
          { name: 'conviction',       type: 'uint8'   },
          { name: 'openToChallenges', type: 'bool'    },
          { name: 'callerExitedAt',   type: 'uint64'  },
          { name: 'outcome',          type: 'uint8'   },
          { name: 'duplicateHash',    type: 'bytes32' },
          { name: 'criteriaHash',     type: 'bytes32' },
          { name: 'assetA',           type: 'uint256' },
          { name: 'assetB',           type: 'uint256' },
          { name: 'targetValue',      type: 'uint256' },
          { name: 'parentCallId',     type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

/**
 * adapterMap public mapping getter — derived from SettlementManager.sol:119-120.
 * adapterMap[marketType][eventSubtype] -> OracleAdapter enum value (uint8).
 */
const ADAPTER_MAP_ABI = [
  {
    type: 'function',
    name: 'adapterMap',
    inputs: [
      { name: '', type: 'uint8' },
      { name: '', type: 'uint8' },
    ],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SettlementWatcherConfig {
  publicClient: PublicClient;
  walletClient: WalletClient;
  redisConfig: RedisOptions;
  /** Override for settlement manager address (default: Sepolia) */
  settlementManagerAddress?: Address;
  /** Override for call registry address (default: Sepolia) */
  callRegistryAddress?: Address;
  /** Override for subgraph URL (default: from env) */
  subgraphUrl?: string;
  /** Override for Hermes URL (default: mainnet Hermes) */
  hermesUrl?: string;
}

export interface SettlementWatcherHandle {
  /** Stop the BullMQ worker and queue */
  stop(): Promise<void>;
  /** Returns diagnostic stats */
  getStats(): { totalProcessed: number; totalErrors: number; queueName: string };
}

interface SettlementJobData {
  callId: string;
  expiry: number;
  enqueueTime: number;
  retryCount?: number;
}

// ── Subgraph: fetch acceptedChallengeIds ──────────────────────────────────────

/**
 * Query the subgraph for accepted challenge IDs for a given callId.
 *
 * The subgraph indexes ChallengeProposed and ChallengeAccepted events.
 * Returns empty array if subgraph is unavailable (fallback — settlement proceeds,
 * no duel settlements happen for this call).
 *
 * Architecture note (Blocker 3 fix):
 *   - CallRegistry and ChallengeEscrow are UNCHANGED — no enumerator added.
 *   - The relayer sources accepted challenge IDs off-chain from the subgraph.
 *   - SettlementManager validates each ID on-chain via ce.getChallenge().
 *   - Subgraph is UNTRUSTED INPUT — the contract is the authority.
 */
export async function getAcceptedChallengeIds(
  callId: bigint,
  subgraphUrl?: string,
): Promise<bigint[]> {
  const logger = getLogger();
  const url = subgraphUrl ?? process.env.RELAYER_SUBGRAPH_URL ?? process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? '';

  if (!url) {
    logger.warn(
      { event: 'subgraph_url_missing', callId: callId.toString() },
      'Subgraph URL not configured — falling back to empty acceptedChallengeIds',
    );
    return [];
  }

  const query = `
    query AcceptedChallenges($callId: String!) {
      challenges(where: { callId: $callId, status: "Accepted" }) {
        challengeId
      }
    }
  `;

  try {
    const apiKey = process.env.SUBGRAPH_STUDIO_API_KEY ?? '';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ query, variables: { callId: callId.toString() } }),
    });

    if (!res.ok) {
      throw new Error(`Subgraph request failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as {
      data?: { challenges: { challengeId: string }[] };
      errors?: { message: string }[];
    };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Subgraph errors: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    const challenges = json.data?.challenges ?? [];
    const ids = challenges.map((c) => BigInt(c.challengeId));

    logger.info(
      {
        event: 'subgraph_accepted_challenges',
        callId: callId.toString(),
        count: ids.length,
      },
      `Found ${ids.length} accepted challenge(s) for callId ${callId}`,
    );

    return ids;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      {
        event: 'subgraph_accepted_challenges_failed',
        callId: callId.toString(),
        error: message,
      },
      'Failed to fetch acceptedChallengeIds from subgraph — falling back to []',
    );
    // Fallback: empty array (settlement proceeds; no duels settled for this call)
    return [];
  }
}

// ── Enqueue helper ────────────────────────────────────────────────────────────

let _settlementQueue: Queue | undefined;

/**
 * Enqueue a settlement job for the given callId at its expiry time.
 *
 * The BullMQ delayed job fires at max(0, expiry*1000 - Date.now()) ms from now.
 * If the call has already expired, the job fires immediately (delay=0).
 *
 * @param callId - call ID to settle
 * @param expiry - Unix timestamp (seconds) of call expiry
 * @param redisConfig - Redis connection options
 */
export async function enqueueSettlement(
  callId: bigint,
  expiry: number,
  redisConfig: RedisOptions,
): Promise<void> {
  const logger = getLogger();

  if (!_settlementQueue) {
    _settlementQueue = new Queue(SETTLEMENT_QUEUE_NAME, { connection: redisConfig });
  }

  const delayMs = Math.max(0, expiry * 1000 - Date.now());
  const jobData: SettlementJobData = {
    callId: callId.toString(),
    expiry,
    enqueueTime: Date.now(),
  };

  await _settlementQueue.add('settle', jobData, { delay: delayMs });

  logger.info(
    {
      event: 'settlement_enqueued',
      callId: callId.toString(),
      expiry,
      delayMs,
    },
    `Settlement job enqueued with delay ${delayMs}ms`,
  );
}

// ── Worker ────────────────────────────────────────────────────────────────────

/**
 * Start the settlement watcher BullMQ worker.
 *
 * @param config - settlement watcher configuration
 * @returns handle with stop() and getStats()
 */
export function startSettlementWatcher(config: SettlementWatcherConfig): SettlementWatcherHandle {
  const logger = getLogger();
  const {
    publicClient,
    walletClient,
    redisConfig,
    settlementManagerAddress = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as Address,
    callRegistryAddress = CALL_REGISTRY_ARBITRUM_SEPOLIA as Address,
    subgraphUrl,
    hermesUrl = 'https://hermes.pyth.network',
  } = config;

  let totalProcessed = 0;
  let totalErrors = 0;

  // Create the BullMQ queue (shared with enqueueSettlement)
  const queue = new Queue(SETTLEMENT_QUEUE_NAME, { connection: redisConfig });
  _settlementQueue = queue;

  // ── OracleAdapter enum (mirrors ISettlementManager.sol) ───────────────────
  // Dispatch table for all 7 oracle paths (SETTLE-06)
  enum OracleAdapter {
    Pyth = 0,       // PriceTarget + SpreadVs (on-chain pull VAA)
    NftTwap = 1,    // NFT floor 24h TWAP via Alchemy (relayer-attested)
    DefiLlama = 2,  // TVL/volume/fees/APRs via DefiLlama API (relayer-attested)
    RpcMetrics = 3, // on-chain metrics + liquidation events (relayer-attested)
    Snapshot = 4,   // governance proposal state via Snapshot (relayer-attested)
    Tally = 5,      // on-chain governance via Tally (relayer-attested)
    CexScraper = 6, // CEX listing events via Playwright scrapers (relayer-attested)
  }

  // ── Adapter instances ──────────────────────────────────────────────────────

  // Create the Pyth adapter
  const hermesClient = new HermesClient(hermesUrl, {});
  const pythAdapter = new PythAdapter(hermesClient, {
    maxRetries: MAX_PYTH_RETRIES,
    retryIntervalMs: PYTH_RETRY_INTERVAL_MS,
    confidenceThresholdNumerator: 200, // SETTLE-08: confidence * 200 <= price
  });

  // KMS configuration (from environment)
  const kmsConfig = {
    kmsProjectId: process.env.GCP_PROJECT_ID ?? 'call-it-sepolia',
    kmsLocationId: process.env.GCP_LOCATION_ID ?? 'us-east1',
    kmsKeyRingId: process.env.GCP_KEY_RING_ID ?? 'attestations',
    kmsKeyVersion: process.env.GCP_KEY_VERSION_DEFILLAMA ?? '1',
  };

  const nftTwapAdapter = new NftTwapAdapter({
    settlementManagerAddress,
    ...kmsConfig,
    kmsKeyVersion: process.env.GCP_KEY_VERSION_NFT_TWAP ?? '1',
    kmsExpectedAddress: process.env.KMS_ADDRESS_NFT_TWAP as `0x${string}` | undefined,
  });

  const defiLlamaAdapter = new DefiLlamaAdapter({
    settlementManagerAddress,
    ...kmsConfig,
    kmsExpectedAddress: process.env.KMS_ADDRESS_DEFILLAMA as `0x${string}` | undefined,
  });

  const rpcMetricsAdapter = new RpcMetricsAdapter({
    settlementManagerAddress,
    ...kmsConfig,
    publicClient,
    kmsExpectedAddress: process.env.KMS_ADDRESS_DEFILLAMA as `0x${string}` | undefined,
  });

  const snapshotAdapter = new SnapshotAdapter({
    settlementManagerAddress,
    ...kmsConfig,
    kmsKeyVersion: process.env.GCP_KEY_VERSION_SNAPSHOT_TALLY ?? '1',
    kmsExpectedAddress: process.env.KMS_ADDRESS_SNAPSHOT_TALLY as `0x${string}` | undefined,
  });

  const tallyAdapter = new TallyAdapter({
    settlementManagerAddress,
    ...kmsConfig,
    kmsKeyVersion: process.env.GCP_KEY_VERSION_SNAPSHOT_TALLY ?? '1',
    kmsExpectedAddress: process.env.KMS_ADDRESS_SNAPSHOT_TALLY as `0x${string}` | undefined,
  });

  const cexAdapter = new CexAdapter({
    settlementManagerAddress,
    ...kmsConfig,
    kmsKeyVersion: process.env.GCP_KEY_VERSION_CEX ?? '1',
    kmsExpectedAddress: process.env.KMS_ADDRESS_CEX as `0x${string}` | undefined,
    // walletClient wired so scrapeAndAttest calls SM.submitAttestation internally (Pitfall 6 fix)
    walletClient: walletClient as { writeContract: (params: unknown) => Promise<`0x${string}`> },
  });

  /**
   * Process a single settlement job.
   * Error resilience: catch(err) → log but do NOT throw (worker must keep running).
   */
  async function processSettlementJob(job: Job<SettlementJobData>): Promise<void> {
    const { callId: callIdStr, expiry, enqueueTime, retryCount = 0 } = job.data;
    const callId = BigInt(callIdStr);

    logger.info(
      { event: 'settlement_job_start', callId: callIdStr, retryCount, expiry },
      `Processing settlement job for callId ${callIdStr} (retry ${retryCount}/${MAX_PYTH_RETRIES})`,
    );

    try {
      // Check if stuck (> 25 minutes since expiry)
      const minutesSinceExpiry = (Date.now() - expiry * 1000) / 60_000;
      if (minutesSinceExpiry > SETTLEMENT_STUCK_THRESHOLD_MINUTES) {
        logger.warn(
          {
            event: 'settlement_stuck',
            callId: callIdStr,
            minutesSinceExpiry: Math.round(minutesSinceExpiry),
          },
          `Settlement stuck for ${Math.round(minutesSinceExpiry)} minutes`,
        );
        await sendAlertSafe('settle_stuck_25m', {
          callId: callIdStr,
          minutesStuck: Math.round(minutesSinceExpiry),
        });
      }

      // (1) Fetch call details from CallRegistry
      let call: {
        caller: Address;
        stake: bigint;
        virtualFadeSeed: bigint;
        createdAt: bigint;
        expiry: bigint;
        marketType: number;
        eventSubtype: number;
        category: number;
        status: number;
        conviction: number;
        openToChallenges: boolean;
        callerExitedAt: bigint;
        outcome: number;
        duplicateHash: `0x${string}`;
        criteriaHash: `0x${string}`;
        assetA: bigint;
        assetB: bigint;
        targetValue: bigint;
        parentCallId: bigint;
      };
      try {
        call = await publicClient.readContract({
          address: callRegistryAddress,
          abi: CALL_REGISTRY_ABI,
          functionName: 'getCall',
          args: [callId],
        }) as typeof call;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'settlement_get_call_failed', callId: callIdStr, error: message },
          'Failed to fetch call from CallRegistry',
        );
        totalErrors++;
        return;
      }

      // (2b) Fetch acceptedChallengeIds from subgraph (Blocker 3 fix)
      const acceptedChallengeIds = await getAcceptedChallengeIds(callId, subgraphUrl);

      // (3) Dispatch to oracle adapter based on on-chain adapterMap(marketType, eventSubtype) — SETTLE-06
      // Reads the authoritative mapping from the deployed SettlementManager.
      // Default = OracleAdapter.Pyth(0) for unmapped slots.
      const adapterType: number = Number(await publicClient.readContract({
        address: settlementManagerAddress,
        abi: ADAPTER_MAP_ABI,
        functionName: 'adapterMap',
        args: [call.marketType, call.eventSubtype],
      }));

      logger.info(
        { event: 'settlement_dispatch', callId: callIdStr, adapterType, marketType: call.marketType, eventSubtype: call.eventSubtype },
        `Dispatching to oracle adapter ${adapterType}`,
      );

      switch (adapterType) {
        // ── case 0: Pyth ──────────────────────────────────────────────────────
        case OracleAdapter.Pyth: {
          // assetA encodes the Pyth feedId as uint256(bytes32(feedId))
          const priceId = call.assetA.toString(16).padStart(64, '0');

          const fetchResult = await pythAdapter.fetchAndVerify({
            priceId,
            callId,
          });

          if (fetchResult.status === PythAdapterStatus.SettlementDelayed) {
            if (retryCount >= MAX_PYTH_RETRIES - 1) {
              logger.error(
                { event: 'pyth_retries_exhausted', callId: callIdStr, retryCount },
                'Pyth retries exhausted — opening dispute window (SETTLE-11)',
              );
              await sendAlertSafe('settle_failed', {
                callId: callIdStr,
                reason: 'pyth_max_retries',
                retries: MAX_PYTH_RETRIES,
              });
              return;
            }

            logger.info(
              { event: 'settlement_retry_enqueue', callId: callIdStr, retryCount: retryCount + 1 },
              `Wide confidence — re-enqueuing in ${PYTH_RETRY_INTERVAL_MS}ms`,
            );
            await queue.add(
              'settle',
              { ...job.data, retryCount: retryCount + 1 },
              { delay: PYTH_RETRY_INTERVAL_MS },
            );
            return;
          }

          if (fetchResult.status === PythAdapterStatus.DisputeWindowOpened) {
            await sendAlertSafe('settle_failed', {
              callId: callIdStr,
              reason: 'pyth_max_retries',
              retries: MAX_PYTH_RETRIES,
            });
            return;
          }

          const updateData = fetchResult.updateData ?? [];
          await settlePythCall({
            callId,
            updateData,
            acceptedChallengeIds,
            walletClient,
            publicClient,
            settlementManagerAddress,
          });
          break;
        }

        // ── case 1: NftTwap ──────────────────────────────────────────────────
        case OracleAdapter.NftTwap: {
          // assetA encodes the NFT contract address as uint256(address(nftContract))
          const contractAddress = ('0x' + call.assetA.toString(16).padStart(40, '0').slice(-40)) as `0x${string}`;
          const attestation = await nftTwapAdapter.fetchAndAttest(
            callId,
            contractAddress,
            Number(call.expiry),
          );

          if (attestation.ambiguous) {
            logger.warn(
              { event: 'nft_twap_ambiguous', callId: callIdStr },
              'NFT TWAP ambiguous — opening dispute window',
            );
            await sendAlertSafe('settle_failed', {
              callId: callIdStr,
              reason: 'nft_twap_ambiguous',
            });
            return;
          }

          await (walletClient as { writeContract: (params: unknown) => Promise<`0x${string}`> }).writeContract({
            address: settlementManagerAddress,
            abi: SUBMIT_ATTESTATION_ABI,
            functionName: 'submitAttestation',
            args: [callId, attestation.attestationData, attestation.signature],
          });
          break;
        }

        // ── case 2: DefiLlama ─────────────────────────────────────────────────
        case OracleAdapter.DefiLlama: {
          // assetA encodes the protocolSlug identifier (stored as uint256 via criteria store)
          const dlAttestation = await defiLlamaAdapter.fetchAndAttest({
            callId,
            metric: 'tvl',
            protocolSlug: call.assetA.toString(16), // decoded from assetA field
            targetValue: call.targetValue,
          });

          await (walletClient as { writeContract: (p: unknown) => Promise<`0x${string}`> }).writeContract({
            address: settlementManagerAddress,
            abi: SUBMIT_ATTESTATION_ABI,
            functionName: 'submitAttestation',
            args: [callId, dlAttestation.attestationData, dlAttestation.signature],
          });
          break;
        }

        // ── case 3: RpcMetrics ────────────────────────────────────────────────
        case OracleAdapter.RpcMetrics: {
          const rpcAttestation = await rpcMetricsAdapter.fetchAndAttest(
            callId,
            'liquidation',
            Number(call.expiry),
            call.targetValue,
          );

          if (rpcAttestation.ambiguous) {
            logger.warn(
              { event: 'rpc_metrics_ambiguous', callId: callIdStr },
              'RPC metrics ambiguous — opening dispute window',
            );
            await sendAlertSafe('settle_failed', { callId: callIdStr, reason: 'rpc_metrics_ambiguous' });
            return;
          }

          await (walletClient as { writeContract: (p: unknown) => Promise<`0x${string}`> }).writeContract({
            address: settlementManagerAddress,
            abi: SUBMIT_ATTESTATION_ABI,
            functionName: 'submitAttestation',
            args: [callId, rpcAttestation.attestationData, rpcAttestation.signature],
          });
          break;
        }

        // ── case 4: Snapshot ──────────────────────────────────────────────────
        case OracleAdapter.Snapshot: {
          // assetA encodes the Snapshot proposalId as uint256(bytes32(proposalId))
          const proposalId = '0x' + call.assetA.toString(16).padStart(64, '0');
          const snapshotAtt = await snapshotAdapter.fetchAndAttest(callId, proposalId);

          if (snapshotAtt.ambiguous) {
            logger.warn(
              { event: 'snapshot_ambiguous', callId: callIdStr, proposalId },
              'Snapshot result ambiguous — opening dispute window',
            );
            await sendAlertSafe('settle_failed', { callId: callIdStr, reason: 'snapshot_ambiguous' });
            return;
          }

          await (walletClient as { writeContract: (p: unknown) => Promise<`0x${string}`> }).writeContract({
            address: settlementManagerAddress,
            abi: SUBMIT_ATTESTATION_ABI,
            functionName: 'submitAttestation',
            args: [callId, snapshotAtt.attestationData, snapshotAtt.signature],
          });
          break;
        }

        // ── case 5: Tally ─────────────────────────────────────────────────────
        case OracleAdapter.Tally: {
          // assetA encodes the Tally proposalId as uint256 (on-chain proposalId is already uint256)
          const tallyProposalId = call.assetA.toString();
          const tallyAtt = await tallyAdapter.fetchAndAttest(callId, tallyProposalId);

          if (tallyAtt.ambiguous) {
            logger.warn(
              { event: 'tally_ambiguous', callId: callIdStr, proposalId: tallyProposalId },
              'Tally result ambiguous — opening dispute window',
            );
            await sendAlertSafe('settle_failed', { callId: callIdStr, reason: 'tally_ambiguous' });
            return;
          }

          await (walletClient as { writeContract: (p: unknown) => Promise<`0x${string}`> }).writeContract({
            address: settlementManagerAddress,
            abi: SUBMIT_ATTESTATION_ABI,
            functionName: 'submitAttestation',
            args: [callId, tallyAtt.attestationData, tallyAtt.signature],
          });
          break;
        }

        // ── case 6: CexScraper ────────────────────────────────────────────────
        case OracleAdapter.CexScraper: {
          // assetA encodes the tokenSymbol; assetB encodes the tokenName (as uint256 from bytes)
          const tokenSymbol = call.assetA.toString(16);
          const tokenName = call.assetB.toString(16);
          const cexOutcome = await cexAdapter.scrapeAndAttest(
            callId,
            tokenSymbol,
            tokenName,
            Number(call.expiry),
          );

          if (typeof cexOutcome === 'string' && (cexOutcome === 'not_found' || cexOutcome === 'ambiguous')) {
            logger.warn(
              { event: 'cex_scraper_not_found', callId: callIdStr, cexOutcome },
              `CEX scraper outcome: ${cexOutcome} — opening dispute window`,
            );
            await sendAlertSafe('settle_failed', { callId: callIdStr, reason: `cex_${cexOutcome}` });
            return;
          }

          // 'found' — scrapeAndAttest now calls SM.submitAttestation internally (Pitfall 6 fix)
          if (typeof cexOutcome === 'object' && cexOutcome.status === 'found') {
            // Internal submission already done inside cex-adapter.scrapeAndAttest
            logger.info(
              { event: 'cex_scraper_found', callId: callIdStr },
              'CEX listing confirmed — attestation signed and submitted',
            );
          } else if (typeof cexOutcome === 'string' && cexOutcome === 'found') {
            logger.info(
              { event: 'cex_scraper_found', callId: callIdStr },
              'CEX listing confirmed — attestation signed and submitted',
            );
          }
          break;
        }

        // ── default: unknown adapter type ─────────────────────────────────────
        default: {
          const unknownAdapter = adapterType;
          logger.error(
            { event: 'settlement_unknown_adapter', callId: callIdStr, adapterType: unknownAdapter },
            `Unknown oracle adapter type ${unknownAdapter} — cannot settle`,
          );
          await sendAlertSafe('settle_failed', {
            callId: callIdStr,
            reason: `unknown_adapter_${unknownAdapter}`,
          });
          totalErrors++;
          return;
        }
      }

      logger.info(
        { event: 'settlement_complete', callId: callIdStr },
        `Settlement complete for callId ${callIdStr}`,
      );
      totalProcessed++;

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          event: 'settlement_watcher_error',
          callId: callIdStr,
          error: message,
          enqueueTime,
        },
        'Settlement job failed',
      );
      totalErrors++;
      // Do NOT throw — worker must keep running (polled-events-fallback pattern)
    }
  }

  // Create and start the BullMQ worker
  const worker = new Worker(SETTLEMENT_QUEUE_NAME, processSettlementJob, {
    connection: redisConfig,
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        event: 'settlement_worker_job_failed',
        jobId: job?.id,
        callId: job?.data?.callId,
        error: err instanceof Error ? err.message : String(err),
      },
      'BullMQ settlement job failed',
    );
    totalErrors++;
  });

  worker.on('error', (err) => {
    logger.error(
      {
        event: 'settlement_worker_error',
        error: err instanceof Error ? err.message : String(err),
      },
      'BullMQ settlement worker error',
    );
  });

  logger.info(
    { event: 'settlement_watcher_started', queueName: SETTLEMENT_QUEUE_NAME },
    'Settlement watcher started',
  );

  return {
    async stop(): Promise<void> {
      logger.info({ event: 'settlement_watcher_stopping' }, 'Stopping settlement watcher');
      await worker.close();
      await queue.close();
      _settlementQueue = undefined;
      logger.info({ event: 'settlement_watcher_stopped' }, 'Settlement watcher stopped');
    },

    getStats(): { totalProcessed: number; totalErrors: number; queueName: string } {
      return { totalProcessed, totalErrors, queueName: SETTLEMENT_QUEUE_NAME };
    },
  };
}
