---
phase: quick-260608-kqh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/vercel.json
autonomous: true
requirements: [QUICK-260608-kqh]

must_haves:
  truths:
    - "Vercel's GitHub auto-deploy builds @call-it/shared before @call-it/web, so a clean checkout (gitignored dist absent) resolves the @call-it/shared module instead of failing with 'Module not found: Can't resolve @call-it/shared'"
    - "A clean-state local reproduction of Vercel's checkout (dist + tsbuildinfo deleted) builds shared then web with exit 0"
  artifacts:
    - path: "apps/web/vercel.json"
      provides: "buildCommand that filters @call-it/shared build before @call-it/web build"
      contains: "pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build"
  key_links:
    - from: "apps/web/vercel.json"
      to: "packages/shared (dist/index.js)"
      via: "pnpm --filter @call-it/shared build runs tsc --build, regenerating the gitignored dist before web consumes the @call-it/shared export"
      pattern: "@call-it/shared build && pnpm --filter @call-it/web build"
---

<objective>
Fix the Vercel GitHub auto-deploy build failure for `apps/web` by building the `@call-it/shared` workspace package before `@call-it/web` in `apps/web/vercel.json`'s `buildCommand`.

Purpose: Vercel's clean GitHub checkout fails with `Module not found: Can't resolve '@call-it/shared'` → `Build failed because of webpack errors` → `Command "cd ../.. && pnpm --filter @call-it/web build" exited with 1`. Root cause: `@call-it/shared`'s production export resolves to `./dist/index.js` (built by `tsc --build`), but `packages/shared/dist` is gitignored, so on Vercel's clean checkout it is absent. The current `buildCommand` builds ONLY web, never its workspace dependency shared. (`@call-it/ui` exports `./src` and `@call-it/config` exports raw files — both committed to git — so ONLY shared needs a prior build; the error confirms only shared failed.) Earlier `vercel` CLI deploys succeeded only because they uploaded a locally pre-built `dist/`.

Output: A one-field edit to `apps/web/vercel.json` (`buildCommand`) that builds shared before web. No source/code changes.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/vercel.json
@packages/shared/package.json

# Current vercel.json (4 fields). ONLY buildCommand changes:
#   "$schema": "https://openapi.vercel.sh/vercel.json"      ← do NOT touch
#   "framework": "nextjs"                                     ← do NOT touch
#   "installCommand": "cd ../.. && pnpm install --no-frozen-lockfile"  ← do NOT touch
#   "buildCommand": "cd ../.. && pnpm --filter @call-it/web build"      ← change THIS only

# @call-it/shared package.json (relevant fields):
#   "main": "./dist/index.js", "types": "./dist/index.d.ts"
#   "exports": { ".": { "types": "./dist/index.d.ts", "development": "./src/index.ts", "default": "./dist/index.js" } }
#   "scripts": { "build": "tsc --build" }
# → production/default resolution = ./dist/index.js, which is gitignored and absent on a clean Vercel checkout.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build @call-it/shared before @call-it/web in vercel.json buildCommand</name>
  <files>apps/web/vercel.json</files>
  <action>
Edit ONLY the `buildCommand` field in apps/web/vercel.json. Change its value from
`cd ../.. && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build` is the target.

Specifically, replace the existing value `cd ../.. && pnpm --filter @call-it/web build` with `cd ../.. && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build`.

This makes Vercel run `tsc --build` for @call-it/shared first (regenerating the gitignored ./dist/index.js + ./dist/index.d.ts that @call-it/shared's production export resolves to), then builds @call-it/web against the now-present dist — resolving the `Module not found: Can't resolve '@call-it/shared'` webpack error.

Do NOT change `installCommand`, `framework`, `$schema`, or any other field. Do NOT touch any code, next.config, or package.json. Keep the file as valid JSON (preserve the existing 2-space indentation and the same 4-key object shape — only the buildCommand string value differs).

Never stage the git submodule at packages/contracts/lib/openzeppelin-contracts — it is irrelevant to this change.
  </action>
  <verify>
    <automated>rm -rf packages/shared/dist && find packages/shared -name '*.tsbuildinfo' -delete && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build && test -f packages/shared/dist/index.js && test -f packages/shared/dist/index.d.ts && grep -q '@call-it/shared build && pnpm --filter @call-it/web build' apps/web/vercel.json</automated>
  </verify>
  <done>apps/web/vercel.json's buildCommand is `cd ../.. && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build`; all other fields unchanged; file is valid JSON; the clean-state local reproduction (dist + tsbuildinfo deleted, then shared build then web build) exits 0 and packages/shared/dist/index.js + dist/index.d.ts are regenerated.</done>
</task>

</tasks>

<verification>
Clean-state reproduction of Vercel's GitHub checkout (this is the CI-safe local gate; the true confirmation is the subsequent Vercel deploy turning green, which is a post-push operator observation):

```
rm -rf packages/shared/dist
find packages/shared -name '*.tsbuildinfo' -delete
pnpm --filter @call-it/shared build   # tsc --build → regenerates dist/index.js + dist/index.d.ts
pnpm --filter @call-it/web build       # must now resolve @call-it/shared and exit 0
```

Assert: exit 0 AND `packages/shared/dist/index.js` and `packages/shared/dist/index.d.ts` exist.
Assert: `apps/web/vercel.json` is valid JSON with only `buildCommand` changed.

Post-push (operator observation, NOT part of this plan's automated gate): the Vercel GitHub auto-deploy of `apps/web` turns green instead of failing with `Module not found: Can't resolve '@call-it/shared'`.
</verification>

<success_criteria>
- apps/web/vercel.json `buildCommand` = `cd ../.. && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build`.
- `installCommand`, `framework`, `$schema` unchanged; file is valid JSON.
- Clean-state local build (dist + tsbuildinfo deleted → shared build → web build) exits 0; packages/shared/dist/index.js + dist/index.d.ts regenerated.
- No code/source/package.json/next.config changes; the openzeppelin-contracts submodule never staged.
</success_criteria>

<output>
Create `.planning/quick/260608-kqh-fix-vercel-git-deploy-build-call-it-shar/260608-kqh-SUMMARY.md` when done.
</output>
