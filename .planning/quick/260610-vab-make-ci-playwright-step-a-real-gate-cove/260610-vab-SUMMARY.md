---
phase: quick-260610-vab
plan: 01
subsystem: ci
tags: [github-actions, playwright, workflow-dispatch, visual-snapshots, share-11]

requires:
  - phase: 01
    provides: phase-1-gates.yml workflow + apps/web/tests/ playwright suite (20 specs)
provides:
  - "Enforceable phase-1-complete-gate: whole-suite playwright step with no failure-swallowing escape"
  - "Dispatchable gate job (workflow_dispatch) + working branch-push triggers"
  - "win32 platform guards on the two win32-only snapshot suites"
  - "Green full-gate run on GitHub record (first ever run of this workflow)"
affects: [phase-close gates, future spec additions (auto-gated)]

tech-stack:
  added: []
  patterns:
    - "GitHub on.push with tags requires explicit branches: ['**'] or branch pushes never trigger"
    - "pnpm --filter <pkg> exec vitest (not bare `vitest`) when the package has no vitest script"
    - "test.skip(process.platform !== 'win32', reason) file-scope guard for platform-suffixed goldens"

key-files:
  created: []
  modified:
    - .github/workflows/phase-1-gates.yml
    - apps/web/tests/visual-smoke.spec.ts
    - apps/web/tests/design-system-snap.spec.ts

key-decisions:
  - "OG_BENCH_SLO REMOVED after run-log evidence: GitHub 2-core runner cannot hold SHARE-11 p95<100ms deterministically (measured p95 150.85ms / 134.87ms / 99.88ms across 3 attempts — passed only as flaky with 0.12ms margin). SLO gate stays opt-in via OG_BENCH_SLO=1 on quiet dedicated hardware."
  - "usdc-paste-guard allowlist extended to the 4 canonical negative-test fixtures (usdc.ts, usdc.test.ts, USDC.sol, USDC.t.sol) + build-artifact dir exclusions — guard intent (catch accidental wrong-USDC pastes in production paths) preserved"
  - "test-app-id is the canonical CI mock Privy sentinel (every spec guard recognizes it)"

requirements-completed: [QUICK-260610-VAB]

duration: ~50min
completed: 2026-06-10
---

# Quick Task 260610-vab: Make CI Playwright Step a Real Gate Summary

**Phase-1-Gates playwright step now runs the whole 20-spec suite with no `|| echo` escape, the gate job is dispatchable, the dead tags-without-branches push trigger is fixed, and a fully green dispatch run (129 passed / 83 skipped / 0 failed) is on GitHub record before the change landed on master — the workflow's first run ever also exposed and fixed 2 latent per-push job bugs.**

## Evidence (required outputs)

| Item | Value |
|------|-------|
| Green dispatch run (full gate, all 8 jobs success) | https://github.com/Woshvad/call-it/actions/runs/27309931329 |
| Master per-push run (green; gate job correctly skipped on plain push) | https://github.com/Woshvad/call-it/actions/runs/27310334588 |
| Playwright step counts (final green run) | 212 tests collected → **129 passed, 83 skipped, 0 failed, 0 flaky** (8.4s test wall-clock) |
| OG_BENCH_SLO decision | **REMOVED** (commit 78266d9). Run 27309389648 measured "OG Fallback warm render" p95 = **150.85ms** (attempt 1), **134.87ms** (retry 1), **99.88ms** (retry 2 — 0.12ms margin); Test 3 passed only as "flaky". Verdict recorded in the workflow env comment: GitHub 2-core runner cannot hold SHARE-11 p95<100ms; gate stays opt-in via OG_BENCH_SLO=1 on quiet dedicated hardware. |

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `7d1519d` | ci: real whole-suite gate — escape removed, dispatchable gate (`timeout-minutes: 45`), `branches: ['**']` trigger fix, `test-app-id` sentinel in both jobs, DEV_ROUTES dropped from gate build, provisional OG_BENCH_SLO, turbo builds, failure artifact upload, duplicate step (i) deleted |
| 2 | `3f54085` | test: file-scope `test.skip(process.platform !== 'win32', ...)` guards in visual-smoke + design-system-snap with rationale comments; assertion counts unchanged (4 + 5 `.toHaveScreenshot(` calls), no threshold edits (D-15) |
| 3 (fix-forward 1) | `2210c11` | ci: fix 2 latent per-push bugs exposed by the first-ever run — `exec vitest` for @call-it/shared (no vitest script → ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT) in both the parity-diff job and gate step (b); USDC.e grep allowlist extended to the 4 negative-test fixtures + build-artifact dirs in both the usdc-paste-guard job and gate step (h) |
| 3 (fix-forward 2) | `78266d9` | ci: remove provisional OG_BENCH_SLO per triage evidence (flaky on the runner) |

Master fast-forwarded to `78266d9` and pushed only AFTER the green dispatch run; verification branch `ci/quick-260610-vab-playwright-gate` deleted locally and on origin.

## Verification-run history (fix-forward iterations)

