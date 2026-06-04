---
phase: 06-safety-review-sepolia-48h-multisig-promotion
plan: 02
subsystem: contracts-deploy
tags: [deploy, sepolia, broadcast, resolveUsdc, circle-usdc, cluster-redeploy, addresses, subgraph]
requirements-completed: [SAFETY-02, SAFETY-03]
key-files:
  created:
    - packages/contracts/script/DeployPhase6.s.sol (Task 1)
  modified:
    - packages/shared/src/constants/addresses.ts (4 Phase-6 cluster addresses + USDC_ARB_SEPOLIA)
    - packages/subgraph/subgraph.yaml (4 datasource addresses + startBlocks)
task-commits:
  - "Task 1 (DeployPhase6.s.sol): 85a5cdf"
  - "Task 2 (live Sepolia broadcast + addresses.ts/subgraph wiring): this commit"
completed: 2026-06-04
status: complete
deferred:
  - "Relayer go-live: env retarget + worker restart (Railway/Fly platform access — operator) — ONLY remaining go-live step"
post_broadcast_done:
  - "Subgraph Studio publish: call-it-sepolia v0.6.0 (2026-06-04) — api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.6.0"
---

# Phase 6 Plan 2: DeployPhase6 broadcast — live Sepolia cluster with Circle USDC

**Redeployed the CR+FFM+CE+SM cluster to Arbitrum Sepolia with `resolveUsdc()` baking in Circle's testnet USDC. On-chain verification confirms all four money contracts route to Circle Sepolia USDC — the live proof of the 06-01 security fix. addresses.ts + subgraph.yaml retargeted.**

## Task 1 — DeployPhase6.s.sol (`85a5cdf`)

Cloned `DeployPhase5_1.s.sol` with the minimal Phase-6 diff: `resolveUsdc()` substituted for `USDC_ARB_NATIVE` in the CE + SM constructor args, `ProfileRegistry.setSettlementManager(newSM)` rewire, and post-deploy assertions for `sm.usdc()`/`ce.usdc() == resolveUsdc()` + `PR.settlementManager()`. `forge build` exits 0.

## Task 2 — Live broadcast + wiring (this commit)

**Broadcast** (`forge script DeployPhase6 --broadcast`, Arbitrum Sepolia, user-authorized) — `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`. The 4 KMS attestation-signer addresses required by the script were recovered from the live 05.1 SettlementManager (`0x765f…30fC`, public on-chain values) and re-wired into the new SM by the deploy (same signers per 06-02 step 5b).

New Phase-6 Sepolia cluster (deployer/owner `0xDa8c…A4a5`):

| Contract | Address | Deploy block |
|---|---|---|
| CallRegistry v4 | `0x015758CbBc9A97b98Cf3BBf30381fFAc3F00BB54` | 273674159 |
| FollowFadeMarket v4 | `0x3129a7E3A9D52Fd40E18b8581d1A6D4c22E25cAA` | 273674163 |
| ChallengeEscrow v3 | `0xD2688514f95D94a1f426506C921928D188036487` | 273674167 |
| SettlementManager v5 | `0x998CC092E69f4D2bebb0852eF69CC1F04038c7D4` | 273674171 |
| ProfileRegistry (unchanged) | `0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E` | — |
| USDC (Circle Sepolia) | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | — |

**On-chain verification (all green):**
- `cr.usdc() = ffm.usdc() = ce.usdc() = sm.usdc() = 0x75faf114…AA4d` ✅ — **all four money contracts route to Circle Sepolia USDC** (the 06-01 fix, proven live).
- `usdc.decimals() = 6` ✅ — ADR-0001 decimals-parity check (deferred from the 06-01 review) confirmed on-chain.
- `PR.settlementManager() = cr.settlementManager() = new SM` ✅; `cr.followFadeMarket() = new FFM` ✅.
- `sm.attestationSigner(1) = 0x1333F8…` ✅ — deploy wired all 6 oracle attestation signers + the adapter map.

**Repo wiring:** `addresses.ts` updated (4 cluster constants + new `USDC_ARB_SEPOLIA`); `subgraph.yaml` updated (4 datasource addresses + startBlocks). ProfileRegistry datasource unchanged.

## Deferred to operator (platform access)

The on-chain deploy + repo wiring is done. Two go-live steps remain (need Railway/Fly + Graph Studio creds, not available to the agent):
1. **Relayer:** set `CALL_REGISTRY_ADDRESS`/`FFM_ADDRESS`/`CE_ADDRESS`/`SM_ADDRESS` to the new addresses + `USDC_ADDRESS=0x75faf114…`, restart workers, `curl /health`. (KMS `setAttestationSigner` is already done by the deploy.)
2. **Subgraph:** ✅ DONE 2026-06-04 — published `call-it-sepolia` **v0.6.0** indexing the new cluster; `SUBGRAPH_URL_SEPOLIA` updated. (Operator: update `.env` `NEXT_PUBLIC_SUBGRAPH_URL` to the v0.6.0 endpoint for the frontend.)

Only the relayer retarget remains to fully close Gate-1 go-live and unblock the Gate-2 soak. See OPERATOR-RUNBOOK.md.

## Self-Check: PASSED

- [x] `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`; 4 contracts deployed + verified on Arbiscan Sepolia
- [x] All 4 `usdc()` getters return Circle Sepolia USDC (live proof of 06-01 fix)
- [x] addresses.ts: 4 new cluster constants + USDC_ARB_SEPOLIA; no stale 05.1 cluster constants
- [x] subgraph.yaml: 4 datasources retargeted (address + startBlock)
- [x] Commits 85a5cdf (script) + this (broadcast/wiring)
