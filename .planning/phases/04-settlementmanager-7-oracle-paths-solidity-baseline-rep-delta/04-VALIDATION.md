---
phase: 4
slug: settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-02
auditor: gsd-nyquist-auditor
suite_results:
  contracts: "173 passed / 0 failed / 2 skipped (non-fork); fork suite env-blocked (ARB_ONE_RPC_URL, ADR-0001)"
  relayer: "132 passed / 0 failed / 1 skipped (kms-roundtrip env-gated)"
  web: "40 passed / 0 failed"
  subgraph: "build OK (codegen + 5 datasource wasm + manifest)"
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
| 04-01-T1 | 04-01 | 1 | SETTLE-02/03/05/08/43/46/47 REP-14/22/23 SETTLE-39/40 | T-04-01-01..06 | All Foundry test scaffolds compile to RED gate; SmTestHelper inheritance valid; testDuelInvalidChallengeId asserts revert on wrong challengeId/status; testDuplicateHashClearedOnSettle asserts activeDuplicateHashes(dupHash)==0 after settle() and createCall with same params succeeds (SETTLE-47) | tdd (scaffold) | `forge build --root packages/contracts 2>&1 \| grep -c "SettlementManager"` RED gate expected | ✅ | ✅ green |
| 04-01-T2 | 04-01 | 1 | SETTLE-16, SETTLE-23, D-08/SHARE-06 | T-04-01-04..05 | Vitest scaffolds fail with module-not-found; D-08 thresholds codified; viewerIsWinningFader=false test exists | tdd (scaffold) | `pnpm --filter @call-it/relayer test --run 2>&1 \| grep "Cannot find module"` RED gate expected | ✅ | ✅ green |
| 04-02-T1 | 04-02 | 1 | SETTLE-01..12, SETTLE-41..51, REP-03..16/22/23/25..27 | T-04-02-01..09 | ISettlementManager + IStylusScoreEngine (Phase-5 lock) + FFM redeploy compile; settle() has 3-param signature; FFM claimPayout CEI | tdd | `forge build --root packages/contracts 2>&1 \| tail -3` exits 0 | ✅ | ✅ green |
| 04-02-T2 | 04-02 | 1 | SETTLE-01..51/SETTLE-47, REP-03..27, SETTLE-39/40, SETTLE-25..38 | T-04-02-01..09 | All Foundry tests GREEN (SettlementManagerTest, FfmSettlementTest, SettlementDisputeTest); no markDisputed call; disputes mapping in SM; step 12 try/catch-guarded; clearDuplicateHash seam in CallRegistry.sol source | tdd | `forge test --root packages/contracts --match-contract SettlementManagerTest -vv 2>&1 \| tail -20` | ✅ | ✅ green |
| 04-03-T1 | 04-03 | 2 | SETTLE-01, SETTLE-04, OPS-15, OPS-16 | T-04-03-01..04 | DeployPhase4.s.sol compiles; ABI JSON valid; OPS runbooks exist | unit | `forge build --root packages/contracts 2>&1 \| grep DeployPhase4` exits 0 | ✅ | ✅ green |
| 04-03-T2 | 04-03 | 2 | SETTLE-01 (wiring) | T-04-03-05 | addresses.ts placeholder present; subgraph.yaml has all 7 SettlementManager eventHandlers (grep count >= 7) | unit | `grep -c "handleCallSettled\|handleDisputeRaised\|handleDisputeResolved\|handleCallForceSettled\|handleSettlementDelayed\|handleRepCalculated\|handleRepCalculatedFallback" packages/subgraph/subgraph.yaml` >= 7 | ✅ | ✅ green |
| 04-04-T1 | 04-04 | 3 | SETTLE-07..12, SETTLE-37/38, OPS-15 | T-04-04-03..06 | pyth-adapter.test.ts GREEN (wide confidence retry, retry exhaustion, success); settlePythCall passes acceptedChallengeIds as third arg | tdd | `pnpm --filter @call-it/relayer test --run --reporter=verbose 2>&1 \| grep -E "pyth-adapter\|PASS\|FAIL" \| head -20` | ✅ | ✅ green |
| 04-04-T2 | 04-04 | 3 | SETTLE-18 | T-04-04-01..02 | defillama-adapter.test.ts GREEN (EIP-712 domain name=CallIt-DefiLlama, chainId=42161n); settlement watcher registered in server.ts | tdd | `pnpm --filter @call-it/relayer test --run --reporter=verbose 2>&1 \| grep -E "defillama\|PASS\|FAIL" \| head -20` | ✅ | ✅ green |
| 04-05-T1 | 04-05 | 3 | SETTLE-31..33, REP-25..27 | T-04-05-01..04 | subgraph builds (codegen + build); 7 handler exports; handleDisputeRaised is single source of Call.status='Disputed' | unit | `pnpm --filter @call-it/subgraph build 2>&1 \| tail -15` | ✅ | ✅ green |
| 04-06-T1 | 04-06 | 4 | SETTLE-13..22 | T-04-06-02..05/07 | relayer build exits 0; nft-twap keyId='nft-twap'; rpc-metrics shares defillama key (documented); AAVE_V3_POOL from @call-it/shared | unit | `pnpm --filter @call-it/relayer build 2>&1 \| tail -5` | ✅ | ✅ green |
| 04-06-T2a | 04-06 | 4 | SETTLE-23, SETTLE-06 | T-04-06-01 | cex-binance.test.ts GREEN; first 4 scrapers + cex-adapter compile; ANNOUNCE_URL embedded as constants | tdd | `pnpm --filter @call-it/relayer test --run --reporter=verbose 2>&1 \| grep -E "cex-binance\|PASS\|FAIL" \| head -20` | ✅ | ✅ green |
| 04-06-T2b | 04-06 | 4 | SETTLE-23/24, SETTLE-06 | T-04-06-01 | all 8 scrapers exist with testWithFixture; settlement-watcher dispatches all 7 OracleAdapter types | unit | `grep -c "case OracleAdapter\|case.*Adapter" apps/relayer/src/workers/settlement-watcher.ts` >= 7 | ✅ | ✅ green |
| 04-07-T1 | 04-07 | 4 | UI-14..23, UI-44/45/52/54 | T-04-07-03..05 | outcome-word.test.ts GREEN; Settled Receipt page builds; viewerIsWinningFader=false when wallet disconnected (D-09) | tdd | `pnpm --filter @call-it/web build 2>&1 \| tail -10` | ✅ | ✅ green |
| 04-07-T2 | 04-07 | 4 | SHARE-05/06/08/12 | T-04-07-01..02 | No display:grid in OG routes; buildSettledCard + buildCallerExitedCard exist; duel stubs filled | unit | `grep -n "display.*grid\|gridTemplate" apps/web/app/og/\\[callId\\]/route.ts apps/web/app/og/duel/\\[challengeId\\]/route.ts 2>/dev/null \| wc -l` == 0 | ✅ | ✅ green¹ |
| 04-08-T1 | 04-08 | 5 | SETTLE-25..36, SETTLE-52, SHARE-12 | T-04-08-01..05 | DisputeModal + ProvenanceModal compile; settle.ts has oracle.type field; ProvenanceModal branches on oracle.type for path-aware raw data | unit | `pnpm --filter @call-it/web build 2>&1 \| tail -5 && pnpm --filter @call-it/relayer build 2>&1 \| tail -5` | ✅ | ✅ green |
| 04-08-T2 | 04-08 | 5 | SETTLE-25..36 | T-04-08-01..05 | /disputes/page.tsx compiles; isOwner check; resolveDispute wired; reversal preview present | unit | `pnpm --filter @call-it/web build 2>&1 \| tail -5` | ✅ | ✅ green |
| 04-09-T1 | 04-09 | 6 | SETTLE-23/24, SAFETY-57, OPS-15/16 | T-04-09-01..03 | cex-synthetic-ci.yml has cron + 8 CEX tests; SAFETY-57 doc exists; addresses.ts updated with real deployed addresses | unit | `cat .github/workflows/cex-synthetic-ci.yml \| grep -c "cex-"` >= 8 | ✅ | ✅ green |
| 04-10-T1 | 04-10 | A/B | SETTLE-06, SETTLE-09, SAFETY-57, T-04-04-01 | T-04-04-01 | EIP-712 relayer-attestation rail: SettlementAttestationTest.sol GREEN (happy path CallerWon/CallerLost, wrong-signer reject, wrong-domain replay reject, cross-type reject, Pending reject, callId-mismatch reject, Pyth-type gate, owner guard, AttestationSignerSet event, **testUnattestedNonPythDefers** regression guard = defer-not-mis-settle); oracle-attestation.test.ts GREEN (unified byte-format: domain CallIt-Oracle/1/block.chainid, 5-field typehash, int256 round-trip, viem↔contract ECDSA recover, no hardcoded 42161) | tdd | `forge test --match-contract SettlementAttestationTest -vv` + `pnpm --filter @call-it/relayer test --run` (oracle-attestation.test.ts) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

