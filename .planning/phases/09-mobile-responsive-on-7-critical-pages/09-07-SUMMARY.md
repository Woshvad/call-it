---
phase: 09-mobile-responsive-on-7-critical-pages
plan: 07
subsystem: web-frontend
tags: [responsive, modals, flexwrap, satori-safe, neobrutalist, mobile]

# Dependency graph
requires:
  - phase: 09-mobile-responsive-on-7-critical-pages
    provides: "useIsMobile() hook + responsive.spec.ts Wave-0 gate (09-01)"
provides:
  - "apps/web/app/components/ChallengeFormModal.tsx — 375px-safe: panel maxWidth min(480px, calc(100vw - 32px)) + flexWrap action row + 44px touch targets (D-04)"
  - "packages/ui/src/compound/{FollowFade,CallerExit,PositionExit}Modal.tsx — verified clamp + flexWrap button rows that stack full-width at the clamped panel width; intrinsic CSS only (Pitfall 2)"
affects: [phase-09-verification]

# Tech tracking
tech-stack:
  added: []  # zero new deps — pure CSS-in-JS flex changes
  patterns:
    - "Intrinsic responsive button stacking: flexWrap:'wrap' + per-button minWidth so a row stays side-by-side on the desktop panel but stacks full-width when the panel clamps to calc(100vw - 32px) on a phone — no JS viewport read, safe for the Satori/@vercel/og Node build (Pitfall 2)"
    - "Modal panel mobile clamp: maxWidth: min(<desktop>px, calc(100vw - 32px)) — viewport-relative, no hook"

key-files:
  created: []
  modified:
    - apps/web/app/components/ChallengeFormModal.tsx
    - packages/ui/src/compound/FollowFadeModal.tsx
    - packages/ui/src/compound/CallerExitModal.tsx
    - packages/ui/src/compound/PositionExitModal.tsx

decisions:
  - "Used flexWrap + per-button minWidth (not flex:'1 1 100%') so the desktop two-column button layout is preserved unchanged — buttons only wrap to full-width when the clamped panel becomes too narrow to fit both minWidths + the 12px gap"
  - "PositionExitModal uses smaller minWidths (150/190px) than FollowFade/CallerExit (160/200px) because its desktop panel is 420px (narrowest) — keeps it side-by-side on desktop while still wrapping on a 375px phone"
  - "Reworded my own code comments to avoid the literal tokens 'useIsMobile'/'matchMedia' so the Pitfall-2 acceptance grep (grep useIsMobile|matchMedia packages/ui/src) returns a true 0"

# Metrics
duration: 4min
completed: 2026-06-09
---

# Phase 9 Plan 07: In-Scope Modals (375px) Summary

**Every modal a critical page can open now fits a 375px phone — `ChallengeFormModal` panel clamped to `min(480px, calc(100vw - 32px))` with a `flexWrap` action row, and the three `packages/ui` modals (FollowFade/CallerExit/PositionExit) get `flexWrap` + per-button `minWidth` so their button rows stack full-width at the clamped panel width — all intrinsic CSS, no browser-only viewport API leaked into the Satori/OG Node build (Pitfall 2, D-04).**

## Accomplishments

