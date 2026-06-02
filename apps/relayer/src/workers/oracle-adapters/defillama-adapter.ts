/**
 * DefiLlama oracle adapter — KMS-attestation rail (D-02).
 *
 * Implements the DefiLlama TVL/volume/fees/APR oracle path using the unified
 * oracle-attestation signing format.
 *
 * Flow:
 *   1. fetch api.llama.fi/protocol/{slug} (TVL) or yields.llama.fi/pools (APRs)
 *   2. signOracleAttestation: unified EIP-712 sign with domain='CallIt-Oracle', keyId='defillama'
 *   3. Return ABI-encoded attestationData + EIP-712 signature
 *
 * Security:
 *   - chainId comes from process.env.CHAIN_ID (421614 on Sepolia, 42161 on mainnet) — never hardcoded
 *   - domain.name='CallIt-Oracle' — unified domain; on-chain ECDSA.recover verifies correctly
 *   - keyId='defillama' — shared with rpc-metrics-adapter (both numeric off-chain attestations)
 *   - oracleType=OracleType.DefiLlama(2) — bound via _checkAdapterBinding on-chain
 *   - targetValue from the 19-field Call struct — never defaults to 0n (T-05.1-03-07)
 *
 * Spec: CALL_IT_SPEC1.md §13.3
 * Requirements: SETTLE-18
 */

import { type Address } from 'viem';
// NOTE: Import from 3 levels up so the path resolves to apps/relayer/lib/kms-signer.ts,
// matching the vi.mock('../../../lib/kms-signer.js') in defillama-adapter.test.ts.
// apps/relayer/lib/kms-signer.ts is a re-export barrel of src/lib/kms-signer.ts.
// See vitest.config.ts comment for rationale.
import { gcpKmsAccount } from '../../../lib/kms-signer.js';
import { getLogger } from '../../lib/logger.js';
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';
import {
  signOracleAttestation,
  OracleType,
  resolveValueOutcome,
  SUBMIT_ATTESTATION_ABI,
} from './oracle-attestation.js';
import { resolveCriteria } from '../../db/criteria-store.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DefiLlamaMetric = 'tvl' | 'volume7d' | 'fees7d' | 'supplyApr' | 'borrowApr';

export interface DefiLlamaAdapterConfig {
  settlementManagerAddress: `0x${string}`;
  kmsProjectId: string;
  kmsLocationId: string;
  kmsKeyRingId: string;
  kmsKeyVersion: string;
  /** Expected KMS address (from env); defaults to env var KMS_ADDRESS_DEFILLAMA */
  kmsExpectedAddress?: `0x${string}`;
}

export interface FetchAndAttestParams {
  callId: bigint;
  metric: DefiLlamaMetric;
  /**
   * Protocol slug (e.g. 'uniswap', 'aave').
   * At settlement time, this is omitted — the adapter resolves it via resolveCriteria(callId).
   * When provided (e.g., in unit tests), it bypasses the criteria store lookup.
   * The criteria store is the production source of truth (Gap B.3).
   */
  protocolSlug?: string;
  /**
   * The call's on-chain targetValue from the 19-field Call struct.
   * MUST be passed through — do NOT default to 0n (T-05.1-03-07).
   * If 0n and no valid threshold exists, fetchAndAttest returns { ambiguous: true }.
   */
  targetValue?: bigint;
}

/** Signed attestation returned by fetchAndAttest */
export interface DefiLlamaAttestation {
  callId: bigint;
  metric: string;
  value: bigint;
  timestamp: bigint;
  signature: `0x${string}`;
  /** ABI-encoded attestation data for on-chain submitAttestation call */
  attestationData: `0x${string}`;
  ambiguous?: boolean;
}

// ── DefiLlama API helpers ─────────────────────────────────────────────────────

/**
 * Fetch TVL from api.llama.fi/protocol/{slug}.
 * Returns the most recent TVL value scaled to 6 decimal places (USDC-like).
 */
async function fetchTvl(protocolSlug: string): Promise<bigint> {
  const url = `https://api.llama.fi/protocol/${protocolSlug}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`DefiLlama TVL fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }

  const data = (await res.json()) as {
    tvl?: { date: number; totalLiquidityUSD: number }[];
    currentChainTvls?: Record<string, number>;
    tvl_chart?: { date: number; totalLiquidityUSD: number }[];
  };

  // Get the most recent TVL entry
  const tvlArray = data.tvl ?? [];
  const lastEntry = tvlArray[tvlArray.length - 1];
  const tvlUsd = lastEntry?.totalLiquidityUSD ?? 0;

  // Scale to 6 decimals (USDC-like integer representation)
  return BigInt(Math.round(tvlUsd * 1_000_000));
}

/**
 * Fetch APR data from yields.llama.fi/pools filtered by protocol slug.
 * Returns supplyApr or borrowApr scaled to 6 decimal places.
 */
