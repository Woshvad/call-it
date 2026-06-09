---
phase: 09-mobile-responsive-on-7-critical-pages
plan: 06
subsystem: web-frontend
tags: [responsive, mobile, useIsMobile, touch-target, signin, onboarding, D-03, UI-48, UI-49]

# Dependency graph
requires:
  - "apps/web/app/hooks/useIsMobile.ts — SSR-safe useIsMobile() hook (09-01)"
provides:
  - "apps/web/app/signin/page.tsx — 375px-safe sign-in: 400px column clamped to calc(100vw - 32px) at mobile (UI-48)"
  - "apps/web/app/onboarding/layout.tsx — 480px onboarding frame clamped to calc(100vw - 32px) at mobile; 5 subroutes inherit (UI-48)"
  - "apps/web/app/components/SocialLinkControls.tsx + apps/web/components/PrivyFundButton.tsx — >=44px touch targets at mobile (D-03)"
affects: [phase-09-08]

# Tech tracking
tech-stack:
  added: []  # zero new runtime deps
  patterns:
    - "Mobile-only style merge: `style={isMobile ? { minHeight: '44px' } : undefined}` (or spread `...touchTarget`) — desktop density preserved, D-03 floor applied only at <768px"
    - "Fixed-px column clamp: maxWidth flips to calc(100vw - 32px) at isMobile so a 400/480px column never overflows a 375px viewport (16px gutter each side)"

key-files:
  created: []
  modified:
    - apps/web/app/signin/page.tsx
    - apps/web/app/onboarding/layout.tsx
    - apps/web/app/onboarding/handle/page.tsx
    - apps/web/app/onboarding/socials/page.tsx
    - apps/web/app/onboarding/follow-graph/page.tsx
    - apps/web/app/onboarding/fund/page.tsx
    - apps/web/app/components/SocialLinkControls.tsx
    - apps/web/components/PrivyFundButton.tsx

decisions:
  - "D-03 touch-target gaps lived in shared children, not the subroute pages: the onboarding advance buttons that fall below 44px at mobile are size=md/sm Buttons in SocialLinkControls (socials route) and PrivyFundButton (fund route). Fixed the floor at the source component (mobile-only) so /onboarding/socials + /onboarding/fund pass the touch-target gate without per-route overrides; desktop density unchanged. SocialLinkControls is also used by /profile/.../settings (not a critical page) — the mobile-only change is a benign improvement there."
  - "tagline/page.tsx required no change despite being in files_modified: its Commit button is already size=lg (~56px >=44px) and the AUTH-21 commitment line wraps cleanly (no whiteSpace:nowrap) inside the clamped frame — verified by reading, no edit committed."
  - "Belt-and-suspenders frame clamp on onboarding: the outer main already pads 1rem (16px) each side, which alone constrains the width:100% frame at 375px. The plan's contract also requires the layout to `contains: useIsMobile`, so the frame maxWidth additionally flips to calc(100vw - 32px) at mobile — satisfies the artifact contract and hard-guarantees no overflow."

# Metrics
duration: 9min
completed: 2026-06-09
---

# Phase 9 Plan 06: Sign-in + Onboarding Mobile Retrofit Summary