- **`ChallengeFormModal.tsx` (real change, `apps/web`)** — Panel `maxWidth` changed from a fixed `480px` to `min(480px, calc(100vw - 32px))` so the 480px panel never overflows a 375px viewport. The overlay already carried `padding: '24px'` (horizontal gutter present — the panel never touches the edge). The action row (`Keep call open` / `Send Challenge ▸`) gets `flexWrap: 'wrap'` with per-button `flex: '1 1 160px' / '2 1 200px'` + matching `minWidth` so the two buttons stay side-by-side on the 480px desktop panel but stack full-width once the panel clamps on a phone. All action buttons and the `[5/25/50/100]` quick-stake chips get `minHeight: '44px'` touch targets. Intrinsic clamp only — no hook needed.
- **`FollowFadeModal.tsx` / `CallerExitModal.tsx` / `PositionExitModal.tsx` (verify-only clamp + button stack, `packages/ui`)** — Confirmed the `maxWidth: 'calc(100vw - 32px)'` clamp is already present on each `Dialog.Content` (RESEARCH Divergence #2 — the UI-SPEC "add the clamp" instruction was moot). For each modal's `flexDirection: 'row'` button row, added `flexWrap: 'wrap'` + per-button `minWidth`/`flex-basis` (160/200px for the 440px+ FollowFade/CallerExit panels, 150/190px for the 420px PositionExit panel) + `minHeight: '44px'`. At the clamped ~343px panel on a 375px phone the two buttons exceed the available content width and wrap to full-width stacked rows; on the wider desktop panels they stay side-by-side exactly as before. **No `useIsMobile`/`matchMedia` added** — the stack is purely intrinsic, keeping `packages/ui` clean for the `@vercel/og`/Satori Node build (Pitfall 2, T-09-07-01).

## Task Commits

1. **Task 1: ChallengeFormModal — overlay h-padding + panel clamp + stacked button rows** — `02b4439` (fix)
2. **Task 2: Verify 3 packages/ui modal clamps + stack their internal button rows** — `0d20570` (fix)

## Verification

- `cd apps/web && pnpm build` — exits 0 (typechecks ChallengeFormModal + its packages/ui imports). ✅
- `pnpm --filter @call-it/ui build` (`tsc --build`) — exits 0. ✅
- `grep -rn "useIsMobile|matchMedia" packages/ui/src` — **0 matches** (Pitfall 2 / T-09-07-01 proven; comment prose reworded to avoid false-positive tokens). ✅
- `grep "calc(100vw" ChallengeFormModal.tsx` — present (`min(480px, calc(100vw - 32px))`). ✅
- `grep -c "calc(100vw - 32px)" {FollowFade,CallerExit,PositionExit}Modal.tsx` — present in all three. ✅
- `grep "display:'grid'|display: 'grid'"` across all four modals — **0 matches** (no grid). ✅

## Decisions Made

1. **`flexWrap` + per-button `minWidth`, not `flex: '1 1 100%'`.** A blanket `100%` basis would force the buttons full-width on desktop too, breaking the established two-column action layout. Per-button `minWidth` keeps them side-by-side until the panel is too narrow to fit both `minWidth`s + the 12px gap, at which point they wrap to stacked full-width rows. This satisfies "stack at mobile, unchanged at desktop" without any JS viewport read.
2. **Per-modal `minWidth` tuned to panel width.** PositionExit's desktop panel (420px, narrowest) uses 150/190px; FollowFade/CallerExit (440/480px) use 160/200px — so each stays side-by-side on its own desktop panel while all still wrap at the shared ~343px clamped phone panel.
3. **Comment wording avoids literal `useIsMobile`/`matchMedia`.** The Pitfall-2 acceptance gate is a literal grep; descriptive comments using those tokens would trip it. Reworded to "no browser-only viewport read" so the grep reports a true 0.

## Deviations from Plan

None — plan executed exactly as written. Task 1 was the genuine change (ChallengeFormModal); Task 2 was verify-only for the clamp (already present per RESEARCH Divergence #2) plus the prescribed intrinsic button-row stacking. No architectural changes, no new dependencies, no `display:grid`.

## Threat Surface Scan

No new network endpoints, inputs, auth paths, or schema changes. The Follow/Fade/Challenge/Exit transaction calldata + amount logic is untouched (T-09-07-02 accept — UI-only restyle). T-09-07-01 (browser-only API leaking into the OG build) mitigated and proven (0 `matchMedia`/`useIsMobile` in `packages/ui/src`). T-09-07-SC moot — zero installs.

No threat flags.

## Self-Check: PASSED

- [x] `apps/web/app/components/ChallengeFormModal.tsx` modified (clamp + flexWrap) — on disk
- [x] `packages/ui/src/compound/FollowFadeModal.tsx` modified — on disk
- [x] `packages/ui/src/compound/CallerExitModal.tsx` modified — on disk
- [x] `packages/ui/src/compound/PositionExitModal.tsx` modified — on disk
- [x] Commit `02b4439` (Task 1) exists in git log
- [x] Commit `0d20570` (Task 2) exists in git log
- [x] `apps/web` build exits 0; `@call-it/ui` build exits 0
- [x] `grep useIsMobile|matchMedia packages/ui/src` == 0; clamps present in all four modals; no grid

---
*Phase: 09-mobile-responsive-on-7-critical-pages*
*Completed: 2026-06-09*
