---
phase: 06
slug: safety-review-sepolia-48h-multisig-promotion
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-03
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Foundry (forge-std 1.9.5+) for contracts; tsc --noEmit for relayer TypeScript scripts |
| **Config file** | `packages/contracts/foundry.toml` |
| **Quick run command** | `forge test --match-contract "Safety\|TvlAggregation\|SettlementSafetyMatrix\|RevertingStylusEngineDrill" --no-match-contract Fork -C packages/contracts` |
| **Full suite command** | `ARB_ONE_RPC_URL=<url> forge test -C packages/contracts --profile ci` |
| **Estimated runtime** | Quick (unit, no fork): ~30–60 seconds. Full suite with fork: ~3–5 minutes (depends on Alchemy RPC latency). |

---

## Sampling Rate

- **After every task commit:** Run quick run command (unit, no fork)
- **After every plan wave:** Run full suite command (includes fork tests if ARB_ONE_RPC_URL set)
- **Before `/gsd-verify-work`:** Full suite must be green + all evidence log entries present + Sepolia `cast call owner()` == safeAddress on all 6 surfaces
- **Max feedback latency:** 60 seconds (quick), 5 minutes (full with fork)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SAFETY-02, SAFETY-03, SAFETY-22, SAFETY-29 | T-06-01-01, T-06-01-02 | resolveUsdc() returns chain-correct USDC; constructor rejects wrong USDC; chainid 1 reverts | unit (tdd) | `forge test --match-path "test/USDC.t.sol" -vvv -C packages/contracts` | ❌ W0 (USDC.t.sol needs resolveUsdc() tests added) | ⬜ pending |
| 06-01-02 | 01 | 1 | SAFETY-02, SAFETY-03 | T-06-01-03 | 2-address allowlist step present in usdc-paste job; USDC.e still forbidden | unit (CI lint) | `grep -c "USDC address allowlist" .github/workflows/grep-guards.yml` | ✅ grep-guards.yml exists | ⬜ pending |
| 06-01-03 | 01 | 1 | SAFETY-02, SAFETY-03 | T-06-01-01 | ADR-0001 security review checklist passes; no code path lets non-canonical USDC reach mainnet | manual | manual (security-review-passed signal) | — | ⬜ pending |
| 06-02-01 | 02 | 2 | SAFETY-02, SAFETY-03 | T-06-02-01 | DeployPhase6.s.sol compiles; dry-run passes; resolveUsdc() in CE+SM constructors; USDC_ARB_NATIVE removed | unit (compile + dry-run) | `forge build --contracts script/DeployPhase6.s.sol -C packages/contracts && forge script script/DeployPhase6.s.sol --sender 0x1 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL 2>&1 \| tail -10` | ❌ W0 (DeployPhase6.s.sol must be created) | ⬜ pending |
| 06-02-02 | 02 | 2 | SAFETY-02, SAFETY-03 | T-06-02-02, T-06-02-03 | Live cluster deployed with Circle USDC; relayer live; cast call confirms usdc() == Circle Sepolia USDC | manual (human-action) | manual (cluster-live signal) | — | ⬜ pending |
| 06-03-01 | 03 | 3 | SAFETY-29, SAFETY-30, SAFETY-31, SAFETY-32, SAFETY-33, SAFETY-34, SAFETY-35, SAFETY-36, SAFETY-37, SAFETY-38, SAFETY-39, SAFETY-40, SAFETY-41, SAFETY-43 | T-06-03-01, T-06-03-02, T-06-03-03 | All SAFETY-29–41 + SAFETY-43 matrix tests green; TVL CE aggregation confirmed; pause carve-outs, owner guards, reentrancy guard all tested | unit (tdd) | `forge test --match-contract "SettlementSafetyMatrix\|TvlAggregation\|CallRegistrySafety" -vvv -C packages/contracts 2>&1 \| tail -30` | ❌ W0 (SettlementSafetyMatrix.t.sol must be created) | ⬜ pending |
| 06-03-02 | 03 | 3 | SAFETY-29 | T-06-03-04, T-06-03-05 | Full loop fork tests green with deterministic Pyth mock; skip gracefully without ARB_ONE_RPC_URL | fork (tdd) | `ARB_ONE_RPC_URL="" forge test --match-contract SettlementManagerFork -vv -C packages/contracts 2>&1 \| grep -E "PASS\|SKIP\|FAIL" \| tail -10` | ✅ SettlementManagerForkTest.sol exists | ⬜ pending |
| 06-04-01 | 04 | 3 | SAFETY-42, SAFETY-19 | T-06-04-01 | RepCalculatedFallback fires when Stylus proxy points at revert fixture; settlement completes; treasury fee paid; 3-arg upgradeAndCall used | fork (tdd, skip without RPC) | `ARB_ONE_RPC_URL="" forge test --match-contract RevertingStylusEngineDrill -vv -C packages/contracts 2>&1 \| grep -E "PASS\|SKIP\|FAIL"` | ❌ W0 (RevertingStylusEngineDrill.t.sol must be created) | ⬜ pending |
| 06-04-02 | 04 | 3 | SAFETY-21, SAFETY-22, SAFETY-23, SAFETY-24, SAFETY-25, SAFETY-26, SAFETY-27, SAFETY-28 | T-06-04-02, T-06-04-03 | soak-seeder.ts compiles (tsc --noEmit); evidence log scaffold present | integration (tsc) | `cd apps/relayer && npx tsc --noEmit 2>&1 \| grep -E "error TS" \| head -10; echo "exit: $?"` | ❌ W0 (soak-seeder.ts must be created) | ⬜ pending |
| 06-05-01 | 05 | 4 | SAFETY-21, SAFETY-22, SAFETY-23, SAFETY-24, SAFETY-25, SAFETY-26, SAFETY-27, SAFETY-28, SAFETY-42 | T-06-05-01, T-06-05-02, T-06-05-03, T-06-05-04, T-06-05-05 | Soak ≥48h with all minimums met; destruction drill live; PITFALLS 38-item all pass | manual (human-action, ≥48h live Sepolia) | manual (soak-complete signal) | — | ⬜ pending |
| 06-05-02 | 05 | 4 | SAFETY-21 through SAFETY-28, SAFETY-29 through SAFETY-43 | T-06-05-02 | EVIDENCE-LOG.md complete with 0 failures; all sections filled; grep -c "❌" returns 0 | manual (human-verify) | `grep -c "❌" evidence/phase-6-soak/EVIDENCE-LOG.md` (must return 0) | ❌ W0 (evidence/phase-6-soak/ created by Plan 04) | ⬜ pending |
| 06-06-01 | 06 | 5 | SAFETY-02, SAFETY-03, SAFETY-19, SAFETY-20 | T-06-06-01, T-06-06-03, T-06-06-06 | TransferOwnershipToSafe.s.sol compiles; Phase-7 mainnet address warning present; deploy-safe.ts + rehearse-ownership.ts compile (tsc) | unit (compile) | `forge build --contracts script/TransferOwnershipToSafe.s.sol -C packages/contracts 2>&1 \| tail -3` | ❌ W0 (TransferOwnershipToSafe.s.sol must be created) | ⬜ pending |
| 06-06-02 | 06 | 5 | SAFETY-02, SAFETY-03, SAFETY-19, SAFETY-20 | T-06-06-01, T-06-06-02, T-06-06-03, T-06-06-04 | Sepolia Safe owns all 6 surfaces (cast call owner() == SAFE_ARBITRUM_SEPOLIA); Safe-gated pause + proxy upgrade verified; production Arbitrum One Safe live | manual (human-action, live Sepolia) | manual (multisig-promoted signal) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The following test files must exist before sampling works for their respective tasks. They are created during plan execution.

