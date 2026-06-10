---
phase: quick-260610-ev0
plan: 01
subsystem: ui
tags: [onboarding, nextjs, cva-button, cosmetic, button-hierarchy]
requirements-completed: [AUTH-07, AUTH-08]
key-files:
  modified:
    - apps/web/app/components/SocialLinkControls.tsx
    - apps/web/app/onboarding/socials/page.tsx
commit: 220a701
duration: ~4min
completed: 2026-06-10
---

# Quick 260610-ev0: Restyle CONNECT SOCIALS Button Hierarchy Summary

**Pure-cosmetic restyle of the Screen 2 (CONNECT SOCIALS) onboarding button hierarchy — Link Farcaster promoted to primary (filled yellow, matching Link Twitter/X), Continue demoted to secondary (outlined), and Skip for now converted from the neobrutalist CVA Button to plain muted text — with all handlers, copy, routing, and mobile touch targets untouched.**

## Accomplishments

Three edits across exactly two files, no logic/handler/routing/copy changes:

1. **`SocialLinkControls.tsx`** — Link Farcaster `<Button>` (`data-testid="link-farcaster-button"`, `!isFarcasterLinked` branch): `intent="secondary"` → `intent="primary"`. Now renders filled-yellow, matching the Link Twitter / X button directly above it. Everything else on the button (size, onClick, disabled, testid, style, label) byte-identical; the Twitter button, unlink buttons, and `farcaster-linked-tag` untouched.
2. **`socials/page.tsx`** — Continue `<Button>` (`data-testid="socials-continue-button"`): `intent="primary"` → `intent="secondary"`. Now outlined. Size/onClick/disabled/testid/mobile-style/label unchanged.
3. **`socials/page.tsx`** — Skip control (`data-testid="skip-socials-button"`): converted from the `@call-it/ui` neobrutalist `Button` to a native `<button>` rendering plain muted text. Preserves `data-testid="skip-socials-button"`, `onClick={() => { void handleSkip(); }}`, `disabled={isSkipping || isContinuing}`, and the `{isSkipping ? 'Skipping...' : 'Skip for now'}` label. Inline-styled per this file's convention: `color: '#A1A1AA'`, `fontFamily: 'monospace'`, `fontSize: '0.8rem'`, transparent background, no border, no box-shadow, `cursor: 'pointer'`, `opacity` 0.5 when disabled, and `minHeight: '44px'` only when `isMobile`. Hover affordance via `onMouseEnter`/`onMouseLeave` toggling `textDecoration: underline`.

The `import { Button } from '@call-it/ui';` line stays — the Continue button still uses `Button`.

Resulting hierarchy: Link Twitter/X + Link Farcaster (both filled-yellow primary link CTAs) → Continue (outlined secondary) → Skip for now (plain text tertiary opt-out).

## Verification

- **Typecheck:** `pnpm --filter @call-it/web exec tsc --noEmit` — exits non-zero, but ALL errors are pre-existing and confined to unrelated test files (`tests/farcaster-embed.test.ts` Props/children mismatch, `tests/farcaster-manifest.test.ts` TS6307 file-list). A grep of the full tsc output for `socials/page` and `SocialLinkControls` returns **zero matches** — my two edited files introduce **no new TypeScript errors**.
- **Lint:** `apps/web` `lint` script is a placeholder echo (`"No lint configured for web yet"`), so there is no lint gate to fail.
- **Source-text assertions (onboarding.spec.ts ~L155-158):** grep of `apps/web/app/onboarding/socials/page.tsx` confirms BOTH literal strings `skip-socials-button` (line 134) and `Skip for now` (line 154) are still present.
- **Diff scope:** `git show --stat 220a701` confirms exactly 2 files changed (`SocialLinkControls.tsx` +1/-1, `socials/page.tsx` +24/-8); no file deletions in the commit.
- **Staging discipline:** `git diff --cached --name-only` before commit confirmed ONLY the two intended files were staged (explicit two-path `git add`, never `-A`/`.`/`-u`). The background-soak's unrelated uncommitted files (evidence/, scripts, docs, .gitignore) were NOT touched.

## Files Modified

- `apps/web/app/components/SocialLinkControls.tsx` — Link Farcaster button `intent` secondary → primary (single value change).
- `apps/web/app/onboarding/socials/page.tsx` — Continue button `intent` primary → secondary; Skip control swapped from `<Button>` to native plain-text `<button>` (testid/label/handler/disabled/44px touch target preserved).

## Decisions Made

- **Native `<button>` over Button-base CVA override for Skip** — the plan's PREFERRED approach. Cleaner than overriding the neobrutalist base (border-2/offset-shadow/translate) via twMerge; styled inline to match this file's inline-style convention.
- **Hover affordance via `onMouseEnter`/`onMouseLeave` underline toggle** — minimal, no new CSS rule, no dependency.

## Deviations from Plan

None — plan executed exactly as written.

## Commit

- **Code commit:** `220a701` — `style(quick-260610-ev0): restyle CONNECT SOCIALS button hierarchy (Farcaster->primary, Continue->secondary, Skip->plain text)`
- **Not pushed** (operator deploys web via Vercel on their own cadence).

## Self-Check: PASSED

- `apps/web/app/components/SocialLinkControls.tsx` — FOUND (modified, `link-farcaster-button` now `intent="primary"`)
- `apps/web/app/onboarding/socials/page.tsx` — FOUND (modified, Continue `intent="secondary"`, native Skip button)
- Commit `220a701` — FOUND in git log
- Literal strings `skip-socials-button` + `Skip for now` — FOUND in page source