**The lightest critical-page cluster (UI-48/UI-49): clamp the sign-in 400px centered column and the 480px onboarding frame to `calc(100vw - 32px)` at mobile so neither overflows a 375px viewport (RESEARCH divergence #3 — plan against the live 400px, not the unbuilt 480px UI-24 frame), and lift every sub-44px advance/action button + the handle input to a >=44px touch target at mobile only (D-03). Zero new dependencies, no `display:grid`.**

## Accomplishments

- **`apps/web/app/signin/page.tsx`** — imports + calls `useIsMobile()`; the centered `Card` `maxWidth` flips `400px → calc(100vw - 32px)` at mobile (keeps `width:'100%'`), killing the ~25px overflow at 375px. The 3 sign-in CTAs are `size="lg"` (~56px) so already clear the 44px floor — left unchanged. No 480px UI-24 corner-bracket frame introduced (Divergence #3).
- **`apps/web/app/onboarding/layout.tsx`** — imports + calls `useIsMobile()`; the inner 480px `Card` frame `maxWidth` flips to `calc(100vw - 32px)` at mobile (outer `2rem 1rem` padding already supplies the 16px gutter). The 5 subroutes inherit this clamp.
- **5 onboarding subroutes (D-03 touch targets, mobile-only):**
  - `handle/page.tsx` — handle `<input>` and the `size="md"` submit button get `minHeight:'44px'` at mobile.
  - `socials/page.tsx` — Continue (`size="md"`) + "Skip for now" (`size="sm"`) get `minHeight:'44px'` at mobile.
  - `follow-graph/page.tsx` — both opt-in/opt-out (`size="md"`) buttons get `minHeight:'44px'` at mobile.
  - `fund/page.tsx` — Copy (`size="sm"`) + Continue/Skip (`size="md"`) get `minHeight:'44px'` at mobile.
  - `tagline/page.tsx` — no change needed (Commit is `size="lg"` ~56px; the locked AUTH-21 commitment line wraps cleanly).
- **Shared children fixed at source (mobile-only):** `SocialLinkControls.tsx` (the `size="sm"`/`size="md"` link + unlink buttons rendered on `/onboarding/socials`) and `PrivyFundButton.tsx` (the `size="md"` fund button on `/onboarding/fund`) each gained a `useIsMobile()`-gated `minHeight:'44px'`. This is where the real sub-44px gaps lived — the subroute pages themselves only host their own advance buttons.

## Task Commits

1. **Task 1: Sign-in column clamp (UI-48)** — `fef0136` (feat)
2. **Task 2: Onboarding frame clamp + 5-subroute >=44px touch targets (UI-48/UI-49)** — `b8f39f4` (feat)

## Verification

- `cd apps/web && pnpm build` — exits 0 (warnings only, no errors) on both tasks.
- `playwright test responsive.spec.ts -g "Tier-1"` — 6/6 passed (server-snapshot D-02 lock, matchMedia containment, banner-absence, no-grid self-guard).
- `playwright test signin.spec.ts` — 6 passed / 6 Tier-2 skipped (no real Privy id, by design).
- `playwright test onboarding.spec.ts` — 15 passed / 4 Tier-2 skipped (no real Privy id, by design).
- `playwright test quote-composer.spec.ts -g "no CSS grid|Tier-1"` — no-grid regression guard intact.
- Tier-2 viewport tests (`no horizontal scroll` / `touch target` on `/signin` + the 5 `/onboarding/*` paths at 375/390px) are **skipped in CI** — they require a real `NEXT_PUBLIC_PRIVY_APP_ID` + `pnpm build` + `pnpm start` (idiom inherited from 09-01). The mobile clamps + 44px floors are encoded so those gated tests pass when run against a real Privy id.
- No `display:grid` added (grep of `apps/web/app/onboarding` returns 0).

## Decisions Made

1. **The 44px gaps were in shared children, not the subroute pages.** Each subroute's advance button is sub-44px because it uses the `size="md"` (~40px) or `size="sm"` (~32px) Button variant; the same is true of the link/unlink buttons inside `SocialLinkControls` and the fund button inside `PrivyFundButton`. Applying the mobile-only `minHeight:'44px'` at those component sources fixes `/onboarding/socials` + `/onboarding/fund` cleanly. `SocialLinkControls` is also consumed by `/profile/.../settings` (not a critical page) — the mobile-only change is a harmless improvement there and changes nothing on desktop.
2. **`tagline/page.tsx` needed no edit.** Listed in `files_modified`, but its Commit button is already `size="lg"` (~56px, `width:100%`) and the locked commitment line wraps without `whiteSpace:nowrap`. Verified by read; no edit committed (minimal-change principle).
3. **Frame clamp is belt-and-suspenders.** The outer `2rem 1rem` padding alone already constrains the `width:100%` frame to 343px at 375px, but the plan's artifact contract requires `layout.tsx` to `contains: useIsMobile`, so the frame `maxWidth` also flips to `calc(100vw - 32px)` at mobile — satisfying the contract and hard-guaranteeing no overflow.

## Deviations from Plan

**1. [Rule 2 — Missing critical functionality] Fixed sub-44px touch targets in shared child components, not just the subroute pages.**
- **Found during:** Task 2 (auditing each subroute's interactive elements against D-03).
- **Issue:** The plan scoped edits to the 5 subroute pages, but the actual sub-44px advance/action buttons on `/onboarding/socials` and `/onboarding/fund` render inside the shared `SocialLinkControls` and `PrivyFundButton` components (`size="sm"`/`size="md"` ≈ 32–40px). Fixing only the subroute files would leave those routes failing the `touch target >=44px` gate (UI-49 / D-03).
- **Fix:** Added a `useIsMobile()`-gated `minHeight:'44px'` to the link/unlink buttons in `SocialLinkControls.tsx` and the fund button in `PrivyFundButton.tsx` (mobile-only; desktop density preserved).
- **Files modified:** `apps/web/app/components/SocialLinkControls.tsx`, `apps/web/components/PrivyFundButton.tsx`.
- **Commit:** `b8f39f4`.

## Known Stubs

None. No placeholder data, no hardcoded empties, no "coming soon" introduced. All edits are layout/sizing on existing wired surfaces.

## Threat Flags

None. Per the plan's threat register (T-09-06-01/02/SC): the sign-in CTAs invoke the existing Privy paths unchanged (containers resized only); onboarding edits are layout/sizing on existing forms (no new field, data read, auth path, or endpoint); zero package installs (supply-chain gate N/A).

## Self-Check: PASSED

- [x] `apps/web/app/signin/page.tsx` exists + contains `useIsMobile` and `calc(100vw - 32px)`
- [x] `apps/web/app/onboarding/layout.tsx` exists + contains `useIsMobile` and `calc(100vw - 32px)`
- [x] `apps/web/app/components/SocialLinkControls.tsx` + `apps/web/components/PrivyFundButton.tsx` contain mobile `minHeight:'44px'`
- [x] Commit `fef0136` (Task 1) in git log
- [x] Commit `b8f39f4` (Task 2) in git log
- [x] `pnpm build` exits 0; onboarding.spec.ts + responsive Tier-1 green; no `display:grid`

---
*Phase: 09-mobile-responsive-on-7-critical-pages*
*Completed: 2026-06-09*