- [ ] `packages/contracts/test/USDC.t.sol` — resolveUsdc() branch tests (chainid 42161, 421614, other → revert). Must be created or extended in Task 06-01-01. File Exists check: `test -f packages/contracts/test/USDC.t.sol`
- [ ] `packages/contracts/script/DeployPhase6.s.sol` — created in Task 06-02-01. File Exists check: `test -f packages/contracts/script/DeployPhase6.s.sol`
- [ ] `packages/contracts/test/SettlementSafetyMatrix.t.sol` — covers SAFETY-34/35/36/37/38/39/40/41. Created in Task 06-03-01. File Exists check: `test -f packages/contracts/test/SettlementSafetyMatrix.t.sol`
- [ ] `packages/contracts/test/RevertingStylusEngineDrill.t.sol` — SAFETY-42 unit drill (skip without RPC). Created in Task 06-04-01. File Exists check: `test -f packages/contracts/test/RevertingStylusEngineDrill.t.sol`
- [ ] `apps/relayer/src/scripts/soak-seeder.ts` — seeding bot. Created in Task 06-04-02. File Exists check: `test -f apps/relayer/src/scripts/soak-seeder.ts`
- [ ] `evidence/phase-6-soak/` — evidence log directory (with .gitkeep + SCHEMA.md). Created in Task 06-04-02. File Exists check: `test -f evidence/phase-6-soak/.gitkeep`
- [ ] `packages/contracts/script/TransferOwnershipToSafe.s.sol` — multisig transfer script. Created in Task 06-06-01. File Exists check: `test -f packages/contracts/script/TransferOwnershipToSafe.s.sol`

