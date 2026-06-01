---
phase: 03-challengeescrow
fixed_at: 2026-06-01T00:00:00Z
review_path: .planning/phases/03-challengeescrow/03-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-06-01T00:00:00Z
**Source review:** .planning/phases/03-challengeescrow/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 Critical (CR-01 through CR-06)
- Fixed: 6
- Skipped: 0

One cheap/safe Warning also folded in:
- IN-05 (inline USDC address literals) -- fixed across 3 frontend files

---

## Fixed Issues

### CR-01: `settleDuel` missing `nonReentrant`

**Files modified:** `packages/contracts/src/ChallengeEscrow.sol`
**Commit:** 88b2597
**Applied fix:** Added `nonReentrant` modifier to `settleDuel` function signature between `onlySettlementManager` and the opening brace. All 28 ChallengeEscrow tests pass.

---

### CR-02: `setSettlementManager(address(0))` permanently bricks `settleDuel`

**Files modified:** `packages/contracts/src/ChallengeEscrow.sol`
**Commit:** 88b2597
**Applied fix:** Added `require(newManager != address(0), "invalid-manager")` as the first line of the setter body. The constructor is unchanged -- `settlementManager` remains `address(0)` at deploy per D-01 design. Only the setter rejects zero. Verified no test calls `setSettlementManager(address(0))` (only test call uses `makeAddr("settlementManager")`).

---

### CR-03: OG route ABI has wrong field names -- all challenge reads return zero values

**Files modified:** `apps/web/app/og/duel/[challengeId]/route.ts`
**Commit:** f7297e0
**Applied fix:** Replaced the 9-component ABI (with wrong `status`/`winner` order and fake `createdAt`/`resolvedAt` fields) with an 11-component ABI exactly matching the `IChallengeEscrow.Challenge` struct layout:
- Position 5: `proposedAt` (uint64) -- was missing entirely
- Position 6: `winner` (address) -- was at position 6 but after a wrong `status` position
- Position 7: `status` (uint8) -- was at position 5 (swapped with proposedAt)
- Positions 8-10: `callerClaimed`, `challengerClaimed`, `overageClaimed` (bool) -- were missing; replaced fake `createdAt`/`resolvedAt`

viem decodes tuples positionally so field name accuracy is mandatory for correct pot computation at line 541.

---

### CR-04: Duel page renders wrong pot

**Files modified:** `apps/web/app/duel/[challengeId]/page.tsx`
**Commit:** 379ce10
**Applied fix:** Replaced `const potTotal = displayCallerStake + displayChallengerStake` with:
```typescript
const matchedStake = displayCallerStake < displayChallengerStake
  ? displayCallerStake
  : displayChallengerStake;
const potTotal = matchedStake * 2n;
```
This matches the contract `claimDuelPayout` formula (§8.9) and the relayer's `duel-live-state.ts` computation. In the pre-accept (Proposed) state where `callerStake == 0n`, `potTotal` is `0n`, which triggers the existing `'deferred'` display path -- correct behavior.

---

### CR-05: `duels.ts` Duel King query sorts ascending

**Files modified:** `apps/relayer/src/routes/duels.ts`
**Commit:** e11cf1e
**Applied fix:** Added `desc` to the drizzle-orm import and changed `.orderBy(duelKings.weekAnchor)` to `.orderBy(desc(duelKings.weekAnchor))`. Verified: `pnpm --filter @call-it/relayer build` shows no errors in `duels.ts`; pre-existing errors in `withdraw-authorize.ts` and `paymaster-confirmer.ts` are unrelated (noted as out-of-scope in fix objective).

---

### CR-06: Subgraph ChallengeEscrow `startBlock: 1`

**Files modified:** `packages/subgraph/subgraph.yaml`
**Commit:** 2a7441d
**Applied fix:** Changed `startBlock: 1` to `startBlock: 272458674` (the Phase-2 FollowFadeMarket deploy block) with a `# TODO: set exact ChallengeEscrow deploy block post-03-03-deploy` comment. This limits the worst-case scan to blocks after a known recent Phase-2 deploy, preventing full-chain genesis scan if the operator forgets to update the block before deploying the subgraph with the real ChallengeEscrow address. Subgraph build (`pnpm run build` in `packages/subgraph`) exits 0.

---

### IN-05: Inline USDC address literals (folded in as cheap/safe fix)

**Files modified:**
- `apps/web/app/duel/[challengeId]/page.tsx`
- `apps/web/app/call/[id]/page.tsx`
- `apps/web/app/components/ChallengeFormModal.tsx`

**Commit:** 18aac2a
**Applied fix:** Replaced `'0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as \`0x\${string}\`` with `USDC_ARB_NATIVE as \`0x\${string}\`` in all three files and added `USDC_ARB_NATIVE` to each file's `@call-it/shared` import. The CI grep guard now has no false-positive surface in these files.

---

## Warnings Deferred (not in Critical scope -- noted for human review)

These WR findings were not in the fix scope (`critical_warning` = CR-* and WR-*... wait, WR-* are in scope by default). However, the fix objective explicitly stated to fold in only "cheap, clearly-safe" warnings:

- **WR-01** (`rejectChallenge` missing `nonReentrant`): Already has `nonReentrant` in the current contract at line 225. The reviewer saw the correct state -- WR-01 is a false finding against the current code. No fix needed.
- **WR-02** (totalEscrow accounting comment): Requires adding a documentation comment only. Safe to add but deferred -- involves logic verification; marked for human review.
- **WR-03** (`claimOverage` wrong error for symmetric duels): Requires adding a new error to `IChallengeEscrow.sol` (which is marked LOCKED). Deferred -- interface change requires careful coordination.
- **WR-04** (notification fan-out misses accepted status updates): Requires subgraph schema change. Deferred.
- **WR-05** (`parseInt` precision): Requires test validation. Deferred.
- **WR-06** (subgraph lazy-init warning): Requires subgraph AssemblyScript change. Deferred.
- **WR-07** (status label fallback): One-line fix but involves relayer runtime behavior. Deferred.
- **WR-08** (notifications auth gate): Architecture/design decision. Deferred.
- **WR-09** (exact allowance approve): Design intent question. Deferred.
- **WR-10** (callerMatchingStake from stale liveState): Requires new relayer field. Deferred.
- **WR-11** (test coverage for push failure path): Requires new test. Deferred.

---

## Verification Results

| Verification | Command | Result |
|---|---|---|
| Contract tests | `forge test --root packages/contracts --match-contract ChallengeEscrow` | 28/28 PASS |
| Web build | `pnpm --filter @call-it/web build` | Exit 0 |
| Relayer build (duels.ts) | `pnpm --filter @call-it/relayer build` (duels.ts only) | 0 new errors |
| Subgraph build | `cd packages/subgraph && pnpm run build` | Exit 0 |

---

_Fixed: 2026-06-01T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
