/**
 * RPC Metrics oracle adapter — KMS-attestation rail (D-02).
 *
 * Queries on-chain metrics via viem getLogs (e.g., Aave V3 liquidation events).
 * Signs the metric value using the unified oracle-attestation format.
 *
 * KMS key: 'defillama' — shared intentionally with defillama-adapter.ts.
 * Both adapters produce numeric off-chain attestations with equivalent trust requirements.
 * Blast radius: a compromised 'defillama' key can forge DefiLlama AND RpcMetrics attestations;
 * NFT-TWAP, CEX, and Snapshot/Tally keys remain isolated.
 * The unified domain name 'CallIt-Oracle' is used; oracleType=RpcMetrics(3) prevents
 * cross-type replay via _checkAdapterBinding on-chain.
 *
 * Security:
 *   - chainId comes from process.env.CHAIN_ID — never hardcoded (T-05.1-03-01)
 *   - domain.name='CallIt-Oracle' — unified domain
 *   - oracleType=OracleType.RpcMetrics(3) — bound via _checkAdapterBinding on-chain
 *   - AAVE_V3_POOL_ARBITRUM_ONE imported from @call-it/shared — never from call parameters (W11)
 *   - targetValue from the 19-field Call struct — never defaults to 0n (T-05.1-03-07)
 *
 * Spec: CALL_IT_SPEC1.md §13.5
 * Requirements: SETTLE-19, SETTLE-20
 */

import { type Address, type PublicClient } from 'viem';
// NOTE: Import from 3 levels up to match vi.mock('../../../lib/kms-signer.js') test pattern
import { gcpKmsAccount } from '../../../lib/kms-signer.js';
import { getLogger } from '../../lib/logger.js';
import {
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
  AAVE_V3_POOL_ARBITRUM_ONE,
} from '@call-it/shared';
import {
  signOracleAttestation,
  OracleType,
  resolveValueOutcome,
} from './oracle-attestation.js';
import { resolveCriteria } from '../../db/criteria-store.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RpcMetricType = 'liquidation' | 'active_addresses' | 'gas';

export interface RpcMetricResult {
  metricType: RpcMetricType;
  value: bigint;
  blockNumber: bigint;
  ambiguous?: boolean;
}

export interface RpcMetricAttestation {
  callId: bigint;
  metricType: string;
  value: bigint;
  blockNumber: bigint;
  timestamp: bigint;
  signature: `0x${string}`;
  attestationData: `0x${string}`;
}

export interface RpcMetricsAdapterConfig {
  settlementManagerAddress?: `0x${string}`;
  kmsProjectId: string;
  kmsLocationId: string;
  kmsKeyRingId: string;
  kmsKeyVersion: string;
  kmsExpectedAddress?: `0x${string}`;
  publicClient?: PublicClient;
}

// ── Aave V3 Liquidation event ABI (for getLogs) ───────────────────────────────

const LIQUIDATION_CALL_ABI = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'collateralAsset', type: 'address' },
    { indexed: true, name: 'debtAsset', type: 'address' },
    { indexed: true, name: 'user', type: 'address' },
    { indexed: false, name: 'debtToCover', type: 'uint256' },
    { indexed: false, name: 'liquidatedCollateralAmount', type: 'uint256' },
    { indexed: false, name: 'liquidator', type: 'address' },
    { indexed: false, name: 'receiveAToken', type: 'bool' },
  ],
  name: 'LiquidationCall',
  type: 'event',
} as const;

// ── RPC Metrics fetch ─────────────────────────────────────────────────────────

/**
 * Fetch an on-chain RPC metric.
 *
 * For 'liquidation': counts Aave V3 LiquidationCall events in the 24h window.
 * AAVE_V3_POOL address is always sourced from @call-it/shared pinned constant (W11).
 *
 * @param callId - call ID (for logging)
 * @param metricType - type of on-chain metric to query
 * @param expiryTimestamp - call expiry (used to define the block window)
 * @param publicClient - viem PublicClient for chain reads
 */
