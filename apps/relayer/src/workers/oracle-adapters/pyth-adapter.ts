/**
 * Pyth oracle adapter — pull model (D-01).
 *
 * Fetches a Pyth price update VAA from Hermes, verifies the confidence gate,
 * and calls SettlementManager.settle(callId, updateData, acceptedChallengeIds).
 *
 * Spec: CALL_IT_SPEC1.md §13.1
 * Requirements: SETTLE-07, SETTLE-08, SETTLE-09, SETTLE-10, SETTLE-11
 * Research: 04-RESEARCH.md §Adapter 1 Pyth, §Pitfall 4 ETH fee budget
 *
 * Security:
 *   - walletClient is GCP-KMS-backed (never local private key) (D-05, T-04-04-05)
 *   - ETH balance < 0.01 ETH → Telegram P0 alert (T-04-04-03, OPS-15)
 *   - No local private key signing — walletClient from config param
 */

import type { PublicClient, WalletClient, Address } from 'viem';
import { parseEther } from 'viem';
import type { HermesClient } from '@pythnetwork/hermes-client';
import { getLogger } from '../../lib/logger.js';
import { sendAlertSafe } from '../alerts.js';
import {
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export enum PythAdapterStatus {
  /** Price update verified successfully — settlement can proceed */
  Success = 'Success',
  /** Confidence interval is too wide (confidence * 200 > price) — retry later */
  SettlementDelayed = 'SettlementDelayed',
  /** 30 retries exhausted — dispute window opened (SETTLE-11) */
  DisputeWindowOpened = 'DisputeWindowOpened',
}

export interface PythAdapterResult {
  status: PythAdapterStatus;
  /** Human-readable reason (present on SettlementDelayed / DisputeWindowOpened) */
  reason?: string;
  /** ABI-encoded VAA update data (present on Success) */
  updateData?: `0x${string}`[];
  /** ETH fee required for Pyth update (present on Success) */
  feeWei?: bigint;
}

export interface PythAdapterConfig {
  /** Maximum number of retry attempts (default: 30 per SETTLE-10) */
  maxRetries: number;
  /** Interval between retries in ms (default: 60_000 per SETTLE-10) */
  retryIntervalMs: number;
  /** Confidence gate numerator: confidence * numerator <= price (default: 200 = 0.5% gate) */
  confidenceThresholdNumerator: number;
}

export interface FetchAndVerifyParams {
  priceId: string;
  callId: bigint;
}

export interface SettlePythCallParams {
  callId: bigint;
  updateData: `0x${string}`[];
  acceptedChallengeIds: bigint[];
  walletClient: WalletClient;
  publicClient: PublicClient;
  settlementManagerAddress?: Address;
}

// ── Minimal SettlementManager ABI slice ───────────────────────────────────────

const SM_ABI = [
  {
    type: 'function',
    name: 'settle',
    inputs: [
      { name: 'callId', type: 'uint256', internalType: 'uint256' },
      { name: 'pythUpdateData', type: 'bytes[]', internalType: 'bytes[]' },
      { name: 'acceptedChallengeIds', type: 'uint256[]', internalType: 'uint256[]' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getUpdateFee',
    inputs: [
      { name: 'updateData', type: 'bytes[]', internalType: 'bytes[]' },
    ],
    outputs: [{ name: 'feeAmount', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ── ETH balance threshold ─────────────────────────────────────────────────────

/** Alert threshold: if SM ETH balance < 0.01 ETH, fire settle_failed alert (Pitfall 4, OPS-15) */
const ETH_BALANCE_ALERT_THRESHOLD = parseEther('0.01');

// ── PythAdapter class ─────────────────────────────────────────────────────────

/**
 * PythAdapter wraps the HermesClient + confidence gate logic.
 *
 * Injected into the settlement watcher; unit tests inject a mock HermesClient.
 * walletClient is NOT held in this class — passed per-call to allow rotation.
 */
export class PythAdapter {
  private readonly hermesClient: HermesClient;
  private readonly config: PythAdapterConfig;

  constructor(hermesClient: HermesClient, config: PythAdapterConfig) {
    this.hermesClient = hermesClient;
    this.config = config;
  }

  /**
   * Fetch the latest Pyth price update and verify the confidence gate.
   *
   * Returns:
   *   Success           — narrow confidence, updateData + feeWei ready to use
   *   SettlementDelayed — wide confidence (confidence * 200 > price)
   *
   * SETTLE-08: confidence gate: confidence × 200 <= price
   */
  async fetchAndVerify(params: FetchAndVerifyParams): Promise<PythAdapterResult> {
    const logger = getLogger();
    const { priceId, callId } = params;

    logger.info(
      { event: 'pyth_fetch_and_verify', callId: callId.toString(), priceId },
      'Fetching Pyth price update',
    );

    const updates = await this.hermesClient.getLatestPriceUpdates([priceId]);

    // Extract the parsed price for the confidence gate check
    const parsedPrice = updates.parsed?.[0]?.price;
    if (parsedPrice) {
      const price = BigInt(parsedPrice.price);
      const conf = BigInt(parsedPrice.conf);
      const numerator = BigInt(this.config.confidenceThresholdNumerator);

      // SETTLE-08: confidence * 200 <= price required (narrow = ≤ 0.5% of price)
      if (conf * numerator > price) {
        logger.warn(
          {
            event: 'pyth_confidence_wide',
            callId: callId.toString(),
            price: price.toString(),
            confidence: conf.toString(),
            threshold: numerator.toString(),
          },
          'Pyth confidence too wide — SettlementDelayed (SETTLE-08)',
        );
        return {
          status: PythAdapterStatus.SettlementDelayed,
          reason: `Confidence too wide: ${conf} * ${numerator} = ${conf * numerator} > price ${price}`,
        };
      }
    }

    // Convert binary VAA data to 0x-prefixed hex strings
    const updateData: `0x${string}`[] = (updates.binary?.data ?? []).map(
      (d: string) => (d.startsWith('0x') ? d : (`0x${d}` as `0x${string}`)) as `0x${string}`,
    );

    // Fee is computed by the contract; placeholder bigint for now
    // (actual feeWei read via publicClient.readContract in settlePythCall)
    const feeWei = 0n;

    logger.info(
      {
        event: 'pyth_fetch_success',
        callId: callId.toString(),
        updateDataLength: updateData.length,
      },
      'Pyth price update fetched and verified',
    );

    return {
      status: PythAdapterStatus.Success,
      updateData,
      feeWei,
    };
  }

  /**
   * Retry fetchAndVerify up to maxRetries times.
   *
   * SETTLE-10: 30 × 60s retries before dispute window.
   * SETTLE-11: after 30 retries → DisputeWindowOpened.
   *
   * NOTE: In the settlement watcher, retries are implemented as BullMQ delayed jobs
   * (not a synchronous loop), so actual delay is handled externally. This method
   * implements the retry counting for testing purposes.
   */
  async fetchWithRetry(params: FetchAndVerifyParams): Promise<PythAdapterResult> {
    const logger = getLogger();

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const result = await this.hermesClient.getLatestPriceUpdates([params.priceId]);

      const parsedPrice = result.parsed?.[0]?.price;
      if (parsedPrice) {
        const price = BigInt(parsedPrice.price);
        const conf = BigInt(parsedPrice.conf);
        const numerator = BigInt(this.config.confidenceThresholdNumerator);

        if (conf * numerator > price) {
          logger.warn(
            {
              event: 'pyth_retry_wide_confidence',
              callId: params.callId.toString(),
              attempt,
              maxRetries: this.config.maxRetries,
            },
            `Pyth confidence wide on attempt ${attempt}/${this.config.maxRetries}`,
          );

          if (attempt === this.config.maxRetries) {
            // SETTLE-11: retry exhaustion → open dispute window
            logger.error(
              {
                event: 'pyth_retries_exhausted',
                callId: params.callId.toString(),
                totalAttempts: attempt,
              },
              'Pyth retries exhausted — DisputeWindowOpened (SETTLE-11)',
            );
            return {
              status: PythAdapterStatus.DisputeWindowOpened,
              reason: `Pyth confidence remained wide after ${attempt} retries`,
            };
          }
          // Not yet exhausted — continue loop (in production, BullMQ delays between jobs)
          continue;
        }
      }

      // Narrow confidence — success
      const updateData: `0x${string}`[] = (result.binary?.data ?? []).map(
        (d: string) => (d.startsWith('0x') ? d : (`0x${d}` as `0x${string}`)) as `0x${string}`,
      );

      return {
        status: PythAdapterStatus.Success,
        updateData,
        feeWei: 0n,
      };
    }

    // Should not reach here (loop returns inside), but TypeScript requires a return
    return {
      status: PythAdapterStatus.DisputeWindowOpened,
      reason: `Pyth retries exhausted (${this.config.maxRetries})`,
    };
  }
}

// ── Standalone export functions ───────────────────────────────────────────────

/**
 * Fetch Pyth price update VAA from Hermes.
 *
 * @param priceIds - Pyth price feed IDs (bytes32 hex strings)
 * @returns Array of 0x-prefixed hex strings (ABI-encoded VAA data)
 */
export async function fetchPythUpdate(
  hermesClient: HermesClient,
  priceIds: string[],
): Promise<`0x${string}`[]> {
  const updates = await hermesClient.getLatestPriceUpdates(priceIds);
  return (updates.binary?.data ?? []).map(
    (d: string) => (d.startsWith('0x') ? d : (`0x${d}` as `0x${string}`)) as `0x${string}`,
  );
}

/**
 * Check the SettlementManager ETH balance for Pyth fee budget.
 * Fires a Telegram alert if balance < 0.01 ETH (Pitfall 4, OPS-15).
 *
 * @param publicClient - viem PublicClient
 * @param settlementManagerAddress - SM address to check (default: Sepolia address)
 */
export async function checkEthBalance(
  publicClient: PublicClient,
  settlementManagerAddress: Address = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as Address,
): Promise<bigint> {
  const logger = getLogger();
  const balance = await publicClient.getBalance({ address: settlementManagerAddress });

  if (balance < ETH_BALANCE_ALERT_THRESHOLD) {
    logger.error(
      {
        event: 'eth_balance_low',
        address: settlementManagerAddress,
        balance: balance.toString(),
        threshold: ETH_BALANCE_ALERT_THRESHOLD.toString(),
      },
      'SettlementManager ETH balance below 0.01 ETH — Pyth fees at risk (Pitfall 4)',
    );
    await sendAlertSafe('settle_failed', {
      reason: 'eth_balance_low',
      address: settlementManagerAddress,
      balance: balance.toString(),
      threshold: ETH_BALANCE_ALERT_THRESHOLD.toString(),
    });
  } else {
    logger.info(
      {
        event: 'eth_balance_ok',
        address: settlementManagerAddress,
        balance: balance.toString(),
      },
      'SettlementManager ETH balance OK',
    );
  }

  return balance;
}

/**
 * Call SettlementManager.settle(callId, updateData, acceptedChallengeIds) with ETH fee.
 *
 * Steps:
 *   (a) Check ETH balance (Pitfall 4)
 *   (b) Read getUpdateFee from SM to get required ETH fee
 *   (c) writeContract settle() with value=feeWei
 *
 * @param params - settlement parameters
 * @returns transaction hash
 */
export async function settlePythCall(params: SettlePythCallParams): Promise<`0x${string}`> {
  const {
    callId,
    updateData,
    acceptedChallengeIds,
    walletClient,
    publicClient,
    settlementManagerAddress = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as Address,
  } = params;

  const logger = getLogger();

  logger.info(
    {
      event: 'pyth_settle_start',
      callId: callId.toString(),
      updateDataLength: updateData.length,
      acceptedChallengeIdsCount: acceptedChallengeIds.length,
    },
    'Starting Pyth settle call',
  );

  // (a) Check ETH balance before incurring the fee (Pitfall 4, T-04-04-03)
  await checkEthBalance(publicClient, settlementManagerAddress);

  // (b) Read the required ETH update fee from SM
  let feeWei: bigint;
  try {
    feeWei = await publicClient.readContract({
      address: settlementManagerAddress,
      abi: SM_ABI,
      functionName: 'getUpdateFee',
      args: [updateData],
    });
  } catch (err) {
    // If getUpdateFee is not available (older SM), fall back to 0
    logger.warn(
      {
        event: 'pyth_fee_read_failed',
        callId: callId.toString(),
        err: err instanceof Error ? err.message : String(err),
      },
      'Could not read Pyth update fee — using 0',
    );
    feeWei = 0n;
  }

  // (c) Submit the settlement transaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txHash = await (walletClient as any).writeContract({
    address: settlementManagerAddress,
    abi: SM_ABI,
    functionName: 'settle',
    args: [callId, updateData, acceptedChallengeIds],
    value: feeWei,
  });

  logger.info(
    {
      event: 'pyth_settle',
      callId: callId.toString(),
      txHash,
      feeWei: feeWei.toString(),
    },
    'Pyth settle transaction submitted',
  );

  return txHash as `0x${string}`;
}
