---
phase: 4
slug: settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
status: draft
nyquist_compliant: true
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
> Wave-0 dependency = test scaffold created in Plan 04-01 (the TDD RED-gate plan).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | SETTLE-02/03/05/08/43/46 REP-14/22/23 SETTLE-39/40 | T-04-01-01..06 | All Foundry test scaffolds compile to RED gate; SmTestHelper inheritance valid; testDuelInvalidChallengeId asserts revert on wrong challengeId/status | tdd (scaffold) | `forge build --root packages/contracts 2>&1 \| grep -c "SettlementManager"` RED gate expected | ❌ W0 | ⬜ pending |
| 04-01-T2 | 04-01 | 1 | SETTLE-16, SETTLE-23, D-08/SHARE-06 | T-04-01-04..05 | Vitest scaffolds fail with module-not-found; D-08 thresholds codified; viewerIsWinningFader=false test exists | tdd (scaffold) | `pnpm --filter @call-it/relayer test --run 2>&1 \| grep "Cannot find module"` RED gate expected | ❌ W0 | ⬜ pending |
| 04-02-T1 | 04-02 | 1 | SETTLE-01..12, SETTLE-41..51, REP-03..16/22/23/25..27 | T-04-02-01..09 | ISettlementManager + IStylusScoreEngine (Phase-5 lock) + FFM redeploy compile; settle() has 3-param signature; FFM claimPayout CEI | tdd | `forge build --root packages/contracts 2>&1 \| tail -3` exits 0 | ❌ W0 | ⬜ pending |
| 04-02-T2 | 04-02 | 1 | SETTLE-01..51, REP-03..27, SETTLE-39/40, SETTLE-25..38 | T-04-02-01..09 | All Foundry tests GREEN (SettlementManagerTest, FfmSettlementTest, SettlementDisputeTest); no markDisputed call; disputes mapping in SM | tdd | `forge test --root packages/contracts --match-contract SettlementManagerTest -vv 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |
| 04-03-T1 | 04-03 | 2 | SETTLE-01, SETTLE-04, OPS-15, OPS-16 | T-04-03-01..04 | DeployPhase4.s.sol compiles; ABI JSON valid; OPS runbooks exist | unit | `forge build --root packages/contracts 2>&1 \| grep DeployPhase4` exits 0 | ❌ W0 | ⬜ pending |
| 04-03-T2 | 04-03 | 2 | SETTLE-01 (wiring) | T-04-03-05 | addresses.ts placeholder present; subgraph.yaml has all 7 SettlementManager eventHandlers (grep count >= 7) | unit | `grep -c "handleCallSettled\|handleDisputeRaised\|handleDisputeResolved\|handleCallForceSettled\|handleSettlementDelayed\|handleRepCalculated\|handleRepCalculatedFallback" packages/subgraph/subgraph.yaml` >= 7 | ❌ W0 | ⬜ pending |
| 04-04-T1 | 04-04 | 3 | SETTLE-07..12, SETTLE-37/38, OPS-15 | T-04-04-03..06 | pyth-adapter.test.ts GREEN (wide confidence retry, retry exhaustion, success); settlePythCall passes acceptedChallengeIds as third arg | tdd | `pnpm --filter @call-it/relayer test --run --reporter=verbose 2>&1 \| grep -E "pyth-adapter\|PASS\|FAIL" \| head -20` | ❌ W0 | ⬜ pending |
| 04-04-T2 | 04-04 | 3 | SETTLE-18 | T-04-04-01..02 | defillama-adapter.test.ts GREEN (EIP-712 domain name=CallIt-DefiLlama, chainId=42161n); settlement watcher registered in server.ts | tdd | `pnpm --filter @call-it/relayer test --run --reporter=verbose 2>&1 \| grep -E "defillama\|PASS\|FAIL" \| head -20` | ❌ W0 | ⬜ pending |
| 04-05-T1 | 04-05 | 3 | SETTLE-31..33, REP-25..27 | T-04-05-01..04 | subgraph builds (codegen + build); 7 handler exports; handleDisputeRaised is single source of Call.status='Disputed' | unit | `pnpm --filter @call-it/subgraph build 2>&1 \| tail -15` | ❌ W0 | ⬜ pending |
| 04-06-T1 | 04-06 | 4 | SETTLE-13..22 | T-04-06-02..05/07 | relayer build exits 0; nft-twap keyId='nft-twap'; rpc-metrics shares defillama key (documented); AAVE_V3_POOL from @call-it/shared | unit | `pnpm --filter @call-it/relayer build 2>&1 \| tail -5` | ❌ W0 | ⬜ pending |
| 04-06-T2a | 04-06 | 4 | SETTLE-23, SETTLE-06 | T-04-06-01 | cex-binance.test.ts GREEN; first 4 scrapers + cex-adapter compile; ANNOUNCE_URL embedded as constants | tdd | `pnpm --filter @call-it/relayer test --run --reporter=verbose 2>&1 \| grep -E "cex-binance\|PASS\|FAIL" \| head -20` | ❌ W0 | ⬜ pending |
| 04-06-T2b | 04-06 | 4 | SETTLE-23/24, SETTLE-06 | T-04-06-01 | all 8 scrapers exist with testWithFixture; settlement-watcher dispatches all 7 OracleAdapter types | unit | `grep -c "case OracleAdapter\|case.*Adapter" apps/relayer/src/workers/settlement-watcher.ts` >= 7 | ❌ W0 | ⬜ pending |
| 04-07-T1 | 04-07 | 4 | UI-14..23, UI-44/45/52/54 | T-04-07-03..05 | outcome-word.test.ts GREEN; Settled Receipt page builds; viewerIsWinningFader=false when wallet disconnected (D-09) | tdd | `pnpm --filter @call-it/web build 2>&1 \| tail -10` | ❌ W0 | ⬜ pending |
| 04-07-T2 | 04-07 | 4 | SHARE-05/06/08/12 | T-04-07-01..02 | No display:grid in OG routes; buildSettledCard + buildCallerExitedCard exist; duel stubs filled | unit | `grep -n "display.*grid\|gridTemplate" apps/web/app/og/\\[callId\\]/route.ts apps/web/app/og/duel/\\[challengeId\\]/route.ts 2>/dev/null \| wc -l` == 0 | ❌ W0 | ⬜ pending |
| 04-08-T1 | 04-08 | 5 | SETTLE-25..36, SETTLE-52, SHARE-12 | T-04-08-01..05 | DisputeModal + ProvenanceModal compile; settle.ts has oracle.type field; ProvenanceModal branches on oracle.type for path-aware raw data | unit | `pnpm --filter @call-it/web build 2>&1 \| tail -5 && pnpm --filter @call-it/relayer build 2>&1 \| tail -5` | ❌ W0 | ⬜ pending |
| 04-08-T2 | 04-08 | 5 | SETTLE-25..36 | T-04-08-01..05 | /disputes/page.tsx compiles; isOwner check; resolveDispute wired; reversal preview present | unit | `pnpm --filter @call-it/web build 2>&1 \| tail -5` | ❌ W0 | ⬜ pending |
| 04-09-T1 | 04-09 | 6 | SETTLE-23/24, SAFETY-57, OPS-15/16 | T-04-09-01..03 | cex-synthetic-ci.yml has cron + 8 CEX tests; SAFETY-57 doc exists; addresses.ts updated with real deployed addresses | unit | `cat .github/workflows/cex-synthetic-ci.yml \| grep -c "cex-"` >= 8 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

From RESEARCH.md "Wave 0 Gaps" — test scaffolds that must exist before/alongside implementation:

- [ ] `packages/contracts/test/SettlementManagerTest.sol` — SETTLE-02, SETTLE-03, SETTLE-05, SETTLE-08, SETTLE-43, SETTLE-46 (fee split + pool conservation invariants), testCallNotExpired, testDuelInvalidChallengeId
- [ ] `packages/contracts/test/FfmSettlementTest.sol` — `claimPayout`, `applySettlement`, cold-start, CALL-41 empty-pool→treasury
- [ ] `packages/contracts/test/SettlementDisputeTest.sol` — SETTLE-25..36 (bond, window close, max-3 counter-claims, reversal)
- [ ] `apps/relayer/src/workers/__tests__/pyth-adapter.test.ts` — Pyth retry loop (mocked Hermes)
- [ ] `apps/relayer/src/workers/__tests__/cex-binance.test.ts` (+ 7 sibling exchanges) — static HTML fixture tests + Innovation Zone exclusion
- [ ] `apps/relayer/src/workers/__tests__/defillama-adapter.test.ts` — DefiLlama EIP-712 attestation signing
- [ ] Foundry↔Vitest parity harness for shared rep-delta + fee-split + outcome-word math
- [ ] `apps/relayer/src/workers/__tests__/outcome-word.test.ts` — includes testPublicViewer asserting viewerIsWinningFader=false returns caller-centric word

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (the 8 scaffolds above)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [ ] Wave 0 complete (Plan 04-01 must execute first)
- [ ] Money-path invariants run under mainnet-fork (ADR-0001)
- [ ] `nyquist_compliant: true` set in frontmatter (✅ set above — all tasks have automated verify or Wave-0 dependency)

**Approval:** pending (Wave 0 must complete before green)