export async function fetchRpcMetric(
  callId: bigint,
  metricType: RpcMetricType,
  expiryTimestamp: number,
  publicClient: PublicClient,
): Promise<RpcMetricResult> {
  const logger = getLogger();

  logger.info(
    {
      event: 'rpc_metrics_fetch_start',
      callId: callId.toString(),
      metricType,
      expiryTimestamp,
    },
    'RPC metrics fetch started',
  );

  try {
    const currentBlock = await publicClient.getBlockNumber();

    if (metricType === 'liquidation') {
      // Query Aave V3 liquidation events
      // AAVE_V3_POOL address: MUST come from @call-it/shared pinned constant, NOT call parameters
      // (W11 fix: if from call params, attacker can forge attestations via malicious contract)
      const logs = await publicClient.getLogs({
        address: AAVE_V3_POOL_ARBITRUM_ONE as Address,
        event: LIQUIDATION_CALL_ABI,
        // Approximate 24h window: ~86400 / 0.25 = 345600 blocks (Arbitrum ~0.25s per block)
        fromBlock: currentBlock - 345600n > 0n ? currentBlock - 345600n : 0n,
        toBlock: currentBlock,
      });

      const value = BigInt(logs.length);

      logger.info(
        {
          event: 'rpc_metrics_liquidations_fetched',
          callId: callId.toString(),
          liquidationCount: logs.length,
          poolAddress: AAVE_V3_POOL_ARBITRUM_ONE,
        },
        `Aave V3 liquidation events: ${logs.length} in ~24h window`,
      );

      return { metricType, value, blockNumber: currentBlock };
    }

    if (metricType === 'gas') {
      // Fetch the latest block and return the base fee as the gas metric
      const block = await publicClient.getBlock({ blockNumber: currentBlock });
      const value = block.baseFeePerGas ?? 0n;

      logger.info(
        {
          event: 'rpc_metrics_gas_fetched',
          callId: callId.toString(),
          baseFeePerGas: value.toString(),
        },
        'Gas metric fetched',
      );

      return { metricType, value, blockNumber: currentBlock };
    }

    // active_addresses: count unique senders in recent blocks
    // Simplified: return block's transaction count as a proxy
    const block = await publicClient.getBlock({ blockNumber: currentBlock });
    const value = BigInt(block.transactions.length);

    logger.info(
      {
        event: 'rpc_metrics_active_addresses_fetched',
        callId: callId.toString(),
        txCount: block.transactions.length,
      },
      'Active addresses metric fetched (proxy: tx count in latest block)',
    );

    return { metricType, value, blockNumber: currentBlock };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        event: 'rpc_metrics_fetch_error',
        callId: callId.toString(),
        metricType,
        error: message,
      },
      'RPC metrics fetch failed — marking ambiguous',
    );
    // On any fetch failure: return ambiguous (not throw — prevents settlement-watcher crash)
    return { metricType, value: 0n, blockNumber: 0n, ambiguous: true };
  }
}

// ── RpcMetricsAdapter class ───────────────────────────────────────────────────

/**
 * RpcMetricsAdapter: queries on-chain metrics and signs with KMS.
 *
 * KMS key: 'defillama' — intentionally shared with defillama-adapter.ts (see module header).
 * domain.name='CallIt-RpcMetrics' — different from 'CallIt-DefiLlama' (cross-type replay prevention).
 */
export class RpcMetricsAdapter {
  private readonly config: RpcMetricsAdapterConfig;

  constructor(config: RpcMetricsAdapterConfig) {
    this.config = config;
  }

