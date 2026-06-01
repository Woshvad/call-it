/**
 * Tally governance oracle adapter — KMS-attestation rail (D-02).
 *
 * Reads Tally on-chain governance proposal state via direct GraphQL fetch
 * (no official Tally npm SDK — per CLAUDE.md: "direct fetch via fetch() or graphql-request").
 * Signs the outcome with the snapshot-tally KMS key (same key as snapshot-adapter).
 *
 * Flow:
 *   1. fetchTallyProposal: fetch to https://api.tally.xyz/query with TALLY_API_KEY header
 *   2. signTallyAttestation: EIP-712 sign with keyId='snapshot-tally'
 *   3. Return signed attestation for SettlementManager.submitAttestation
 *
 * Security (Pitfall 7):
 *   - EIP-712 domain chainId=42161n (Arbitrum One) — cross-chain replay prevention
 *   - domain.name='CallIt-SnapshotTally' — same domain as snapshot-adapter (both governance)
 *   - keyId='snapshot-tally' — per-type KMS key (D-05); shared with snapshot-adapter
 *
 * Open question (RESEARCH.md): TALLY_API_KEY is required; free tier key needed.
 * This adapter logs a warning if TALLY_API_KEY is absent and returns ambiguous.
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

export type TallyOutcome = 'CallerWon' | 'CallerLost' | 'Ambiguous';

/** Tally proposal status values returned by the API */
export type TallyProposalStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'DEFEATED'
  | 'EXECUTED'
  | 'EXPIRED'
  | 'CANCELED'
  | 'QUEUED';

export interface TallyProposalData {
  id: string;
  status: TallyProposalStatus;
  eta?: string | null;
  voteStats?: Array<{
    type: string;
    votes: string;
    percent: number;
  }>;
}

export interface TallyResult {
  proposalId: string;
  outcome: TallyOutcome;
  status?: TallyProposalStatus;
  ambiguous?: boolean;
}

export interface TallyAttestation {
  callId: bigint;
  proposalId: string;
  outcome: number; // 0=Ambiguous, 1=CallerWon, 2=CallerLost
  timestamp: bigint;
  signature: `0x${string}`;
  attestationData: `0x${string}`;
}

export interface TallyAdapterConfig {
  settlementManagerAddress?: `0x${string}`;
  kmsProjectId: string;
  kmsLocationId: string;
  kmsKeyRingId: string;
  kmsKeyVersion: string;
  kmsExpectedAddress?: `0x${string}`;
  /** Tally API key (from env TALLY_API_KEY) */
  tallyApiKey?: string;
  /** Tally GraphQL endpoint (default: https://api.tally.xyz/query) */
  tallyEndpoint?: string;
}

// ── EIP-712 type definitions ──────────────────────────────────────────────────

/**
 * EIP-712 types for Tally attestation.
 * Domain: name='CallIt-SnapshotTally', chainId=42161n (Pitfall 7).
 * Note: domain name shared with snapshot-adapter (both use keyId='snapshot-tally').
 */
const TALLY_ATTESTATION_TYPES = {
  TallyAttestation: [
    { name: 'callId', type: 'uint256' },
    { name: 'proposalId', type: 'string' },
    { name: 'outcome', type: 'uint8' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'chainId', type: 'uint256' },
  ],
} as const;

// ── Outcome mapping ───────────────────────────────────────────────────────────

const OUTCOME_TO_UINT: Record<TallyOutcome, number> = {
  Ambiguous: 0,
  CallerWon: 1,
  CallerLost: 2,
};

// ── Tally API fetch ───────────────────────────────────────────────────────────

const TALLY_ENDPOINT = 'https://api.tally.xyz/query';

/** GraphQL query for proposal status + vote stats */
const PROPOSAL_QUERY = (proposalId: string) => `{
  proposal(id: "${proposalId}") {
    id
    status
    eta
    voteStats {
      type
      votes
      percent
    }
  }
}`;

/**
 * Fetch a Tally governance proposal and determine its outcome.
 *
 * @param proposalId - Tally proposal ID (numeric string from the governance contract)
 * @param apiKey - Tally API key (from env TALLY_API_KEY)
 * @param endpoint - Tally GraphQL endpoint (default: https://api.tally.xyz/query)
 */
