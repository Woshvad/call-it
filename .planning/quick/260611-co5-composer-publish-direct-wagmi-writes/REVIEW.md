---
phase: quick-260611-co5
reviewed: 2026-06-11T10:30:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - apps/web/app/new/components/PublishConfirmModal.tsx
  - apps/web/app/new/hooks/usePublishCall.ts
  - apps/web/app/new/lib/call-created-log.ts
  - apps/web/lib/abis/erc20.ts
  - apps/web/lib/abis/index.ts
  - apps/web/tests/call-created-log.test.ts
  - apps/web/tests/new-call-publish.spec.ts
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
fixes_applied: 2026-06-11
fix_scope: CR-01, WR-01, WR-02, WR-03
---

# Quick 260611-co5: Code Review Report — composer publish via direct wagmi writes

**Reviewed:** 2026-06-11
**Depth:** standard (money-submission path)
**Files Reviewed:** 7 (commit adc1e19)
**Status:** issues_found

## Summary

The direct-EOA rewrite is structurally sound. Verified clean against the seven review axes:

1. **TX-ARG ORDER/TYPES — PASS.** The 12 `createCall` args (usePublishCall.ts:214-227) match `ICallRegistry.sol:165-178` and the web ABI stub (CallRegistry.ts:98-117) in order and type: uint8 maps as numbers, uint256/uint64/uint96 as bigints (`CreateCallInput` declares `targetValue`/`expiry`/`stake`/`parentCallId` as bigint), `effectiveConviction = preflight.suggestedConviction` (line 150) is genuinely used at arg 9, `built.assetAUint`/`built.assetBUint` preserve the bf2 dup-hash invariant, `parentCallId ?? 0n` correct. **BUT see CR-01 — the eventSubtype VALUE map is drifted vs the deployed 05.1 enum.**
2. **CRITERIA HASH — PASS.** Hook (`input.criteriaText ? keccak256(toBytes(...)) : bytes32(0)`, lines 205-207) is semantically identical to the relayer (calls-preflight.ts:241-243, `criteriaText && length > 0`): empty string is falsy in both → zero-hash. Same input string both sides → same hash.
3. **APPROVE FLOW — PASS.** Amount is exactly `input.stake + CREATION_FEE` (line 182), matching the contract's single pull `stake + CREATION_FEE` (CallRegistry.sol:253,290). No infinite approve. Approve receipt status checked (line 197). Post-approve allowance race (external spend) falls through to `createCall` which reverts `InsufficientUsdcAllowance` → decoded errorName surfaces. Acceptable.
4. **REVERTED RECEIPTS — PASS.** Both `waitForTransactionReceipt` results are checked (`status !== 'success'` throws, lines 197-199 and 236-238) BEFORE log parsing — a reverted createCall can never reach `extractCallIdFromLogs`, so no bogus `/call/0` redirect.
5. **LOG PARSE — PASS.** Case-insensitive address filter, per-log try/catch around real `decodeEventLog`, `eventName === 'CallCreated'` gate, null on no match, profile-page fallback on null. The 6 unit tests use real viem encoders against the real ABI (incl. mixed-case address, foreign-contract CallCreated, garbage topics, mixed-array scan) — honest, no mocks.
6. **USER-REJECTION DETECTION — PASS.** `isUserRejection` walks the viem `BaseError` chain for `UserRejectedRequestError`; viem maps EIP-1193 code 4001 from both the Privy embedded provider and injected wallets into that class, so the walk covers both shapes.
7. **D-15 SPEC ASSERTIONS — PASS.** The rewritten D-28 test anchors on `'await postPreflight'` < `'await writeContract'` call sites (the deviation note is right — bare identifiers would key on import order); the first awaited write is the approve, so the pinned invariant is "preflight before ANY money write" — strictly stronger than before. The direct-EOA test pins gas guard + allowance + approve + extractCallIdFromLogs + absence of sendUserOperation. Nothing was gutted.

The one Critical finding is an enum-value drift in the createCall args that this commit activates; the warnings are error-honesty and modal-dismissal gaps on the in-flight money flow.

## Critical Issues

### CR-01: `eventSubtype` arg encodes the WRONG on-chain enum value for `protocolMilestone` (and makes Tally governance inexpressible) — drift vs the deployed 05.1 enum split

