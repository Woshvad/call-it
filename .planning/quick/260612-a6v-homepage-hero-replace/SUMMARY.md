---
phase: quick-260612-a6v
plan: 260612-a6v
subsystem: ui
tags: [nextjs, react, privy, landing, design-canon, vitest, playwright]

# Dependency graph
requires:
  - phase: quick-260612-8wk
    provides: HowItWorksModal (Polymarket-style explainer; props open/onClose/onPrimaryCta)
  - phase: 09.2-design-adoption
    provides: D-12 logged-out landing = /signin; D-33 SignInButtons order; AUTH-37/38 pins
provides:
  - Acid-hero logged-out landing at /signin (design-verbatim from `call it homepage/CALL IT Hero.dc.html`)
  - Always-mounted display-toggled signin modal hosting the untouched Privy rail (cookie self-heal preserved)
  - Public /calls route (tape re-export, public via middleware's existing '/call' startsWith prefix)
  - apps/web/public/brand/callit-mark.png logo asset (static-imported)
  - landing-hero.test.ts regression pins (removals, CTA wiring, always-mounted invariant, asset honesty, /calls dependency, keyframes)
affects: [signin, middleware-public-prefixes, visual-smoke, hackathon-demo]

# Tech tracking
tech-stack:
  added: [next/font/google Archivo_Black + Archivo (page-local)]
  patterns: ["ci-prefixed page-local <style> classes for hover/media overrides (inline style beats stylesheet)", "always-mounted display-toggled modal for effect-bearing children", "static next/image import to dodge the middleware matcher"]

key-files:
  created:
    - apps/web/app/calls/page.tsx
    - apps/web/public/brand/callit-mark.png
    - apps/web/tests/landing-hero.test.ts
  modified:
    - apps/web/app/signin/page.tsx
    - apps/web/app/components/HowItWorksModal.tsx
    - apps/web/tests/signin.spec.ts
    - apps/web/tests/how-it-works-modal.test.ts

key-decisions:
  - "Signin modal wrapper is ALWAYS-MOUNTED (display-toggled + aria-hidden) so SignInButtons' privy-token cookie-write/self-heal effect runs on page load"
  - "/calls is public via the existing '/call' PUBLIC_PREFIX startsWith match — zero middleware change; landing-hero.test.ts mirror-reads the prefix"
  - "Logo via static import (served from /_next/static/media/*) — a raw /brand/ URL would 307-bounce logged-out visitors through the middleware matcher"
  - "HowItWorksModal STEPS is now the SINGLE copy canon (signin HOW_IT_WORKS duplicate deleted); lockstep test re-anchored to modal + mount linkage"

patterns-established:
  - "ci- class prefix for page-local styles to avoid globals.css collisions"
  - "Design-canon HTML files under 'call it homepage/' are READ-ONLY reference, never staged"

requirements-completed: [QUICK-260612-A6V]

# Metrics
duration: 11min
completed: 2026-06-12
---

# Quick 260612-a6v: Homepage Hero Replace Summary

**Logged-out landing (/signin) rewritten to the acid-hero design canon — #D4F500 frame, glass nav with a single How-it-works pill, always-mounted signup modal on the untouched Privy rail, and a new public /calls tape route for See Live Calls**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-06-12T06:30:50Z
- **Completed:** 2026-06-12T06:41:30Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments
- Full design-verbatim rewrite of `apps/web/app/signin/page.tsx`: #D4F500 frame (14px padding), #0A0A0A rounded-28px panel, 3 atmosphere layers (glass columns, top glow, animated ci-bloom), glass nav, ci-pulse badge ("Stake smarter · Call it public"), `clamp(64px, 8.6vw, 124px)` Archivo Black "BE RIGHT / IN PUBLIC." headline, 2 CTAs, and the 3 staggered glass demo cards (veda / jaxon.eth / degen_oracle) with hover transforms
- Three user deltas applied exactly: (1) Market/Leaderboard/Dashboard pills → ONE "How it works" pill opening the existing HowItWorksModal (whose CTA chains into the signup modal); (2) "See Live Calls" → new public /calls route; (3) "MAKE YOUR FIRST CALL →" + "Sign In →" open the signup modal hosting the verbatim Privy rail (PrivyErrorBoundary, CustodyTooltip, ssr:false SignInButtons, AUTH-37 disclaimer)
- Cookie self-heal invariant preserved and regression-guarded: modal is display-toggled + aria-hidden, never conditionally rendered around SignInButtons
- 375px responsive via page-local ci- classes + one media query (nav/CTA wrap, cards stack center-first with rotations zeroed); desktop >=861px is the staggered design exactly
- Test pins migrated honestly (D-15): signin.spec.ts Tier 1 clamp + pulse-badge pins, Tier 2 modal-open steps + signin-modal-buttons scoping; how-it-works lockstep re-anchored to modal-as-single-canon; new landing-hero.test.ts (9 pins)

## Task Commits

Single atomic commit per plan:

1. **Tasks 1-4: acid hero + /calls + canon re-anchor + test migration** - `880c5cb` (feat)

## Files Created/Modified
- `apps/web/app/signin/page.tsx` - The acid-hero landing (full rewrite; 4 donor blocks carried verbatim)
- `apps/web/app/calls/page.tsx` - Public live-calls route; header-documented re-export of the tape (`export { default } from '../page';`)
- `apps/web/public/brand/callit-mark.png` - Logo mark, byte-identical copy of `call it homepage/uploads/1781243145765.png`
- `apps/web/app/components/HowItWorksModal.tsx` - Comment-only: copy-canon re-anchored to modal-as-single-canon (git diff shows 0 non-comment lines)
- `apps/web/tests/signin.spec.ts` - Tier 1 pin updates (8.6vw clamp, Stake smarter) + Tier 2 modal-open steps with signin-modal-buttons scoping
- `apps/web/tests/how-it-works-modal.test.ts` - Lockstep describe replaced: modal verbatim canon + landing mount/trigger linkage
- `apps/web/tests/landing-hero.test.ts` - NEW: 9 source-assert pins (removals, CTA wiring, always-mounted invariant, asset honesty, /calls + '/call' prefix dependency, demo cards, keyframes)

## Gate Results
- `pnpm --filter @call-it/web build` -> exit 0 (`/calls` present in the route table; static PNG import resolved via '@' alias)
- `pnpm --filter @call-it/web exec vitest run` -> 376/376 passed, 36 files, 0 failures (366 baseline + 9 new landing-hero pins + 1 parallel-session test drift; all green)
- Tier 1 signin.spec.ts pins grep-verified against the rewritten source: all 12 pinned strings present exactly once; `8,442` / `$284K` / `LIVE NOW` absent
- `git diff HEAD -- apps/web/middleware.ts` empty (zero middleware change)
- `git show --stat HEAD` lists exactly the 7 planned paths; `call it homepage/` and all parallel-session WIP untouched and unstaged

## Decisions Made
None beyond the plan - all decisions were pre-made by the orchestrator (modal architecture, /calls re-export, static-import asset path, page-local fonts/colors, test relocations) and followed as specified.

## Deviations from Plan

**1. [Rule 1 - Bug] Reworded the signin-modal JSX invariant comment to avoid self-tripping the regex guard**
- **Found during:** Task 2 (page rewrite)
- **Issue:** The plan asked for a JSX comment documenting the never-conditionally-render rule with the literal `{signinOpen && ...}` text - but that literal would match landing-hero.test.ts' negative regex guard AND the plan's own negative grep verify step
- **Fix:** Comment says "NEVER a conditional-render guard around SignInButtons" instead - same documentation intent, no false regex hit
- **Files modified:** apps/web/app/signin/page.tsx
- **Verification:** Task 2 negative greps pass; landing-hero.test.ts passes
- **Committed in:** 880c5cb

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Cosmetic comment wording only; the always-mounted invariant and its guards are intact. No scope creep.

## Issues Encountered
None - parallel session shared the tree but no file drift was hit (every Edit anchored cleanly against freshly-read state; vitest baseline drifted 366->367 pre-existing tests, which the gate tolerated by design).

## User Setup Required
None - no external service configuration required.

## Operator Follow-up
- Playwright visual-smoke `signin.png` baseline is INVALIDATED by the redesign. Regenerate on the box with `PLAYWRIGHT_BASE_URL` set when convenient (snapshot dirs are never staged from this task).

## Next Phase Readiness
- The landing is design-canon; orchestrator pushes `880c5cb` (Vercel auto-deploys web)
- /calls depends on middleware's '/call' PUBLIC_PREFIX - landing-hero.test.ts flags any rename
- Tier 2 browser tests stay skipped without a real Privy app ID but are correct for the staging run (modal-open steps inserted)

---
*Phase: quick-260612-a6v*
*Completed: 2026-06-12*
