---
phase: 03-challengeescrow
plan: 06
subsystem: ui
tags: [duel-page, challenge-form, live-receipt, wagmi, usdc-preflight, phase3]

# Dependency graph

requires:
  - phase: 03-challengeescrow
    provides: ChallengeEscrow contract + proposeChallenge/acceptChallenge/rejectChallenge ABI (plan 03-01)
  - phase: 03-challengeescrow
    provides: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA constant in @call-it/shared (plan 03-03)
  - phase: 03-challengeescrow
    provides: /api/duels/:id/live-state relayer endpoint (plan 03-05)
  - phase: 02-followfademarket
    provides: FollowFadeModal, MarketPositioningBar, CallerExitModal, PositionExitModal (plan 02-08)
  - phase: 02-followfademarket
    provides: /call/[id]/page.tsx Phase 2 baseline (plan 02-08)

provides:
  - GET /duel/[challengeId] — full §15.5 duel page with hero, two-column card, consensus bar, riding, CTAs
  - apps/web/app/components/ChallengeFormModal.tsx — shared Surface-7 modal (reusable by 03-07 Duels tab)
  - Live Receipt pending challenge block (challenge_proposed notification + caller accept/reject)
  - SOCIAL-49 caller exit link (present, confirmed)
  - SOCIAL-50 position exit link (present, confirmed)

affects: [phase-03-07-duels-tab, phase-04-settlement, phase-07-og-finalization]

# Tech tracking

tech-stack:
  added: []
  patterns:
    - "Duel page: 5s setInterval + window.addEventListener('focus') for live-state refetch (D-10)"
    - "callerMatchingStake = min(callerInputStake, challengerStake) — SOCIAL-31 correct formula (Issue #1 fix)"
    - "USDC allowance preflight: useReadContract → compare → show Approve sub-step → after receipt → enable action"
    - "ChallengeFormModal: shared at apps/web/app/components/ for 03-07 Duels tab reuse"
    - "AUTH-44: wallet address never in JSX — handle + rep only (duel page + form modal)"
    - "Flexbox-only: display:flex everywhere, display:grid forbidden (Pitfall 15 / T-3-06-03)"
    - "CE_ADDR from @call-it/shared — never inline hex (T-3-06-05)"
    - "Graceful zero-address placeholder: isZeroAddr guard skips contract reads when CE not deployed"

key-files:
  created:
    - apps/web/app/duel/[challengeId]/page.tsx
    - apps/web/app/components/ChallengeFormModal.tsx
  modified:
    - apps/web/app/call/[id]/page.tsx

key-decisions:
  - "ChallengeFormModal extracted to apps/web/app/components/ (not colocated in duel/) so 03-07 Duels tab can import it without circular dependency or duplication"
  - "callerMatchingStake = min(callerInputStake, challengerStake): caller's chosen acceptance amount, NOT min(challengerStake,challengerStake) — this was the Issue #1 bug in the plan; both accept paths (Duel page + Live Receipt) use the corrected formula"
  - "Separate approveTxHash / acceptTxHash state variables (not shared) to avoid ambiguous isSuccess from same hash"
  - "useReadContract for USDC allowance (not useReadContracts batch) — simpler, enabled flag is per-condition"
  - "Mobile banner via CSS @media in <style> tag — avoids window.innerWidth useState pattern (SSR-safe)"
  - "openToChallenges field added to CallData type with default true (backward compat with relayer responses that omit it)"

patterns-established:
  - "Challenge USDC preflight: read allowance → compare → show Approve step → after WaitForTransactionReceipt isSuccess → refetch allowance → enable action CTA"
  - "Pending challenge notification: fetch /api/notifications?callId=X&type=challenge_proposed on load + 5s interval"

requirements-completed: [SOCIAL-30, SOCIAL-34, SOCIAL-35, SOCIAL-36, UI-11]

# Metrics

duration: 35min
completed: 2026-06-01
---

