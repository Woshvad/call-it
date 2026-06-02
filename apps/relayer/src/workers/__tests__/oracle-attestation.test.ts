/**
 * oracle-attestation.test.ts — pins the unified attestation format to the on-chain
 * SettlementManager byte-contract (Wave B of the attestation-rail gap-closure).
 *
 * These assertions are the spec-of-record for the relayer↔contract format. If the
 * contract's ORACLE_ATTESTATION_TYPEHASH, EIP-712 domain, or submitAttestation decode
 * changes, these tests must change in lockstep — and vice versa.
 *
 * Spec: CALL_IT_SPEC1.md §12.4, §13 · Requirements: SETTLE-06, SAFETY-57
 */

import { describe, it, expect, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress, type Hex } from 'viem';
import {
  OracleType,
  OracleOutcome,
  ORACLE_DOMAIN_NAME,
  ORACLE_DOMAIN_VERSION,
  ORACLE_ATTESTATION_TYPES,
  getOracleDomain,
  encodeOracleAttestationData,
  decodeOracleAttestationData,
  resolveValueOutcome,
  signOracleAttestation,
  type OracleSigner,
} from '../oracle-adapters/oracle-attestation.js';

const SM = '0x1234567890123456789012345678901234567890' as `0x${string}`;
const SEPOLIA = 421614n; // Arbitrum Sepolia chainId — the contract uses block.chainid

describe('oracle-attestation — EIP-712 domain', () => {
  it('matches the contract constructor EIP712("CallIt-Oracle", "1")', () => {
    expect(ORACLE_DOMAIN_NAME).toBe('CallIt-Oracle');
    expect(ORACLE_DOMAIN_VERSION).toBe('1');
    const domain = getOracleDomain(SEPOLIA, SM);
    expect(domain).toEqual({
      name: 'CallIt-Oracle',
      version: '1',
      chainId: 421614n,
      verifyingContract: SM,
    });
  });

  it('carries the REAL deployment chainId, never a hardcoded 42161', () => {
    // The legacy per-adapter code hardcoded 42161n; on Sepolia that broke ECDSA.recover.
    expect(getOracleDomain(421614n, SM).chainId).toBe(421614n);
    expect(getOracleDomain(42161n, SM).chainId).toBe(42161n);
  });
});

describe('oracle-attestation — typed-data field list', () => {
  it('byte-matches ORACLE_ATTESTATION_TYPEHASH field (name,type,order)', () => {
    // "OracleAttestation(uint256 callId,uint8 oracleType,uint8 outcome,int256 priceDelta,uint256 timestamp)"
    expect(ORACLE_ATTESTATION_TYPES.OracleAttestation).toEqual([
      { name: 'callId', type: 'uint256' },
      { name: 'oracleType', type: 'uint8' },
      { name: 'outcome', type: 'uint8' },
      { name: 'priceDelta', type: 'int256' },
      { name: 'timestamp', type: 'uint256' },
    ]);
  });
});

describe('oracle-attestation — resolveValueOutcome (mirrors _settlePyth: observed >= target)', () => {
  it('observed > target → CallerWon, positive delta', () => {
    expect(resolveValueOutcome(150n, 100n)).toEqual({
      outcome: OracleOutcome.CallerWon,
      priceDelta: 50n,
    });
  });

  it('observed == target → CallerWon, zero delta (>= is inclusive, exactly like the contract)', () => {
    expect(resolveValueOutcome(100n, 100n)).toEqual({
      outcome: OracleOutcome.CallerWon,
      priceDelta: 0n,
    });
  });

  it('observed < target → CallerLost, negative delta', () => {
    expect(resolveValueOutcome(80n, 100n)).toEqual({
      outcome: OracleOutcome.CallerLost,
      priceDelta: -20n,
    });
  });
});