export async function fetchTallyProposal(
  proposalId: string,
  apiKey?: string,
  endpoint = TALLY_ENDPOINT,
): Promise<TallyResult> {
  const logger = getLogger();
  const tallyApiKey = apiKey ?? process.env.TALLY_API_KEY ?? '';

  // Check TALLY_API_KEY — log warning if absent (T-04-06-05)
  if (!tallyApiKey) {
    logger.warn(
      { event: 'tally_api_key_missing', proposalId },
      'TALLY_API_KEY not set — Tally fetch will fail; marking ambiguous (T-04-06-05)',
    );
    return { proposalId, outcome: 'Ambiguous', ambiguous: true };
  }

  logger.info(
    { event: 'tally_fetch_start', proposalId, endpoint },
    'Tally proposal fetch started',
  );

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Api-Key': tallyApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: PROPOSAL_QUERY(proposalId) }),
    });

    if (!res.ok) {
      throw new Error(`Tally API request failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as {
      data?: { proposal: TallyProposalData | null };
      errors?: { message: string }[];
    };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Tally GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    const proposal = json.data?.proposal;
    if (!proposal) {
      logger.warn(
        { event: 'tally_proposal_not_found', proposalId },
        'Tally proposal not found — marking ambiguous',
      );
      return { proposalId, outcome: 'Ambiguous', ambiguous: true };
    }

    const status = proposal.status;

    logger.info(
      { event: 'tally_proposal_fetched', proposalId, status },
      `Tally proposal status: ${status}`,
    );

    // Determine outcome from status
    // CallerWon: proposal was EXECUTED (successfully passed + executed on-chain)
    // CallerLost: proposal was DEFEATED, EXPIRED, or CANCELED
    // Ambiguous: ACTIVE, PENDING, QUEUED, SUCCEEDED (passed but not yet executed)
    if (status === 'EXECUTED') {
      return { proposalId, outcome: 'CallerWon', status };
    }

    if (status === 'DEFEATED' || status === 'EXPIRED' || status === 'CANCELED') {
      return { proposalId, outcome: 'CallerLost', status };
    }

    // ACTIVE, PENDING, QUEUED, SUCCEEDED — not yet final
    logger.warn(
      { event: 'tally_proposal_not_final', proposalId, status },
      `Tally proposal status '${status}' is not final — marking ambiguous`,
    );
    return { proposalId, outcome: 'Ambiguous', status, ambiguous: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        event: 'tally_fetch_error',
        proposalId,
        error: message,
      },
      'Tally proposal fetch failed — marking ambiguous',
    );
    // On any fetch failure: return ambiguous (not throw — prevents settlement-watcher crash)
    return { proposalId, outcome: 'Ambiguous', ambiguous: true };
  }
}

// ── TallyAdapter class ────────────────────────────────────────────────────────

/**
 * TallyAdapter: reads Tally governance proposal state and signs with KMS.
 *
 * KMS key: 'snapshot-tally' (shared with snapshot-adapter — both governance oracles).
 * domain.name='CallIt-SnapshotTally'.
 */
export class TallyAdapter {
  private readonly config: TallyAdapterConfig;

  constructor(config: TallyAdapterConfig) {
    this.config = config;
  }

  /**
   * Fetch Tally proposal and produce a signed EIP-712 attestation.
   * Returns { ambiguous: true } on any fetch failure or non-final status.
   */
  async fetchAndAttest(
    callId: bigint,
    proposalId: string,
  ): Promise<TallyAttestation & { ambiguous?: boolean }> {
    const logger = getLogger();

    const tallyResult = await fetchTallyProposal(
      proposalId,
      this.config.tallyApiKey,
      this.config.tallyEndpoint,
    );

    if (tallyResult.ambiguous) {
      logger.warn(
        { event: 'tally_attestation_ambiguous', callId: callId.toString(), proposalId },
        'Tally result ambiguous — returning ambiguous attestation',
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

    const outcomeUint = OUTCOME_TO_UINT[tallyResult.outcome];
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const smAddress = this.config.settlementManagerAddress ?? (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`);

    const expectedAddress = (
      this.config.kmsExpectedAddress ??
      (process.env.KMS_ADDRESS_SNAPSHOT_TALLY as `0x${string}`) ??
      '0x0000000000000000000000000000000000000000' as `0x${string}`
    );

    // keyId='snapshot-tally' — same key as snapshot-adapter (both governance oracles, D-05)
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
        event: 'tally_sign',
        callId: callId.toString(),
        proposalId,
        outcome: tallyResult.outcome,
        outcomeUint,
      },
      'Signing Tally attestation with KMS (keyId=snapshot-tally)',
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
      types: TALLY_ATTESTATION_TYPES,
      primaryType: 'TallyAttestation',
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
        event: 'tally_submit_ready',
        callId: callId.toString(),
        proposalId,
        outcome: tallyResult.outcome,
      },
      'Tally attestation signed and ready for submission',
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