# Phase 3 Plan 6: Duel Page + Live Receipt Challenge Block Summary

**Full §15.5 Duel page at /duel/[challengeId] + Surface 7 challenge form modal + Live Receipt pending-challenge + caller accept/reject with USDC preflight**

## Task Commits

Each task was committed atomically:

1. **Task 1: Duel page + ChallengeFormModal** - `bf15c33` (feat)
2. **Task 2: Live Receipt pending challenge block + Challenge button** - `26c0c84` (feat)

## Files Created/Modified

- `apps/web/app/duel/[challengeId]/page.tsx` — Full §15.5 Duel page: THE MARKET hero (64px Syne asset pair, 3-stat row), two-column CALLER/VS/CHALLENGER flex card (CornerBrackets, color semantics locked), MARKET CONSENSUS LIVE bar (5s poll + window-focus), Riding sections (D-06 FFM data), Side-with CTAs → Follow/Fade modals, Challenge form button for non-callers, caller-only accept/reject block with USDC preflight, mobile desktop banner at ≤768px
- `apps/web/app/components/ChallengeFormModal.tsx` — Shared Surface-7 modal: stake pre-fill (SOCIAL-30), callerMatchingStake = min(input, callerStake) (SOCIAL-31), quick-stake buttons $5/$25/$50/$100, Zod $5–$100 bounds, USDC allowance + balance preflight (T-3-06-06), proposeChallenge wagmi write, post-submit Toast
- `apps/web/app/call/[id]/page.tsx` — Added: activated Challenge button (from disabled stub), challenge_proposed pending block with caller accept/reject + USDC approve preflight, ChallengeFormModal integration, openToChallenges field in CallData type

## Decisions Made

