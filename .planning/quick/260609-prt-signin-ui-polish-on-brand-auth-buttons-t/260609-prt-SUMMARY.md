---
phase: quick-260609-prt
plan: 01
subsystem: web-ui
tags: [signin, auth, terms, notification-bell, neobrutalist, nextjs]
requires:
  - apps/web signin surface (page.tsx, SignInButtons.tsx) + NotificationBell.tsx + @call-it/ui Button
provides:
  - /terms route (on-brand stub, no 404) preserving the permanent-public-record promise
  - Terms & Conditions link replacing the wall-of-text disclaimer on /signin
  - auth-only NotificationBell render gate (OAuth address-lag WR-03 fix)
  - solid-neobrutalist auth buttons + Twitter→X rename + Google/X inline SVG icons
affects: [phase-09.1-testnet-demo-hardening]
key-files:
  created:
    - apps/web/app/terms/page.tsx
  modified:
    - apps/web/app/signin/page.tsx
    - apps/web/app/components/NotificationBell.tsx
    - apps/web/app/signin/SignInButtons.tsx
decisions:
  - "Updated the AUTH-37 docstring comment in page.tsx (was quoting the old 'permanent public record' disclaimer verbatim) so the Task-1 verify assertion !/permanent public record\\./ passes — the promise now lives on /terms."
  - "Removed the literal word 'grid' from the /terms docstring (changed 'no css grid' → 'Satori-safe habit') so the Task-2 !/grid/ assertion passes; layout is flexbox-only regardless."
  - "Wrote the /terms permanent-record promise paragraph on a single source line so the verify regex (which has no whitespace tolerance) matches verbatim."
metrics:
  duration: ~8min
  completed: 2026-06-09
  tasks: 4
  files: 4
---

# Phase quick-260609-prt Plan 01: Sign-in UI Polish — On-Brand Auth Buttons + Terms Link Summary

Replaced the /signin wall-of-text disclaimer with an on-brand Terms & Conditions link (backed by a new /terms stub that never 404s), made the notification bell render for OAuth users before their wallet address resolves (WR-03), and gave the three auth buttons the solid-neobrutalist treatment with a Twitter→X rename and 4-color Google / monochrome X inline SVGs — all confined to apps/web, packages/ui untouched.

## Tasks Completed

1. **Disclaimer → Terms & Conditions link (signin/page.tsx)** — Added `import Link from 'next/link'`; the `<p data-testid="disclaimer">` keeps its inline style + testid but now reads "By signing in, you're agreeing to our Terms & Conditions." with "Terms & Conditions" as an underlined `#E8F542` `<Link href="/terms">`. The old permanent-public-record sentence is gone from page.tsx (the AUTH-37 docstring comment was also updated to point at /terms).
2. **New /terms stub (apps/web/app/terms/page.tsx)** — Plain server component (no 'use client', no hooks). Centered flex column, dark `#09090E` bg, ~480px max-width; Syne-family `#E8F542` ~2rem h1 "Terms & Conditions", muted-mono "Full terms are coming soon.", the verbatim permanent-public-record promise paragraph, and a `<Link href="/">` "← Back to Call It". Flexbox only, no grid.
3. **Auth-only notification bell gate (NotificationBell.tsx)** — Render gate at line 130 changed from `if (!ready || !authenticated || !address) return null;` to `if (!ready || !authenticated) return null;`, dropping only the `|| !address` clause. Comment updated to reference WR-03. The fetch guard (~line 77) and polling-effect guard (~line 97) still include `!address`, so the bell shows with no badge and never fetches with an empty address; logged-out users stay hidden.
4. **Solid-neobrutalist auth buttons + Twitter→X (SignInButtons.tsx)** — D-33 order (Connect Wallet > Google > X) and all three data-testids (btn-connect-wallet, btn-google, btn-twitter — testid kept despite the "Sign in with X" label) preserved; CustodyTooltip wrappers, `disabled={!ready && !privyTimedOut}`, and all three handlers (handleConnectWallet/handleGoogleLogin/handleTwitterLogin) unchanged. Inline `style={{ width: '100%' }}` replaced by `w-full` in className on all three. Connect Wallet keeps intent="primary" (no icon) + focus ring; Google + X use the shared solid-neobrutalist secondary className with `transition-all` (not split transitions) + focus rings. Added a 4-color Google "G" SVG (`h-5 w-5`) and a `fill="currentColor"` monochrome X SVG (`h-[18px] w-[18px]`), each `aria-hidden` and flexbox-wrapped via `<span className="inline-flex items-center gap-2">`. Third label renamed "Sign in with Twitter" → "Sign in with X".