¹ **04-07-T2 grep-command caveat:** the literal command `grep "display.*grid\|gridTemplate" … | wc -l == 0` returns **non-zero** because both OG `route.ts` files contain **comment guard lines** that literally spell "Satori does NOT support display:grid" / "no display:grid" (the negative-assertion documentation). A precise check for actual style declarations — `grep "display:\s*['\"]grid['\"]\|gridTemplateColumns\|gridTemplateRows"` — returns the same comment-only matches and **zero real `display:'grid'` style props**. Every JSX layout uses `display:'flex'`. The secure behavior the row gates (no CSS-grid layout in Satori OG cards) is fully satisfied; row is GREEN on the requirement. Recommend tightening the command to exclude comments if exact `wc -l == 0` semantics are desired.

---

## Audit Trail (Post-Execution Status Flip)

> Authored by gsd-nyquist-auditor on 2026-06-02. The Per-Task Map above was authored at
> PLAN time (every row `⬜ pending` / `❌ W0`). This audit ran each mapped command against
> the executed codebase (all 9 plans + Wave A/B gap-closure 04-10) and flipped every row to
> its real post-execution status. **No implementation files were modified. No new test files
> were created — the Wave A/B attestation suites already cover the previously-uncovered rail.**

### Suites executed (real run output, 2026-06-02)