1. **Run 27308930105 — FAILED** (per-push jobs; gate skipped via `needs:`). Two latent bugs, both pre-existing and never before exercised (the workflow had zero runs in history):
   - `parity-diff`: `pnpm --filter @call-it/shared vitest run ...` → `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` (no "vitest" script). Fixed with `exec vitest` (verified locally: 30/30 pass).
   - `usdc-paste-guard`: stale single-file allowlist — the bridged address legitimately appears in 3 more deliberate negative-test files (`packages/contracts/src/constants/USDC.sol` WARNING comment, `packages/contracts/test/USDC.t.sol`, `packages/shared/test/usdc.test.ts`). Allowlist extended; build-artifact dirs (`dist/.next/.turbo/out/target`) also excluded because the gate job builds shared/ui/web BEFORE its copy of the grep runs and `dist/*.d.ts` re-declares the fixture constant.
2. **Run 27309389648 — SUCCESS but flaky** (all 8 jobs green; 129 passed / 82 skipped / **1 flaky**). The flaky test was og-fallback-bench Test 3 under the provisional `OG_BENCH_SLO=1` — failed twice on the p95<100ms gate, passed retry #2 at 99.88ms. Per the plan's triage rule, this does not prove the runner holds the SLO; env var removed and measured p95s recorded in the workflow comment.
3. **Run 27309931329 — FULLY GREEN, zero flaky** (final evidence run; bench Test 3 now self-skips → 83 skipped).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Latent `vitest` invocation bug in parity-diff + gate step (b)**
- **Found during:** Task 3 (run 27308930105 triage)
- **Issue:** `pnpm --filter @call-it/shared vitest run` — package has no "vitest" script; both copies of the command could never have worked
- **Fix:** `pnpm --filter @call-it/shared exec vitest run __tests__/call-gates-parity.test.ts` (workflow plumbing, no assertion change)
- **Files modified:** .github/workflows/phase-1-gates.yml
- **Commit:** 2210c11

**2. [Rule 3 - Blocking] Stale USDC.e grep allowlist in usdc-paste-guard + gate step (h)**
- **Found during:** Task 3 (run 27308930105 triage)
- **Issue:** single-file allowlist predates the 3 other deliberate negative-test fixture files; the gate-job copy would additionally trip on built `dist/*.d.ts`
- **Fix:** allowlist extended to exactly the 4 canonical fixtures + build-artifact dir exclusions, with rationale comments; guard intent (catch accidental pastes in production source) preserved
- **Files modified:** .github/workflows/phase-1-gates.yml
- **Commit:** 2210c11

**3. [Rule 1 - Bug] Task 2's automated verify gate was unsatisfiable as written**
- **Found during:** Task 2 verification
- **Issue:** the plan's gate `grep -c "toHaveScreenshot" visual-smoke.spec.ts | grep -qx 4` counts LINES containing the string — the committed pre-change file already had 5 (4 assertions + 1 file-header comment mention), so the gate could never pass even before any edit
- **Fix:** verified the plan's actual intent precisely: `grep -cF ".toHaveScreenshot("` = 4 (visual-smoke) and 5 (design-system-snap) — assertion call counts unchanged; also reworded the new guard comments to avoid the literal string so the files' total mention counts stay at their pre-existing 5/5
- **Files modified:** apps/web/tests/visual-smoke.spec.ts, apps/web/tests/design-system-snap.spec.ts
- **Commit:** 3f54085

### Plan-sanctioned triage

**4. OG_BENCH_SLO removed (plan Task 3 triage path, not a deviation in substance)** — Task 1 added it provisionally; the verification run's own evidence (3 measured p95s, 2 over threshold) triggered the plan's designated removal path. The Task-1 grep gate clause "non-comment OG_BENCH_SLO present" is intentionally no longer true after this triage; the plan explicitly anticipated this outcome.

**5. Tasks 1-2 committed on local master before branching** — the plan scripted branch-first-then-commit; commits were made on local master and the branch was created at the same HEAD. Equivalent outcome: origin/master received nothing until the green dispatch run existed, and the ff-only merge landed the identical verified commits.

## Out-of-scope discovery (logged, NOT fixed)

`grep-guards.yml` (separate workflow) is silently broken: every `rg`-based check logs `rg: command not found` and then prints PASS — ripgrep is not preinstalled on current ubuntu-latest runners and the `if rg ...; then fail` pattern treats exit-127 as "no match". All its USDC.e checks are no-ops. Logged with fix guidance in `deferred-items.md` (same directory as this summary).

## Known Stubs

None — changes are workflow plumbing and test platform guards only; no app code or data paths touched.

## Threat Flags

None new. T-vab-01 (escape removal) and T-vab-02 (whole-suite coverage) mitigations implemented as planned. The USDC.e allowlist extension covers only pre-existing, deliberate negative-test fixture files and excludes only generated build artifacts; production source paths remain fully guarded.

## Self-Check: PASSED

- .github/workflows/phase-1-gates.yml — FOUND (no `|| echo` on any playwright step; whole-suite run; upload-artifact present)
- apps/web/tests/visual-smoke.spec.ts — FOUND (platform guard present; 4 assertions)
- apps/web/tests/design-system-snap.spec.ts — FOUND (platform guard present; 5 assertions)
- Commits 7d1519d, 3f54085, 2210c11, 78266d9 — FOUND on master (origin/master == local master == 78266d9)
- Dispatch run 27309931329 conclusion=success; master push run 27310334588 conclusion=success; branch deleted on origin
