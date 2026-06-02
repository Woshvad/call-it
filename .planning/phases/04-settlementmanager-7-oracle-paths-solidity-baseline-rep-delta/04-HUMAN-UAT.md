---
status: partial
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
source: [04-VERIFICATION.md]
started: 2026-06-02T00:31:26Z
updated: 2026-06-02T00:31:26Z
---

## Current Test

[awaiting human testing — live wallet-driven §19.11 smoke test]

## Context

Phase 4 code is fully verified (17/17 must-haves, all automated tests GREEN, deployed live to Arbitrum Sepolia, money paths fork-tested against real USDC). The items below need a funded Sepolia wallet + browser + a real settlement cycle and cannot be automated.

Live deployment under test:
- SettlementManager: 0xAc37a0e4A3e575EF21684c28a5b820dB44654595
- FollowFadeMarket v2: 0x185e43526c0acd88AC236197e3Ee7629ebd601CA
- Subgraph v0.4.0: https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.4.0

## Tests

### 1. Live settlement E2E (Pyth demo spine)
expected: Create a BTC/USD price-target call on Sepolia with a short expiry; after expiry the settlement watcher enqueues and calls settle() (visible as a settle() tx on SettlementManager in Arbiscan); the call transitions to Settled.
result: [pending]

### 2. Dispute flow E2E
expected: On a Settled Receipt, "Dispute this settlement" opens the DisputeModal; approving + posting the $5 USDC bond submits raiseDispute; the dispute appears in /disputes with the 24h owner-commitment.
result: [pending]

### 3. Provenance modal content (D-10)
expected: "view oracle proof ↗" opens the ProvenanceModal showing path-aware raw data (Pyth price + confidence + publishTime), the settle() tx Arbiscan link, and the truncated EIP-712 relayer signature (chainId 42161 label).
result: [pending]

### 4. OG card 200px readability QA (SHARE-12 / UI-18)
expected: The Settled and Caller-Exited OG cards remain legible (outcome word, key figures) when scaled to ~200px width — the social-thumbnail readability gate.
result: [pending]

### 5. Live OG render for settled / exited calls
expected: GET /og/[callId] returns a non-fallback card with header X-Variant: settled and the outcome word visible; ?as=fader renders "FADED CORRECTLY" for a winning fader.
result: [pending]

### 6. On-chain wiring confirmation (cast)
expected: SM owner() = deployer 0xDa8c…A4a5; CallRegistry.settlementManager() and FollowFadeMarket v2.settlementManager() both = SM 0xAc37a0e4A3e575EF21684c28a5b820dB44654595.
result: passed — verified by orchestrator 2026-06-02 (cast call against Sepolia: owner = 0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5; CR.settlementManager() and FFMv2.settlementManager() both returned 0xAc37a0e4A3e575EF21684c28a5b820dB44654595).

## Summary

total: 6
passed: 1
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
