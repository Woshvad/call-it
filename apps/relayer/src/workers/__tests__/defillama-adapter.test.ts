/**
 * defillama-adapter.test.ts — RED-gate Vitest scaffold for the DefiLlama oracle adapter.
 *
 * Spec: CALL_IT_SPEC1.md §13.3 — DefiLlama (TVL/volume/fees/APRs)
 * Requirements: SETTLE-18
 * Research: 04-RESEARCH.md §Adapter 2 DefiLlama, §Pitfall 7 (KMS key separation + EIP-712 chainId)
 *
 * RED GATE: This file WILL fail with "Cannot find module" until Plan 04-03 creates
 *   apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts
 * That module-not-found error is the expected Wave 0 RED gate. Do not fix the import.
 *
 * Security notes (Pitfall 7):
 *   - EIP-712 domain MUST include chainId=42161n (Arbitrum One) — prevents cross-chain replay
 *   - EIP-712 domain name="CallIt-DefiLlama" — prevents cross-adapter replay within same chain
 *   - verifyingContract=SETTLEMENT_MANAGER_ADDRESS — binds attestation to specific deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// RED GATE: these modules do not exist yet — created in Plan 04-03
import {
  DefiLlamaAdapter,
  DefiLlamaAttestation,
} from '../oracle-adapters/defillama-adapter.js'; // <-- RED GATE: module does not exist yet

// Mock the KMS signer — prevents real GCP KMS calls in unit tests
vi.mock('../../../lib/kms-signer.js', () => ({
  gcpKmsAccount: vi.fn().mockReturnValue({
    signTypedData: vi.fn().mockResolvedValue('0xmocksignature1234' as `0x${string}`),
    address: '0xRelayerSignerAddress' as `0x${string}`,
  }),
}));

// Mock fetch to intercept DefiLlama API calls
global.fetch = vi.fn();

describe('DefiLlamaAdapter', () => {
  let adapter: DefiLlamaAdapter;
  const MOCK_SETTLEMENT_MANAGER = '0x1234567890123456789012345678901234567890' as `0x${string}`;

  beforeEach(() => {
    adapter = new DefiLlamaAdapter({
      settlementManagerAddress: MOCK_SETTLEMENT_MANAGER,
      kmsProjectId: 'call-it-sepolia',
      kmsLocationId: 'us-east1',
      kmsKeyRingId: 'attestations',
      kmsKeyVersion: '1',
    });
    vi.clearAllMocks();
  });

  // ── EIP-712 domain-binding coverage relocated (Phase 05.1) ───────────────────
  // Two tests previously lived here asserting the LEGACY per-adapter EIP-712 domain
  // (name="CallIt-DefiLlama", hardcoded chainId 42161n). Phase 05.1 (3bcfbeb/ee75bee)
  // unified every oracle adapter onto signOracleAttestation — domain name="CallIt-Oracle"
  // and chainId sourced from process.env.CHAIN_ID (421614 Sepolia / 42161 mainnet), never
  // hardcoded. The cross-chain-replay / cross-adapter-replay / verifyingContract-binding
  // guarantees those tests existed to protect now live canonically — and against the CURRENT
  // design, including a real ECDSA.recover round-trip — in
  //   src/workers/__tests__/oracle-attestation.test.ts:
  //     · "carries the REAL deployment chainId, never a hardcoded 42161"  → cross-chain replay
  //     · domain.name === "CallIt-Oracle" + verifyingContract === SM      → cross-adapter replay
  //     · "a real viem signature ... recovers to the signer address"      → on-chain ECDSA.recover
  // The legacy assertions were DELETED (not unskipped) because they pinned a domain shape that
  // no longer exists and would now assert wrong values.

  /**
   * testFetchTvl:
   * Mocked fetch to api.llama.fi returns tvl value → produces signed attestation.
   */
  it('fetches TVL from api.llama.fi and returns a signed attestation', async () => {
    const mockTvl = 2_500_000; // $2.5M TVL

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        tvl: [
          { date: Math.floor(Date.now() / 1000) - 100, totalLiquidityUSD: mockTvl },
        ],
      }),
    });

    const attestation: DefiLlamaAttestation = await adapter.fetchAndAttest({
      callId: BigInt(3),
      metric: 'tvl',
      protocolSlug: 'curve-dex',
    });

    expect(attestation).toBeDefined();
    expect(attestation.callId).toBe(BigInt(3));
    expect(attestation.metric).toBe('tvl');
    expect(attestation.value).toBeGreaterThan(0n);
    expect(attestation.signature).toMatch(/^0x/);

    // Verify the DefiLlama URL was called correctly
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    const calledUrl = fetchCalls[0][0] as string;
    expect(calledUrl).toContain('api.llama.fi');
    expect(calledUrl).toContain('curve-dex');
  });
});
