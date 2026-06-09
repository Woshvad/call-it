---
phase: quick-260609-r6i
plan: 01
subsystem: ui
tags: [tailwind, postcss, nextjs, design-system, apps-web]
requires: []
provides:
  - apps/web Tailwind PostCSS pipeline (postcss.config.js + autoprefixer/postcss devDeps)
  - "@tailwind base/components/utilities compiled app-wide via root layout import"
affects: [all-web-routes, post-deploy-visual-verification]
tech-stack:
  added: [autoprefixer@10.5.0, postcss@8.5.15 (declared as apps/web devDeps)]
  patterns:
    - "apps/web/postcss.config.js plain-object export { plugins: { tailwindcss: {}, autoprefixer: {} } } — Next 16 does not inject tailwindcss into its default PostCSS set"
    - "globals.css loaded from the root server layout.tsx (first import) so the compiled stylesheet ships in SSR <head> on every route"
key-files:
  created:
    - apps/web/postcss.config.js
  modified:
    - apps/web/package.json
    - apps/web/app/globals.css
    - apps/web/app/layout.tsx
    - apps/web/app/page.tsx
    - pnpm-lock.yaml
decisions:
  - "REQUIRED scope addition: created postcss.config.js + declared autoprefixer/postcss — the original 3-file diagnosis could not make the verify gate pass without the Tailwind PostCSS plugin wired"
metrics:
  duration: ~12min
  completed: 2026-06-09
---

# Quick 260609-r6i: Wire up Tailwind CSS pipeline in apps/web Summary

**Turned on the entire `@call-it/ui` neobrutalist design system app-wide for the first time by wiring the Tailwind PostCSS plugin (`postcss.config.js` + declared `autoprefixer`/`postcss`), adding the `@tailwind base/components/utilities` directives to `globals.css`, and loading `globals.css` from the root server layout so the compiled stylesheet ships in the SSR `<head>` on every route.**

## Acceptance Gate — Emitted CSS Token Counts

Clean build (`rm -rf apps/web/.next` then `pnpm --filter @call-it/web build`) exited **0**. The emitted bundles under `apps/web/.next/static/css/` (`618f2e63a49d72f3.css`, `aee02b61ed800e66.css`) were grepped. All four utility tokens were **0 before** this change and are now present:

| Token | Meaning | Count |
|-------|---------|-------|
| `e8f542` (case-insensitive) | `brand-accent` color `#E8F542` (e.g. `bg-brand-accent`) | **13** |
| `--tw-` | Tailwind CSS custom-property variables (preflight + utility layer compiled) | **344** |
| `4px_4px` | neobrutalist hard-shadow arbitrary value (`shadow-[4px_4px_0_...]`) | **4** |
| `.uppercase` | core Tailwind utility class | **1** |
| `cardEnter` | preserved hand-written keyframe (must survive ≥ 1) | **2** |

All required counts > 0; the preserved `cardEnter` keyframe still ships. PostCSS wiring confirmed correct.

## Files Staged + Commits

Two atomic commits on `master` (NOT pushed):

**Task 1 — `79d7015`** `build(quick-260609-r6i): wire Tailwind PostCSS plugin in apps/web`
- `apps/web/postcss.config.js` (created)
- `apps/web/package.json` (added `autoprefixer ^10.4.0` + `postcss ^8.4.0` devDeps)
- `pnpm-lock.yaml` (resolved `autoprefixer@10.5.0`, `postcss@8.5.15` in the web importer only — diff verified as exactly those two entries)

**Task 2 — `f7ee336`** `feat(quick-260609-r6i): load Tailwind globals.css app-wide from root layout`
- `apps/web/app/globals.css` (3 `@tailwind` directives at top; cardEnter keyframe + `.card-enter` + prefers-reduced-motion block preserved unchanged)
- `apps/web/app/layout.tsx` (`import './globals.css';` as first import — server component, no `'use client'`)
- `apps/web/app/page.tsx` (removed the now-redundant `import './globals.css';` and its UI-53 comment)

Task 3 was build + verification only — no files staged.

Staging used explicit per-file `git add` only. The unrelated background-soak working-tree files (`.gitignore`, `.planning/config.json`, `apps/web/.gitignore`, `.claude/launch.json`, `evidence/*`, soak scripts, the untracked playwright snapshot, `docs/*` artifacts, untracked `packages/contracts/lib/openzeppelin-contracts`) were never staged. No deletions in either commit (verified `git diff --diff-filter=D HEAD~1 HEAD` empty for Task 1).

## REQUIRED Scope Addition (postcss.config.js + devDeps) — Why

The task brief scoped this to 3 files and noted `tailwind.config.ts` was already correct. Planning verified the 3-file change alone CANNOT make the verify gate pass: **there is no PostCSS config anywhere** (`apps/web`, repo root, or `packages/config`), and `autoprefixer`/`postcss` are not declared in `apps/web/package.json`. Next.js 16.2.6's built-in PostCSS loader, when no `postcss.config` is found, falls back to only `postcss-flexbugs-fixes` + `postcss-preset-env` — it does NOT inject `tailwindcss`. Without `postcss.config.js` the `@tailwind` directives are passed through uncompiled and emit zero utilities (all four token counts would be 0 → gate fails).

So Task 1 created `apps/web/postcss.config.js` (plain-object export `{ plugins: { tailwindcss: {}, autoprefixer: {} } }` — a function export triggers Next error E323; `@tailwindcss/postcss` is the v4 plugin and this repo pins `tailwindcss@3.4.x`) and declared the two devDeps. This stayed strictly inside `apps/web`; `tailwind.config.ts`, `packages/ui`, and `next.config` were not touched. This is reachability completion, not scope creep — the original goal is impossible without it.

## FLAG — Tailwind preflight now active app-wide for the FIRST time

`@tailwind base` enables Tailwind **preflight** (the CSS reset) app-wide for the first time: it zeroes default margins, unstyles headings/lists, sets `box-sizing: border-box` globally, etc. Pages that previously relied on browser-default element styling may shift. This is expected and correct (the design system is finally active).

**For the orchestrator:** visually verify pages across routes on the live deploy. Per the plan, preflight regressions are OUT OF SCOPE for this task — do NOT pre-fix hypothetical regressions; surface anything the live screenshots reveal as a follow-up. (Deploy is also gated on the orchestrator — this task committed to master but did NOT push.)

## Deviations from Plan

None beyond the REQUIRED scope addition documented above (which was pre-authorized in the plan's `<scope_note>`). Plan executed as written.

## Self-Check: PASSED

- `apps/web/postcss.config.js` — FOUND
- `apps/web/package.json` devDeps `autoprefixer` + `postcss` — FOUND
- `apps/web/app/globals.css` first 3 lines = `@tailwind` directives, keyframes preserved — FOUND
- `apps/web/app/layout.tsx` first import `./globals.css` — FOUND
- `apps/web/app/page.tsx` no longer imports `./globals.css` — CONFIRMED
- Commit `79d7015` — FOUND
- Commit `f7ee336` — FOUND
- Build exit 0 + all token counts > 0 — CONFIRMED
