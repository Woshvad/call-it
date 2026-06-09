---
quick: 260609-ky2
subsystem: web-ui
tags: [react, stale-closure, slippage, follow-fade, flow-correctness, 09-review]
requirements: [WR-01, WR-02]
key-files:
  created: []
  modified:
    - apps/web/app/new/hooks/usePublishCall.ts
    - apps/web/app/new/page.tsx
    - packages/ui/src/compound/FollowFadeModal.tsx
commits:
  - 98e4de7  # Task 1 — WR-01
  - f63475a  # Task 2 — WR-02
duration: ~12min
completed: 2026-06-09
---

# Quick 260609-ky2: Fix WR-01 + WR-02 pre-existing flow-correctness bugs

Two pre-existing logic bugs from the Phase-9 code review (`09-REVIEW.md`), unrelated to the mobile-responsive layout work and intentionally left out of the Phase-9 diff: a stale-closure bug that suppressed the quote-success screen (WR-01) and a slippage-retry that always re-reverted (WR-02). Both fixed as atomic, scoped commits; both package builds exit 0.

## What changed

### Task 1 — WR-01: branch `onConfirmPublish` on a `publish()` return value (`98e4de7`)

- **`apps/web/app/new/hooks/usePublishCall.ts`** — Added an exported `PublishResult = { status: 'success' | 'error' }` type and changed `publish`'s declared return type from `Promise<void>` to `Promise<PublishResult>`. Returned the matching status at every terminal exit:
  - `if (!address)` guard → `return { status: 'error' }`
  - success path (after the `step: 'success'` setState + toast + `router.push`) → `return { status: 'success' }`
  - outer `catch` (after error setState + toast) → `return { status: 'error' }`
  - No change to the existing setState step transitions, preflight/paymaster logic, toast calls, or `router.push` — only `return` values added. `step` is still exported (PublishConfirmModal still consumes `publishStep`).
- **`apps/web/app/new/page.tsx`** — Rewrote `onConfirmPublish` to capture `const result = await publish(values)` and branch on `result?.status === 'success'` instead of the closed-over `publishStep` const (which was captured stale at callback-creation time and never reflected the just-completed publish). Removed `publishStep` from the `onConfirmPublish` dependency array. `publishStep` remains in scope — still passed as a prop to both `PublishConfirmModal` instances (quote-mode + standard-mode).

**Result:** In quote mode (`?quote=`), a successful publish now surfaces the UI-28 quote-success screen; a failed/errored publish (wallet not connected, preflight 422, contract/userOp error) does not. Non-quote mode is unchanged (still redirects to `/profile/{address}` on success).

### Task 2 — WR-02: gate FollowFadeModal Retry until fresh reserves arrive (`f63475a`)

- **`packages/ui/src/compound/FollowFadeModal.tsx`** (only file touched):
  - Added `awaitingFreshReserves` boolean state, set `true` inside the `if (isSlippage)` branch of `handleSubmit` — replacing the four no-op `setRefreshed*(null)` lines (and their comment) that admittedly delivered nothing because the override state was never populated.
  - Removed the dead `refreshed*` override state (4 `useState`s) and simplified the `effective*` reserve derivations to read the props directly (the modal always renders the latest reserve props the parent feeds on its 5s poll).
  - Added a `useEffect` with dependency array `[followReserve, fadeReserve, followTotalShares, fadeTotalShares]` that clears `awaitingFreshReserves` back to `false` when fresh reserve props arrive. Guarded on `awaitingFreshReserves` being true so ordinary reserve updates and the first render after open are no-ops.
  - Folded `awaitingFreshReserves` into the existing `isValid` computation (`&& !awaitingFreshReserves`), so the Confirm/Retry submit button is disabled via the existing `!isValid` path — reusing the existing `#2E2E42` / `not-allowed` disabled styling, no new colors. Button label still reads `Retry {sideLabel}` in the slippage state.
  - `handleReset` (the "Got it — Retry" acknowledgment in the slippage panel) intentionally does NOT clear the lock; the submit button re-enables only when reserves arrive (via the effect), so it is never permanently stuck and the gate cannot be bypassed by dismissing the panel.
  - Documented the parent-poll dependency in the top-of-file doc comment and at the slippage branch; fixed the stale comment that claimed clearing overrides triggers a refresh.

**Result:** After a SlippageExceeded revert, the slippage panel still shows the "Price moved…" message and recomputed estimate, but Retry is disabled until the parent pushes new reserve props (≤5s poll), at which point Retry re-enables so the recomputed `minSharesOut` reflects the new reserves — eliminating the "Retry reverts again" loop. No new props on `FollowFadeModalProps`.

## Constraint compliance

- **No new props on `FollowFadeModalProps`** — confirmed; the fix is internal modal state only.
- **`packages/ui` free of `matchMedia`/`useIsMobile`/`window` read (Pitfall 2)** — confirmed. The only `window` token in the file is in a pre-existing comment ("…the Satori/@vercel/og Node build with no window") documenting the absence of a window read, not an actual usage.
- **No new deps** — confirmed.
- **Atomic, scoped commits** — each task staged only its own file(s) via explicit `git add <path>`; never `git add -A`/`git add .`. No unrelated soak artifacts committed; no file deletions in either commit.
- **No other 09-REVIEW finding touched** — only WR-01 + WR-02; CR-01/WR-03/WR-05/WR-06 already fixed elsewhere, WR-04/WR-07/IN-* out of scope.

## Verification

| Gate | Result |
|------|--------|
| `pnpm --filter @call-it/web build` (after Task 1) | exit 0 |
| `pnpm --filter @call-it/ui build` (after Task 2) | exit 0 (`tsc --build`) |
| `pnpm --filter @call-it/web build` (after Task 2, picks up modal change) | exit 0 |
| `matchMedia`/`useIsMobile`/runtime `window` in FollowFadeModal.tsx | 0 (only a doc-comment mention) |

## Deviations from Plan

**1. [Rule 1 - cleanup of dead code] Removed the dead `refreshed*` override state**
- **Found during:** Task 2
- **Issue:** The plan said to replace the no-op `setRefreshed*(null)` lines with the new flag. Those four `useState`s (`refreshedFollowReserve`/`FadeReserve`/`FollowShares`/`FadeShares`) were only ever set to `null` and never populated, so the `effective* = refreshed* ?? prop` indirection always resolved to the prop. Leaving them would have been dead state.
- **Fix:** Removed the four `refreshed*` `useState` declarations and simplified `effectiveFollowReserve`/etc. to read the props directly. Behavior is identical (the overrides were inert) and the source no longer carries the misleading "we trigger a visual refresh by clearing our overrides" mechanism.
- **Files modified:** `packages/ui/src/compound/FollowFadeModal.tsx`
- **Commit:** `f63475a`

Otherwise plan executed as written.

## Self-Check: PASSED

- [x] `apps/web/app/new/hooks/usePublishCall.ts` modified — exports `PublishResult`, `publish` resolves `{ status }`
- [x] `apps/web/app/new/page.tsx` modified — `onConfirmPublish` branches on `result.status === 'success'`, no `publishStep` in callback body or deps
- [x] `packages/ui/src/compound/FollowFadeModal.tsx` modified — Retry gated on `awaitingFreshReserves`, cleared by reserve-watching `useEffect`
- [x] Commit `98e4de7` exists (Task 1, WR-01)
- [x] Commit `f63475a` exists (Task 2, WR-02)
- [x] Both `pnpm --filter @call-it/web build` and `pnpm --filter @call-it/ui build` exit 0
- [x] No new props on `FollowFadeModalProps`; no `matchMedia`/`useIsMobile`/`window` read
