---
phase: 07-og-service-final-variants-subgraph-final-mappings
plan: 01
subsystem: testing
tags: [eslint, satori, vercel-og, playwright, vitest, share-intent, subgraph, tdd]

# Dependency graph
requires:
  - phase: 02-followfademarket
    provides: /og/[callId] live OG route + og-fallback.spec.ts harness (the grid string-match this plan replaces)
  - phase: 01.5-relayer
    provides: x-api-client key-gate degrade pattern (QuotaError on missing key) the auto-post scaffold mirrors
provides:
  - Real custom flat-config eslint rule banning display:'grid'/grid* in OG sources (call-it-og/no-display-grid)
  - eslint.config.js wiring scoped to app/og, app/api/og, lib/og-* with @typescript-eslint/parser
  - 200px visual-regression scaffold for the 5 settled outcome words (toHaveScreenshot, no new dep)
  - Shared pure share-text builders twitterIntentUrl / warpcastComposeUrl / buildShareText (SHARE-15/18)
  - RED scaffold for the X/Warpcast auto-post worker (SC2)
  - RED scaffold for the subgraph Call.statement templated default (SC3/D-05)
affects: [07-02-subgraph-statement, 07-03-200px-baselines, 07-04-auto-post-worker, 07-05-share-button]

# Tech tracking
tech-stack:
  added: []  # zero new runtime deps (Playwright toHaveScreenshot + @typescript-eslint/parser already in lockfile)
  patterns:
    - "Custom eslint flat-config rule as a Property-AST visitor, registered as a local plugin scoped via files[]"
    - "Visual-regression scaffold authored as env-gated skip (OG_200PX_BASELINES) so it never blocks Wave 0 before baselines exist"
    - "Pure, env/fetch-free shared builders importable by both apps/web and apps/relayer (purity asserted by a source-grep test)"
    - "RED scaffolds authored as it.todo so the file + behavior map exist (Nyquist) without failing the suite; downstream plan turns each todo green"

key-files:
  created:
    - apps/web/eslint-rules/no-display-grid-in-og.js
    - apps/web/tests/og-thumbnail-200px.spec.ts
    - apps/web/lib/share-text.ts
    - apps/web/tests/share-text.test.ts
    - apps/relayer/src/workers/__tests__/auto-post-worker.test.ts
    - packages/subgraph/tests/call-statement.test.ts
  modified:
    - apps/web/eslint.config.js
    - apps/web/tests/og-fallback.spec.ts

key-decisions:
  - "Wired @typescript-eslint/parser into the OG-scoped eslint block — default Espree cannot parse the TS/TSX OG sources (Rule 3 blocking auto-fix)"
  - "200px spec is env-gated skip (OG_200PX_BASELINES=1) not test.fixme — keeps the 5-word structure runnable+greppable while not blocking Wave 0 until 07-03 seeds IDs + baselines"
  - "buildShareText keeps outcome word + handle and truncates the statement with an ellipsis so the legible identity is never dropped under the 240-char cap"
  - "Purity test greps the source for process.env / fetch( ; rephrased the share-text doc comment to avoid those literal tokens rather than weaken the grep"

patterns-established:
  - "OG grid ban is now CI-enforced by a real rule, not a console.warn string-match"
  - "Shared share-text module is the single source for both the web Share button (07-05) and the relayer auto-post worker (07-04)"

requirements-completed: [SHARE-15, SHARE-18]

# Metrics
duration: ~20min
completed: 2026-06-07
---

# Phase 7 Plan 01: Wave-0 Test + Enforcement Scaffolds Summary