1. **ChallengeFormModal at apps/web/app/components/** — Extracted to shared components directory so Plan 03-07 (Duels tab) can import it without file duplication or relative path gymnastics.
2. **callerMatchingStake = min(callerInputStake, challengerStake)** — Issue #1 critical bug fix. The plan's Task 2 had `min(challengerStake, challengerStake)` (both args identical) which drops the caller's chosen amount. Corrected in both accept paths (Duel page + Live Receipt).
3. **Separate approve/accept tx hash state** — `approveTxHash` and `acceptTxHash` are separate variables so `useWaitForTransactionReceipt.isSuccess` does not cross-fire between the two operations.
4. **Mobile banner via `<style>` tag CSS** — Avoids window resize event listener for SSR safety; the `@media (max-width: 768px)` rule is the canonical Phase 9 contract.
5. **openToChallenges default = true** — New field in CallData with backward-compat default; relayer responses that don't include it default to challengeable to avoid blocking users unnecessarily.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `callerMatchingStake = min(challengerStake, challengerStake)` (Issue #1)**
- **Found during:** Task 2 — Live Receipt accept path — both args were `challengerStake`
- **Issue:** Plan Task 2 action block had `min(pendingChallenge.challengerStake, pendingChallenge.challengerStake)` — identical args; this ignores the caller's chosen input amount, breaking SOCIAL-31 asymmetric stake support
- **Fix:** Applied correct formula `min(callerInputStake, challengerStake)` — defaults to `challengerStake` (caller matches exactly) but the API surface is correct for UI override
- **Files modified:** `apps/web/app/call/[id]/page.tsx`, `apps/web/app/duel/[challengeId]/page.tsx`
- **Committed in:** `26c0c84` (Task 2), `bf15c33` (Task 1 — Duel page had correct formula; confirmed)

**2. [Rule 3 - Missing] Added `openToChallenges` to CallData type**
- **Found during:** Task 2 — Challenge button needed to check `callData.openToChallenges` but field was not in type
- **Fix:** Added `openToChallenges?: boolean` to `CallData` type with default `true` in `fetchCallData`
- **Files modified:** `apps/web/app/call/[id]/page.tsx`
- **Committed in:** `26c0c84`

**3. [Rule 2 - Missing] Removed unused FFM_ABI constant from Duel page**
- **Found during:** Task 1 TypeScript build check — `FFM_ABI` declared but not used (Duel page reads consensus from relayer, not direct RPC)
- **Fix:** Removed the unused ABI block
- **Committed in:** `bf15c33`

### SOCIAL-49/50 Exit Link Verification (Issue #3)

SOCIAL-49 (caller exit link after 24h lock) and SOCIAL-50 (position holder exit after 4h cooldown) were verified as already delivered in Plan 02-08 and present in the current `call/[id]/page.tsx`. The caller exit control is in the sticky header; the position exit control is in the "Your position" block at the bottom of the page. Both were confirmed present before Task 2 modifications and are preserved (additive changes only).

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `followReserve = 0n / fadeReserve = 0n` | `apps/web/app/duel/[challengeId]/page.tsx` | ~458 | Market consensus reads from relayer live-state extended response; relayer returns `deferred: true` until ChallengeEscrow is deployed (03-03 operator action). Falls back gracefully to 50/50 muted display. |
| `CE_ADDR = 0x000...000` | `packages/shared/src/constants/addresses.ts` | 158 | Placeholder pending 03-03 operator deploy. Both pages guard: `isZeroAddr` / `isZeroCE` checks disable contract writes and show notice. |
| `onSubmit={async (_a, _b) => void 0}` | `apps/web/app/duel/[challengeId]/page.tsx` | ~788 | FollowFadeModal `onSubmit` is a pass-through; the modal handles its own wagmi write internally. Stub is correct behavior — the "Side with" CTAs use Follow/Fade modals which already wire their own wagmi calls. |

## Threat Surface Scan

No new network endpoints introduced beyond those already in the plan's threat model (T-3-06-01 through T-3-06-06). Both pages make client-side reads to the relayer `/api/duels/:id/live-state` and `/api/notifications` — same pattern as Phase 2 live-state polling. All trust boundaries are client → ChallengeEscrow via wagmi (contract enforces all gates as final authority).

## Self-Check: PASSED

- [x] `apps/web/app/duel/[challengeId]/page.tsx` exists on disk (min_lines > 200: 820+ lines)
- [x] `apps/web/app/components/ChallengeFormModal.tsx` exists on disk
- [x] `apps/web/app/call/[id]/page.tsx` modified with challenge block
- [x] Commits `bf15c33` and `26c0c84` exist in git log
- [x] `pnpm --filter @call-it/web build` exits 0 — PASS
- [x] `grep -r "display.*grid" apps/web/app/duel/` — 0 CSS matches (only comments) — PASS
- [x] `grep "CHALLENGE_ESCROW_ARBITRUM_SEPOLIA" apps/web/app/duel/[challengeId]/page.tsx` — imported — PASS
- [x] `grep "CHALLENGE_MIN_STAKE\|CHALLENGE_MAX_STAKE" apps/web/app/components/ChallengeFormModal.tsx` — present — PASS
- [x] `grep "#E8F542" apps/web/app/duel/[challengeId]/page.tsx | wc -l` — 23 matches >= 5 — PASS
- [x] `grep "#FB923C" apps/web/app/duel/[challengeId]/page.tsx | wc -l` — 16 matches >= 3 — PASS
- [x] `grep "BEST VIEWED ON DESKTOP\|768" apps/web/app/duel/[challengeId]/page.tsx` — present — PASS
- [x] `grep "challenge_proposed\|rejectChallenge\|acceptChallenge" apps/web/app/call/[id]/page.tsx` — present — PASS
- [x] AUTH-44: `grep "account.address.*>.*<\|userAddress.*>.*<" apps/web/app/duel/` — 0 matches — PASS
- [x] callerMatchingStake formula: min(callerInputStake, challengerStake) — NOT min(x,x) — confirmed in both files
- [x] SOCIAL-49/50 exit links present and preserved in call/[id]/page.tsx — PASS
