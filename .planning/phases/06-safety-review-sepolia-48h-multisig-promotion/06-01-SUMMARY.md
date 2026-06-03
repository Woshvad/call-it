---
phase: 06-safety-review-sepolia-48h-multisig-promotion
plan: 01
subsystem: contracts
tags: [usdc, resolveUsdc, chainid-gate, adr-0001, ci-guard, security-review, sepolia]
requirements-completed: [SAFETY-02, SAFETY-03, SAFETY-22, SAFETY-29]
key-files:
  created:
    - packages/contracts/test/USDC.t.sol (resolveUsdc branch tests + constructor-revert tests + UsdcRoutingTest)
  modified:
    - packages/contracts/src/constants/USDC.sol (USDC_ARB_SEPOLIA + resolveUsdc())
    - packages/contracts/src/CallRegistry.sol (usdc immutable + transfer routing)
    - packages/contracts/src/FollowFadeMarket.sol (usdc immutable + transfer routing)
    - packages/contracts/src/ChallengeEscrow.sol (resolveUsdc() guard + usdc immutable + routing)
    - packages/contracts/src/SettlementManager.sol (resolveUsdc() guard + usdc immutable + routing)
    - .github/workflows/grep-guards.yml (2-address allowlist step)
    - packages/contracts/test/helpers/FfmTestHelper.sol (vm.chainId(42161) pin)
    - packages/contracts/test/CallRegistry.t.sol (vm.chainId pin)
    - packages/contracts/test/CallRegistryGates.t.sol (vm.chainId pin)
    - packages/contracts/test/CallRegistryParity.t.sol (vm.chainId pin)
    - packages/contracts/test/CallRegistrySafety.t.sol (vm.chainId pin)
task-commits:
  - "Task 1 (resolveUsdc gate + constructor guards + USDC.t.sol): 119c4a6"
  - "Task 2 (CI 2-address allowlist guard): 61a37dd"
  - "Security-review fix (transfer routing through usdc immutable + 421614 regression test): 11d16d2"
completed: 2026-06-03
status: complete
---

# Phase 6 Plan 1: resolveUsdc() chainid gate + CI guard + USDC transfer routing

**Adds the `resolveUsdc()` chainid gate to USDC.sol, wires it into CE+SM constructors, expands the CI grep guard to the 2-address allowlist, and — per the Task 3 security review — routes ALL USDC transfers in CR/FFM/CE/SM through a chainid-resolved `usdc` immutable so the Sepolia money path actually works. Mainnet SAFETY-13 unfakeable-USDC invariant preserved.**

## Accomplishments

- **Task 1 (executor, `119c4a6`):** `USDC.sol` gained `USDC_ARB_SEPOLIA = 0x75faf114…AA4d` + `resolveUsdc()` (chainid 42161 → native FIRST/unconditional, 421614 → Sepolia, revert otherwise). CE + SM constructor guards changed to `require(_usdc == resolveUsdc())`. `USDC.t.sol` covers all three branches + constructor reverts.
- **Task 2 (executor, `61a37dd`):** `grep-guards.yml` `usdc-paste` job gained a "USDC address allowlist" step rejecting any `af88d065`/`75faf114`-prefixed address outside the canonical two; the bridged USDC.e (`0xff970a61`) absolute-forbid step is unchanged.
- **Task 3 — Security review + fix (`11d16d2`):** The review found a **critical, blocking** gap — CR/FFM/CE/SM validated the constructor `_usdc` but every transfer hardcoded `IERC20(USDC_ARB_NATIVE)`, so on Sepolia every money flow would revert (the documented staging blocker, NOT resolved by Task 1 alone). Fixed by adding `address public immutable usdc` (= `resolveUsdc()`) to all four contracts and routing every transfer through it. No constructor ABI change (CR/FFM compute it directly; CE/SM store the validated `_usdc`). New `UsdcRoutingTest` proves per-chain routing, incl. a real `createCall` on 421614 against a mock etched ONLY at the Sepolia address.

## Security review verdict (ADR-0001 checklist)

PASSED after the fix: (1) mainnet path returns native USDC exclusively (SAFETY-13 preserved); (2) `usdc` is immutable with no setter and `resolveUsdc()` has no admin override — not bypassable; (3) transfers route to the chain-resolved token (regression test proves it); (4) decimals parity 6==6 (public Circle fact; on-chain `cast` confirmation deferred to the 06-02 operator pre-broadcast step, which requires `$ARBITRUM_SEPOLIA_RPC_URL`).

## Tests

`forge test` (excluding the env-gated `SettlementManagerForkTest`, which needs `ARB_ONE_RPC_URL`): **194 passed / 0 failed / 2 skipped**. The 2 skips are pre-existing internal `vm.skip` stubs in `FollowFadeMarket.t.sol`. `forge build` exits 0; `ce.usdc()`/`sm.usdc()` getters now exist (required by 06-02's post-deploy assertions).

## Deviations

1. **Expanded scope (user-approved):** Task 3 was a verify-only checkpoint, but the review surfaced a blocking bug requiring a code fix across all 4 money contracts. The operator approved fixing inline. Implemented via a `usdc` immutable to avoid any constructor ABI change (the option's original "add _usdc param to CR/FFM" wording would have broken every deploy script + test that instantiates them).
2. **Test chainid pins:** Because CR/FFM constructors now call `resolveUsdc()` (which reverts on Foundry default chainid 31337), 5 test setUps that deploy CR/FFM were pinned to `vm.chainId(42161)` — behavior-neutral on mainnet (immutable resolves to the same address the code used before).

## Deferred / handoff

- On-chain decimals-parity `cast call 0x75faf114… "decimals()(uint8)"` (== 6) — needs `$ARBITRUM_SEPOLIA_RPC_URL`; runs as part of the 06-02 operator broadcast checklist.
- `SettlementManagerForkTest` requires `ARB_ONE_RPC_URL` to run (skips otherwise); its graceful skip-guard is 06-03 Task 2's scope.

## Self-Check: PASSED

- [x] `resolveUsdc()` present in USDC.sol with mainnet-first branch order
- [x] CR/FFM/CE/SM all expose `usdc()` and route transfers through it (grep `IERC20(USDC_ARB_NATIVE)` in src → 0)
- [x] CI allowlist step present; USDC.e forbid unchanged
- [x] `forge build` exits 0; `forge test` (non-fork) 194 pass / 0 fail
- [x] 421614 routing regression test passes
- [x] Commits 119c4a6, 61a37dd, 11d16d2 in git log