---

## Manual-Only Verifications

The following behaviors require human judgment and have no automated proxy.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ADR-0001 security review — no code path lets non-canonical USDC reach mainnet | SAFETY-02, SAFETY-03 | Requires human code review confirming: (1) mainnet chainid 42161 returns only USDC_ARB_NATIVE, (2) decimals parity 6==6, (3) chainid gate not bypassable. Run /gsd-secure-phase + /gsd-code-review. | Run: cast call CE "usdc()(address)" on fork with chainid 1 → expect revert. Verify resolveUsdc() has 42161 as first branch. Type "security-review-passed" when clean. |
| Sepolia cluster broadcast + relayer go-live | SAFETY-02, SAFETY-03 | Requires real private key + funded wallet + active Alchemy RPC for broadcast. cast calls confirm on-chain state. | Follow 06-02 Task 2 how-to-verify steps 1–5. Type "cluster-live" with new addresses. |
| ≥48h Sepolia soak execution | SAFETY-21 | Time-locked — requires 48 continuous hours with live relayer. Cannot be simulated or accelerated. | Start soak-seeder.ts, monitor for 48h, verify all SAFETY-21–28 minimums in evidence JSONL. Type "soak-complete". |
| UAT-1: Live settlement E2E | SAFETY-24 (per D-04) | Requires live browser + real wallet + visual verification of payout received. | Open settled call page in browser → verify payout reflected in wallet. Check Arbiscan for claimPayout tx. Record screenshot. |
| UAT-2: Dispute flow E2E | SAFETY-27 (per D-04) | Requires live browser + owner resolution + visual verification of payout change. | Open disputed call → follow dispute UI → owner resolves → verify payout changed. Record screenshot before/after. |
| UAT-3: Provenance modal D-10 | SAFETY-24 (per D-04) | UI interaction with 4 distinct data fields requires human visual confirmation. No programmatic proxy for "oracle URL + tx + raw data + EIP-712 sig all present and correct". | Click Provenance on a settled Pyth call. Verify all 4 fields visible and correct. Record screenshot. |
| UAT-4: OG 200px readability | SAFETY-29 (per D-04, SHARE-12/UI-18) | Requires human visual judgment of text legibility at 200px viewport. | Resize browser to 200px width → open /og/[callId] → verify outcome words are readable. Record screenshot. |
| UAT-5: Live OG render for settled/exited | SAFETY-29 (per D-04) | Requires live render + HTTP header inspection. Automated curl -I can check headers but human verifies card layout. | curl -I /og/[callId] for settled call → X-Variant: settled present. Screenshot shows settled card layout. |
| Stylus destruction drill on live Sepolia (mid-soak) | SAFETY-42 | Requires live deployer private key + ProxyAdmin.owner() verification + Arbiscan event log confirmation + Telegram alert check. | Follow 06-05 Task 1 Step 2 — use 3-arg upgradeAndCall(address,address,bytes) 0x. Record tx hashes. Confirm RepCalculatedFallback in Arbiscan. Check Telegram. Restore real engine. |
| PITFALLS 38-item checklist | SAFETY-29 | Checklist requires human judgment on 38 distinct "Looks Done But Isn't" items spanning operational, security, and functional domains. | Read .planning/research/PITFALLS.md. For each item: gather tx hash / test name / screenshot evidence. Mark ✅/❌. 0 failures required for Phase 7. |
| Safe Sepolia rehearsal — transferOwnership + acceptOwnership | SAFETY-19, SAFETY-20 | Requires real private keys (deployer + 2 Safe signers). Cast calls verify on-chain ownership state. | Follow 06-06 Task 2 Steps 1–5. cast call owner() == SAFE_ARBITRUM_SEPOLIA on all 6 surfaces. Type "multisig-promoted". |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or justified manual-only entry
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Tasks 01-01, 01-02, 02-01 are all automated; checkpoints are manually-gated by design)
- [ ] Wave 0 covers all MISSING references (7 files listed above must be created during execution)
- [x] No watch-mode flags
- [x] Feedback latency: 30–60 seconds (quick), 3–5 minutes (full with fork)
- [x] `nyquist_compliant: true` — every task maps to an automated command or a justified manual-only entry with explicit rationale

**Approval:** pending (set to approved after first passing execution wave)
