---
phase: quick-260610-vab
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/phase-1-gates.yml
  - apps/web/tests/visual-smoke.spec.ts
  - apps/web/tests/design-system-snap.spec.ts
autonomous: true
requirements: [QUICK-260610-VAB]

must_haves:
  truths:
    - "A Playwright test failure in the phase-1-complete-gate job fails the job — the `|| echo` escape is removed from the e2e step (and from the duplicate wallet-export step, which is deleted)"
    - "The e2e step runs the ENTIRE apps/web/tests/ suite (20 specs) with no explicit file list, so new specs are gated automatically"
    - "The phase-1-complete-gate job is runnable via workflow_dispatch (no tag required), and branch pushes actually trigger the workflow's per-push jobs (the tags-without-branches trigger bug is fixed)"
    - "Snapshot suites with win32-only goldens (visual-smoke, design-system-snap) skip with a documented in-file reason on non-win32 platforms instead of failing on missing linux baselines; no assertion or threshold is weakened per D-15 — win32 goldens stay authoritative for local runs"
    - "A clean green run of the full workflow including phase-1-complete-gate is on record on GitHub BEFORE the change lands on master"
    - "On Playwright failure, the HTML report and test-results (traces) are uploaded as a run artifact for debuggability"
  artifacts:
    - path: ".github/workflows/phase-1-gates.yml"
      provides: "Gated whole-suite e2e step, dispatchable gate job, fixed push trigger, mock-sentinel env, turbo build, artifact upload"
      contains: "github.event_name == 'workflow_dispatch'"
    - path: "apps/web/tests/visual-smoke.spec.ts"
      provides: "File-scope win32 platform guard with rationale comment"
      contains: "process.platform !== 'win32'"
    - path: "apps/web/tests/design-system-snap.spec.ts"
      provides: "File-scope win32 platform guard with rationale comment"
      contains: "process.platform !== 'win32'"
  key_links:
    - from: ".github/workflows/phase-1-gates.yml"
      to: "apps/web/tests/ (all 20 specs)"
      via: "playwright test with no file arguments"
      pattern: "playwright test --reporter=list,html"
    - from: ".github/workflows/phase-1-gates.yml phase-1-complete-gate job"
      to: "workflow_dispatch trigger"
      via: "extended if condition"
      pattern: "github.event_name == 'workflow_dispatch'"
    - from: ".github/workflows/phase-1-gates.yml build steps"
      to: "packages/shared + packages/ui dist"
      via: "turbo dependency-ordered build (^build)"
      pattern: "turbo run build --filter=@call-it/web"
---

<objective>
Make the "Run full Playwright e2e suite" step in `.github/workflows/phase-1-gates.yml` a real gate: remove the `|| echo` failure-swallowing escape, run the whole 20-spec suite instead of a stale 12-file list, upload the report on failure, and prove the workflow green on GitHub before it lands on master.

Purpose: the phase-1-complete gate currently cannot fail (escape hatch) and has NEVER run (trigger bug) — it provides zero protection. This plan turns it into an enforceable, dispatchable, evidence-backed gate.

Output: fixed workflow, win32 platform guards in the two win32-only snapshot suites, and a green `workflow_dispatch` run of the full gate on record.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.github/workflows/phase-1-gates.yml
@apps/web/playwright.config.ts
@apps/web/tests/visual-smoke.spec.ts
@apps/web/tests/design-system-snap.spec.ts

## Investigation evidence (verified 2026-06-10 during planning — do NOT re-derive)

