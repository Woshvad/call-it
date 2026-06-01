/**
 * DefiLlama oracle adapter — KMS-attestation rail (D-02).
 *
 * Proves the KMS-attestation rail generalizes from Pyth by implementing
 * the DefiLlama TVL/volume/fees/APR oracle path.
 *
 * Flow:
 *   1. fetch api.llama.fi/protocol/{slug} (TVL) or yields.llama.fi/pools (APRs)
 *   2. Sign the metric value with the per-type KMS key (keyId='defillama')
 *   3. Return ABI-encoded attestationData + EIP-712 signature
 *
 * Security (Pitfall 7):
 *   - EIP-712 domain chainId=42161n (Arbitrum One) prevents cross-chain replay (T-04-04-02)
 *   - Domain name='CallIt-DefiLlama' prevents cross-adapter replay (T-04-04-01)
 *   - verifyingContract=SETTLEMENT_MANAGER_ADDRESS binds to specific deployment
 *   - KMS key keyId='defillama' (not shared with NFT-TWAP or CEX keys)
 *
 * Spec: CALL_IT_SPEC1.md §13.3
 * Requirements: SETTLE-18
 */

import { encodeAbiParameters, parseAbiParameters, type Address } from 'viem';
// NOTE: Import from 3 levels up so the path resolves to apps/relayer/lib/kms-signer.ts,
// matching the vi.mock('../../../lib/kms-signer.js') in defillama-adapter.test.ts.
// apps/relayer/lib/kms-signer.ts is a re-export barrel of src/lib/kms-signer.ts.
// See vitest.config.ts comment for rationale.
import { gcpKmsAccount } from '../../../lib/kms-signer.js';
import { getLogger } from '../../lib/logger.js';
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';

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
  protocolSlug: string;
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
}

// ── EIP-712 type definitions ──────────────────────────────────────────────────

/**
 * EIP-712 types for DefiLlama attestation.
 * Domain: name='CallIt-DefiLlama', chainId=42161n (Pitfall 7).
 */
const DEFILLAMA_ATTESTATION_TYPES = {
  DefiLlamaAttestation: [
    { name: 'callId', type: 'uint256' },
    { name: 'metric', type: 'string' },
    { name: 'value', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'chainId', type: 'uint256' },
  ],
} as const;

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
    const { callId, metric, protocolSlug } = params;

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

    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    // Step 2: Sign with GCP KMS (per-type key for keyId='defillama')
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
    }) as any; // gcpKmsAccount returns LocalAccount which has signTypedData; viem type widening loses it

    logger.info(
      {
        event: 'defillama_sign',
        callId: callId.toString(),
        metric,
        signerAddress: account.address,
      },
      'Signing DefiLlama attestation with KMS',
    );

    // EIP-712 domain — Pitfall 7: chainId=42161n (Arbitrum One), per-adapter name
    const domain = {
      name: 'CallIt-DefiLlama',
      version: '1',
      chainId: 42161n,
      verifyingContract: this.config.settlementManagerAddress as `0x${string}`,
    };

    const message = {
      callId,
      metric,
      value,
      timestamp,
      chainId: 42161n,
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const signature = await account.signTypedData({
      domain,
      types: DEFILLAMA_ATTESTATION_TYPES,
      primaryType: 'DefiLlamaAttestation',
      message,
    });

    // ABI-encode attestation data for on-chain submitAttestation call
    const attestationData = encodeAbiParameters(
      parseAbiParameters('uint256 callId, string metric, uint256 value, uint256 timestamp, uint256 chainId'),
      [callId, metric, value, timestamp, 42161n],
    );

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
      timestamp,
      signature: signature as `0x${string}`,
      attestationData,
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
 * Sign a DefiLlama attestation with the per-type KMS key.
 *
 * @returns attestationData (ABI-encoded) + EIP-712 signature
 */
export async function signDefiLlamaAttestation(
  callId: bigint,
  metric: string,
  value: bigint,
  config: {
    settlementManagerAddress?: Address;
    kmsProjectId: string;
    kmsLocationId: string;
    kmsKeyRingId: string;
    kmsKeyVersion: string;
    kmsExpectedAddress?: Address;
  },
): Promise<{ attestationData: `0x${string}`; signature: `0x${string}` }> {
  const smAddress = config.settlementManagerAddress ?? (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as Address);
  const timestamp = BigInt(Math.floor(Date.now() / 1000));

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
  }) as any; // gcpKmsAccount returns LocalAccount; viem type widening loses signTypedData

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const signature = await account.signTypedData({
    domain: {
      name: 'CallIt-DefiLlama',
      version: '1',
      chainId: 42161n,
      verifyingContract: smAddress,
    },
    types: DEFILLAMA_ATTESTATION_TYPES,
    primaryType: 'DefiLlamaAttestation',
    message: { callId, metric, value, timestamp, chainId: 42161n },
  });

  const attestationData = encodeAbiParameters(
    parseAbiParameters('uint256 callId, string metric, uint256 value, uint256 timestamp, uint256 chainId'),
    [callId, metric, value, timestamp, 42161n],
  );

  return {
    attestationData,
    signature: signature as `0x${string}`,
  };
}

/**
 * Submit a DefiLlama attestation to SettlementManager.
 *
 * @param callId - call ID being settled
 * @param attestationData - ABI-encoded attestation data
 * @param signature - EIP-712 signature
 * @param walletClient - GCP-KMS-backed viem WalletClient
 */
export async function submitDefiLlamaAttestation(
  callId: bigint,
  attestationData: `0x${string}`,
  signature: `0x${string}`,
  walletClient: { writeContract: (params: unknown) => Promise<`0x${string}`> },
  settlementManagerAddress: Address = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as Address,
): Promise<void> {
  const logger = getLogger();

  const SM_SUBMIT_ABI = [
    {
      type: 'function',
      name: 'submitAttestation',
      inputs: [
        { name: 'callId', type: 'uint256', internalType: 'uint256' },
        { name: 'attestationData', type: 'bytes', internalType: 'bytes' },
        { name: 'signature', type: 'bytes', internalType: 'bytes' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ] as const;

  logger.info(
    { event: 'defillama_submit', callId: callId.toString() },
    'Submitting DefiLlama attestation to SettlementManager',
  );

  await walletClient.writeContract({
    address: settlementManagerAddress,
    abi: SM_SUBMIT_ABI,
    functionName: 'submitAttestation',
    args: [callId, attestationData, signature],
  });
}
