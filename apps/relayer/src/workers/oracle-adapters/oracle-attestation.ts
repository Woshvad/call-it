/**
 * Unified oracle attestation — the single signed-outcome format the deployed
 * SettlementManager verifies (Wave B of the attestation-rail gap-closure).
 *
 * THIS MODULE IS THE BYTE-CONTRACT WITH SettlementManager.sol. It mirrors, exactly:
 *
 *   EIP-712 domain   : EIP712("CallIt-Oracle", "1") + block.chainid + address(this)
 *   struct typehash  : OracleAttestation(uint256 callId,uint8 oracleType,uint8 outcome,int256 priceDelta,uint256 timestamp)
 *   submitAttestation: abi.decode(attestationData, (uint256, uint8, uint8, int256, uint256))
 *
 * Any drift between this file and SettlementManager.{ORACLE_ATTESTATION_TYPEHASH,
 * _hashTypedDataV4, submitAttestation decode} makes every non-Pyth settlement
 * revert InvalidAttestation. The unit test pins the format; do not edit one side
 * without the other.
 *
 * CRITICAL — chainId: the contract's EIP712 domain uses `block.chainid` (the REAL
 * deployment chain, e.g. 421614 on Arbitrum Sepolia, 42161 on Arbitrum One). The
 * old per-adapter code hardcoded 42161n, which would make every Sepolia attestation
 * fail ECDSA.recover. Callers MUST pass the deployment chainId — never hardcode it.
 *
 * CRITICAL — outcome direction: the contract reads _attestedOutcome verbatim (it does
 * NOT re-derive it). The relayer is the sole authority on correctness. resolveValueOutcome
 * mirrors SettlementManager._settlePyth EXACTLY: `observed >= target -> CallerWon`,
 * priceDelta = observed - target (signed). observed and target MUST be in the same unit.
 *
 * Spec: CALL_IT_SPEC1.md §12.4 (step 6 — outcome computed deterministically), §13
 * Requirements: SETTLE-06, SAFETY-57, T-04-04-01
 */

import {
  encodeAbiParameters,
  decodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';

// ── Enums (mirror ISettlementManager.OracleAdapter + ICallRegistry.Outcome) ────

/**
 * OracleAdapter enum — mirrors ISettlementManager.sol exactly.
 * Pyth(0) NEVER uses the attestation path (it settles on-chain via VAA).
 * submitAttestation rejects oracleType 0 and any value > CexScraper(6).
 */
export enum OracleType {
  Pyth = 0,
  NftTwap = 1,
  DefiLlama = 2,
  RpcMetrics = 3,
  Snapshot = 4,
  Tally = 5,
  CexScraper = 6,
}

/**
 * Outcome enum — mirrors ICallRegistry.Outcome exactly.
 * submitAttestation accepts ONLY CallerWon(1) / CallerLost(2); Pending(0) is rejected.
 */
export enum OracleOutcome {
  Pending = 0,
  CallerWon = 1,
  CallerLost = 2,
}

// ── EIP-712 domain ─────────────────────────────────────────────────────────────

/** Must equal the SettlementManager constructor's EIP712("CallIt-Oracle", "1"). */
export const ORACLE_DOMAIN_NAME = 'CallIt-Oracle';
export const ORACLE_DOMAIN_VERSION = '1';

export interface OracleDomain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: Address;
}

/**
 * Build the EIP-712 domain. chainId MUST be the deployment chain (block.chainid):
 *   - Arbitrum Sepolia: 421614
 *   - Arbitrum One:      42161
 */
export function getOracleDomain(chainId: bigint, verifyingContract: Address): OracleDomain {
  return {
    name: ORACLE_DOMAIN_NAME,
    version: ORACLE_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };
}

/**
 * EIP-712 typed-data field list. The (name, type, order) tuple MUST byte-match the
 * Solidity typehash string in SettlementManager.ORACLE_ATTESTATION_TYPEHASH:
 *   "OracleAttestation(uint256 callId,uint8 oracleType,uint8 outcome,int256 priceDelta,uint256 timestamp)"
 */
