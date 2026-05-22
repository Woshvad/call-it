---
phase: 01-core-contracts-auth-frontend-skeleton
plan: "04"
subsystem: packages/ui
tags:
  - design-system
  - packages-ui
  - cva
  - radix
  - tailwind
  - neobrutalist
  - flexbox-only
  - auth-44
dependency_graph:
  requires:
    - "01-01: @call-it/ui shell + tailwind.preset.ts (Wave 0)"
  provides:
    - "@call-it/ui full design-system surface: Button, Card, Tag, CornerBrackets, Skeleton(6), Stamp, Toast, ToastProvider, useToast, Receipt, ConvictionBar, CallCard, ProfileHeader"
    - "AUTH-44 invariant: Receipt type signature + Vitest static-source assertion + ESLint rule (3-layer defense)"
    - "Pitfall 15 defense: Receipt flexbox-only layout usable by Phase 7 Satori OG cards"
  affects:
    - "01-05, 01-06: frontend pages depend on these primitives"
    - "Phase 7: Receipt reused via Satori for OG card variants"
tech_stack:
  added:
    - "@radix-ui/react-toast@1.2.x — Toast Provider/Root/Viewport/Title"
    - "@radix-ui/react-slider@1.3.6 — ConvictionBar"
    - "@testing-library/react@16.x + jest-dom@6.x + jsdom@25.x — test harness"
    - "@types/react@19.x + @types/react-dom@19.x — TypeScript type declarations"
    - "@typescript-eslint/parser (from @call-it/config) — ESLint TypeScript parsing"
  patterns:
    - "CVA (class-variance-authority) for all variant mapping (Button, Card, Tag, Skeleton, Toast)"
    - "framer-motion scoped to Stamp only (useReducedMotion a11y fallback)"
    - "Radix Toast + Radix Slider — only where they earn their place"
    - "Context-based useToast hook over array state"
    - "Flexbox-only Receipt layout (Pitfall 15 / Satori compatibility)"
key_files:
  created:
    - packages/ui/src/lib/cn.ts
    - packages/ui/src/tokens/colors.ts
    - packages/ui/src/tokens/typography.ts
    - packages/ui/src/tokens/spacing.ts
    - packages/ui/src/primitives/Button.tsx
    - packages/ui/src/primitives/Card.tsx
    - packages/ui/src/primitives/Tag.tsx
    - packages/ui/src/primitives/CornerBrackets.tsx
    - packages/ui/src/primitives/Skeleton.tsx
    - packages/ui/src/primitives/Stamp.tsx
    - packages/ui/src/primitives/Toast.tsx
    - packages/ui/src/primitives/ToastProvider.tsx
    - packages/ui/src/hooks/useToast.ts
    - packages/ui/src/compound/Receipt.tsx
    - packages/ui/src/compound/ConvictionBar.tsx
    - packages/ui/src/compound/CallCard.tsx
    - packages/ui/src/compound/ProfileHeader.tsx
    - packages/ui/src/styles/globals.css
    - packages/ui/__tests__/setup.ts
    - packages/ui/__tests__/cva-variants.test.tsx
    - packages/ui/__tests__/skeleton-variants.test.tsx
    - packages/ui/__tests__/corner-brackets.test.tsx
    - packages/ui/__tests__/toast.test.tsx
    - packages/ui/__tests__/receipt-no-address.test.tsx
  modified:
    - packages/ui/src/index.ts
    - packages/ui/package.json
    - packages/ui/vitest.config.ts
    - packages/ui/eslint.config.js
decisions:
  - "Used @radix-ui/react-toast instead of a custom toast implementation for a11y (ARIA announcements, focus management) out of the box"
  - "Toast countdown drain uses CSS animation (@keyframes drain) not framer-motion — keeps framer-motion scoped to Stamp only per RESEARCH Standard Stack"
  - "Receipt data prop explicitly excludes `address` field at TypeScript type level — AUTH-44 defense-in-depth starting at the type signature"
  - "CornerBrackets renders 4 inline <span> elements (not CSS ::before/::after pseudo-elements) for Satori compatibility in Phase 7 OG cards"
  - "ConvictionBar lerpHex implemented inline (no extra dep) for muted#A1A1AA→accent#E8F542 interpolation"
  - "eslint.config.js in packages/ui explicitly adds @typescript-eslint/parser since base.js doesn't include it (Rule 3 fix)"
  - "vitest.config.ts: globals=true required for @testing-library/jest-dom expect matchers"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-22"
  tasks: 2
  files_created: 24
  files_modified: 4
  tests_passing: 53
  bundle_size_js: "27KB (unminified .js output in dist/)"