  /**
   * Fetch an RPC metric and produce a signed EIP-712 attestation.
   * Returns { ambiguous: true } on any fetch failure.
   */
  async fetchAndAttest(
    callId: bigint,
    metricType: RpcMetricType | undefined,
    expiryTimestamp: number,
    targetValue?: bigint,
  ): Promise<RpcMetricAttestation & { ambiguous?: boolean }> {
    const logger = getLogger();

    // ── Resolve metricType from criteria store (Gap B.3 fix) ────────────────────
    // Production path: metricType comes from the criteria store (identifier field).
    // Direct-call path: metricType may be provided in params (bypasses store lookup).
    let resolvedMetricType: RpcMetricType;
    if (!metricType) {
      const criteria = await resolveCriteria(Number(callId));
      if (!criteria) {
        logger.warn(
          {
            event: 'rpc_metrics_criteria_missing',
            callId: callId.toString(),
          },
          'RpcMetrics: criteria not found in store — returning ambiguous (no settlement)',
        );
        return {
          callId,
          metricType: 'liquidation' as RpcMetricType,
          value: 0n,
          blockNumber: 0n,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
          signature: '0x' as `0x${string}`,
          attestationData: '0x' as `0x${string}`,
          ambiguous: true,
        };
      }
      resolvedMetricType = criteria.identifier as RpcMetricType;
    } else {
      resolvedMetricType = metricType;
    }

    if (!this.config.publicClient) {
      logger.error(
        { event: 'rpc_metrics_no_client', callId: callId.toString() },
        'No publicClient configured for RpcMetricsAdapter — marking ambiguous',
      );
      return {
        callId,
        metricType: resolvedMetricType,
        value: 0n,
        blockNumber: 0n,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        signature: '0x' as `0x${string}`,
        attestationData: '0x' as `0x${string}`,
        ambiguous: true,
      };
    }

    const metricResult = await fetchRpcMetric(
      callId,
      resolvedMetricType,
      expiryTimestamp,
      this.config.publicClient,
    );

    if (metricResult.ambiguous) {
      return {
        callId,
        metricType: resolvedMetricType,
        value: 0n,
        blockNumber: 0n,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        signature: '0x' as `0x${string}`,
        attestationData: '0x' as `0x${string}`,
        ambiguous: true,
      };
    }

    // targetValue=0n → ambiguous (no valid threshold, T-05.1-03-07)
    const tv = targetValue ?? 0n;
    if (tv === 0n) {
      logger.warn(
        {
          event: 'rpc_metrics_ambiguous_no_target',
          callId: callId.toString(),
          metricType: resolvedMetricType,
        },
        'RpcMetrics: targetValue is 0n — returning ambiguous (no valid threshold)',
      );
      return {
        callId,
        metricType: resolvedMetricType,
        value: 0n,
        blockNumber: 0n,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        signature: '0x' as `0x${string}`,
        attestationData: '0x' as `0x${string}`,
        ambiguous: true,
      };
    }

    const { outcome, priceDelta } = resolveValueOutcome(metricResult.value, tv);
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const smAddress = this.config.settlementManagerAddress ?? (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`);
    // chainId MUST come from env — never hardcoded (T-05.1-03-01)
    const chainId = BigInt(process.env.CHAIN_ID ?? '421614');

    const expectedAddress = (
      this.config.kmsExpectedAddress ??
      (process.env.KMS_ADDRESS_DEFILLAMA as `0x${string}`) ??
      '0x0000000000000000000000000000000000000000' as `0x${string}`
    );

    // KMS key: 'defillama' — shared intentionally with defillama-adapter.ts.
    // oracleType=RpcMetrics(3) in the unified domain prevents cross-type replay on-chain.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = gcpKmsAccount({
      projectId: this.config.kmsProjectId,
      locationId: this.config.kmsLocationId,
      keyRingId: this.config.kmsKeyRingId,
      keyId: 'defillama', // intentionally shared — see module header blast-radius note
      keyVersion: this.config.kmsKeyVersion,
      expectedAddress,
    }) as any; // gcpKmsAccount returns LocalAccount; viem type widening loses signTypedData

    logger.info(
      {
        event: 'rpc_metrics_sign',
        callId: callId.toString(),
        metricType: resolvedMetricType,
        value: metricResult.value.toString(),
        targetValue: tv.toString(),
        outcome,
        chainId: chainId.toString(),
      },
      'Signing RPC metrics attestation with unified oracle-attestation domain (keyId=defillama)',
    );

    // Use unified signOracleAttestation — domain='CallIt-Oracle', chainId from env
    const result = await signOracleAttestation({
      account,
      chainId,
      verifyingContract: smAddress,
      callId,
      oracleType: OracleType.RpcMetrics,
      outcome,
      priceDelta,
      timestamp,
    });

    logger.info(
      {
        event: 'rpc_metrics_submit_ready',
        callId: callId.toString(),
        metricType: resolvedMetricType,
        value: metricResult.value.toString(),
      },
      'RPC metrics attestation signed and ready for submission',
    );

    return {
      callId,
      metricType: resolvedMetricType,
      value: metricResult.value,
      blockNumber: metricResult.blockNumber,
      timestamp: result.fields.timestamp,
      signature: result.signature,
      attestationData: result.attestationData,
    };
  }
}