**File:** `apps/web/app/new/hooks/usePublishCall.ts:216` (arg site) / root cause `packages/shared/src/types/call.ts:70-79` vs `packages/contracts/src/interfaces/ICallRegistry.sol:24-35`
**Issue:** The hook passes `EVENT_SUBTYPE_TO_UINT[input.eventSubtype ?? 'none']`. The shared map still encodes the PRE-05.1 enum (`governance: 6, protocolMilestone: 7`), but the deployed Sepolia CallRegistry (Phase 05.1 cluster — Option A enum split) has `Governance_Snapshot=6, Governance_Tally=7, ProtocolMilestone=8`. A user publishing a **Protocol Milestone** call (offered in EventFields.tsx) submits subtype `7` = **Governance_Tally** on-chain: the call is permanently recorded with the wrong subtype and SettlementManager's adapterMap will route settlement to the Tally oracle adapter against an assetA that is not a Tally proposal — staked USDC ends up in a call that cannot settle correctly (dispute/forceSettle path). `'governance'` likewise maps only to `6` (Snapshot), so Tally-based governance calls cannot be expressed at all. Note the contract itself also drifted internally: `_criteriaRequired` still gates `st >= 4 && st <= 7` (CallRegistry.sol:509-518), excluding the real `ProtocolMilestone(8)` — confirming the renumber was never propagated. The dup-hash stays consistent (both relayer and contract derive from the same submitted uint), which is exactly why nothing catches this before funds move.

This drift is **pre-existing in packages/shared** (outside the 7 commit files), but until this commit the composer's publish ALWAYS threw at the AA stub — adc1e19 is the change that puts these args on-chain for the first time, so it ships the defect.
**Fix:**
```ts
// packages/shared/src/types/call.ts — align with ICallRegistry.sol post-05.1:
export const EVENT_SUBTYPE_TO_UINT = {
  none: 0, tvlMilestone: 1, volumeFees: 2, onchainMetric: 3,
  cexListing: 4, tokenLaunch: 5,
  governanceSnapshot: 6, governanceTally: 7,   // split 'governance'
  protocolMilestone: 8,
} as const;
```
…plus the matching `EVENT_SUBTYPES` tuple / `UINT_TO_EVENT_SUBTYPE` / criteria-set / relayer parity updates, and fix `_criteriaRequired`'s `<= 7` range (or ship a parity test that asserts the TS map against the deployed enum). Minimum stopgap if the full split is out of scope: block `protocolMilestone` (and `governance` if Tally-bound) in the composer until the map is corrected — do NOT let the composer write subtype 7 for protocolMilestone.

## Warnings

### WR-01: Dust wallets bypass the gas guard and then get viem's raw multi-line error instead of the faucet message

**File:** `apps/web/app/new/hooks/usePublishCall.ts:60,160,295`
**Issue:** `GAS_FLOOR_WEI = 10_000_000_000_000n` (0.00001 ETH) is deliberately below one tx's cost, and this flow now needs **two** txs (approve + createCall, roughly 4-10x the floor). A wallet holding e.g. 0.00002 ETH passes the guard, then `writeContract` throws a viem `TransactionExecutionError` (insufficient funds): `isUserRejection` is false, `extractRevertErrorName` is null, so line 295 toasts `err.message` — for viem `BaseError`s that is the full multi-paragraph message (request args, docs URL, viem version) crammed into a 5s toast. This is precisely the "opaque gas-estimation error" the guard's own comment says it exists to prevent. Same raw-message problem applies to any other mid-flow viem failure (RPC down, nonce issues).
**Fix:** In the catch, walk for `InsufficientFundsError` and reuse the exact faucet message; for the generic fallback prefer the one-line `shortMessage`:
```ts
import { BaseError, InsufficientFundsError } from 'viem';
// in catch:
if (err instanceof BaseError && err.walk((e) => e instanceof InsufficientFundsError)) {
  message = faucetMessage; // hoist the const out of the gas-guard block
} else if (...) { ... } else {
  message = err instanceof BaseError ? err.shortMessage
    : err instanceof Error ? err.message : 'Failed to publish call';
}
```