| Suite | Command | Result |
|-------|---------|--------|
| Contracts (Foundry) | `forge test --no-match-contract ForkTest` | **173 passed / 0 failed / 2 skipped** (17 suites). Key Phase-4 rows: SettlementManagerTest 13/13, FfmSettlementTest 4/4, SettlementDisputeTest 5/5, **SettlementAttestationTest 12/12** (Wave A). The 2 skips are intentional `vm.skip(true)` stubs in the Phase-2 `FollowFadeMarket.t.sol` (`testCallNotLive`, `test_callerExited_noSettlementRepDelta`) — out of Phase-4 scope, not gaps. |
| Contracts fork suite | `forge test --match-contract ForkTest` | **ENV-BLOCKED** — `SettlementManagerForkTest.setUp()` aborts on `vm.envString("ARB_ONE_RPC_URL")` (not provisioned in sandbox). Classified manual-only per ADR-0001 (mainnet-fork money-path). NOT a coverage gap, NOT red. |
| Relayer (Vitest) | `pnpm --filter @call-it/relayer test --run` | **132 passed / 0 failed / 1 skipped** (26 files passed, 1 skipped). Key Phase-4 files: pyth-adapter 3/3, defillama-adapter 3/3, cex-binance 3/3, **oracle-attestation 12/12** (Wave B). The 1 skipped file is `test/kms-roundtrip.test.ts` (env-gated live-GCP-KMS test) — not a Phase-4 mapped row. (`health.test.ts` prints mocked-Redis `ENOTFOUND replace_me.upstash.io` stderr but still passes 2/2.) |
| Web (Vitest) | `pnpm --filter @call-it/web test --run` | **40 passed / 0 failed** (4 files: challenge-gates 12, outcome-word 9, og-unit 13, privy-provider-order 6). A benign Vite source-map ENOENT warning for `lib/outcome-word.js.map` does not affect results. |
| Subgraph | `pnpm --filter @call-it/subgraph build` | **Build OK** (exit 0) — codegen + 5 datasource WASM (incl. SettlementManager) + manifest written to `build/`. |

