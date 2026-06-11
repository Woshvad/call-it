---
phase: quick-260611-fo1
reviewed: 2026-06-11T12:05:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - apps/web/app/call/[id]/page.tsx
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Quick Task 260611-fo1: Code Review Report

**Reviewed:** 2026-06-11T12:05:00Z
**Depth:** standard (single-commit money-path review, commit `e9c02a4`)
**Files Reviewed:** 1
**Status:** issues_found (Info-only — money path is correct; safe to ship)

## Summary

Reviewed commit `e9c02a4` — follow/fade USDC exact-approve preflight in
`apps/web/app/call/[id]/page.tsx` (`handleFollow` ~1476-1509, `handleFade`
~1513-1546). Every item on the adversarial checklist was traced against the
file plus the supporting modules (`apps/web/lib/wagmi.ts`,
`apps/web/lib/chain.ts`, `apps/web/lib/ensure-chain.ts`,
`packages/ui/src/compound/FollowFadeModal.tsx`,
`apps/web/app/new/hooks/usePublishCall.ts`). **No Critical or Warning
findings.** Three Info-level hygiene items below.

Checklist verification detail:

1. **Allowance arg order — CORRECT.** `args: [userAddress, FFM_ADDR]` matches
   the locally declared `USDC_ALLOWANCE_ABI` (page.tsx:271-292) where
   `allowance(owner, spender)` — owner first, spender second. Mirrors
   usePublishCall.ts:201 (`[address, CALL_REGISTRY_ADDRESS]`).
2. **Approve spender/amount/chain — CORRECT.** `args: [FFM_ADDR, amountIn]`
   (spender = FollowFadeMarket, not CR/CE/SM), exact `amountIn` (never
   infinite), `chainId: ACTIVE_CHAIN_ID` pinned on `writeContractAsync`.
3. **chainId pinning + cast soundness — CORRECT.** Both `readContract` and
   `waitForTransactionReceipt` take `wagmiConfig` first and pin
   `chainId: ACTIVE_CHAIN_ID as ActiveChainId`. The cast is sound:
   `ACTIVE_CHAIN_ID` in `@/lib/chain:53` is already typed as the union
   `42161 | 421614`, and the local alias
   `(typeof wagmiConfig)['chains'][number]['id']` resolves to the identical
   set (`chains: [arbitrumSepolia, arbitrum]`, D-36 locked). No runtime
   wrong-chain id can pass — `ACTIVE_CHAIN_ID` is constructed as a ternary
   over exactly those two constants. (But see IN-01: the comment justifying
   the alias is factually wrong.)
4. **Receipt gate — CORRECT.** `receipt.status !== 'success'` throws before
   the deposit write in both handlers. There is no try/catch around the
   approve block, so a reverted approve (`status: 'reverted'`), a
   `waitForTransactionReceipt` timeout/throw, or a user-rejected approve all
   propagate and the deposit write is never reached. No path fires
   `follow`/`fade` after a failed approve.
5. **userAddress guard — CORRECT.** `if (!userAddress) throw` precedes the
   `readContract` call. `userAddress` is destructured from `useAccount()` at
   page.tsx:1268 inside `CallPage` — the CONNECTED wallet, not the route
   param (the route param is `callId`). `ensureActiveChain()` running first
   is harmless: it no-ops when `!account.isConnected`
   (ensure-chain.ts:36-37).
6. **Dep arrays — COMPLETE.** `[callId, userAddress, writeContractAsync]`
   covers every reactive value; `wagmiConfig`, `USDC_ADDR`, `FFM_ADDR`,
   `ACTIVE_CHAIN_ID`, `ensureActiveChain`, `readContract`,
   `waitForTransactionReceipt`, and the ABIs are all module-level constants.
   `userAddress` was correctly ADDED to both arrays in this commit.
7. **Error propagation — CORRECT.** No try/catch in either handler; thrown
   errors reach `FollowFadeModal.handleSubmit`'s catch
   (FollowFadeModal.tsx:178-211), which renders `err.message` (sliced to
   200 chars) and resets `isSubmitting`. Messages ("Connect your wallet
   first.", "USDC approval failed — try again.") are human-actionable.
8. **Deposit write byte-identical — CONFIRMED.** The `follow`/`fade`
   `writeContractAsync` blocks appear only as unchanged context lines in the
   diff; args/shape untouched.
9. **TS/lint hygiene — clean** apart from IN-03 (redundant `as bigint`).
   Imports from `'wagmi/actions'` match the repo's usePublishCall pattern;
   no unused imports; no `any`.
10. **Races / retries / bigint — OK.** Approve receipt mined ⇒ allowance is
    final state before the deposit write (same pattern proven live in
    usePublishCall); there is no post-approve allowance re-read, so no
    stale-read loop. Retry after a slippage-reverted deposit correctly skips
    the approve (allowance already ≥ amountIn). Exact-amount approve
    overwrite is safe for USDC (no approve-to-zero-first requirement on
    native USDC or Circle Sepolia test USDC). `allowance < amountIn` is a
    bigint-vs-bigint comparison.

## Info

### IN-01: `ActiveChainId` alias doc-comment is factually wrong

**File:** `apps/web/app/call/[id]/page.tsx:230-235`
**Issue:** The new comment says "ACTIVE_CHAIN_ID is declared `number` in
@/lib/chain — narrow it here". It is not: `apps/web/lib/chain.ts:43-56`
declares `export const ACTIVE_CHAIN_ID: ActiveChainId` where `ActiveChainId`
is the `42161 | 421614` union. The local alias and the `as ActiveChainId`
casts are redundant (harmless, but the comment will mislead a future reader
into believing an unsafe widening exists somewhere).
**Fix:** Either import `ActiveChainId` from `@/lib/chain` and drop the casts,
or correct the comment to say the casts only bridge two structurally
identical unions (chain.ts's vs wagmiConfig's) for wagmi/actions' generic
inference.

### IN-02: 28-line approve-preflight block duplicated verbatim

**File:** `apps/web/app/call/[id]/page.tsx:1477-1500` and `1514-1537`
**Issue:** `handleFollow` and `handleFade` contain byte-identical
guard → allowance read → approve → receipt-gate blocks. A future edit (e.g.
the mainnet cutover, or a spender change) must be applied twice; divergence
here is a money-path risk.
**Fix:** Extract a module-level helper, e.g.
```ts
async function ensureFfmAllowance(
  userAddress: `0x${string}`,
  amountIn: bigint,
  writeContractAsync: WriteContractAsync,
): Promise<void> { /* allowance read + exact approve + receipt gate */ }
```
and call it from both handlers (it stays outside the component, so dep
arrays are unaffected).

### IN-03: Redundant `as bigint` on `readContract` result

**File:** `apps/web/app/call/[id]/page.tsx:1479-1485` (and 1516-1522)
**Issue:** `USDC_ALLOWANCE_ABI` is `as const`, so `readContract` already
infers the `allowance` return as `bigint`; the `(await ...) as bigint`
assertion adds nothing and would mask a future ABI typo (a wrong
`functionName` would otherwise surface as a type error instead of being
force-cast). usePublishCall.ts:197 needs no cast with `erc20Abi`.
**Fix:** Drop the cast: `const allowance = await readContract(wagmiConfig, {...});`

---

_Reviewed: 2026-06-11T12:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