### WR-02: `!address` early-return is a silent dead-end — no toast, modal just closes

**File:** `apps/web/app/new/hooks/usePublishCall.ts:119-122`
**Issue:** The wallet-not-connected branch sets `step: 'error'` / `error: 'Wallet not connected'` but never calls `showToast`. The caller (`page.tsx:182-185 onConfirmPublish`) awaits `publish()` then unconditionally `setIsModalOpen(false)` — the user clicks "Confirm publish", the modal closes, and nothing visible happens (no inline error consumer reads `state.error` on /new). This branch is pre-existing, but this change's stated must-have truth is "never a silent stall", and every other terminal error path in the rewritten flow toasts.
**Fix:**
```ts
if (!address) {
  const msg = 'Wallet not connected — sign in again, then retry.';
  showToast({ status: 'error', message: msg, duration: 5000 });
  setState((s) => ({ ...s, error: msg, step: 'error', isPublishing: false }));
  return { status: 'error' };
}
```

### WR-03: Backdrop click dismisses the modal during in-flight approve/sign/wait while the Cancel button is deliberately disabled

**File:** `apps/web/app/new/components/PublishConfirmModal.tsx:56` (vs the guarded button at :232,246)
**Issue:** The backdrop `<div onClick={onCancel}>` is always live; the footer (with the `disabled={isPublishing}` Cancel) is hidden entirely during `isSigning`. So mid-money-flow — including the new 'approving' phase and the unbounded `waitForTransactionReceipt` waits — one stray click closes the progress UI while two real transactions are still in flight. The hook keeps running (toast/redirect still fire), but the user is left staring at the bare form with the submit button disabled and no indication anything is happening; if they hard-refresh, an in-flight approve/createCall lands with no feedback at all. Pre-existing markup, but this commit doubles the in-flight exposure window (two wallet prompts + two receipt waits).
**Fix:** Guard the backdrop the same way the buttons are guarded:
```tsx
<div style={{ position: 'absolute', inset: 0 }} onClick={isPublishing ? undefined : onCancel} />
```

## Info

### IN-01: Catch wipes `txHash` even when the failure is a mined-but-reverted transaction

**File:** `apps/web/app/new/hooks/usePublishCall.ts:298-303`
**Issue:** When `createCall` mines but reverts, `txHash` was set at step 'waiting' (line 231) and the receipt check throws — the catch then sets `txHash: null`, discarding the only link to the reverted tx on Arbiscan ("Transaction reverted on-chain" with no evidence trail).
**Fix:** Preserve it: `setState((s) => ({ ...s, isPublishing: false, step: 'error', error: message }))`.

### IN-02: `extractRevertErrorName` and `isUserRejection` ship without unit tests

**File:** `apps/web/tests/call-created-log.test.ts`
**Issue:** The 6 tests cover only `extractCallIdFromLogs`; the two error helpers (the entire error-honesty surface) have zero coverage. Viem's error classes are easy to construct in node-env vitest (`new ContractFunctionRevertedError(...)` wrapped in a `BaseError` cause chain).
**Fix:** Add cases: nested `ContractFunctionRevertedError` with `errorName`, non-BaseError input → null/false, `UserRejectedRequestError` deep in the cause chain → true.

### IN-03: `router.push(... as any)` with eslint-disable on both redirect paths

**File:** `apps/web/app/new/hooks/usePublishCall.ts:253-259`
**Issue:** Typed-routes escape hatch ×2. Works (bigint interpolates as decimal), but if the codebase has a typed-route helper or the route literal can be satisfied, drop the `any`.
**Fix:** `router.push(`/call/${callId.toString()}` as Route)` or centralize a `callPath(id)` helper.

### IN-04: `ACTIVE_CHAIN_ID as ActiveChainId` cast can lie under env misconfiguration; revert-name decode depends on the provider surfacing revert data

