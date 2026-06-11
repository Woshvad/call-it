---
phase: quick-260611-f7c
plan: 01
subsystem: ui
tags: [nextjs, react, a11y, design-tokens, d-07-honesty, brutalist]

requires:
  - phase: 09.2
    provides: prototype design system (globals.css tokens, brutal-* primitives, CallCard)
provides:
  - "3 real-bug fixes: settings disabled-state, fabricated 50/50 duel consensus removed, fabricated 50% conviction removed (D-07)"
  - "Error/empty/loading state unification to the home-feed brutal-card containment pattern (leaderboard, profile, disputes, duels)"
  - "Consistent modal a11y: role=dialog + aria-modal + aria-labelledby + guarded Escape on all four modals"
  - "Design-token compliance in ProfileTabs, duel accents, disputes layout; copy/icon fixes (Settlement window, menu/duel glyphs)"
affects: [phase-09.1-demo-hardening]

tech-stack:
  added: []
  patterns:
    - "Honest degradation (D-07): nullable pct/conviction — missing data hides the element, never fabricates an even split or default"
    - "Modal Escape effect: window keydown, inert while transaction in flight, placed above any early return (rules of hooks)"
    - "RSC retry: router.refresh() re-runs the page.tsx server fetch from a dumb client renderer"

key-files:
  created: []
  modified:
    - apps/web/app/profile/[address]/settings/page.tsx
    - apps/web/app/duel/[challengeId]/page.tsx
    - packages/ui/src/compound/CallCard.tsx
    - packages/ui/__tests__/call-card-states.test.tsx
    - apps/web/components/FeedList.tsx
    - apps/web/app/leaderboard/LeaderboardClient.tsx
    - apps/web/app/profile/[address]/ProfileClient.tsx
    - apps/web/app/disputes/page.tsx
    - apps/web/app/duels/page.tsx
    - apps/web/app/components/ChallengeFormModal.tsx
    - apps/web/app/new/components/PublishConfirmModal.tsx
    - apps/web/app/call/[id]/page.tsx
    - apps/web/components/ProfileTabs.tsx
    - apps/web/app/disputes/layout.tsx
    - apps/web/app/new/components/AdvancedSettings.tsx
    - apps/web/app/new/components/DeadlinePicker.tsx
    - apps/web/app/components/Icon.tsx
    - apps/web/app/components/AppShell.tsx
    - apps/web/app/components/Sidebar.tsx
    - apps/web/tests/utc-day-boundary.spec.ts
    - apps/web/tests/new-call-publish.spec.ts

key-decisions:
  - "Duel consensus pct nullable (callerPct/challengerPct: number | null) — TS narrowing makes a fabricated 50/50 render structurally impossible (F-A2, D-07)"
  - "CallCard conviction?: number optional + degrade-to-hidden; FeedList stops fabricating ?? 50 (F-A3, D-07)"
  - "Leaderboard RETRY = router.refresh() — the data arrives from page.tsx's RSC fetch, so there is no client refetch to call (F-B4)"
  - "ChallengeFormModal Escape guard includes the challenge receipt wait (new challengeConfirming from useWaitForTransactionReceipt) — fullest in-flight definition"
  - "Hash bucket copy renamed to 'Settlement window' in UI + both spec files; the D-12/PITFALL-12 traceability stays in code comments"

requirements-completed: [QUICK-260611-F7C]

duration: 14min
completed: 2026-06-11
---

# Quick Task 260611-f7c: UI/UX Review Remediation Sweep Summary

**All 19 verified review findings (F-A1..F-E19) fixed: 3 real bugs (dead isPending() indirection, fabricated 50/50 duel consensus, fabricated 50% conviction — both D-07 honesty violations), failure-state unification to the home-feed brutal-card pattern, role=dialog + guarded-Escape a11y on all four modals, and token/copy/icon compliance — receipt-page rendering untouched.**

## Tasks Completed

| Task | Name | Commit | Key Findings |
| ---- | ---- | ------ | ------------ |
| 1 | Real bugs + error/empty/loading state unification | 1a54655 | F-A1..A3, F-B4..B9 |
| 2 | Modal a11y — dialog semantics + guarded Escape | 30a6d4a | F-C10..C12 |
| 3 | Token compliance + copy/icon fixes | b33ad5d | F-D13..D15, F-E16..E19 |

## What Was Done