1. **The workflow has ZERO runs in GitHub history.** `gh run list --workflow=289455776` returns `[]`. Remote repo created 2026-06-02; remote has NO tags (`git ls-remote --tags origin` is empty). Root cause: the `on.push` block declares `tags:` but NO `branches:` — GitHub semantics: when only `tags` is defined under `push`, branch pushes never trigger the workflow. The `pull_request` trigger never fired either (repo practice is direct master commits). Consequence: there is NO ubuntu log evidence for any spec; all CI behavior below is derived from source.
2. **`workflow_dispatch` already exists** in the `on:` block (line 34), but the `phase-1-complete-gate` job is gated by `if: startsWith(github.ref, 'refs/tags/phase-1-complete')` — a dispatch run (ref = refs/heads/...) skips exactly the job containing the playwright step. The fix is to extend that `if`, not to add the trigger.
3. **Build steps are broken on a fresh runner.** Both `signin-smoke` and `phase-1-complete-gate` run `pnpm --filter @call-it/web build`. apps/web depends on workspace packages `@call-it/shared` and `@call-it/ui` whose `dist/` is gitignored (known repo gotcha: Vercel needed `pnpm --filter @call-it/shared build` first). The repo's separate `CI` workflow is green on master using `pnpm turbo run ... build` (turbo `build.dependsOn: ["^build"]` builds deps first; web's workspace deps are only shared + ui + devDep config — contracts is NOT in web's dependency graph, so no forge needed).
4. **Mock-sentinel mismatch.** The gate job env sets `NEXT_PUBLIC_PRIVY_APP_ID: mock-app-id-for-ci-tests`. The Tier-2 skip guards in `new-call-publish.spec.ts:190` and `utc-day-boundary.spec.ts:96` only treat exactly `'test-app-id'` as mock (`hasPrivy = !!id && id !== 'test-app-id'`) — with the current value those "requires real Privy session" browser tests would RUN against a fake-Privy build and fail. All other specs use the robust `HAS_REAL_PRIVY_APP_ID` check (length >= 28, no `test`/`mock` prefixes or substrings), which treats `test-app-id` as mock too. So `test-app-id` is the one value every guard in the suite recognizes as mock.
5. **Snapshot goldens are win32-only.** All committed goldens are `*-chromium-win32.png`: visual-smoke (4 — all git-tracked), design-system-snap (5), og-thumbnail-200px (5). Only these 3 specs use `toHaveScreenshot` (verified by grep). On linux CI, Playwright looks for `*-chromium-linux.png`, finds nothing, and FAILS — missing snapshots are never auto-written on CI. visual-smoke has NO env guard (only a page-rendered check that likely passes: its own header says the mock Privy ID "triggers graceful disabled-state rendering rather than throwing"). design-system-snap self-skips only when `/design-system` renders the disabled state, i.e. when `NEXT_PUBLIC_DEV_ROUTES` is NOT baked at build — but the gate job env currently SETS `NEXT_PUBLIC_DEV_ROUTES: '1'`, which would un-skip its 5 snapshot tests on linux. og-thumbnail-200px self-skips without `OG_200PX_BASELINES=1` (unset on CI — fine, leave alone).
6. **visual-smoke strategy decision: CI-scoping platform guard (option b), NOT linux baselines (option a).** Justification: no linux baselines exist anywhere; there is no prior CI run to round-trip artifacts from; the dev box is win32, so maintaining a second baseline set would require a CI artifact round-trip on EVERY future visual change. The quick-task contract explicitly allows a documented platform-scoping guard — assertions/thresholds untouched per D-15; win32 goldens stay authoritative locally.
7. **og-fallback-bench:** Test 3 (p95 < 100ms hard gate) self-skips unless `OG_BENCH_SLO=1`; its own header comment says the authoritative reading needs quiet hardware (dev box measured ~285ms p50 under sibling load) and effectively names CI as the intended venue. Test 4 (informational) always runs and only needs `/api/og/fallback` to return 200. Decision: set `OG_BENCH_SLO: '1'` in the gate job env PROVISIONALLY; the verification run decides whether it stays (Task 3 triage).
8. **Tier-2 `PLAYWRIGHT_BASE_URL` specs** (feed-shell, leaderboard, profile-overview, profile-shell, quote-composer, receipt-meta) self-skip when it is unset — it is unset on CI; correct, leave alone. `wallet-export-prompt.spec.ts` Tier-2 self-skips on any `mock-`/`test-` prefixed app id; its Tier-1 source assertions run anywhere — so workflow step (i), which re-runs it with its own `|| echo` escape, becomes a duplicate once the whole suite runs in step (f), and must be deleted.
9. **Playwright config:** `reporter: 'list'` (no HTML report unless overridden on the CLI), `retries: 2` on CI, `workers: 1`, `trace: 'on-first-retry'`, webServer `pnpm start` with `reuseExistingServer: !CI`. The gate job has no `timeout-minutes` (defaults to 360).
10. **Unrelated red runs exist:** "Synthetic Alert Verification" fails on schedule, and some older "CI" runs were red (the latest is green). Do not confuse them with this gate during verification.
11. **Repo facts:** `gh` CLI authenticated; remote = GitHub origin, default branch master; pushes to master auto-deploy WEB via Vercel (workflow + test-skip-guard changes are harmless to the deployed app). The working tree has UNRELATED dirty/untracked files (.claude/launch.json, .gitignore, .planning/config.json, apps/web/.gitignore, "call it frontend/", docs/*, evidence/*, packages/contracts/lib/openzeppelin-contracts) — stage ONLY this plan's three files, never `git add -A`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix phase-1-gates.yml — gated whole-suite e2e, dispatchable gate job, working triggers/env/build</name>
  <files>.github/workflows/phase-1-gates.yml</files>
  <action>
Apply the following edits to `.github/workflows/phase-1-gates.yml`. Every edit gets a short YAML comment explaining WHY (so future operators do not re-introduce these bugs). Do not touch the bodies of jobs/steps not listed here (parity-diff, solc-pin-guard, usdc-paste-guard, no-display-grid-eslint, relayer-tests, provider-order-ast stay as-is). Use Read then targeted Edits — the file is ~440 lines; do not rewrite untouched jobs.

1. **Fix the dead push trigger.** In the `on.push` block, add `branches: ['**']` alongside the existing `paths:` and `tags:` keys. Comment: GitHub gotcha — a `push` block that declares `tags:` but no `branches:` NEVER triggers on branch pushes; this workflow had zero runs since repo creation (verified 2026-06-10, quick-260610-vab). `paths:` still scopes branch pushes; per GitHub docs, `paths` is not evaluated for tag pushes. Also correct the now-false claim in the nearby comment (lines ~22-25) that "Per-PR jobs are skipped on tag pushes" — paths filters apply at the workflow trigger level, not per-job, so on a `phase-1-complete*` tag push ALL jobs run (desirable: the gate job `needs:` them).

2. **Make the gate job dispatchable.** Change the `phase-1-complete-gate` job condition to: `if: startsWith(github.ref, 'refs/tags/phase-1-complete') || github.event_name == 'workflow_dispatch'`. Comment: workflow_dispatch exercises the full gate without pushing a tag — used for pre-master verification via `gh workflow run "Phase 1 Gates" --ref <branch>`. Also add `timeout-minutes: 45` to the gate job (default is 360; the full suite is roughly 10-20 min on a 2-core runner; 45 caps a hung webServer). Update the operator-procedure comment block above the job to mention the dispatch alternative.

3. **Fix the mock Privy sentinel in BOTH jobs.** In the `signin-smoke` job env AND the `phase-1-complete-gate` job env, change `NEXT_PUBLIC_PRIVY_APP_ID: mock-app-id-for-ci-tests` to `NEXT_PUBLIC_PRIVY_APP_ID: test-app-id`. Comment: `test-app-id` is the one mock sentinel EVERY spec's skip guard recognizes — new-call-publish.spec.ts and utc-day-boundary.spec.ts Tier-2 guards match it exactly (`!== 'test-app-id'`), and all other specs' `HAS_REAL_PRIVY_APP_ID` checks catch it via the `test-` prefix / `test` substring / length < 28. The previous value silently un-skipped two real-Privy Tier-2 browser suites on CI.

4. **Stop baking dev routes into the gate build.** Remove `NEXT_PUBLIC_DEV_ROUTES: '1'` from the `phase-1-complete-gate` job env. Leave a comment at that spot: design-system-snap goldens are win32-only; baking dev routes into the linux CI build would un-skip its 5 snapshot tests with no linux baselines to compare, and the gate should test a production-faithful build anyway. Goldens are regenerated on the win32 dev box (command in the spec header).

5. **Enable the SHARE-11 SLO gate provisionally.** Add `OG_BENCH_SLO: '1'` to the `phase-1-complete-gate` job env. Comment: CI runners are quiet hardware — the authoritative SHARE-11 p95 < 100ms enforcement point per og-fallback-bench.spec.ts's own header (the dev box measures the box, not the pipeline). Note in the comment that this line survives only if the quick-260610-vab verification run proved the runner holds the SLO; otherwise Task 3 removes it and records the measured p95.

6. **Fix both build steps.** In `signin-smoke` ("Build Next.js app (webpack, bakes NEXT_PUBLIC_* vars into bundle)") and `phase-1-complete-gate` step (d) ("Build Next.js app"), change `pnpm --filter @call-it/web build` to `pnpm turbo run build --filter=@call-it/web`. Comment: apps/web depends on workspace packages @call-it/shared and @call-it/ui whose dist/ is gitignored — a bare filter build fails on a fresh runner; turbo's `^build` builds dependencies first (same recipe as the green CI workflow; no TURBO_TOKEN needed — turbo just skips remote cache).

7. **Replace step (f) with the real gate.** Replace the "Run full Playwright e2e suite" step's stale ordering comment (the 12-file list, lines ~373-375) and its multi-line run block (lines ~377-391). New comment: runs the ENTIRE apps/web/tests/ directory (20 specs) with no explicit file list so new specs are gated automatically; env-gated tiers self-skip deterministically on CI — Tier-2 deployed-URL tests (PLAYWRIGHT_BASE_URL unset), real-Privy tiers (test-app-id sentinel), og-thumbnail-200px (OG_200PX_BASELINES unset), win32-only visual goldens (in-spec platform guard, see quick-260610-vab). New run command, single line, NO `|| echo` escape — any test failure fails the job: `pnpm --filter @call-it/web exec playwright test --reporter=list,html`. The `--reporter=list,html` CLI override is needed because playwright.config.ts pins `reporter: 'list'`; the html reporter writes apps/web/playwright-report/ for the failure artifact and does not auto-open on CI.

8. **Add the failure artifact step** immediately after step (f): `actions/upload-artifact@v4` with `if: failure()`, `name: playwright-report-${{ github.run_id }}`, a two-entry `path:` of `apps/web/playwright-report/` and `apps/web/test-results/`, `if-no-files-found: ignore`, `retention-days: 7`. Comment: traces are recorded on first retry (`trace: 'on-first-retry'`, CI `retries: 2`), so failures ship with traces.

9. **Delete step (i)** ("Run wallet export prompt tests", lines ~429-431, including its `── (i) ──` section comment and its `|| echo` escape). It is fully subsumed: wallet-export-prompt.spec.ts now runs inside the whole-suite step (f) — Tier-1 source assertions execute; Tier-2 self-skips on the test-app-id sentinel. Adjust remaining section-letter comments only if trivial; comment correctness beats letter continuity.
  </action>
  <verify>
    <automated>bash -c 'cd "/c/Users/woshv/Desktop/Call it" && W=.github/workflows/phase-1-gates.yml && ! grep -q "Some Playwright tests may use" $W && ! grep -q "wallet-export-prompt tests skipped" $W && ! grep -q "mock-app-id-for-ci-tests" $W && grep -vE "^\s*#" $W | { ! grep -q "NEXT_PUBLIC_DEV_ROUTES"; } && grep -q "github.event_name == .workflow_dispatch." $W && grep -q -- "--reporter=list,html" $W && grep -q "turbo run build --filter=@call-it/web" $W && grep -vE "^\s*#" $W | grep -q "OG_BENCH_SLO" && grep -q "upload-artifact@v4" $W && grep -q "timeout-minutes: 45" $W && grep -vE "^\s*#" $W | grep -q "branches:" && echo TASK1-GATES-PASS'</automated>
  </verify>
  <done>The playwright step runs the whole suite with no `|| echo` escape; gate job is dispatchable with a 45-min cap; both jobs build via turbo; mock sentinel is `test-app-id` in both jobs; `NEXT_PUBLIC_DEV_ROUTES` removed; `OG_BENCH_SLO: '1'` present (provisional); upload-artifact step exists with `if: failure()`; step (i) deleted; `branches: ['**']` added to on.push. All grep gates pass.</done>
</task>

<task type="auto">
  <name>Task 2: Add win32 platform guards to the two win32-only snapshot suites</name>
  <files>apps/web/tests/visual-smoke.spec.ts, apps/web/tests/design-system-snap.spec.ts</files>
  <action>
Add a file-scope conditional skip to both snapshot suites so they skip (with a documented reason) on any non-win32 platform, instead of hard-failing on missing `*-chromium-linux.png` baselines on ubuntu CI. This is CI/platform SCOPING, not assertion weakening — no `toHaveScreenshot` call, `maxDiffPixelRatio`, or any other assertion/threshold is modified (D-15). win32 goldens remain authoritative for local runs.

In `apps/web/tests/visual-smoke.spec.ts`: directly after the import statement (line ~39), add a comment block plus a file-scope guard: `test.skip(process.platform !== 'win32', 'Visual goldens are win32-only (*-chromium-win32.png) — no baselines exist for this platform');`. Playwright supports `test.skip(condition, reason)` at file scope to conditionally skip the entire file. The comment block must explain: (a) Playwright suffixes screenshot baselines per-platform, and the committed goldens are exclusively `-chromium-win32.png`; (b) on CI, missing snapshots are never auto-written — a linux run would fail every `toHaveScreenshot` with "A snapshot doesn't exist"; (c) CI-scoping was chosen over committing a linux baseline set because the dev box is win32 and every future visual change would need a CI artifact round-trip to regenerate linux goldens (decision: quick-260610-vab); (d) to regenerate goldens, run the `--update-snapshots` command from the file header on the win32 dev box. Also update the file-header `## Skip condition` section to mention the platform guard alongside the existing Privy-render skip.

In `apps/web/tests/design-system-snap.spec.ts`: add the same comment-plus-guard immediately after its imports. Note in the comment that this is belt-and-suspenders: the phase-1-gates gate job no longer bakes `NEXT_PUBLIC_DEV_ROUTES` (so the suite already self-skips on CI via disabled-state detection), but the platform guard keeps the suite safe if an operator ever re-enables dev routes on a linux CI build.

Do NOT touch `og-thumbnail-200px.spec.ts` — its `OG_200PX_BASELINES=1` env contract already keeps it off CI, and that env contract is documented and deliberate.
  </action>
  <verify>
    <automated>bash -c 'cd "/c/Users/woshv/Desktop/Call it" && grep -q "process.platform !== .win32." apps/web/tests/visual-smoke.spec.ts && grep -q "process.platform !== .win32." apps/web/tests/design-system-snap.spec.ts && grep -c "toHaveScreenshot" apps/web/tests/visual-smoke.spec.ts | grep -qx 4 && grep -c "toHaveScreenshot" apps/web/tests/design-system-snap.spec.ts | grep -qx 5 && pnpm --filter @call-it/web exec playwright test tests/visual-smoke.spec.ts tests/design-system-snap.spec.ts --list >/dev/null && echo TASK2-GATES-PASS'</automated>
  </verify>
  <done>Both spec files have a file-scope `test.skip(process.platform !== 'win32', ...)` guard with a rationale comment referencing quick-260610-vab; assertion counts are unchanged (4 and 5 `toHaveScreenshot` calls respectively); `playwright test --list` still parses both files. On win32 (dev box) the guards are no-ops.</done>
</task>

<task type="auto">
  <name>Task 3: Prove the gate green on GitHub via branch + workflow_dispatch, then land on master</name>
  <files>.github/workflows/phase-1-gates.yml</files>
  <action>
Verify the workflow ACTUALLY passes on GitHub-hosted ubuntu before it reaches master, using a test branch + dispatch (master never goes red). The working tree contains unrelated dirty/untracked files — stage ONLY the three plan files by explicit path; never use `git add -A` or `git add .`.

Mechanics (run from repo root with the Bash tool):
1. `git checkout -b ci/quick-260610-vab-playwright-gate` from current master HEAD. Stage exactly: `git add .github/workflows/phase-1-gates.yml apps/web/tests/visual-smoke.spec.ts apps/web/tests/design-system-snap.spec.ts`. Commit: `ci(quick-260610-vab): make Phase-1-Gates playwright e2e step a real whole-suite gate`. Push: `git push -u origin ci/quick-260610-vab-playwright-gate`. Note: this branch push itself now triggers the workflow's per-push jobs (Task 1 added `branches: ['**']`, and the workflow file is in `paths:`) plus the unrelated CI/Grep Guards workflows — the per-push jobs do NOT include the gate job; ignore them in favor of the dispatch run below (they will also be exercised inside it via `needs:`).
2. Dispatch the full gate on the branch: `gh workflow run "Phase 1 Gates" --ref ci/quick-260610-vab-playwright-gate`. This is accepted because master's copy of the workflow already declares `workflow_dispatch`; the run executes the BRANCH's modified copy, and the extended `if:` from Task 1 makes the `phase-1-complete-gate` job run on dispatch. Wait ~15s, then capture the run id: `gh run list --workflow "Phase 1 Gates" --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId"`. Watch to completion: `gh run watch <id> --exit-status` (the full gate is roughly 15-25 min; use a generous Bash timeout or poll `gh run view <id> --json status,conclusion` in a loop).
3. Triage on failure (`gh run view <id> --log-failed` for evidence):
   - ONLY og-fallback-bench "Test 3" fails with measured p95 >= 100ms → the runner cannot hold the SHARE-11 SLO: remove `OG_BENCH_SLO: '1'` from the gate job env and replace it with a comment recording the measured p95, the date, and "GitHub 2-core runner cannot hold SHARE-11 p95<100ms; SLO gate remains opt-in via OG_BENCH_SLO=1 on quiet dedicated hardware". Commit, push, re-dispatch, watch again. (If it passes, the provisional env var stays — CI becomes the authoritative SHARE-11 enforcement point.)
   - Any "A snapshot doesn't exist" failure → a platform guard from Task 2 missed a path; extend the SAME guard pattern to the affected spec. Never delete or loosen a `toHaveScreenshot` assertion (D-15).
   - Build failure resolving `@call-it/shared` / `@call-it/ui` → confirm the turbo build edit from Task 1 step 6 was applied to BOTH jobs.
   - Anything else → fix forward on the branch and re-dispatch. The fix must be env/skip-guard scoping or workflow plumbing — NEVER weakened assertions or thresholds (D-15), and NEVER a global `--ignore-snapshots` flag (it would also disable the deliberate OG_200PX_BASELINES=1 comparisons).
   - Sanity: only triage runs of "Phase 1 Gates". "Synthetic Alert Verification" has known scheduled failures, and older "CI" runs were red — unrelated.
4. When the dispatch run is fully green (verify every job including `phase-1-complete-gate` shows success in `gh run view <id>`): record the run URL for the SUMMARY, then land on master: `git checkout master && git merge --ff-only ci/quick-260610-vab-playwright-gate && git push origin master && git push origin --delete ci/quick-260610-vab-playwright-gate`. The master push triggers the per-push jobs (first time ever on master) and the Vercel web auto-deploy (harmless — only workflow + test-skip guards changed). Watch the master push run green: `gh run list --workflow "Phase 1 Gates" --branch master --limit 1 --json databaseId --jq ".[0].databaseId"` then `gh run watch <id> --exit-status` — these jobs already passed inside the dispatch run, so green is expected.
5. In the SUMMARY, record: the green dispatch run URL, the final OG_BENCH_SLO decision with the measured p95 from the run log (search the log for "OG Fallback warm render"), and the count of passed/skipped tests from the playwright step output.
  </action>
  <verify>
    <automated>bash -c 'cd "/c/Users/woshv/Desktop/Call it" && test "$(git rev-parse master)" = "$(git rev-parse origin/master)" && gh run list --workflow "Phase 1 Gates" --event workflow_dispatch --limit 1 --json conclusion --jq ".[0].conclusion" | grep -qx success && gh run list --workflow "Phase 1 Gates" --branch master --limit 1 --json conclusion --jq ".[0].conclusion" | grep -qx success && echo TASK3-GATES-PASS'</automated>
  </verify>
  <done>A fully green workflow_dispatch run of "Phase 1 Gates" (every job, including phase-1-complete-gate) exists on GitHub; master is fast-forwarded to the verified commit and pushed; the subsequent master per-push run is green; the OG_BENCH_SLO keep/remove decision is made from run-log evidence and recorded; the verification branch is deleted.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub Actions CI | Executes repo-defined workflows; gate results feed phase-close decisions |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vab-01 | Tampering | phase-1-gates.yml e2e step | mitigate | Remove the `\|\| echo` escape so test failures fail the job (the gate could previously never fail) |
| T-vab-02 | Repudiation | e2e step spec coverage | mitigate | Run the whole tests/ directory — the stale 12-file list silently excluded 8 specs from gating |
| T-vab-03 | Elevation of Privilege | workflow_dispatch on gate job | accept | Dispatch requires repo write access; solo-dev repo, `permissions: contents: read` already set |
| T-vab-SC | Tampering | package installs | accept (n/a) | No new packages installed by this plan — only `actions/upload-artifact@v4`, a first-party GitHub action pinned by major |
</threat_model>

<verification>
1. `.github/workflows/phase-1-gates.yml` contains no `|| echo` escape on any Playwright step; the e2e step runs `playwright test` with no file list; upload-artifact step present with `if: failure()`.
2. Both win32-only snapshot specs carry the file-scope platform guard; `toHaveScreenshot` counts unchanged (4 + 5); no assertion/threshold edits anywhere (D-15).
3. GitHub shows a green workflow_dispatch run of "Phase 1 Gates" with the phase-1-complete-gate job succeeded, dated before the master merge.
4. origin/master == local master == the verified commit; latest master per-push run of "Phase 1 Gates" is green.
5. OG_BENCH_SLO decision recorded in SUMMARY with measured p95 from the run log.
</verification>

<success_criteria>
- The phase-1-complete-gate Playwright step is a real gate: whole 20-spec suite, failures fail the job, report artifact on failure.
- The workflow actually triggers: branch pushes run per-push jobs; workflow_dispatch runs the full gate including phase-1-complete-gate.
- Snapshot suites are platform-scoped with documented rationale — win32 goldens authoritative locally, no weakened assertions (D-15).
- A green full-gate run is on record on GitHub and the change is merged to master only after that evidence exists.
</success_criteria>

<output>
Create `.planning/quick/260610-vab-make-ci-playwright-step-a-real-gate-cove/260610-vab-SUMMARY.md` when done. Must include: the green dispatch run URL, the master per-push run URL, the OG_BENCH_SLO keep/remove decision with measured p95, and passed/skipped counts from the CI playwright step.
</output>