**File:** `apps/web/app/new/hooks/usePublishCall.ts:67,158` (and 180/191/195/213/234)
**Issue:** (a) `chain.ts` only falls back to Sepolia when `NEXT_PUBLIC_CHAIN_ID` is NaN/0 — a wrong-but-numeric value (e.g. `1`) passes the cast and every action throws an unconfigured-chain error at runtime (surfaced via the generic toast; honest but cryptic). (b) The `Transaction reverted: {errorName}` path relies on the wallet provider including revert data in its eth_sendTransaction estimation error; this is solid for the Privy embedded provider and MetaMask but is exactly the kind of thing the planned live verification (drip ETH → publish) should confirm before declaring the AssetNotAllowlisted copy reachable.
**Fix:** (a) Validate `ACTIVE_CHAIN_ID ∈ {42161, 421614}` once in chain.ts and fail loudly. (b) Include a deliberately non-allowlisted asset in the live-verification checklist.

---

## Fix Status (applied 2026-06-11)

| Finding | Status | Fix |
|---|---|---|
| CR-01 | **FIXED** | `EVENT_SUBTYPE_TO_UINT` matched to the deployed 05.1 enum (`packages/shared/src/types/call.ts`): `governance: 6` (= Governance_Snapshot), `protocolMilestone: 8` (was 7 = Governance_Tally on-chain). `UINT_TO_EVENT_SUBTYPE` decodes all deployed ordinals 0–8 (both 6 and 7 → the single TS `'governance'` label). New hand-pinned parity test `packages/shared/__tests__/enum-uint-parity.test.ts` (7 tests) pins every map against ICallRegistry.sol ordinals, including a `protocolMilestone === 8` regression pin and a "7 is never emitted" assertion; `call-gates-parity.test.ts` `toEventSubtype` renumbered to match. Composer dropdown label updated to "Governance (Snapshot)" so the form says what it submits. |
| WR-01 | **FIXED** | `usePublishCall.ts` catch now walks the viem `BaseError` tree for `InsufficientFundsError` → reuses the exact faucet message (hoisted to module-level `FAUCET_MESSAGE`, shared with the gas guard); generic fallback uses one-line `BaseError.shortMessage` instead of the raw multi-paragraph `err.message`. |
| WR-02 | **FIXED** | `!address` branch toasts `'Wallet not connected — sign in again, then retry.'` (same string stored in `state.error`) and clears `isPublishing` — the unconditional modal close can no longer be a silent dead-end. |
| WR-03 | **FIXED** | `PublishConfirmModal` backdrop is `onClick={isPublishing ? undefined : onCancel}` — guarded identically to the Cancel button; no dismissal mid approve/sign/wait. |
| IN-01..04 | open | Info-tier; not in fix scope. |

### CR-01 follow-up — governance Snapshot/Tally split (NOT yet expressible)

The TS `EventSubtype` union keeps a SINGLE `'governance'` entry, mapped to **Governance_Snapshot(6)**. **Governance_Tally(7) is intentionally inexpressible from the composer** until the union splits into `governanceSnapshot`/`governanceTally` (touches `EVENT_SUBTYPES`, both maps, `CRITERIA_REQUIRED_EVENT_SUBTYPES`, relayer zod schemas, EventFields labels, and the call-gates fixture mappers). Deliberately deferred — the minimal honest correction puts correct uints on-chain without redesigning the form. The dropdown is labeled "Governance (Snapshot)" in the meantime.

Also noted, out of this fix's scope (contracts read-only): `CallRegistry._criteriaRequired` still gates `st >= 4 && st <= 7`, excluding the real `ProtocolMilestone(8)` — the contract-side half of the same drift; and `apps/relayer/src/scripts/soak-seeder.ts:504` carries a third, unrelated numbering in a comment.

### ⚠️ Deployed-consumer note — relayer redeploy required

`EVENT_SUBTYPE_TO_UINT` is consumed by the **deployed relayer** (`apps/relayer/src/routes/calls-preflight.ts:229` dup-hash metric, `calls-dup-check.ts:136`) via the `@call-it/shared` build baked into its Fly image. Until `call-it-relayer-sepolia` is redeployed, its dup-hash for `protocolMilestone` uses the stale `7` while the web composer submits `8` — preflight duplicate detection is ineffective for that subtype (the contract's own dup gate still works). **Redeploy the relayer to pick up the fixed shared map** (not done here — operator action).

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Fixes applied: 2026-06-11 (CR-01, WR-01, WR-02, WR-03) — see Fix Status table_
