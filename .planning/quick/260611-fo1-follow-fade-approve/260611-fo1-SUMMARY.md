---
phase: quick-260611-fo1
plan: 01
subsystem: web-frontend
status: complete
one_liner: "Follow/fade on the call page now reads USDC allowance and submits an exact-amount approve to FollowFadeMarket before the deposit write — fixes the live zero-allowance 'tx failed'"
commit: e9c02a4
tags: [usdc, allowance, follow-fade, wagmi-actions]
requirements: [QUICK-260611-FO1]
dependency-graph:
  requires: ["@/lib/wagmi wagmiConfig", "wagmi/actions readContract + waitForTransactionReceipt"]
  provides: ["approve-then-deposit follow/fade from /call/[id]"]
  affects: ["apps/web/app/call/[id]/page.tsx"]
key-files:
  created: []
  modified:
    - "apps/web/app/call/[id]/page.tsx"
decisions:
  - "Exact-amount approve (amountIn), never infinite — matches repo-wide convention (T-fo1-01)"
  - "Approve receipt status checked; throw before deposit on revert (T-fo1-02)"
  - "No try/catch added — FollowFadeModal's existing onSubmit catch surfaces the error"
metrics:
  duration: "~10 min"
  completed: "2026-06-11"
  tasks: 1
  tests: "206/206 vitest green; web build exits 0"
---

# Quick 260611-fo1: Follow/Fade USDC Approve Summary

Fixed the live follow/fade "tx failed" (verified 2026-06-11, Rabby on Sepolia): `handleFollow` and `handleFade` in `apps/web/app/call/[id]/page.tsx` called `FollowFadeMarket.follow/fade` with no USDC approve step, so `_deposit`'s `safeTransferFrom` reverted in wallet pre-simulation for any wallet with zero allowance.

## What Changed

Single file — `apps/web/app/call/[id]/page.tsx`:

1. Added `readContract, waitForTransactionReceipt` from `wagmi/actions` and `wagmiConfig` from `@/lib/wagmi`; added module-scope `ActiveChainId` alias `(typeof wagmiConfig)['chains'][number]['id']` (mirrors `usePublishCall.ts:78`).
2. In both `handleFollow` and `handleFade`, between `ensureActiveChain()` and the deposit write:
   - throw `'Connect your wallet first.'` when `userAddress` is falsy
   - `readContract` `allowance(userAddress, FFM_ADDR)` on `USDC_ADDR`
   - if short: `writeContractAsync` `approve(FFM_ADDR, amountIn)` (exact amount), `waitForTransactionReceipt`, throw `'USDC approval failed — try again.'` on `status !== 'success'`
   - existing follow/fade `writeContractAsync` calls byte-identical; dep arrays now `[callId, userAddress, writeContractAsync]`
3. Handler comments document the approve-then-deposit rationale.

Reused existing identifiers (`USDC_ALLOWANCE_ABI`, `FFM_ADDR`, `USDC_ADDR`, `ACTIVE_CHAIN_ID`) — nothing redefined.

## Verification

- `pnpm --filter @call-it/web build` — exit 0
- `pnpm --filter @call-it/web exec vitest run` — 206/206 passed (23 files)
- `grep -c "readContract(wagmiConfig" "apps/web/app/call/[id]/page.tsx"` — 2 (one per handler)
- `git show --stat HEAD` — exactly one file changed

## Deviations from Plan

None - plan executed exactly as written.

## Known Issues (out of scope, deferred)

- `apps/web/app/api/frame/tx/[callId]/route.ts` (Warpcast frame tx path) still submits FFM deposits without an approve step. Intentionally untouched — part of the deferred Phase-10 in-Warpcast tap-to-transact workstream (D-01).

## Self-Check: PASSED

- Commit e9c02a4 exists on master, single file `apps/web/app/call/[id]/page.tsx`
- Build + tests green; grep gate >= 2