---

# Phase 1 Plan 04: Design System Primitives + Receipt Summary

Full `@call-it/ui` design-system surface populated with neobrutalist primitives, compound components, and the AUTH-44-safe Receipt component that Phase 7 Satori OG cards will reuse.

## What Was Built

### Primitives (Task 1)

- **cn()** — clsx + tailwind-merge CVA companion utility
- **Token constants** — colors.ts (BRAND_ACCENT, OUTCOME_WIN, etc.), typography.ts (FONT_DISPLAY/BODY/MONO), spacing.ts (shadow offsets)
- **Button** — CVA 3 intents (primary/secondary/danger) × 3 sizes (sm/md/lg), hard offset shadow `shadow-[4px_4px_0_0_#000]`, hover/active translate
- **Card** — border-3, shadow-[6px_6px_0_0_#E8F542], bg-brand-surface, `accent` variant
- **Tag** — CVA 4 intents (info/success/warning/danger), mono font, sharp corners (no rounded-full)
- **CornerBrackets** — 4 aria-hidden absolutely-positioned spans with border-t/b-4 border-l/r-4 brand-accent; visual parity with Phase 0 `cornerBracket()` OG helper
- **Skeleton** — 6 static-gray CVA variants: feedCard(h-32), receipt(h-64), profileHeader(h-24), leaderboardRow(h-16), duelCard(h-48), listItem(h-12); bg-brand-border; NO animate-pulse (D-18)
- **Stamp** — framer-motion scale [1.2→1.0] overshoot cubic-bezier [0.34,1.56,0.64,1], 400ms; `useReducedMotion()` CSS fadeIn fallback (a11y spec §15.7)

### Task 2

- **useToast** — React context hook: `show({status,message,duration?})` + `dismiss(id)` API
- **ToastProvider** — Manages toast queue array state; Radix Toast Provider + Viewport (bottom-right)
- **Toast** — Radix ToastPrimitive.Root, CVA 3 statuses, CornerBrackets, countdown drain bar via CSS `@keyframes drain` (D-19); `data-toast-status` + `data-countdown` attrs for testing
- **styles/globals.css** — `@keyframes drain` (100%→0% width), `@keyframes fadeIn`, `prefers-reduced-motion` override
- **ConvictionBar** — Radix Slider Root+Track+Range+Thumb; lerpHex(BRAND_MUTED→BRAND_ACCENT) based on value/max; CSS custom property `--fill-color`; neobrutalist square thumb
- **Receipt** — FLEXBOX ONLY, multi-mode (preview/live/settled), AUTH-44 type-level address exclusion, file-header "FLEXBOX ONLY — Pitfall 15", CornerBrackets + Card + Tag + Stamp composition
- **CallCard** — Feed-row Card with handle, market line, conviction%, time-left countdown
- **ProfileHeader** — Initials avatar fallback, verified badge slot, TOP X% rep slot, stats row (totalCalls/settledCalls/wins)

### Updated Barrel (src/index.ts)

Exports: Button, Card, Tag, CornerBrackets, Skeleton (+ 6 named variants), Stamp, Toast, ToastProvider, useToast, Receipt, ConvictionBar, CallCard, ProfileHeader, cn, all token constants.

## Exported Component Surface

| Export | File | Purpose |
|--------|------|---------|
| Button | primitives/Button.tsx | CVA 3 intents × 3 sizes |
| Card | primitives/Card.tsx | Neobrutalist structural wrapper |
| Tag | primitives/Tag.tsx | CVA 4 intents, mono, sharp |
| CornerBrackets | primitives/CornerBrackets.tsx | D-17 CSS brackets, Phase 0 OG parity |
| Skeleton (+ 6 named) | primitives/Skeleton.tsx | D-18 static-gray, 6 variants |
| Stamp | primitives/Stamp.tsx | framer-motion overshoot + a11y fallback |
| Toast | primitives/Toast.tsx | Radix Toast, 3-status, drain bar |
| ToastProvider | primitives/ToastProvider.tsx | App-root toast queue manager |
| useToast | hooks/useToast.ts | show/dismiss programmatic API |
| Receipt | compound/Receipt.tsx | AUTH-44-safe, flexbox-only, 3 modes |
| ConvictionBar | compound/ConvictionBar.tsx | Radix Slider + muted→accent LERP |
| CallCard | compound/CallCard.tsx | Feed row card |
| ProfileHeader | compound/ProfileHeader.tsx | Profile page header |

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| cva-variants.test.tsx | 17 | PASSED |
| skeleton-variants.test.tsx | 14 | PASSED |
| corner-brackets.test.tsx | 7 | PASSED |
| toast.test.tsx | 7 | PASSED |
| receipt-no-address.test.tsx | 8 | PASSED |
| **Total** | **53** | **ALL PASSING** |

## Security / Invariant Verification

### AUTH-44: No wallet address on Receipt (3-layer defense)
1. **TypeScript type** — `ReceiptData` type has no `address` field; consumers cannot pass one
2. **ESLint** — `packages/config/eslint/no-display-grid.js` scoped to Receipt.tsx (Plan 01)
3. **Vitest** — `receipt-no-address.test.tsx` static-source assertions: no `data.address`, no `0x...` literal, no `display:grid`, no `grid-cols-*`

### Pitfall 15: Flexbox-only Receipt (Satori compatibility)
- File-header comment: "FLEXBOX ONLY — see Pitfall 15"
- ESLint `no-display-grid` rule: enforced on Receipt.tsx and children
- Vitest static-source test: asserts no grid-cols or display:grid in source

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing @types/react devDependencies**
- **Found during:** Task 1 build
- **Issue:** tsc failed with "Could not find declaration file for module 'react'" — @types/react was not in the original package.json
- **Fix:** Added `@types/react@^19.0.0` and `@types/react-dom@^19.0.0` to devDependencies
- **Files modified:** packages/ui/package.json
- **Commit:** 23c0e12

**2. [Rule 3 - Blocking] ESLint missing TypeScript parser**
- **Found during:** Task 2 lint verification
- **Issue:** ESLint reported "Parsing error: Unexpected token type" for all TypeScript files because base.js config does not configure @typescript-eslint/parser
- **Fix:** Updated packages/ui/eslint.config.js to explicitly add `@typescript-eslint/parser` for .ts/.tsx files
- **Files modified:** packages/ui/eslint.config.js
- **Commit:** 6389772

**3. [Rule 3 - Blocking] vitest.config.ts had `globals: false`**
- **Found during:** Task 1 test run
- **Issue:** @testing-library/jest-dom setup file failed with "expect is not defined" because globals were disabled
- **Fix:** Changed `globals: false` to `globals: true` and added `setupFiles: ['__tests__/setup.ts']` and `environment: 'jsdom'`
- **Files modified:** packages/ui/vitest.config.ts
- **Commit:** 23c0e12

**4. [Rule 1 - Bug] Unused React import causing noUnusedLocals TS error**
- **Found during:** Task 1 build
- **Issue:** CornerBrackets.tsx and Stamp.tsx had `import React from 'react'` — with `react-jsx` transform, the React import is unused and `noUnusedLocals: true` in tsconfig causes a build error
- **Fix:** Removed the explicit `import React` from CornerBrackets.tsx and Stamp.tsx
- **Files modified:** packages/ui/src/primitives/CornerBrackets.tsx, Stamp.tsx
- **Commit:** 23c0e12

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. AUTH-44 mitigation fully implemented (type + lint + test).

## Self-Check: PASSED

- All 23 created files: FOUND
- Commit 23c0e12: Task 1 (primitives + tests)
- Commit 6389772: Task 2 (Toast + Receipt + compounds)
- `pnpm --filter @call-it/ui build`: exits 0
- `pnpm --filter @call-it/ui lint`: exits 0
- `pnpm --filter @call-it/ui exec vitest run`: exits 0 (53/53 tests)
