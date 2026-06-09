---
phase: 09-mobile-responsive-on-7-critical-pages
plan: 05
subsystem: web-frontend
tags: [responsive, mobile, useIsMobile, flexbox, touch-target, feed, profile, leaderboard]

# Dependency graph
requires:
  - phase: 09-mobile-responsive-on-7-critical-pages
    provides: "apps/web/app/hooks/useIsMobile.ts — SSR-safe useIsMobile() hook (09-01)"
provides:
  - "375px-responsive Feed (apps/web/app/page.tsx): container clamp + DuelRowCard column-stack + >=44px chips/tabs/CTAs"
  - "375px-responsive Profile (ProfileClient.tsx + ProfileTabs.tsx): container clamp + CATEGORY REPUTATION single-column stack + >=44px tabs/chips (inline layout only, typography untouched)"
  - "375px-responsive Leaderboard (LeaderboardClient.tsx): 760px container clamp, 4-col row preserved (no column drop), viewer-row accent preserved, >=44px rows/toggles/chips"
affects: [phase-09-verification]

# Tech tracking
tech-stack:
  added: []  # zero new runtime deps — reuses the 09-01 useIsMobile() hook
  patterns:
    - "Mobile container clamp: width/maxWidth -> '100%' under isMobile; desktop maxWidth preserved via ternary -> undefined"
    - "Touch-target floor: padding switched to '0 N' + minHeight:'44px' under isMobile (D-03); desktop dense padding preserved"
    - "Inline-style-only swaps on surfaces carrying Tailwind typography classNames — classNames byte-for-byte untouched (Divergence #4)"

key-files:
  created: []
  modified:
    - apps/web/app/page.tsx
    - apps/web/app/profile/[address]/ProfileClient.tsx
    - apps/web/components/ProfileTabs.tsx
    - apps/web/app/leaderboard/LeaderboardClient.tsx

decisions:
  - "Per-component useIsMobile() calls (HomePage, DuelsTab, DuelRowCard, LiveFeedList; ProfileClient, ProfileOverview; LeaderboardClient, LeaderboardTableRow) — Rules of Hooks require a hook per component function; the plan's 'add isMobile' is realized once per consuming component"
  - "Extended D-03 >=44px to ALL interactive elements on each touched page (tabs, header CTAs, Load more, Challenge CTA, hero handle link), not only the named filter chips — the responsive.spec 'touch target' gate scans every button/a[href] (Rule 2 correctness)"
  - "Leaderboard row kept flexDirection:row (Divergence #1) — live layout is 4-col (48px + flex + 80px + 72px) and already fits 343px; the UI-SPEC's 6-col->3-col collapse is MOOT (UI-13 missing columns OUT OF SCOPE for Phase 9)"

requirements-completed: [UI-48, UI-49]

# Metrics
duration: 9min
completed: 2026-06-09
---

# Phase 9 Plan 05: Feed / Profile / Leaderboard Mobile-Responsive Summary