## Verification

- Task 1–4 per-task `node -e` assertions: all **OK**.
- `pnpm --filter @call-it/web build` exits **0**; the `/terms` route appears in the route manifest (no 404).
- Brand tokens (`brand-accent`, `brand-surface`, `brand-bg`) confirmed present in apps/web/tailwind.config.ts; build compiled the new utility classes successfully.
- packages/ui untouched (focus rings + overrides applied at the call sites via the shared Button's `className` prop, which is merged through `cn`/tailwind-merge).
- Commit `9ce8c48` contains exactly the 4 intended files, 0 deletions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale verbatim disclaimer text in page.tsx docstring tripped the Task-1 assertion**
- **Found during:** Task 1 verify
- **Issue:** The Task-1 assertion includes `!/permanent public record\./`. The old AUTH-37 file-header docstring quoted the disclaimer verbatim ("…become permanent public record."), so the assertion failed even after the JSX text was swapped.
- **Fix:** Rewrote that one docstring line to "Disclaimer copy links to the /terms page (which preserves the permanent-record promise)."
- **Files modified:** apps/web/app/signin/page.tsx
- **Commit:** 9ce8c48

**2. [Rule 3 - Blocking] Word "grid" in /terms docstring + multi-line promise string tripped the Task-2 assertion**
- **Found during:** Task 2 verify
- **Issue:** The Task-2 assertion includes `!/grid/` and a whitespace-intolerant match for the promise paragraph. My initial docstring said "no css grid" (matched `/grid/`) and the promise paragraph was wrapped across two source lines (the literal-string match failed).
- **Fix:** Changed the docstring to "Flexbox layout only (Satori-safe habit)." and put the promise paragraph on a single source line.
- **Files modified:** apps/web/app/terms/page.tsx
- **Commit:** 9ce8c48

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking-issue fixes needed to satisfy the plan's own verify gates). No behavioral or scope change; both are doc-comment / source-formatting adjustments.

## Files Staged & Committed

Explicit per-file staging (no `git add -A`/`.`/`-u`):

| File | Status |
|------|--------|
| apps/web/app/signin/page.tsx | modified |
| apps/web/app/terms/page.tsx | created |
| apps/web/app/components/NotificationBell.tsx | modified |
| apps/web/app/signin/SignInButtons.tsx | modified |

**Commit:** `9ce8c48` — `feat(quick-260609-prt): signin UI polish — Terms link, /terms page, auth-only bell, solid-neobrutalist auth buttons` (committed to master, NOT pushed).

Unrelated background-soak working-tree files (.gitignore, .planning/config.json, apps/web/.gitignore, evidence/*, apps/relayer soak scripts, the untracked playwright snapshot) were left untouched and unstaged.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| "Full terms are coming soon." | apps/web/app/terms/page.tsx | Intentional placeholder per the plan — the page exists so the /signin Terms link never 404s and preserves the permanent-public-record promise verbatim. Full legal copy is a future task. |

## Self-Check: PASSED

- [x] apps/web/app/signin/page.tsx exists on disk (modified)
- [x] apps/web/app/terms/page.tsx exists on disk (created)
- [x] apps/web/app/components/NotificationBell.tsx exists on disk (modified)
- [x] apps/web/app/signin/SignInButtons.tsx exists on disk (modified)
- [x] Commit 9ce8c48 exists in git log (4 files changed, 0 deletions)
- [x] `pnpm --filter @call-it/web build` exits 0; /terms in route manifest
- [x] All four per-task verify assertions return OK
