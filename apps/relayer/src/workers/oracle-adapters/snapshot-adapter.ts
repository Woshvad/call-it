/**
 * Snapshot governance oracle adapter — KMS-attestation rail (D-02).
 *
 * Reads Snapshot proposal state via @snapshot-labs/snapshot.js and signs
 * the outcome with the snapshot-tally KMS key.
 *
 * Flow:
 *   1. fetchSnapshotProposal: query Snapshot Hub for proposal state
 *   2. signSnapshotAttestation: EIP-712 sign with keyId='snapshot-tally'
 *   3. Return signed attestation for SettlementManager.submitAttestation
 *
 * Security (Pitfall 7):
 *   - EIP-712 domain chainId=42161n (Arbitrum One) — cross-chain replay prevention
 *   - domain.name='CallIt-SnapshotTally' — cross-adapter replay prevention
 *   - keyId='snapshot-tally' — per-type KMS key (D-05); shared with tally-adapter (both governance)
 *
 * Spec: CALL_IT_SPEC1.md §13.5
 * Requirements: SETTLE-21, SETTLE-22
 */

import { encodeAbiParameters, parseAbiParameters } from 'viem';
// NOTE: Import from 3 levels up to match vi.mock('../../../lib/kms-signer.js') test pattern
import { gcpKmsAccount } from '../../../lib/kms-signer.js';
import { getLogger } from '../../lib/logger.js';
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SnapshotOutcome = 'CallerWon' | 'CallerLost' | 'Ambiguous';

export interface SnapshotProposalData {
  id: string;
  state: string;
  title: string;
  scores?: number[];
  scores_total?: number;
  quorum?: number;
}

export interface SnapshotResult {
  proposalId: string;
  outcome: SnapshotOutcome;
  scores?: number[];
  quorum?: number;
  ambiguous?: boolean;
}

export interface SnapshotAttestation {
  callId: bigint;
  proposalId: string;
  outcome: number; // 0=Ambiguous, 1=CallerWon, 2=CallerLost
  timestamp: bigint;
  signature: `0x${string}`;
  attestationData: `0x${string}`;
}

export interface SnapshotAdapterConfig {
  settlementManagerAddress?: `0x${string}`;
  kmsProjectId: string;
  kmsLocationId: string;
  kmsKeyRingId: string;
  kmsKeyVersion: string;
  kmsExpectedAddress?: `0x${string}`;
  /** Snapshot Hub URL (default: https://hub.snapshot.org) */
  hubUrl?: string;
}

// ── EIP-712 type definitions ──────────────────────────────────────────────────

/**
 * EIP-712 types for Snapshot attestation.
 * Domain: name='CallIt-SnapshotTally', chainId=42161n (Pitfall 7).
 * Note: domain name shared with tally-adapter (both use keyId='snapshot-tally').
 */
const SNAPSHOT_ATTESTATION_TYPES = {
  SnapshotAttestation: [
    { name: 'callId', type: 'uint256' },
    { name: 'proposalId', type: 'string' },
    { name: 'outcome', type: 'uint8' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'chainId', type: 'uint256' },
  ],
} as const;

// ── Outcome mapping ───────────────────────────────────────────────────────────

const OUTCOME_TO_UINT: Record<SnapshotOutcome, number> = {
  Ambiguous: 0,
  CallerWon: 1,
  CallerLost: 2,
};

// ── Snapshot fetch ────────────────────────────────────────────────────────────

/**
 * Fetch a Snapshot proposal and determine its outcome.
 *
 * @param proposalId - Snapshot proposal ID
 * @param hubUrl - Snapshot Hub URL (default: https://hub.snapshot.org)
 */
export async function fetchSnapshotProposal(
  proposalId: string,
  hubUrl = 'https://hub.snapshot.org',
): Promise<SnapshotResult> {
  const logger = getLogger();

  logger.info(
    { event: 'snapshot_fetch_start', proposalId, hubUrl },
    'Snapshot proposal fetch started',
  );

  try {
    // Use snapshot.js client to fetch proposal
    // @snapshot-labs/snapshot.js exports a default object with Client712
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshotModule = await import('@snapshot-labs/snapshot.js') as any;
    const SnapshotClient = snapshotModule.default?.Client712 ?? snapshotModule.Client712 ?? snapshotModule.default?.Client;
    if (!SnapshotClient) {
      throw new Error('snapshot.js Client712 not found in module exports');
    }
    const client = new SnapshotClient(hubUrl) as { request: (type: string, params: Record<string, string>) => Promise<unknown> };

    const proposal = await client.request('proposal', { id: proposalId }) as SnapshotProposalData | null | undefined;

    if (!proposal || !proposal.id) {
      logger.warn(
        { event: 'snapshot_proposal_not_found', proposalId },
        'Snapshot proposal not found — marking ambiguous',
      );
      return { proposalId, outcome: 'Ambiguous', ambiguous: true };
    }

    logger.info(
      {
        event: 'snapshot_proposal_fetched',
        proposalId,
        state: proposal.state,
        title: proposal.title,
      },
      `Snapshot proposal state: ${proposal.state}`,
    );

    // Only closed proposals have final results
    if (proposal.state !== 'closed') {
      logger.warn(
        { event: 'snapshot_proposal_not_closed', proposalId, state: proposal.state },
        'Snapshot proposal not yet closed — marking ambiguous',
      );
      return { proposalId, outcome: 'Ambiguous', ambiguous: true };
    }

    const scores = proposal.scores ?? [];
    const scoresTotal = proposal.scores_total ?? 0;
    const quorum = proposal.quorum ?? 0;

    // Check quorum (if applicable)
    if (quorum > 0 && scoresTotal < quorum) {
      logger.warn(
        { event: 'snapshot_quorum_not_met', proposalId, scoresTotal, quorum },
        'Snapshot proposal did not meet quorum — marking ambiguous',
      );
      return { proposalId, outcome: 'Ambiguous', scores, quorum, ambiguous: true };
    }

    // Determine outcome: 'For' votes are typically the first score (index 0)
    // Caller wins if the 'For' option has the most votes
    const maxScore = Math.max(...scores);
    const winnerIndex = scores.indexOf(maxScore);

    // Standard Snapshot: choice 0 = For (YES), choice 1 = Against (NO)
    // Caller wins if the majority voted "For" (index 0)
    const outcome: SnapshotOutcome = winnerIndex === 0 ? 'CallerWon' : 'CallerLost';

    logger.info(
      {
        event: 'snapshot_outcome_determined',
        proposalId,
        outcome,
        scores,
        winnerIndex,
      },
      `Snapshot outcome: ${outcome}`,
    );

    return { proposalId, outcome, scores, quorum };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        event: 'snapshot_fetch_error',
        proposalId,
        error: message,
      },
      'Snapshot proposal fetch failed — marking ambiguous',
    );
    // On any fetch failure: return ambiguous (not throw — prevents settlement-watcher crash)
    return { proposalId, outcome: 'Ambiguous', ambiguous: true };
  }
}