**Real custom `no-display-grid` eslint rule (replacing the fake string-match) scoped to OG sources, a 200px visual-regression scaffold for the 5 outcome words, shared pure `share-text` Twitter/Warpcast builders (SHARE-15/18), and RED scaffolds for the auto-post worker (SC2) and subgraph `Call.statement` (SC3/D-05).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-07 (Phase 7 execution)
- **Completed:** 2026-06-07
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- Built the real custom flat-config eslint rule `call-it-og/no-display-grid` (a `Property`-AST visitor) banning `display:'grid'` and `grid*` props in OG sources, wired into `eslint.config.js` scoped to `app/og/**`, `app/api/og/**`, `lib/og-*.ts`. Proven: fires (exit 1, both messages) on a planted grid; exits 0 clean on the real flexbox-only OG routes.
- Replaced the obsolete `console.warn`-escape string-match (og-fallback.spec.ts Test 5) with a pointer to the real rule; removed the now-unused `readFileSync`/`execSync` imports.
- Added `og-thumbnail-200px.spec.ts` with all 5 settled outcome words (CALLED IT / LOUD AND WRONG / CONTRARIAN HIT / COLD CALL / FADED CORRECTLY) using Playwright's built-in `toHaveScreenshot` at a 200px viewport — no new dependency (D-research A4). Env-gated skip until Plan 07-03 seeds real settled-call IDs + baselines.
- Built the shared pure `share-text.ts` (`twitterIntentUrl`, `warpcastComposeUrl`, `buildShareText`) — no env, no fetch, no secrets — importable by both web (Share button, 07-05) and relayer (auto-post, 07-04). 6 green vitest assertions including a purity grep.
- Authored RED scaffolds (`it.todo`) for the auto-post worker (cache-warm HEAD + X-Variant + ETag, ≤30s retry, key-gated no-op, Pitfall-18 trigger) and the subgraph `Call.statement` templated default — the verification maps Plans 07-04 and 07-02 turn green.

## Task Commits

Each task was committed atomically:

1. **Task 1: no-display-grid eslint rule + 200px visual-regression scaffold** - `29c5a43` (feat)
2. **Task 2: share-text builders + auto-post & subgraph RED scaffolds** - `92dfcac` (feat)

**Plan metadata:** docs commit — see final commit below.

_Task 2 is `tdd="true"`; the builders + tests were authored and verified GREEN as a single feature unit alongside the two RED scaffolds._

## Files Created/Modified

- `apps/web/eslint-rules/no-display-grid-in-og.js` — NEW custom flat-config rule (`meta.type='problem'`, `Property` visitor, messageIds `displayGrid`/`gridProp`)
- `apps/web/eslint.config.js` — EXTENDED: import the rule as `call-it-og` plugin, scope to OG files, add `@typescript-eslint/parser` for TS/TSX
- `apps/web/tests/og-thumbnail-200px.spec.ts` — NEW 200px `toHaveScreenshot` scaffold for the 5 outcome words (env-gated)
- `apps/web/tests/og-fallback.spec.ts` — MODIFIED: Test 5 string-match → pointer to the real rule; dropped unused imports
- `apps/web/lib/share-text.ts` — NEW pure builders (SHARE-15/18, D-02)
- `apps/web/tests/share-text.test.ts` — NEW 6 unit tests (encoded URLs, ≤240-char text, purity)
- `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` — NEW RED scaffold (SC2, 6 `it.todo`)
- `packages/subgraph/tests/call-statement.test.ts` — NEW RED scaffold (SC3/D-05, 4 `it.todo`)

## Decisions Made

1. **`@typescript-eslint/parser` wired into the OG-scoped block** — ESLint's default Espree parser threw `Parsing error: Unexpected token NextRequest` on the TS OG routes, so the rule never reached the AST. The parser is already in the root `node_modules` (root devDep `@typescript-eslint/parser@^8`). Adding it to the OG-scoped `languageOptions` is the blocking auto-fix (Rule 3) that makes the rule actually lint.
2. **200px spec is an env-gated skip (`OG_200PX_BASELINES=1`)** rather than `test.fixme` — keeps the 5-word structure fully runnable and greppable now while guaranteeing it cannot block Wave 0 before Plan 07-03 seeds real settled-call IDs and commits baselines.
3. **`buildShareText` truncates the statement, never the identity** — under the 240-char cap it preserves `OUTCOME — @handle` and ellipsis-truncates the statement body, so the legible "who + what outcome" is always intact.
4. **Purity comment rephrase** — the source-grep purity test flags any literal `process.env`/`fetch(`. Rephrased the share-text doc comment to "environment reads / network calls" rather than relaxing the grep, keeping the T-07-01-02 guard strict.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @typescript-eslint/parser to the OG-scoped eslint block**
- **Found during:** Task 1 (running the eslint verify on `app/og`)
- **Issue:** ESLint's default Espree parser cannot parse TypeScript — `app/og/[callId]/route.ts` failed with `Parsing error: Unexpected token NextRequest`, so the rule never visited the AST and the verify was meaningless.
- **Fix:** Imported `@typescript-eslint/parser` (already in the root lockfile) and set it as the parser in the OG-scoped config's `languageOptions` (with `jsx: true`, `sourceType: 'module'`).
- **Files modified:** `apps/web/eslint.config.js`
- **Verification:** `pnpm --filter @call-it/web exec eslint app/og --max-warnings=0` exits 0 on real sources; a planted `display:'grid'`/`gridTemplateColumns` probe exits 1 with both rule messages.
- **Committed in:** `29c5a43` (Task 1 commit)

