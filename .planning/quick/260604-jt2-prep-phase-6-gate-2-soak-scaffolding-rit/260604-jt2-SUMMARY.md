---
phase: quick
plan: 260604-jt2
subsystem: relayer-scripts
tags: [pre-deploy, soak, evidence, safety, sepolia]

dependency_graph:
  requires:
    - packages/shared: PYTH_FEED_IDS constants (gate-d feed ID comparison)
    - apps/relayer: NodeNext module resolution pattern (relative .js imports)
  provides:
    - predeploy-ritual-check.ts: 4-gate automated pre-deploy ritual checker
    - gen-soak-wallets.ts: throwaway Sepolia wallet generator (STDOUT only)
    - EVIDENCE-LOG.md: pre-built evidence log template (all 5 sections)
  affects:
    - Phase 06-05: soak evidence log pre-built; Gate 5 ritual automated
    - Phase 06-06: multisig promotion gate now has a structured evidence document

tech_stack:
  added:
    - viem/accounts generatePrivateKey + privateKeyToAccount (wallet generation)
    - node:fs readdirSync/readFileSync/statSync (cross-platform src walk for gate-a)
    - global fetch with AbortController timeout (Hermes API calls for gate-d)
  patterns:
    - "Cross-platform file walk: readdirSync+statSync recursive walk (no grep/shell) — works on Windows"
    - "Gate degradation: SKIPPED (not FAIL) when env absent or network unreachable — CI-safe"
    - "STDOUT-only wallet output: generatePrivateKey + console.log, no writeFileSync anywhere"

key_files:
  created:
    - apps/relayer/src/scripts/predeploy-ritual-check.ts
    - apps/relayer/src/scripts/gen-soak-wallets.ts
    - evidence/phase-6-soak/EVIDENCE-LOG.md
  modified: []

decisions:
  - "Gate-a uses node:fs recursive walk (not grep/shell) for Windows compatibility — same src scan works on all platforms"
  - "Gate-c and gate-d degrade to SKIPPED (not FAIL) when env/network absent — allows CI to run gate-a/b offline"
  - "Gate-d per-symbol SKIPPED on network error (advisory cross-check only — actual on-chain feed IDs set at deploy time)"
  - "EVIDENCE-LOG.md legend uses ❌/✅ in documentation text only; all status cells use ⬜ PENDING"

metrics:
  duration: 15m
  completed: 2026-06-04
  tasks: 2
  files: 3
---

# Quick Task 260604-jt2: Phase 6 Gate-2 Soak Scaffolding Summary

**4-gate pre-deploy ritual checker + throwaway Sepolia wallet generator + pre-built 5-section evidence log template for the Phase 6 >=48h Sepolia soak (SAFETY-21–28, SAFETY-29, SAFETY-42)**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | predeploy-ritual-check.ts + gen-soak-wallets.ts | 99c1a83 | apps/relayer/src/scripts/predeploy-ritual-check.ts, apps/relayer/src/scripts/gen-soak-wallets.ts |
| 2 | EVIDENCE-LOG.md template | ec106ba | evidence/phase-6-soak/EVIDENCE-LOG.md |

## What Was Built

### predeploy-ritual-check.ts

4-gate pre-deploy ritual checker that the operator runs before mainnet promotion:

- **gate-a**: Cross-platform node:fs walk of apps/relayer/src (excluding /test/, /tests/, /__tests__/, .md, .json files). Counts occurrences of the literal string "arbitrum-sepolia". PASS if count == 0.
- **gate-b**: Reads all .ts files in apps/relayer/src. Finds lines containing "42161" that also contain "chainId" or "domain" (case-insensitive). PASS if >=1 such line found. Guards EIP-712 mainnet replay protection.
- **gate-c**: Creates a viem publicClient against Arbitrum Sepolia and calls getBalance() on RELAYER_ADDRESS. PASS if >= 0.5 ETH. **SKIPPED** (not FAIL) if RELAYER_ADDRESS or ARBITRUM_SEPOLIA_RPC_URL is absent.
- **gate-d**: For each of BTC/ETH/SOL/ARB/OP/POL, fetches `https://hermes.pyth.network/v2/price_feeds?query=Crypto.{SYM}/USD` and confirms the returned id matches PYTH_FEED_IDS[SYM] (0x prefix stripped for comparison). Per-symbol SKIPPED on network error. Overall FAIL only on ID mismatch.