// ── SnapshotAdapter class ─────────────────────────────────────────────────────

/**
 * SnapshotAdapter: reads Snapshot proposal state and signs with KMS.
 *
 * KMS key: 'snapshot-tally' (shared with tally-adapter — both governance oracles).
 * domain.name='CallIt-SnapshotTally'.
 */
export class SnapshotAdapter {
  private readonly config: SnapshotAdapterConfig;

  constructor(config: SnapshotAdapterConfig) {
    this.config = config;
  }

  /**
   * Fetch Snapshot proposal and produce a signed EIP-712 attestation.
   * Returns { ambiguous: true } on any fetch failure or non-closed state.
   */
  async fetchAndAttest(
    callId: bigint,
    proposalId: string,
  ): Promise<SnapshotAttestation & { ambiguous?: boolean }> {
    const logger = getLogger();

    const snapshotResult = await fetchSnapshotProposal(
      proposalId,
      this.config.hubUrl,
    );

    if (snapshotResult.ambiguous) {
      logger.warn(
        { event: 'snapshot_attestation_ambiguous', callId: callId.toString(), proposalId },
        'Snapshot result ambiguous — returning ambiguous attestation',
      );
      return {
        callId,
        proposalId,
        outcome: OUTCOME_TO_UINT.Ambiguous,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        signature: '0x' as `0x${string}`,
        attestationData: '0x' as `0x${string}`,
        ambiguous: true,
      };
    }

    const outcomeUint = OUTCOME_TO_UINT[snapshotResult.outcome];
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const smAddress = this.config.settlementManagerAddress ?? (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`);

    const expectedAddress = (
      this.config.kmsExpectedAddress ??
      (process.env.KMS_ADDRESS_SNAPSHOT_TALLY as `0x${string}`) ??
      '0x0000000000000000000000000000000000000000' as `0x${string}`
    );

    // keyId='snapshot-tally' — shared with tally-adapter (both governance oracles, D-05)
    // domain.name='CallIt-SnapshotTally' — prevents cross-adapter replay (Pitfall 7)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = gcpKmsAccount({
      projectId: this.config.kmsProjectId,
      locationId: this.config.kmsLocationId,
      keyRingId: this.config.kmsKeyRingId,
      keyId: 'snapshot-tally',
      keyVersion: this.config.kmsKeyVersion,
      expectedAddress,
    }) as any; // gcpKmsAccount returns LocalAccount; viem type widening loses signTypedData

    logger.info(
      {
        event: 'snapshot_sign',
        callId: callId.toString(),
        proposalId,
        outcome: snapshotResult.outcome,
        outcomeUint,
      },
      'Signing Snapshot attestation with KMS (keyId=snapshot-tally)',
    );

    const domain = {
      name: 'CallIt-SnapshotTally',
      version: '1',
      chainId: 42161n,
      verifyingContract: smAddress,
    };

    const message = {
      callId,
      proposalId,
      outcome: outcomeUint,
      timestamp,
      chainId: 42161n,
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const signature = await account.signTypedData({
      domain,
      types: SNAPSHOT_ATTESTATION_TYPES,
      primaryType: 'SnapshotAttestation',
      message,
    });

    const attestationData = encodeAbiParameters(
      parseAbiParameters(
        'uint256 callId, string proposalId, uint8 outcome, uint256 timestamp, uint256 chainId',
      ),
      [callId, proposalId, outcomeUint, timestamp, 42161n],
    );

    logger.info(
      {
        event: 'snapshot_submit_ready',
        callId: callId.toString(),
        proposalId,
        outcome: snapshotResult.outcome,
      },
      'Snapshot attestation signed and ready for submission',
    );

    return {
      callId,
      proposalId,
      outcome: outcomeUint,
      timestamp,
      signature: signature as `0x${string}`,
      attestationData,
    };
  }
}