**Task 1 — real bugs + states (1a54655):**
- Settings: `disabled={isWritingHandle}` direct; dead hoisted `isPending()` helper deleted.
- Duel page: `callerPct`/`challengerPct` are now `number | null`; the consensus block gates on `callerPct !== null`, so no code path can render a fabricated even split. Unavailable notice upgraded to mono-uppercase `CONSENSUS DATA UNAVAILABLE`; comments rewritten to state the D-07 honest-degradation contract.
- CallCard: `conviction?: number` optional; the CONVICTION row renders only for a real number. FeedList passes `undefined` instead of fabricating `?? 50`. New ui test asserts a conviction-less call renders no CONVICTION text.
- Leaderboard: error state is a contained brutal-card (accent-loss border) with `Couldn't load the board. Retry.` + RETRY via `router.refresh()`; empty state is a contained brutal-card (`NO CALLERS RANKED YET`) with a `+ NEW CALL` Link to /new; h1 is `Top of Book` (no more collision with the home feed's "The Tape").
- Profile: empty state is a contained brutal-card with "Make your first call" CTA. Disputes: loading shows hard-edge skeleton blocks (duel-page recipe). Duels: empty copy is actionable ("Open any call and hit CHALLENGE to start a 1v1.").

**Task 2 — modal a11y (30a6d4a):**
One consistent pattern on all four modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` wired to an id on the real title element, and a window-keydown Escape close that is inert while a transaction/publish is in flight (mirroring each modal's backdrop/Cancel guard):
- ChallengeFormModal: inert during `approving || approveConfirming || challenging || challengeConfirming` (challenge receipt wait now consumed).
- PublishConfirmModal: inert during `isPublishing`; effect placed above the `if (!isOpen) return null` early return (rules of hooks).
- DisputeModal: inert during `isApproving || approveConfirming || isSubmitting`.
- ProvenanceModal: Escape closes unconditionally (no transaction); effect above the early return.

**Hard fence verified:** the committed diff in `apps/web/app/call/[id]/page.tsx` has exactly 6 hunks, all inside the `DisputeModal` and `ProvenanceModal` function bodies (git hunk context confirms). Zero receipt-rendering lines (stamps, h1, byline, P&L, share CTAs) touched.

**Task 3 — tokens + copy/icons (b33ad5d):**
- ProfileTabs: `var(--font-mono)` and `var(--accent-win)` replace `'monospace'`/`#E8F542` (3 + 2 occurrences).
- Duel page: `CALLER_ACCENT = 'var(--accent-win)'`, `DUEL_ACCENT = 'var(--accent-duel)'`; rgba tint literals untouched; stale `#A855F7` comment reworded.
- Disputes layout: `3px solid var(--border-active)` frame + `4px solid var(--accent-win)` corner brackets; hex-naming comments reworded so plain grep stays clean.
- AdvancedSettings: `CALL-64` removed from user-facing copy, preserved as JSX comment.
- DeadlinePicker: `↳ Settlement window: {bucketLabel}` + new helper line "Your call settles at the start of this UTC day — local times may differ."; `aria-label="UTC settlement window"`; both spec files (`utc-day-boundary.spec.ts`, `new-call-publish.spec.ts`) updated to assert the new copy.
- Icon: new `'menu'` glyph (`M3 6h18M3 12h18M3 18h18`, three equal lines, distinct from 'feed'); AppShell mobile hamburger uses it.
- Sidebar: Duels nav uses the existing crossed-swords `'duel'` glyph; Disputes keeps `'book'`.

## Verification Results

| Gate | Result |
| ---- | ------ |
| `pnpm --filter @call-it/ui test` | PASS — 9 files, 82/82 (incl. new optional-conviction test) |
| `pnpm --filter @call-it/web test` | PASS — 23 files, 206/206 (run after each task) |
| `pnpm --filter @call-it/web build` | PASS — exit 0 |
| role="dialog" count across the 3 modal files | 4 (DIALOGS-OK) |
| Grep gates (no #E8F542 in ProfileTabs/disputes layout; no `ACCENT = '#` in duel page; `icon: 'duel'` in Sidebar; `name="menu"` in AppShell) | TOKENS-OK |
| call/[id]/page.tsx containment | 6 hunks, all inside the two modal functions |
| Deletions in the 3 commits | none |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] ChallengeFormModal challenge receipt wait consumed for the Escape guard**
- **Found during:** Task 2
- **Issue:** The plan said to include the challenge receipt-wait `isLoading` "if a receipt wait consumes it" — the existing `useWaitForTransactionReceipt({ hash: challengeTxHash })` only destructured `isSuccess`, leaving a window where Escape could dismiss the modal while the challenge tx was confirming.
- **Fix:** Destructured `isLoading: challengeConfirming` and included it in the in-flight guard.
- **Files modified:** apps/web/app/components/ChallengeFormModal.tsx
- **Commit:** 30a6d4a

No other deviations — plan executed as written.

## Known Stubs

- `apps/web/app/duel/[challengeId]/page.tsx` — `followReserveFromState = 0n` / `fadeReserveFromState = 0n` placeholders remain (pre-existing; relayer live-state is the real source). This is now an HONEST stub: with zero reserves the consensus bar hides behind the `CONSENSUS DATA UNAVAILABLE` notice instead of rendering a fake 50/50. Wiring real reserves stays a relayer live-state follow-up.

## Threat Flags

None — UI-only remediation; no new network endpoints, auth paths, or trust-boundary changes. Both `<threat_model>` mitigations applied: T-f7c-01 (Escape inert in flight) and T-f7c-02 (fabricated consensus/conviction removed).

## Self-Check: PASSED

- All 21 modified files exist on disk: VERIFIED
- Commits 1a54655, 30a6d4a, b33ad5d exist on master: VERIFIED
- Artifacts: `conviction?:` in CallCard.tsx FOUND; `'menu'` in Icon.tsx FOUND; `Top of Book` in LeaderboardClient.tsx FOUND
- Key links: FeedList passes conviction without `?? 50` FOUND; `router.refresh` in LeaderboardClient FOUND; `icon: 'duel'` in Sidebar FOUND