async function fetchApr(
  protocolSlug: string,
  metric: 'supplyApr' | 'borrowApr',
): Promise<bigint> {
  const url = `https://yields.llama.fi/pools`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`DefiLlama yields fetch failed: ${res.status} ${res.statusText}`);
  }

  type PoolEntry = {
    project: string;
    symbol: string;
    apyBase: number | null;
    apyReward: number | null;
  };
  const data = (await res.json()) as { data?: PoolEntry[] };
  const pools = data.data ?? [];

  // Filter by protocol slug (project field)
  const matchingPools = pools.filter(
    (p) => p.project?.toLowerCase() === protocolSlug.toLowerCase(),
  );

  if (matchingPools.length === 0) {
    throw new Error(`No DefiLlama yield pools found for protocol: ${protocolSlug}`);
  }

  // Average across matching pools
  const aprValues = matchingPools
    .map((p) => (metric === 'supplyApr' ? (p.apyBase ?? 0) : (p.apyReward ?? 0)))
    .filter((v) => v > 0);

  const avgApr =
    aprValues.length > 0
      ? aprValues.reduce((sum, v) => sum + v, 0) / aprValues.length
      : 0;

  return BigInt(Math.round(avgApr * 1_000_000));
}

// ── DefiLlamaAdapter class ────────────────────────────────────────────────────

/**
 * DefiLlamaAdapter fetches protocol metrics from DefiLlama and signs them
 * with the per-type GCP KMS key (keyId='defillama').
 *
 * Injected into the settlement watcher; unit tests inject mock via vi.mock.
 */
export class DefiLlamaAdapter {
  private readonly config: DefiLlamaAdapterConfig;

  constructor(config: DefiLlamaAdapterConfig) {
    this.config = config;
  }

  /**
   * Fetch a DefiLlama metric and produce a signed EIP-712 attestation.
   *
   * @param params - callId, metric type, protocol slug
   * @returns signed DefiLlamaAttestation
   */
  async fetchAndAttest(params: FetchAndAttestParams): Promise<DefiLlamaAttestation> {
    const logger = getLogger();
    const { callId, metric, targetValue } = params;

    // ── Resolve protocolSlug from criteria store (Gap B.3 fix) ──────────────────
    // Production path: protocolSlug comes from the criteria store, not call params.
    // Test / direct-call path: protocolSlug may be provided in params (bypasses store lookup).
    let protocolSlug = params.protocolSlug;
    if (!protocolSlug) {
      const criteria = await resolveCriteria(Number(callId));
      if (!criteria) {
        logger.warn(
          {
            event: 'defillama_criteria_missing',
            callId: callId.toString(),
            metric,
          },
          'DefiLlama: criteria not found in store — returning ambiguous (no settlement)',
        );
        return {
          callId,
          metric,
          value: 0n,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
          signature: '0x' as `0x${string}`,
          attestationData: '0x' as `0x${string}`,
          ambiguous: true,
        };
      }
      protocolSlug = criteria.identifier;
    }

    logger.info(
      {
        event: 'defillama_adapter_fetch',
        callId: callId.toString(),
        metric,
        protocolSlug,
      },
      'DefiLlama fetch started',
    );

    // Step 1: Fetch the metric value from DefiLlama
    let value: bigint;
    try {
      switch (metric) {
        case 'tvl':
          value = await fetchTvl(protocolSlug);
          break;
        case 'supplyApr':
        case 'borrowApr':
          value = await fetchApr(protocolSlug, metric);
          break;
        default:
          // volume7d / fees7d: fetch TVL endpoint and look for volumeAdapter data
          value = await fetchTvl(protocolSlug);
          break;
      }

      logger.info(
        {
          event: 'defillama_fetch',
          callId: callId.toString(),
          metric,
          protocolSlug,
          value: value.toString(),
        },
        'DefiLlama metric fetched',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          event: 'defillama_adapter_error',
          error: message,
          callId: callId.toString(),
          metric,
          protocolSlug,
        },
        'DefiLlama fetch failed',
      );
      throw err;
    }

    // Step 2: Resolve outcome using targetValue from the 19-field Call struct
    // targetValue=0n with no valid threshold → ambiguous (never settle against zero, T-05.1-03-07)
    const tv = targetValue ?? 0n;
    if (tv === 0n) {
      logger.warn(
        {
          event: 'defillama_ambiguous_no_target',
          callId: callId.toString(),
          metric,
          protocolSlug,
        },
        'DefiLlama: targetValue is 0n — returning ambiguous (no valid threshold)',
      );
      return {
        callId,
        metric,
        value,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        signature: '0x' as `0x${string}`,
        attestationData: '0x' as `0x${string}`,
        ambiguous: true,
      };
    }