Exit code: 0 if all non-skipped gates PASS; 1 if any gate FAILS.

Live smoke test result (no env set):
- gate-a: PASS (0 "arbitrum-sepolia" occurrences in production source)
- gate-b: PASS (34 lines with chainId/domain + 42161)
- gate-c: SKIPPED (RELAYER_ADDRESS not set)
- gate-d: PASS (all 6 Hermes feed IDs confirmed live)
- Exit code: 0

### gen-soak-wallets.ts

Generates 10 throwaway Sepolia test wallets using `generatePrivateKey` + `privateKeyToAccount` from viem/accounts. Prints to STDOUT:
1. Security warning banner
2. Funding checklist (10 addresses for faucet.circle.com + Sepolia ETH)
3. Env block (SOAK_WALLET_0..SOAK_WALLET_9 private key lines)
4. End marker

**No file writes.** No writeFileSync, appendFileSync, or createWriteStream anywhere. No env loader needed.

### evidence/phase-6-soak/EVIDENCE-LOG.md

Pre-built evidence log template with all 5 sections:
- Section 1: SAFETY-21–28 (8 rows, soak minimums)
- Section 2: SAFETY-29–43 (15 rows, safety matrix)
- Section 3: PITFALLS checklist (47 items across 7 subsections: Share Loop, Settlement Path, Safety Caps, Embedded Wallet, Oracle Attestation, Subgraph+Indexing, Mainnet Day)
- Section 4: Phase-4 deferred UAT closure (5 items)
- Section 5: Pre-deploy Ritual Results (4 gate rows)

All status cells use ⬜ PENDING. Legend text contains ❌/✅ for documentation only — no data rows are pre-marked.

## Verification Results

- `npx tsc --noEmit` (from apps/relayer): PASS (0 errors)
- `npx tsx src/scripts/gen-soak-wallets.ts`: 10 SOAK_WALLET_N= lines + 10 address lines; no file created
- `npx tsx src/scripts/predeploy-ritual-check.ts` (no env): gate-a PASS, gate-b PASS, gate-c SKIPPED, gate-d all 6 PASS; exit 0
- `grep -c "SAFETY-21" evidence/phase-6-soak/EVIDENCE-LOG.md`: 2 (appears in Section 1 row + JSDoc header)
- `grep -c "SAFETY-42" evidence/phase-6-soak/EVIDENCE-LOG.md`: 1
- `grep -c "UAT-1" evidence/phase-6-soak/EVIDENCE-LOG.md`: 1
- `grep -c "gate-a" evidence/phase-6-soak/EVIDENCE-LOG.md`: 1
- All 5 sections present with H2 headers
- submodule pointer NOT staged in either commit (verified via `git diff --cached --name-only`)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. Both scripts are read-only operator tools:
- predeploy-ritual-check.ts reads relayer src files + makes read-only network calls (Sepolia RPC balance query + Hermes HTTPS fetch)
- gen-soak-wallets.ts has no network calls and no file writes

T-jt2-01 (private key STDOUT disclosure): mitigated — prominent WARNING banner + STDOUT-only output + no writeFile calls.
T-jt2-02 (Hermes API manipulation): accepted — gate-d is advisory cross-check, not a trust root.
T-jt2-03 (RELAYER_ADDRESS in env): mitigated — public on-chain address; documented in JSDoc as non-sensitive.

## Self-Check

- [x] apps/relayer/src/scripts/predeploy-ritual-check.ts exists
- [x] apps/relayer/src/scripts/gen-soak-wallets.ts exists
- [x] evidence/phase-6-soak/EVIDENCE-LOG.md exists
- [x] Commit 99c1a83 exists in git log (Task 1)
- [x] Commit ec106ba exists in git log (Task 2)
- [x] npx tsc --noEmit exits 0
- [x] gen-soak-wallets.ts produces exactly 10 addresses and 10 SOAK_WALLET_N= lines
- [x] predeploy-ritual-check.ts gate-c emits SKIPPED when RELAYER_ADDRESS absent
- [x] predeploy-ritual-check.ts exits 0 when no FAIL gates
- [x] EVIDENCE-LOG.md has all 5 sections
- [x] No data rows pre-marked ✅ or ❌
- [x] packages/contracts/lib/openzeppelin-contracts NOT staged in either commit

## Self-Check: PASSED
