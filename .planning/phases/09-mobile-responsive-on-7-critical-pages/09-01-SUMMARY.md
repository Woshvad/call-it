---
phase: 09-mobile-responsive-on-7-critical-pages
plan: 01
subsystem: web-frontend
tags: [responsive, useSyncExternalStore, matchMedia, playwright, ssr, mobile-first]

# Dependency graph
requires: []
provides:
  - "apps/web/app/hooks/useIsMobile.ts — SSR-safe useIsMobile() hook (getServerSnapshot=>true, D-01/D-02)"
  - "apps/web/tests/responsive.spec.ts — Wave-0 Playwright mechanical gate (UI-48/49/50/SC3) with the named -g filters later Phase-9 plans verify against"
affects: [phase-09-02, phase-09-03, phase-09-04, phase-09-05, phase-09-06, phase-09-07, phase-09-08]

# Tech tracking
tech-stack:
  added: []  # zero new runtime deps — react@19, next@16, @playwright/test@1.60 all present
  patterns:
    - "SSR-safe viewport detection via useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot=>true) — mobile-first first paint, no hydration mismatch under force-dynamic"
    - "Responsive Playwright gate: Tier-1 readFileSync source assertions (always run, no Privy id) + Tier-2 viewport E2E gated on real NEXT_PUBLIC_PRIVY_APP_ID; viewport set in-spec per-width (Pitfall 6)"

key-files:
  created:
    - apps/web/app/hooks/useIsMobile.ts
    - apps/web/tests/responsive.spec.ts
  modified: []

decisions:
  - "Hook ordering: created useIsMobile.ts (Task 1) before responsive.spec.ts (Task 2) so the spec's server-snapshot Tier-1 assertion has a real file to read; both committed atomically"
  - "RED-pending tests use test.skip(<predicate>) (not test.fixme) so the Wave-0 gate is GREEN now and flips to a hard assertion automatically once 09-03 (data-outcome-word, action-row marker) and 09-04 (banner mount) land"
  - "SEEDED_SETTLED_CALL = process.env.RESPONSIVE_SETTLED_CALL_ID ?? '14' — operator can repoint the seeded settled-receipt id without editing assertions (Open Question 1)"

# Metrics
duration: 6min
completed: 2026-06-09
---

# Phase 9 Plan 01: Mobile-Responsive Foundation Summary

**SSR-safe `useIsMobile()` hook (`useSyncExternalStore` with `getServerSnapshot()=>true`, mobile-first first paint per D-02) plus the `responsive.spec.ts` Wave-0 Playwright mechanical gate that encodes the UI-48/49/50/SC3 named `-g` filters every later Phase-9 plan verifies against — zero new runtime dependencies.**

## Accomplishments

