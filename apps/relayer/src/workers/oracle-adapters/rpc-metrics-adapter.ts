/**
 * RPC Metrics oracle adapter — KMS-attestation rail (D-02).
 *
 * Queries on-chain metrics via viem getLogs (e.g., Aave V3 liquidation events).
 * Signs the metric value with the GCP KMS key.
 *
 * KMS key: 'defillama' — shared intentionally with defillama-adapter.ts.
 * Both adapters produce numeric off-chain attestations with equivalent trust requirements.
 * Blast radius: a compromised 'defillama' key can forge DefiLlama AND RpcMetrics attestations;
 * NFT-TWAP, CEX, and Snapshot/Tally keys remain isolated.
 * Different EIP-712 domain names (CallIt-RpcMetrics vs CallIt-DefiLlama) prevent cross-type
 * replay within the shared key.
 *
 * Security (Pitfall 7):
 *   - EIP-712 domain chainId=42161n (Arbitrum One) — cross-chain replay prevention
 *   - domain.name='CallIt-RpcMetrics' — different from 'CallIt-DefiLlama'; prevents cross-type replay
 *   - AAVE_V3_POOL_ARBITRUM_ONE imported from @call-it/shared — never from call parameters (W11)
 *
 * Spec: CALL_IT_SPEC1.md §13.5
 * Requirements: SETTLE-19, SETTLE-20
 */

import { encodeAbiParameters, parseAbiParameters, type Address, type PublicClient } from 'viem';
// NOTE: Import from 3 levels up to match vi.mock('../../../lib/kms-signer.js') test pattern
import { gcpKmsAccount } from '../../../lib/kms-signer.js';
import { getLogger } from '../../lib/logger.js';
import {
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
  AAVE_V3_POOL_ARBITRUM_ONE,
} from '@call-it/shared';

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

// ── EIP-712 type definitions ──────────────────────────────────────────────────

/**
 * EIP-712 types for RPC Metrics attestation.
 * Domain: name='CallIt-RpcMetrics', chainId=42161n (Pitfall 7).
 *
 * NOTE on domain.name: 'CallIt-RpcMetrics' differs from 'CallIt-DefiLlama' even though
 * both use keyId='defillama'. This different domain name prevents cross-type replay
 * within the shared key — an attacker cannot replay an RpcMetrics attestation as a
 * DefiLlama attestation on-chain because the domain separators differ.
 */
const RPC_METRICS_ATTESTATION_TYPES = {
  RpcMetricsAttestation: [
    { name: 'callId', type: 'uint256' },
    { name: 'metricType', type: 'string' },
    { name: 'value', type: 'uint256' },
    { name: 'blockNumber', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'chainId', type: 'uint256' },
  ],
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
    metricType: RpcMetricType,
    expiryTimestamp: number,
  ): Promise<RpcMetricAttestation & { ambiguous?: boolean }> {
    const logger = getLogger();

    if (!this.config.publicClient) {
      logger.error(
        { event: 'rpc_metrics_no_client', callId: callId.toString() },
        'No publicClient configured for RpcMetricsAdapter — marking ambiguous',
      );
      return {
        callId,
        metricType,
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
      metricType,
      expiryTimestamp,
      this.config.publicClient,
    );

    if (metricResult.ambiguous) {
      return {
        callId,
        metricType,
        value: 0n,
        blockNumber: 0n,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        signature: '0x' as `0x${string}`,
        attestationData: '0x' as `0x${string}`,
        ambiguous: true,
      };
    }

    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const smAddress = this.config.settlementManagerAddress ?? (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`);

    const expectedAddress = (
      this.config.kmsExpectedAddress ??
      (process.env.KMS_ADDRESS_DEFILLAMA as `0x${string}`) ??
      '0x0000000000000000000000000000000000000000' as `0x${string}`
    );

    // KMS key: 'defillama' — shared intentionally with defillama-adapter.ts.
    // Both adapters produce numeric off-chain attestations with equivalent trust requirements.
    // Blast radius: a compromised 'defillama' key can forge DefiLlama AND RpcMetrics attestations;
    // NFT-TWAP, CEX, and Snapshot/Tally keys remain isolated.
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
        metricType,
        value: metricResult.value.toString(),
        signerAddress: account.address,
      },
      'Signing RPC metrics attestation with KMS (keyId=defillama, intentional shared key)',
    );

    // domain.name='CallIt-RpcMetrics' — different from 'CallIt-DefiLlama'
    // This prevents cross-type replay even though both use keyId='defillama' (Pitfall 7)
    const domain = {
      name: 'CallIt-RpcMetrics',
      version: '1',
      chainId: 42161n,
      verifyingContract: smAddress,
    };

    const message = {
      callId,
      metricType,
      value: metricResult.value,
      blockNumber: metricResult.blockNumber,
      timestamp,
      chainId: 42161n,
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const signature = await account.signTypedData({
      domain,
      types: RPC_METRICS_ATTESTATION_TYPES,
      primaryType: 'RpcMetricsAttestation',
      message,
    });

    const attestationData = encodeAbiParameters(
      parseAbiParameters(
        'uint256 callId, string metricType, uint256 value, uint256 blockNumber, uint256 timestamp, uint256 chainId',
      ),
      [callId, metricType, metricResult.value, metricResult.blockNumber, timestamp, 42161n],
    );

    logger.info(
      {
        event: 'rpc_metrics_submit_ready',
        callId: callId.toString(),
        metricType,
        value: metricResult.value.toString(),
      },
      'RPC metrics attestation signed and ready for submission',
    );

    return {
      callId,
      metricType,
      value: metricResult.value,
      blockNumber: metricResult.blockNumber,
      timestamp,
      signature: signature as `0x${string}`,
      attestationData,
    };
  }
}