**2. [Rule 1 - Bug] Purity test failed on the share-text doc comment**
- **Found during:** Task 2 (share-text vitest run — 5/6 passing)
- **Issue:** The purity test greps the source for `process.env` / `fetch(`; the module's own doc comment literally contained those tokens, failing the assertion.
- **Fix:** Rephrased the comment ("environment reads / network calls") instead of weakening the grep — the strict source-level T-07-01-02 guard is preserved.
- **Files modified:** `apps/web/lib/share-text.ts`
- **Verification:** `pnpm --filter @call-it/web exec vitest run tests/share-text.test.ts` → 6/6 pass.
- **Committed in:** `92dfcac` (Task 2 commit)

**3. [Rule 1 - Bug] Removed now-unused imports in og-fallback.spec.ts**
- **Found during:** Task 1 (replacing the obsolete Test 5)
- **Issue:** After replacing the string-match body, `readFileSync` and `execSync` became unused imports (lint/TS noise).
- **Fix:** Trimmed the imports to just `existsSync`.
- **Files modified:** `apps/web/tests/og-fallback.spec.ts`
- **Verification:** File still parses; remaining Test 5 asserts the OG source files exist.
- **Committed in:** `29c5a43` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bug). **Impact:** All necessary for correctness — the parser fix makes the core SC1 gate real; the others are cleanups. No scope creep.

## Issues Encountered

- **Vitest `--reporter=line` is not a thing** — the plan's verify command tries Playwright `--reporter=line` first, then falls back to vitest. Running vitest with `--reporter=line` threw `Cannot find package 'line'`. Resolved by running plain `vitest run tests/share-text.test.ts` (the share-text suite is a vitest suite, not Playwright). The plan's `||` fallback structure anticipates this.

## Known Stubs

The two RED scaffolds (`auto-post-worker.test.ts`, `call-statement.test.ts`) are intentional `it.todo` placeholders, not stubs that block this plan's goal. They are the deliberate Wave-0 verification maps that Plans 07-04 and 07-02 turn green (documented in their headers + 07-VALIDATION.md). The 200px spec's placeholder `{callId}` URLs are likewise intentional and TODO-marked for Plan 07-03.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries beyond the plan's `<threat_model>`. T-07-01-01 (grid render) and T-07-01-02 (share-text purity) are both mitigated as specified; T-07-01-SC (no new deps) holds — zero packages installed.

## Next Phase Readiness

- **07-02** turns `packages/subgraph/tests/call-statement.test.ts` green (add `Call.statement` field + templated-default mapping).
- **07-03** seeds 5 settled-call IDs, wires the `{callId}` placeholders in `og-thumbnail-200px.spec.ts`, generates baselines, and enables `OG_200PX_BASELINES=1`.
- **07-04** turns `auto-post-worker.test.ts` green, importing the shared `share-text.ts` builders.
- **07-05** wires the web Share button to `twitterIntentUrl` / `warpcastComposeUrl`.

---
*Phase: 07-og-service-final-variants-subgraph-final-mappings*
*Completed: 2026-06-07*

## Self-Check: PASSED

- [x] `apps/web/eslint-rules/no-display-grid-in-og.js` exists
- [x] `apps/web/eslint.config.js` exists (modified)
- [x] `apps/web/tests/og-thumbnail-200px.spec.ts` exists
- [x] `apps/web/lib/share-text.ts` exists
- [x] `apps/web/tests/share-text.test.ts` exists
- [x] `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` exists
- [x] `packages/subgraph/tests/call-statement.test.ts` exists
- [x] `apps/web/tests/og-fallback.spec.ts` exists (modified)
- [x] Commit `29c5a43` (Task 1) exists in git log
- [x] Commit `92dfcac` (Task 2) exists in git log
- [x] eslint exits 0 on real OG sources, 1 on planted grid (both rule messages)
- [x] share-text vitest: 6/6 pass; auto-post scaffold 6 todo; subgraph scaffold 4 todo