export const ORACLE_ATTESTATION_TYPES = {
  OracleAttestation: [
    { name: 'callId', type: 'uint256' },
    { name: 'oracleType', type: 'uint8' },
    { name: 'outcome', type: 'uint8' },
    { name: 'priceDelta', type: 'int256' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const;

// ── ABI encoding (must match submitAttestation's abi.decode) ────────────────────

const ATTESTATION_ABI_PARAMS = parseAbiParameters(
  'uint256 callId, uint8 oracleType, uint8 outcome, int256 priceDelta, uint256 timestamp',
);

export interface OracleAttestationFields {
  callId: bigint;
  oracleType: OracleType;
  outcome: OracleOutcome;
  /** Signed delta carried through to CallSettled.priceDelta. 0 when not price-bearing. */
  priceDelta: bigint;
  timestamp: bigint;
}

/** ABI-encode the payload the contract decodes via abi.decode(..., (uint256,uint8,uint8,int256,uint256)). */
export function encodeOracleAttestationData(f: OracleAttestationFields): Hex {
  return encodeAbiParameters(ATTESTATION_ABI_PARAMS, [
    f.callId,
    f.oracleType,
    f.outcome,
    f.priceDelta,
    f.timestamp,
  ]);
}

/** Inverse of encodeOracleAttestationData — used by tests to assert round-trip fidelity. */
export function decodeOracleAttestationData(data: Hex): OracleAttestationFields {
  const [callId, oracleType, outcome, priceDelta, timestamp] = decodeAbiParameters(
    ATTESTATION_ABI_PARAMS,
    data,
  );
  return {
    callId,
    oracleType: Number(oracleType) as OracleType,
    outcome: Number(outcome) as OracleOutcome,
    priceDelta,
    timestamp,
  };
}

// ── Outcome resolution (money-critical) ─────────────────────────────────────────

/**
 * Resolve a value-comparison market's outcome. MIRRORS SettlementManager._settlePyth:
 *
 *     int256 currentPrice = p.price;
 *     priceDelta = currentPrice - target;
 *     outcome = currentPrice >= target ? CallerWon : CallerLost;
 *
 * `observed` and `target` MUST be expressed in the SAME unit — the caller (each adapter)
 * is responsible for unit alignment with how the call's targetValue was created. A unit
 * mismatch here is a silent mis-settlement, so adapters document their unit contract.
 *
 * @param observed The oracle-observed value (e.g. floor TWAP, TVL) in the call's unit.
 * @param target   The call's on-chain targetValue, in the same unit.
 */
export function resolveValueOutcome(
  observed: bigint,
  target: bigint,
): { outcome: OracleOutcome; priceDelta: bigint } {
  const priceDelta = observed - target;
  const outcome = observed >= target ? OracleOutcome.CallerWon : OracleOutcome.CallerLost;
  return { outcome, priceDelta };
}

// ── Signing ─────────────────────────────────────────────────────────────────────

/**
 * Minimal signer shape. gcpKmsAccount() (a viem LocalAccount) satisfies this; tests
 * pass a mock. Kept permissive (`unknown` args) because viem's generic signTypedData
 * overloads don't narrow cleanly through the KMS account's widened type — the same
 * reason the legacy adapters cast to `any`. The domain/types we pass are fixed below,
 * so the loose arg type does not weaken the on-the-wire format.
 */
export interface OracleSigner {
  address: Address;
  signTypedData: (args: {
    domain: OracleDomain;
    types: typeof ORACLE_ATTESTATION_TYPES;
    primaryType: 'OracleAttestation';
    message: {
      callId: bigint;
      oracleType: number;
      outcome: number;
      priceDelta: bigint;
      timestamp: bigint;
    };
  }) => Promise<Hex>;
}

export interface SignedOracleAttestation {
  /** abi.encode(callId, oracleType, outcome, priceDelta, timestamp) — first arg to submitAttestation. */
  attestationData: Hex;
  /** 65-byte ECDSA signature over the EIP-712 digest — third arg to submitAttestation. */
  signature: Hex;
  fields: OracleAttestationFields;
}

export interface SignOracleAttestationParams {
  account: OracleSigner;
  /** Deployment chainId (block.chainid). NEVER hardcode — pass 421614 (Sepolia) / 42161 (One). */
  chainId: bigint;
  /** SettlementManager address (EIP-712 verifyingContract = address(this)). */
  verifyingContract: Address;
  callId: bigint;
  oracleType: OracleType;
  outcome: OracleOutcome;
  priceDelta: bigint;
  timestamp: bigint;
}

/**
 * Sign + encode a unified oracle attestation ready for SettlementManager.submitAttestation.
 *
 * Enforces, at the signing boundary, the same two invariants the contract enforces —
 * so a buggy adapter fails loudly here instead of producing a signature the contract
 * silently rejects:
 *   - oracleType !== Pyth (Pyth settles on-chain via VAA)
 *   - outcome is definitive (CallerWon / CallerLost; never Pending)
 */
export async function signOracleAttestation(
  params: SignOracleAttestationParams,
): Promise<SignedOracleAttestation> {
  const {
    account,
    chainId,
    verifyingContract,
    callId,
    oracleType,
    outcome,
    priceDelta,
    timestamp,
  } = params;

  if (oracleType === OracleType.Pyth) {
    throw new Error(
      'signOracleAttestation: Pyth (oracleType 0) settles on-chain via VAA and must never be attested',
    );
  }
  if (outcome !== OracleOutcome.CallerWon && outcome !== OracleOutcome.CallerLost) {
    throw new Error(
      `signOracleAttestation: refusing to sign non-definitive outcome ${outcome} — the contract rejects Pending(0)`,
    );
  }

  const domain = getOracleDomain(chainId, verifyingContract);
  const message = { callId, oracleType, outcome, priceDelta, timestamp };

  const signature = await account.signTypedData({
    domain,
    types: ORACLE_ATTESTATION_TYPES,
    primaryType: 'OracleAttestation',
    message,
  });

  const fields: OracleAttestationFields = { callId, oracleType, outcome, priceDelta, timestamp };
  return { attestationData: encodeOracleAttestationData(fields), signature, fields };
}

// ── submitAttestation ABI (single source of truth for all adapters) ─────────────

/** The on-chain submitAttestation signature — identical across every adapter. */
export const SUBMIT_ATTESTATION_ABI = [
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
