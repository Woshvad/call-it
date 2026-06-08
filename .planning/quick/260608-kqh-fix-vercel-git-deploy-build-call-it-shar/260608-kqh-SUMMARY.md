---
phase: quick-260608-kqh
plan: 01
subsystem: deploy-config
tags: [vercel, pnpm-workspace, monorepo, next-build]
requires: []
provides:
  - "apps/web/vercel.json buildCommand that builds @call-it/shared before @call-it/web"
affects: [vercel-github-auto-deploy]
tech-stack:
  added: []
  patterns:
    - "Vercel monorepo buildCommand must build gitignored-dist workspace deps before the app that imports them"
key-files:
  created: []
  modified:
    - apps/web/vercel.json
decisions:
  - "Only @call-it/shared needs a prior build: it exports ./dist/index.js (gitignored); @call-it/ui exports ./src and @call-it/config exports committed raw files"
metrics:
  duration: 4min
  completed: 2026-06-08
requirements: [QUICK-260608-kqh]
---

# Quick 260608-kqh: Fix Vercel Git Deploy Build (@call-it/shared) Summary

Vercel's GitHub auto-deploy of `apps/web` now builds the `@call-it/shared` workspace package before `@call-it/web`, resolving the clean-checkout `Module not found: Can't resolve '@call-it/shared'` webpack failure.

## What Changed

Single-field edit to `apps/web/vercel.json`:

- **Before:** `"buildCommand": "cd ../.. && pnpm --filter @call-it/web build"`
- **After:** `"buildCommand": "cd ../.. && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build"`

`installCommand`, `framework`, and `$schema` were left untouched. File remains valid JSON with the same 4-key shape and 2-space indentation.

## Root Cause

`@call-it/shared`'s production/default export resolves to `./dist/index.js` (built by `tsc --build`), but `packages/shared/dist` is gitignored. On Vercel's clean GitHub checkout, that dist is absent, so the webpack resolution of `@call-it/shared` failed. The prior `buildCommand` built only `@call-it/web`, never its workspace dependency `@call-it/shared`. Earlier `vercel` CLI deploys succeeded only because they uploaded a locally pre-built `dist/`. `@call-it/ui` (exports `./src`) and `@call-it/config` (exports committed raw files) need no prior build — only `shared` does.

## Verification

Clean-state reproduction of Vercel's checkout, run from repo root:

```
rm -rf packages/shared/dist
find packages/shared -name '*.tsbuildinfo' -delete
pnpm --filter @call-it/shared build   # tsc --build
pnpm --filter @call-it/web build       # next build --webpack
```

- Exit 0 (the only warnings are pre-existing webpack warnings from the metamask-sdk optional `@react-native-async-storage/async-storage` peer and the viem/ox `tempo/virtualMasterPool.js` expression dependency — documented in STATE.md, not caused by this change).
- `packages/shared/dist/index.js` regenerated — confirmed present.
- `packages/shared/dist/index.d.ts` regenerated — confirmed present.
- `packages/shared/dist` confirmed gitignored (via `git check-ignore`); not staged.
- Staged diff = exactly the single `buildCommand` line change.

Post-push operator observation (not part of this automated gate): the Vercel GitHub auto-deploy of `apps/web` should turn green instead of failing with `Module not found: Can't resolve '@call-it/shared'`.

## Task Commits

1. **Task 1: Build @call-it/shared before @call-it/web in vercel.json** — `588a629` (fix), 1 file changed.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `apps/web/vercel.json` exists on disk with the updated buildCommand
- [x] Commit `588a629` exists in git log
- [x] Clean-state build (dist deleted -> shared build -> web build) exits 0
- [x] `packages/shared/dist/index.js` and `dist/index.d.ts` regenerated
- [x] `installCommand`, `framework`, `$schema` unchanged; file valid JSON
- [x] Only `apps/web/vercel.json` staged/committed; gitignored dist not staged; submodule untouched
