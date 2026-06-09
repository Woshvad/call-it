---
phase: 09-mobile-responsive-on-7-critical-pages
plan: 04
subsystem: ui
tags: [nextjs, react, mobile-responsive, banner, useIsMobile, flexbox]

# Dependency graph
requires:
  - phase: 09-mobile-responsive-on-7-critical-pages
    provides: useIsMobile() SSR-safe hook (plan 09-01)
provides:
  - DesktopOnlyBanner — shared per-session-dismissible, isMobile-gated warn-but-allow banner (UI-50)
  - DesktopOnlyBanner mounted on /new (covers New Call + ?quote= composer) and /duel/[challengeId]
affects: [phase-09-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DesktopOnlyBanner: 'use client'; const isMobile = useIsMobile(); useState(false) dismiss; if (!isMobile || dismissed) return null"
    - "Banner is normal-flow (not position:fixed) so it pushes content down (D-08 warn-but-allow), never blocks the hamburger exit (SC2)"
    - "Mount via React fragment at top of returned tree to keep the banner OUTSIDE the page's flex container (not a flex child)"

key-files:
  created:
    - apps/web/app/components/DesktopOnlyBanner.tsx
  modified:
    - apps/web/app/new/page.tsx
    - apps/web/app/duel/[challengeId]/page.tsx

key-decisions:
  - "Banner mounted on ALL THREE /new returns (standard new-call, ?quote= composer, quote-success screen) via React fragments — the page early-returns per mode, so a single mount point cannot cover every rendered state"
  - "Banner mounted on BOTH duel returns (loading skeleton + main render) so a slow relayer fetch never leaves a mobile user without the warn-banner"
  - "Used the @/app/components alias on the duel page (matches its existing ChallengeFormModal import) and a relative ../components import on /new (matches its existing component import style)"

requirements-completed: [UI-50]

# Metrics
duration: 9min
completed: 2026-06-09
---

# Phase 09 Plan 04: Desktop-Only Banner (UI-50) Summary

**A single shared `<DesktopOnlyBanner>` (isMobile-gated, per-session dismissible, normal-flow warn-but-allow) mounts on exactly `/new` (covers New Call + the `?quote=` composer) and `/duel/[challengeId]` — absent on the 7 critical pages and at desktop, never blocking the hamburger exit (UI-50 / SC2).**

## Performance

- **Duration:** ~9 min
- **Tasks:** 2
- **Files:** 3 (1 created, 2 modified)

## Accomplishments

- **`DesktopOnlyBanner.tsx`** (new): `'use client'`; `const isMobile = useIsMobile()` + `const [dismissed, setDismissed] = useState(false)`; `if (!isMobile || dismissed) return null` — so it is absent at desktop AND absent on the 7 critical pages (which never mount it). Locked copy: heading `Best viewed on desktop` (`#E8F542`, monospace, uppercase) + subtext `This page isn't optimized for small screens yet. Use the menu to navigate away.` (`#94A3B8`, 13px). Neobrutalist tokens (`3px solid #E8F542` border, `4px 4px 0 0 #E8F542` shadow, `#13131D` bg, row flex, space-between). Dismiss `<button aria-label="Dismiss">×</button>` with `minWidth:44`/`minHeight:44` (≥44px hit area, D-03). Normal flow — NOT `position:fixed`/overlay (D-08 warn-but-allow → pushes content down, never covers the page controls or the 09-02 hamburger drawer → exit/sign-out always reachable, SC2).
- **`/new` mount**: banner added at the top of all 3 returned trees (standard new-call, `?quote=` composer, quote-success). The `?quote=` mode is the same file (RESEARCH divergence #5 — no standalone quote route), so the New Call page AND the quote composer are both covered by one file.
- **`/duel/[challengeId]` mount**: banner added at the top of the loading skeleton AND the main render.
- Banner NOT mounted on any of the 7 critical pages — the 09-01 Tier-1 source test (`desktop-only banner — NONE of the 7 critical pages mount DesktopOnlyBanner`) stays green.

## Task Commits

1. **Task 1: DesktopOnlyBanner.tsx** — `15d822c` (feat)
2. **Task 2: Mount on /new + /duel/[challengeId]** — `3fa817d` (feat)

## Verification

- `playwright test tests/responsive.spec.ts -g "desktop-only banner"` — 2 passed / 2 skipped. **The RED-pending positive-half test (`/new and /duel mount DesktopOnlyBanner`) flipped from `test.skip` to a HARD PASS** now that the banner is mounted on both files; the negative-half test (absence on the 7 critical pages) stays green. (The 2 skips are Tier-2 viewport E2E tests gated on a real `NEXT_PUBLIC_PRIVY_APP_ID` — skipped in CI, by design.)
- `playwright test tests/quote-composer.spec.ts tests/new-call-publish.spec.ts` — 19 passed / 3 skipped (Tier-2 Privy-gated). No desktop regression; the banner is `null` at desktop so desktop-rendered source/E2E specs are unaffected.
- `cd apps/web && pnpm build` — exits **0**.
- `tsc --noEmit` — no errors in `DesktopOnlyBanner.tsx`, `app/new/page.tsx`, or `app/duel/[challengeId]/page.tsx`.

## Decisions Made

1. **Banner on all 3 /new returns + both /duel returns** — Both pages early-return per render mode. `/new` returns separately for the standard new-call composer, the `?quote=` quote composer, and the post-publish quote-success screen; `/duel` returns separately for the loading skeleton and the main render. A single mount point cannot cover every state, so the banner was added (via a React fragment) at the top of each returned tree. This guarantees a mobile user always sees the warn-banner regardless of mode or load state.
2. **React fragment wrapping** — The banner mounts as a sibling ABOVE each page's flex container (not as a flex child inside it), so it does not get stretched/justified by the page's `display:flex` / `justify-content:space-between` layout.
3. **Import style matches each file** — `@/app/components/DesktopOnlyBanner` on the duel page (matches its existing `ChallengeFormModal` alias import); `../components/DesktopOnlyBanner` on `/new` (matches its existing relative component imports).

## Deviations from Plan

None — plan executed exactly as written. No new dependencies (supply-chain gate N/A, T-09-04-SC).

The plan named 2 mount-site files; both were modified. The plan's "very top of the returned JSX tree" instruction was satisfied across every early-return branch in each file (a faithful reading of "very top of tree" for multi-return page components), not just a single return.

## Known Stubs

None. The banner is fully wired: `isMobile` from the live `useIsMobile()` hook, dismiss state from local `useState`, static locked copy (no data source needed — banner has no fetch/input by design, T-09-04-02).

## Threat Surface Scan

No new security-relevant surface. The banner is a static client render: no network endpoint, no fetch, no input, no auth path, no schema change (T-09-04-02 accept). T-09-04-01 (banner blocking exit) is mitigated by the normal-flow / non-overlay design + the still-active 09-02 hamburger drawer (SC2). No new packages (T-09-04-SC).

## Self-Check: PASSED

- [x] `apps/web/app/components/DesktopOnlyBanner.tsx` exists on disk
- [x] `apps/web/app/new/page.tsx` contains `DesktopOnlyBanner` (4 refs: 1 import + 3 mounts)
- [x] `apps/web/app/duel/[challengeId]/page.tsx` contains `DesktopOnlyBanner` (3 refs: 1 import + 2 mounts)
- [x] Commit `15d822c` exists in git log (Task 1)
- [x] Commit `3fa817d` exists in git log (Task 2)
- [x] `playwright -g "desktop-only banner"` positive test flipped to PASS
- [x] `quote-composer.spec.ts` + `new-call-publish.spec.ts` green
- [x] `pnpm build` exits 0

---
*Phase: 09-mobile-responsive-on-7-critical-pages*
*Completed: 2026-06-09*