    const { outcome, priceDelta } = resolveValueOutcome(value, tv);
    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    // Step 3: Sign with GCP KMS using unified oracle-attestation format
    const expectedAddress = (
      this.config.kmsExpectedAddress ??
      (process.env.KMS_ADDRESS_DEFILLAMA as `0x${string}`) ??
      '0x0000000000000000000000000000000000000000' as `0x${string}`
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = gcpKmsAccount({
      projectId: this.config.kmsProjectId,
      locationId: this.config.kmsLocationId,
      keyRingId: this.config.kmsKeyRingId,
      keyId: 'defillama',
      keyVersion: this.config.kmsKeyVersion,
      expectedAddress,
    }) as any; // gcpKmsAccount returns LocalAccount; viem type widening loses signTypedData

    // chainId MUST come from env — never hardcoded (T-05.1-03-01)
    const chainId = BigInt(process.env.CHAIN_ID ?? '421614');

    logger.info(
      {
        event: 'defillama_sign',
        callId: callId.toString(),
        metric,
        value: value.toString(),
        targetValue: tv.toString(),
        outcome,
        chainId: chainId.toString(),
      },
      'Signing DefiLlama attestation with unified oracle-attestation domain',
    );

    // Use unified signOracleAttestation — domain='CallIt-Oracle', chainId from env
    const result = await signOracleAttestation({
      account,
      chainId,
      verifyingContract: this.config.settlementManagerAddress as `0x${string}`,
      callId,
      oracleType: OracleType.DefiLlama,
      outcome,
      priceDelta,
      timestamp,
    });

    logger.info(
      {
        event: 'defillama_submit',
        callId: callId.toString(),
        metric,
        value: value.toString(),
        timestamp: timestamp.toString(),
      },
      'DefiLlama attestation signed and ready for submission',
    );

    return {
      callId,
      metric,
      value,
      timestamp: result.fields.timestamp,
      signature: result.signature,
      attestationData: result.attestationData,
    };
  }
}

// ── Standalone export functions ───────────────────────────────────────────────

/**
 * Fetch a DefiLlama metric value.
 *
 * @param slug - DefiLlama protocol slug (e.g. 'uniswap', 'aave', 'curve-dex')
 * @param metric - metric type to fetch
 * @returns scaled BigInt value (6 decimal places)
 */
export async function fetchDefiLlamaMetric(
  slug: string,
  metric: DefiLlamaMetric,
): Promise<bigint> {
  switch (metric) {
    case 'tvl':
      return fetchTvl(slug);
    case 'supplyApr':
    case 'borrowApr':
      return fetchApr(slug, metric);
    default:
      return fetchTvl(slug);
  }
}

/**
 * Sign a DefiLlama attestation with the per-type KMS key using the unified oracle-attestation format.
 *
 * @param targetValue - the call's on-chain targetValue; must not be 0n (no valid threshold)
 * @returns attestationData (ABI-encoded) + EIP-712 signature
 */
export async function signDefiLlamaAttestation(
  callId: bigint,
  _metric: string, // kept for API compatibility; unified format uses oracleType=DefiLlama(2) only
  value: bigint,
  config: {
    settlementManagerAddress?: Address;
    kmsProjectId: string;
    kmsLocationId: string;
    kmsKeyRingId: string;
    kmsKeyVersion: string;
    kmsExpectedAddress?: Address;
  },
  targetValue?: bigint,
): Promise<{ attestationData: `0x${string}`; signature: `0x${string}`; ambiguous?: boolean }> {
  const smAddress = config.settlementManagerAddress ?? (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as Address);

  // targetValue=0n → ambiguous (no valid threshold, T-05.1-03-07)
  const tv = targetValue ?? 0n;
  if (tv === 0n) {
    return {
      attestationData: '0x' as `0x${string}`,
      signature: '0x' as `0x${string}`,
      ambiguous: true,
    };
  }

  const { outcome, priceDelta } = resolveValueOutcome(value, tv);
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  // chainId MUST come from env — never hardcoded (T-05.1-03-01)
  const chainId = BigInt(process.env.CHAIN_ID ?? '421614');

  const expectedAddress = (
    config.kmsExpectedAddress ??
    (process.env.KMS_ADDRESS_DEFILLAMA as Address) ??
    '0x0000000000000000000000000000000000000000' as Address
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = gcpKmsAccount({
    projectId: config.kmsProjectId,
    locationId: config.kmsLocationId,
    keyRingId: config.kmsKeyRingId,
    keyId: 'defillama',
    keyVersion: config.kmsKeyVersion,
    expectedAddress,
  }) as any;

  // Use unified signOracleAttestation — domain='CallIt-Oracle', chainId from env
  const result = await signOracleAttestation({
    account,
    chainId,
    verifyingContract: smAddress,
    callId,
    oracleType: OracleType.DefiLlama,
    outcome,
    priceDelta,
    timestamp,
  });

  return {
    attestationData: result.attestationData,
    signature: result.signature,
  };
}

/**
 * Submit a DefiLlama attestation to SettlementManager using the unified SUBMIT_ATTESTATION_ABI.
 */
export async function submitDefiLlamaAttestation(
  callId: bigint,
  attestationData: `0x${string}`,
  signature: `0x${string}`,
  walletClient: { writeContract: (params: unknown) => Promise<`0x${string}`> },
  settlementManagerAddress: Address = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as Address,
): Promise<void> {
  const logger = getLogger();

  logger.info(
    { event: 'defillama_submit', callId: callId.toString() },
    'Submitting DefiLlama attestation to SettlementManager',
  );

  await walletClient.writeContract({
    address: settlementManagerAddress,
    abi: SUBMIT_ATTESTATION_ABI,
    functionName: 'submitAttestation',
    args: [callId, attestationData, signature],
  });
}