describe('oracle-attestation — ABI encode/decode round-trip', () => {
  it('round-trips all 5 fields including a NEGATIVE int256 priceDelta', () => {
    const fields = {
      callId: 42n,
      oracleType: OracleType.NftTwap,
      outcome: OracleOutcome.CallerLost,
      priceDelta: -123456789n, // exercises int256 two's-complement encoding
      timestamp: 1_700_000_000n,
    };
    const encoded = encodeOracleAttestationData(fields);
    expect(decodeOracleAttestationData(encoded)).toEqual(fields);
  });

  it('round-trips a large positive priceDelta', () => {
    const fields = {
      callId: 1n,
      oracleType: OracleType.DefiLlama,
      outcome: OracleOutcome.CallerWon,
      priceDelta: 999_000_000_000_000n,
      timestamp: 1_800_000_000n,
    };
    expect(decodeOracleAttestationData(encodeOracleAttestationData(fields))).toEqual(fields);
  });
});

describe('oracle-attestation — signOracleAttestation guards (defense in depth)', () => {
  const mockSigner: OracleSigner = {
    address: '0x000000000000000000000000000000000000dEaD',
    signTypedData: vi.fn().mockResolvedValue('0xdeadbeef' as Hex),
  };

  it('refuses to sign for Pyth (oracleType 0 — settles on-chain via VAA)', async () => {
    await expect(
      signOracleAttestation({
        account: mockSigner,
        chainId: SEPOLIA,
        verifyingContract: SM,
        callId: 1n,
        oracleType: OracleType.Pyth,
        outcome: OracleOutcome.CallerWon,
        priceDelta: 0n,
        timestamp: 1n,
      }),
    ).rejects.toThrow(/Pyth/);
  });

  it('refuses to sign a non-definitive (Pending) outcome — the contract rejects it', async () => {
    await expect(
      signOracleAttestation({
        account: mockSigner,
        chainId: SEPOLIA,
        verifyingContract: SM,
        callId: 1n,
        oracleType: OracleType.Snapshot,
        outcome: OracleOutcome.Pending,
        priceDelta: 0n,
        timestamp: 1n,
      }),
    ).rejects.toThrow(/Pending|non-definitive/);
  });

  it('signs with the unified domain and returns decodable attestationData', async () => {
    const captured: { domain?: { name: string; chainId: bigint; verifyingContract: string } } = {};
    const signer: OracleSigner = {
      address: '0x000000000000000000000000000000000000dEaD',
      signTypedData: vi.fn(async (args) => {
        captured.domain = args.domain;
        return '0xsig' as Hex;
      }),
    };

    const result = await signOracleAttestation({
      account: signer,
      chainId: SEPOLIA,
      verifyingContract: SM,
      callId: 7n,
      oracleType: OracleType.DefiLlama,
      outcome: OracleOutcome.CallerWon,
      priceDelta: 12n,
      timestamp: 1_700_000_000n,
    });

    expect(captured.domain?.name).toBe('CallIt-Oracle');
    expect(captured.domain?.chainId).toBe(421614n);
    expect(captured.domain?.verifyingContract).toBe(SM);
    expect(decodeOracleAttestationData(result.attestationData)).toEqual({
      callId: 7n,
      oracleType: OracleType.DefiLlama,
      outcome: OracleOutcome.CallerWon,
      priceDelta: 12n,
      timestamp: 1_700_000_000n,
    });
  });
});

describe('oracle-attestation — EIP-712 signature is recoverable (proxy for on-chain ECDSA.recover)', () => {
  it('a real viem signature over this typed data recovers to the signer address', async () => {
    // Deterministic throwaway test key (NOT a real key). Proves the domain/types/message
    // hash deterministically and the signature recovers — exactly what the contract's
    // ECDSA.recover(_hashTypedDataV4(structHash), signature) does on-chain.
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    );

    const result = await signOracleAttestation({
      account: account as unknown as OracleSigner,
      chainId: SEPOLIA,
      verifyingContract: SM,
      callId: 99n,
      oracleType: OracleType.NftTwap,
      outcome: OracleOutcome.CallerLost,
      priceDelta: -5n,
      timestamp: 1_700_000_123n,
    });

    const recovered = await recoverTypedDataAddress({
      domain: getOracleDomain(SEPOLIA, SM),
      types: ORACLE_ATTESTATION_TYPES,
      primaryType: 'OracleAttestation',
      message: {
        callId: 99n,
        oracleType: OracleType.NftTwap,
        outcome: OracleOutcome.CallerLost,
        priceDelta: -5n,
        timestamp: 1_700_000_123n,
      },
      signature: result.signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});