### Structural map-command spot-checks (verified, not assumed)

- subgraph.yaml 7-handler grep → **7** (≥7 ✓, row 04-03-T2)
- settlement-watcher `case OracleAdapter.X` → **7 distinct** branches: Pyth, NftTwap, DefiLlama, RpcMetrics, Snapshot, Tally, CexScraper (≥7 ✓, row 04-06-T2b)
- OG routes real `display:'grid'` style props → **0** (✓, row 04-07-T2 — see caveat ¹)
- `cex-synthetic-ci.yml` `cex-` count → **10** (≥8 ✓, row 04-09-T1)
- `DeployPhase4.s.sol`, `subgraph/abis/SettlementManager.json`, `addresses.ts:SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA` → all present (rows 04-03-T1/T2)

### Wave A/B attestation rail — coverage fold-in

The gap-closure (plan 04-10) added the on-chain EIP-712 relayer-attestation rail + the security
bug-fix (unattested non-Pyth calls now **defer as Pending** instead of mis-settling as CallerLost).
This is covered by:
- `packages/contracts/test/SettlementAttestationTest.sol` — **12 tests** (happy-path won/lost, wrong-signer, wrong-domain replay, cross-type, Pending-outcome, callId-mismatch, Pyth-type gate, owner guard, invalid-type, event-emission, and `testUnattestedNonPythDefers` = the regression guard for the security blocker)
- `apps/relayer/src/workers/__tests__/oracle-attestation.test.ts` — **12 tests** pinning the unified byte-format (domain `CallIt-Oracle`/`1`/`block.chainid`, 5-field typehash, int256 two's-complement round-trip, viem↔contract ECDSA-recover parity, and the "never hardcoded 42161" guard)

Both suites are GREEN. These fold into coverage for **SETTLE-06 / SETTLE-09 / SAFETY-57 / T-04-04-01** (new row 04-10-T1).

> **Scope note — legacy per-adapter EIP-712 domain:** `defillama-adapter.test.ts` still asserts the
> legacy `name='CallIt-DefiLlama'`, `chainId=42161n` domain. Per audit scope, this is **COVERED-for-now**:
> it correctly tests the *present* legacy per-adapter signer code. Rewiring the 6 non-Pyth adapters onto
> the unified `oracle-attestation.ts` rail (the functional end-to-end criteria-retrieval path) is an
> intentionally-deferred, separate work item and is explicitly **out of scope** for this audit — not a gap.

---

## Wave 0 Requirements

From RESEARCH.md "Wave 0 Gaps" — test scaffolds that must exist before/alongside implementation.
**All scaffolds now exist and pass (verified 2026-06-02). Wave 0 complete.**

- [x] `packages/contracts/test/SettlementManagerTest.sol` — SETTLE-02, SETTLE-03, SETTLE-05, SETTLE-08, SETTLE-43, SETTLE-46 (fee split + pool conservation invariants), SETTLE-47 (testDuplicateHashClearedOnSettle), testCallNotExpired, testDuelInvalidChallengeId — **13/13 PASS**
- [x] `packages/contracts/test/FfmSettlementTest.sol` — `claimPayout`, `applySettlement`, cold-start, CALL-41 empty-pool→treasury — **4/4 PASS**
- [x] `packages/contracts/test/SettlementDisputeTest.sol` — SETTLE-25..36 (bond, window close, max-3 counter-claims, reversal) — **5/5 PASS**
- [x] `apps/relayer/src/workers/__tests__/pyth-adapter.test.ts` — Pyth retry loop (mocked Hermes) — **3/3 PASS**
- [x] `apps/relayer/src/workers/__tests__/cex-binance.test.ts` (+ 7 sibling exchanges in `cex-synthetic-ci.yml` matrix) — static HTML fixture tests + Innovation Zone exclusion — **3/3 PASS** (8-exchange matrix wired in CI)
- [x] `apps/relayer/src/workers/__tests__/defillama-adapter.test.ts` — DefiLlama EIP-712 attestation signing — **3/3 PASS**
- [x] Foundry↔Vitest parity harness for shared rep-delta + fee-split + outcome-word math — present (`CallRegistryParity.t.sol` 29/29, `ChallengeEscrowParity.t.sol` 8/8 on the Solidity side; `outcome-word.test.ts` parity on both web + relayer)
- [x] `apps/web/tests/outcome-word.test.ts` — D-09 public-viewer path (viewerIsWinningFader=false returns caller-centric word) — **9/9 PASS** (web). *(Note: the canonical outcome-word parity test lives at `apps/web/tests/outcome-word.test.ts`, not under relayer `__tests__/` — the source-of-truth getOutcomeWord is a web lib.)*

### Wave A/B (gap-closure 04-10) — added after original Wave 0

- [x] `packages/contracts/test/SettlementAttestationTest.sol` — EIP-712 attestation rail (SETTLE-06, SETTLE-09, SAFETY-57, T-04-04-01); 12 spoof/replay/cross-type/defer tests incl. `testUnattestedNonPythDefers` regression guard — **12/12 PASS**
- [x] `apps/relayer/src/workers/__tests__/oracle-attestation.test.ts` — unified attestation byte-format pin (domain/typehash/encode-decode/recover) — **12/12 PASS**

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Money-path settlement against real USDC (`SettlementManagerForkTest`) | SETTLE-46, CALL-41 | Mandated mainnet USDC `0xaf88…e5831` has no Sepolia code (ADR-0001). **Confirmed env-blocked 2026-06-02:** `setUp()` aborts on `vm.envString("ARB_ONE_RPC_URL")` — RPC not provisioned in sandbox. Test file compiles; this is an ENV limitation, **not a coverage gap or red status.** | Run money-path tests under `forge test --fork-url <ARB_ONE_RPC>` (mainnet fork) once an Arbitrum One RPC URL is available |
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
- [x] Wave 0 complete (Plan 04-01 executed; all 8 scaffolds GREEN — verified 2026-06-02)
- [~] Money-path invariants run under mainnet-fork (ADR-0001) — **env-blocked** (`ARB_ONE_RPC_URL` not provisioned in sandbox); classified manual-only, not a gap. Non-fork money-path invariants (`invariantFeeSplit`, `invariantPoolConservation`, `testEmptyPoolToTreasury`, `testClaimPayoutProRata`) PASS under mock USDC.
- [x] `nyquist_compliant: true` set in frontmatter — all tasks have a GREEN automated verify

**Approval:** ✅ **GREEN** — Wave 0 complete, all 18 mapped rows GREEN, Wave A/B attestation rail covered (24 added tests). Audit by gsd-nyquist-auditor 2026-06-02. Suite totals: contracts 173✓/2-skip (+fork env-blocked), relayer 132✓/1-skip, web 40✓, subgraph build OK. Remaining manual-only items (mainnet-fork money path, 200px visual QA, OG CDN cache-bust, live Tally/Pyth-auth) are external/env-gated, not coverage gaps.