- **`apps/web/app/hooks/useIsMobile.ts`** — `'use client'` module exporting a named `useIsMobile(): boolean`. Internals: `QUERY = '(max-width: 767px)'` (single breakpoint, `< 768px ⇒ mobile`, D-01 Claude's-discretion), `subscribe` registers `matchMedia('change')` via `addEventListener` (never the deprecated `addListener`) with a `removeEventListener` cleanup and a `()=>{}` no-op SSR guard, `getSnapshot` returns the real `matchMedia` value (guarded to `true` when `window`/`matchMedia` is undefined), and `getServerSnapshot` returns `true` (D-02 lock). `useIsMobile() === useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`. Lives in `apps/web` ONLY (Pitfall 2 — keeps `matchMedia` out of the Satori/`@vercel/og` Node build path).
- **`apps/web/tests/responsive.spec.ts`** — Wave-0 mechanical gate. Sets `375` AND `390` viewports in-spec via `test.use({ viewport: { width, height: 812 } })` per-width describe blocks (Pitfall 6 — the lone Playwright project is Desktop Chrome; a viewport-less spec passes vacuously). Encodes the named tests the VALIDATION map + later plans cite: `no horizontal scroll`, `touch target >=44px`, `single column / full-width`, `outcome word legible — settled receipt`, `desktop-only banner`, and `server snapshot`. Tier-1 source assertions (server-snapshot, matchMedia containment, banner-absence-on-critical-pages, no-grid-self-guard) run with NO Privy id; Tier-2 viewport E2E is gated on a real `NEXT_PUBLIC_PRIVY_APP_ID` (idiom copied from `signin.spec.ts`). `SEEDED_SETTLED_CALL` overridable via env.

## Task Commits

1. **Task 1: SSR-safe useIsMobile() hook** — `54aa63f` (feat)
2. **Task 2: responsive.spec.ts Wave-0 mechanical gate** — `96b0726` (test)

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` — no errors in either new file (pre-existing errors in `farcaster-embed.test.ts` / `farcaster-manifest.test.ts` are out of scope — they predate this plan at commit `0236f3d`, logged below).
- `playwright test tests/responsive.spec.ts -g "server snapshot|desktop-only banner|matchMedia|no display:grid"` — **5 passed, 3 skipped** (RED-pending banner-positive + Tier-2 viewport tests by design). The `server snapshot` Tier-1 assertion (D-02 lock) is GREEN.
- `playwright test tests/quote-composer.spec.ts -g "Tier-1|no CSS grid"` — **5/5 passed** (no-grid regression guard intact).
- `grep matchMedia packages/ui/src` — **0 matches** (Pitfall 2 containment proven).

## Decisions Made

1. **Task ordering (hook then spec).** The plan lists the TDD hook as Task 1 and the spec as Task 2, but Task 1's verify references the spec's `server snapshot` test. Resolved by creating the hook first so the spec's Tier-1 `readFileSync` assertion reads a real file, then the spec — both committed atomically within the same plan.
2. **`test.skip(predicate)` for RED-pending tests, not `test.fixme`.** The banner-positive (`/new`+`/duel`), `data-outcome-word`, and receipt-action-row tests cannot pass until 09-03/09-04 land. Using a runtime `test.skip(<not-yet-built>)` keeps the Wave-0 gate GREEN now and auto-flips to a hard assertion the moment the marker/banner exists — no manual re-enabling needed.
3. **Env-overridable seeded id.** `SEEDED_SETTLED_CALL = process.env.RESPONSIVE_SETTLED_CALL_ID ?? '14'` lets the operator repoint the settled-receipt fixture (Open Question 1) without touching assertions.

## Deviations from Plan

None — plan executed exactly as written. (Task ordering and `test.skip` mechanism were within the plan's stated latitude: the plan explicitly permits the banner source tests to be "written as `.fixme`/conditional until 09-04 lands" and gates on the server-snapshot test being green now.)

## Out-of-Scope Discoveries (logged, NOT fixed)

- Pre-existing `tsc` errors in `apps/web/tests/farcaster-embed.test.ts` (TS2345, missing `children` prop) and `apps/web/tests/farcaster-manifest.test.ts` (TS6307, `.well-known/farcaster.json/route.ts` not in tsconfig file list). These predate this plan (Phase 8 commit `0236f3d`) and are unrelated to the responsive foundation. Not fixed per the scope boundary.

## Known Stubs

The RED-pending tests are intentional Wave-0 scaffolding, not stubs that block this plan's goal:

| Item | File | Resolves in |
|------|------|-------------|
| `desktop-only banner` positive half (banner on `/new`+`/duel`) | `responsive.spec.ts` | Plan 09-04 (mounts `DesktopOnlyBanner`) |
| `outcome word legible` + `single column` action-row markers (`[data-outcome-word]`, `[data-receipt-action-row]`) | `responsive.spec.ts` | Plan 09-03 (Receipt slice owns `call/[id]/page.tsx`) |
| `no horizontal scroll` / `touch target` viewport tests | `responsive.spec.ts` | Gated on real Privy app id + per-page retrofit plans 09-02..09-07 |

This plan's own goal (the hook + the runnable gate harness with the green server-snapshot lock) is fully achieved.

## Threat Flags

None. This plan adds no network endpoint, input, auth path, or schema change — `matchMedia` is a read-only viewport query and the spec is a test file. T-09-01-02 (hook OG-build leak) mitigated and proven (0 `matchMedia` in `packages/ui/src`). T-09-01-01 / T-09-01-SC (supply-chain) moot — zero installs.

## Self-Check: PASSED

- [x] `apps/web/app/hooks/useIsMobile.ts` exists on disk
- [x] `apps/web/tests/responsive.spec.ts` exists on disk
- [x] Commit `54aa63f` (Task 1) exists in git log
- [x] Commit `96b0726` (Task 2) exists in git log
- [x] `server snapshot` Tier-1 assertion GREEN; `matchMedia` 0 in packages/ui/src; quote-composer no-grid intact

---
*Phase: 09-mobile-responsive-on-7-critical-pages*
*Completed: 2026-06-09*