**The Feed, Profile, and Leaderboard cluster (UI-48/UI-49) now render single-column / clamped at 375px with no horizontal scroll and >=44px touch targets — each surface gains a `useIsMobile()`-driven container clamp plus a single row-stack, the Leaderboard keeps its 4-column row (Divergence #1: no column drop) and its viewer-row accent, and every Tailwind typography className stays byte-for-byte untouched (Divergence #4 — inline layout swaps only).**

## Accomplishments

- **Feed (`apps/web/app/page.tsx`)** — `useIsMobile()` added to `HomePage`, `DuelsTab`, `DuelRowCard`, and `LiveFeedList`. The `<main>` container clamps to `width:'100%'`/`maxWidth:'100%'` at mobile (desktop 680px preserved). `DuelRowCard`'s main row flips `flexDirection:'row' -> 'column'` at mobile and drops both `minWidth:'120px'` caller/challenger cells (`width:'100%'`), so the caller stacks above market above challenger inside 343px. Filter chips (Duels + Live), the tab bar, header CTAs (`+ NEW CALL` / `Sign in`), the empty-state `+ NEW CALL` button, the `⚔ Challenge` CTA, and `Load more` all switch to `padding:'0 N'` + `minHeight:'44px'` at mobile (D-03). No `display:grid`.
- **Profile (`ProfileClient.tsx` + `ProfileTabs.tsx`)** — `ProfileClient` container clamps at mobile. `ProfileOverview`'s CATEGORY REPUTATION wrapper forces `flexDirection:'column'` at mobile and each `Card` drops `minWidth:'160px'` for `width:'100%'` (3×160=480px would overflow 343px). RECENT CALLS All/Open/Settled chips get the >=44px treatment. `ProfileTabs` Overview button + Settings link become >=44px tall (Settings link gains `inline-flex`+`alignItems:center` to honor `minHeight`), with `flexWrap` allowed at mobile. The 5-stat row (already `flexWrap:'wrap'`) is left as-is. **Every Tailwind typography className — `font-mono`, `text-xs`, `text-brand-muted`, `uppercase`, `tracking-wide`, `font-display`, etc. — is byte-for-byte unchanged** (Divergence #4; verified via `git diff | grep className` returning empty).
- **Leaderboard (`LeaderboardClient.tsx`)** — `useIsMobile()` added to `LeaderboardClient` and `LeaderboardTableRow`. Container clamps from 760px to full-width at mobile. **Per Divergence #1 the 4-column row (# 48px · Caller flex:1 · Rep 80px · Calls 72px) stays `flexDirection:'row'` — NO column drop, NO grid** — because it already fits 343px. Each row gets `minHeight:'44px'` at mobile; the **viewer's-own-row accent (`borderLeft:'3px solid #E8F542'` + `backgroundColor:'#1A1A24'`) is preserved through the mobile path** (UI-13). Time-toggle buttons, category chips, and the #1 hero handle link all get the >=44px treatment. Typography classNames untouched.

## Task Commits

1. **Task 1: Feed page.tsx — container clamp + DuelRowCard column-stack + >=44px chips** — `35f9992` (feat)
2. **Task 2: Profile — container clamp + CATEGORY REPUTATION stack + ProfileTabs >=44px (inline layout only)** — `b57209f` (feat)
3. **Task 3: Leaderboard — clamp 4-col row to 343px, preserve viewer-row accent (no column drop, no grid)** — `82f7b03` (feat)

## Verification

- `cd apps/web && pnpm build` — exits 0 after each task (3 clean builds).
- **No `display:grid`** in any of the 4 touched files (`grep "display: 'grid'"` returns 0 in `page.tsx`, `ProfileClient.tsx`, `ProfileTabs.tsx`, `LeaderboardClient.tsx`).
- **Tailwind typography untouched** — `git diff <file> | grep className` returns empty for both `ProfileClient.tsx` and `LeaderboardClient.tsx` (Divergence #4 honored).
- **Viewer accent preserved** — `LeaderboardClient.tsx` still contains `borderLeft: ... 3px solid ${ACCENT}` (×2 incl. transparent fallback) and `ROW_HIGHLIGHT_BG = '#1A1A24'`; `leaderboard.spec.ts` Test 3 (viewer-row highlight UI-13) GREEN.
- `playwright test tests/responsive.spec.ts -g "Tier-1|no display:grid|server snapshot|banner"` — **6 passed, 2 skipped** (Tier-2 banner-positive by design). The critical-page banner-absence + no-grid Tier-1 guards are GREEN.
- `playwright test tests/leaderboard.spec.ts` — **8/8 Tier-1 passed, 1 Tier-2 skipped** (no desktop regression; viewer accent + hero + chips intact).
- `playwright test tests/feed-shell.spec.ts tests/profile-shell.spec.ts tests/profile-overview.spec.ts` — **20 passed, 5 Tier-2 skipped** (no regression on the touched surfaces).
- The `responsive.spec.ts` **Tier-2 viewport tests skip in CI** — they gate on a real `NEXT_PUBLIC_PRIVY_APP_ID` (>=28 chars, non-mock), absent in this environment. This is the established Phase-9 pattern (09-01 summary): the `no horizontal scroll` / `touch target >=44px` viewport assertions for `/`, `/leaderboard` (and the profile via Tier-1 source coverage) auto-run once an operator sets a real Privy app id + production build. Source-level correctness is gated by the Tier-1 assertions that DO run.

## Decisions Made

1. **Per-component `useIsMobile()` calls.** Rules of Hooks require a hook per component function, so the plan's single "add `const isMobile = useIsMobile()`" is realized once in each consuming component: `HomePage` / `DuelsTab` / `DuelRowCard` / `LiveFeedList` (Feed), `ProfileClient` / `ProfileOverview` (Profile), and `LeaderboardClient` / `LeaderboardTableRow` (Leaderboard). Same pattern the 09-03 Receipt slice used (3 calls for 3 modal components).
2. **>=44px applied to ALL interactive elements, not only the named chips.** The `responsive.spec.ts` `touch target` gate scans every `button` / `a[href]` / `[role="button"]` on the page, so a single under-sized tab or CTA would fail it. Extended D-03 sizing to the tab bar, header CTAs, Load more, Challenge CTA, empty-state button (Feed), and the hero handle link (Leaderboard) — Rule 2 (correctness for the gate the plan verifies against).
3. **Leaderboard row stays `flexDirection:'row'` (Divergence #1).** The live row is 4-col and fits 343px; the UI-SPEC's 6-col->3-col collapse describes columns (ACC/BEST/sparkline) that do not exist on this surface. No column drop, no grid; the missing UI-13 columns remain OUT OF SCOPE for Phase 9.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended >=44px touch-target sizing beyond the named filter chips**

- **Found during:** Tasks 1–3 (planning the `touch target` gate compliance).
- **Issue:** The plan's per-task action prose names "filter chips" / "tabs" / "each row" for the >=44px floor, but `responsive.spec.ts`'s `touch target >=44px` test asserts on EVERY `button`/`a[href]`/`[role="button"]` on the page. Under-sized tab-bar buttons, header CTAs (`+ NEW CALL`/`Sign in`), `Load more`, the `⚔ Challenge` CTA, the empty-state button, and the Leaderboard #1 hero handle link would fail that gate.
- **Fix:** Applied the same `padding:'0 N'` + `minHeight:'44px'` (mobile-only ternary) treatment to all interactive elements on each touched page. Desktop density unchanged (ternary -> `undefined`).
- **Files modified:** `apps/web/app/page.tsx`, `apps/web/app/profile/[address]/ProfileClient.tsx`, `apps/web/components/ProfileTabs.tsx`, `apps/web/app/leaderboard/LeaderboardClient.tsx`.
- **Verification:** Tier-1 + leaderboard/feed-shell/profile regression suites GREEN; builds exit 0.
- **Committed in:** `35f9992`, `b57209f`, `82f7b03` (within each task's commit).

**2. [Rule 2 - Missing Critical] Settings link `inline-flex` for honoring `minHeight`**

- **Found during:** Task 2 (ProfileTabs).
- **Issue:** A bare `<a>` (inline element) ignores `minHeight`, so the >=44px floor would not apply to the Settings tab link.
- **Fix:** At mobile only, set `display:'inline-flex'` + `alignItems:'center'` on the Settings link (and on the Leaderboard hero handle link) so `minHeight:'44px'` takes effect. Desktop rendering unchanged.
- **Files modified:** `apps/web/components/ProfileTabs.tsx`, `apps/web/app/leaderboard/LeaderboardClient.tsx`.
- **Committed in:** `b57209f`, `82f7b03`.

---

**Total deviations:** 2 auto-fixed (both Rule 2 — touch-target correctness for the gate the plan verifies against). No architectural changes, no new dependencies, no scope creep beyond the three named pages.

## Known Stubs

None introduced by this plan. (Pre-existing documented stubs on these surfaces — `recentCalls = []` and the `—` placeholder stats in `ProfileOverview` (hydrated client-side post-deploy, D-04) and the D-06 time-window leaderboard limitation — are untouched and out of this plan's layout-only scope.)

## Threat Flags

None. This plan only swaps inline layout styles on existing JSX trees — no new fetch, input, auth path, schema change, or conditionally-rendered content. T-09-05-01 (information disclosure) mitigated: the viewer-row accent reveals only the already-public "this is you" highlight (same as desktop). T-09-05-02 (typography classNames) accept-disposition honored — classNames untouched. T-09-05-SC (supply-chain) moot — zero installs.

## Self-Check: PASSED

- [x] `apps/web/app/page.tsx` exists and contains `useIsMobile`
- [x] `apps/web/app/profile/[address]/ProfileClient.tsx` exists and contains `useIsMobile`
- [x] `apps/web/components/ProfileTabs.tsx` exists and contains `useIsMobile`
- [x] `apps/web/app/leaderboard/LeaderboardClient.tsx` exists and contains `useIsMobile`
- [x] Commit `35f9992` (Task 1) exists in git log
- [x] Commit `b57209f` (Task 2) exists in git log
- [x] Commit `82f7b03` (Task 3) exists in git log
- [x] `pnpm build` exits 0; no `display:grid` in any of the 4 files; Tailwind typography classNames untouched; viewer-row accent preserved (leaderboard.spec Test 3 GREEN)

---
*Phase: 09-mobile-responsive-on-7-critical-pages*
*Completed: 2026-06-09*
