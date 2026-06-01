---
phase: 4
slug: settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 04-RESEARCH.md "## Validation Architecture". Money-critical paths
> (fee extraction, pool settlement, rep deltas, oracle ambiguity) require
> layered validation: Foundry property-fuzz invariants for contracts +
> Foundry↔Vitest parity for shared math + adapter unit tests with fixtures.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Foundry (Solidity) + Vitest (TypeScript relayer/web) |
| **Config file** | `packages/contracts/foundry.toml` (existing — `=0.8.30` pin, `ci` fuzz profile = 1000 runs) |
| **Quick run command** | `forge test --match-contract SettlementManagerTest -vv` |
| **Full suite command** | `forge test -v` (all contracts) + `pnpm --filter @call-it/relayer test` |
| **Estimated runtime** | ~60–120 seconds (contracts) + relayer adapter unit tests |

---

## Sampling Rate

- **After every task commit:** Run `forge test --match-contract SettlementManagerTest -vv` (or the matching adapter Vitest file for relayer tasks)
- **After every plan wave:** Run `forge test -v` + `pnpm --filter @call-it/relayer test`
- **Before `/gsd-verify-work`:** Full suite must be green, including the 1000-run `ci` fuzz profile on money-path invariants
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

> Populated by gsd-planner (one row per task) and confirmed by the Nyquist auditor.
> Anchor requirements → tests below from the RESEARCH.md test map.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-XX-XX | XX | 1 | SETTLE-02 | T-04-XX / — | 2nd settle when status != Live reverts `AlreadySettled` | unit | `forge test --match-test testSettleIdempotency` | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 1 | SETTLE-05 | T-04-XX / — | Any step revert rolls back the whole tx | unit | `forge test --match-test testAtomicRollback` | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 1 | SETTLE-46 | T-04-XX / — | Fee split 1.0%+0.4%+0.3% = 1.7%; pool conserved | property-fuzz | `forge test --match-test invariantFeeSplit --fuzz-runs 1000` | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 1 | SETTLE-44 | — | `settle()` gas O(1) vs participant count | gas-snapshot | `forge snapshot --match-test testSettleGas` | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 1 | REP-14 | T-04-XX / — | Cold-start 25% scale when `fadeRealReserve==0` | unit | `forge test --match-test testColdStartScale` | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 1 | REP-22/23 | T-04-XX / — | Stylus revert → baseline fires + `RepCalculatedFallback` | unit (mock Stylus) | `forge test --match-test testStylusFallback` | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 1 | SETTLE-39/40 | T-04-XX / — | `forceSettle` reverts < 7d; emits both events | unit | `forge test --match-test testForceSettleCooldown testForceSettleEvents` | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 1 | SETTLE-25..30/34 | T-04-XX / — | Dispute bond/window/max-3 + reversal re-distributes USDC | unit | `forge test --match-test testDisputeWindow testDisputeReversal` | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 2 | SETTLE-16 | T-04-XX / — | NFT TWAP < 12 obs → ambiguous | unit | Vitest adapter test | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 2 | SETTLE-23 | T-04-XX / — | CEX scraper detects known listing in fixture; Innovation Zone excluded | unit | Vitest static-HTML fixture | ❌ W0 | ⬜ pending |
| 04-XX-XX | XX | 2 | D-08 / SHARE-06 | — | CONTRARIAN HIT when `fadeShare ≥ 50%` (TS↔Solidity parity) | unit (parity) | Vitest parity test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

From RESEARCH.md "Wave 0 Gaps" — test scaffolds that must exist before/alongside implementation:

- [ ] `packages/contracts/test/SettlementManagerTest.sol` — SETTLE-02, SETTLE-05, SETTLE-08, SETTLE-46 (fee split + pool conservation invariants)
- [ ] `packages/contracts/test/FfmSettlementTest.sol` — `claimPayout`, `applySettlement`, cold-start, CALL-41 empty-pool→treasury
- [ ] `packages/contracts/test/SettlementDisputeTest.sol` — SETTLE-25..36 (bond, window close, max-3 counter-claims, reversal)
- [ ] `apps/relayer/src/workers/__tests__/pyth-adapter.test.ts` — Pyth retry loop (mocked Hermes)
- [ ] `apps/relayer/src/workers/__tests__/cex-binance.test.ts` (+ 7 sibling exchanges) — static HTML fixture tests + Innovation Zone exclusion
- [ ] `apps/relayer/src/workers/__tests__/defillama-adapter.test.ts` — DefiLlama EIP-712 attestation signing
- [ ] Foundry↔Vitest parity harness for shared rep-delta + fee-split + outcome-word math

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Money-path settlement against real USDC | SETTLE-46, CALL-41 | Mandated mainnet USDC `0xaf88…e5831` has no Sepolia code (ADR-0001) | Run money-path tests under `forge test --fork-url <ARB_ONE_RPC>` (mainnet fork) |
| 200px-viewport readability of every receipt variant | UI-52, SHARE-12 | Visual QA gate — requires rendered output inspection | Render `/call/[id]` Settled/Disputed/CallerExited at 200px; confirm outcome word legible (Phase 7 finalizes auto-post gate) |
| OG card cache-bust on state change | SHARE-05, SHARE-08 | CDN cache behavior — observed, not unit-asserted | Trigger settle; confirm `/og/[callId]?v={statusVersion}` returns variant 2/4 with new version |
| Tally / Pyth-auth live availability | SETTLE governance + Pyth paths | External-service provisioning | Confirm Tally API key in GCP Secret Manager; add `PYTH_API_KEY` slot (auth required after 2026-07-31) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (the 7 scaffolds above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] Money-path invariants run under mainnet-fork (ADR-0001)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
