---
phase: quick-260610-vab
reviewed: 2026-06-10T00:00:00Z
depth: quick
files_reviewed: 3
files_reviewed_list:
  - .github/workflows/phase-1-gates.yml
  - apps/web/tests/design-system-snap.spec.ts
  - apps/web/tests/visual-smoke.spec.ts
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues_found
---

# Quick 260610-vab: Code Review Report

**Reviewed:** 2026-06-10
**Depth:** quick (pattern scan + targeted verification of the 4-commit diff `7d1519d^..78266d9`)
**Files Reviewed:** 3
**Status:** issues_found

## Summary

The core change is sound and verified against the diff: the Playwright gate step (f) is now a single-line `run:` with no `|| echo` escape — its exit code propagates and fails the job. The two latent per-push bugs (parity-diff vitest invocation, USDC.e allowlist) are fixed as described, and `permissions: contents: read` hardening is in place with no untrusted-input interpolation anywhere in the workflow.

**Answers to the CRITICAL review questions:**

1. **Platform guards — correctly scoped.** The diff adds only a file-level `test.skip(process.platform !== 'win32', ...)` to each spec; no assertion, threshold, or describe body was modified. Verified by reading every test in both files: each test contains exactly one assertion — `toHaveScreenshot()` — preceded only by locator-count checks used as *skip* conditions (not assertions). No non-snapshot coverage existed to lose. The guard provably worked on the green linux dispatch run: the visual-smoke pages render under mocks (the count checks would pass), so without the guard the suite would have failed with "A snapshot doesn't exist" — green is only possible via the skip.
2. **Remaining silent-failure paths — YES, one critical.** The gate's own steps are clean (single-line runs, `-e` default shell, `|| true` only on greps whose output is checked afterward), but the gate `needs:` the `relayer-tests` job, which still carries a `|| echo` escape that has gone stale — see CR-01. The `no-display-grid-eslint` per-push job has the same pattern (WR-01, mitigated by gate step g).
3. **Failure-artifact upload — correctly scoped.** `if: failure()` triggers on any prior step failure in the job; the step is positioned immediately after the Playwright step (steps after it failing is fine — no report needed then); `if-no-files-found: ignore` handles pre-Playwright failures; the trace claim matches `playwright.config.ts` (`retries: 2` on CI, `trace: 'on-first-retry'`). Only nit: artifact-name collision on re-run attempts (IN-01).
4. **Security — clean.** Workflow-level `permissions: contents: read`; `pull_request` (not `pull_request_target`); `workflow_dispatch` has no inputs; the only expression in a step parameter is `${{ github.run_id }}` (trusted context, used in an artifact name, not a `run:` block).

The Privy sentinel claim was independently verified: all four `HAS_REAL_PRIVY_APP_ID` guard variants reject `test-app-id` via the `length >= 28` clause alone (length 11), plus `test-`/`includes('test')` clauses; `new-call-publish.spec.ts:191` and `utc-day-boundary.spec.ts:97` match `!== 'test-app-id'` exactly. All 9 win32 snapshot baselines are committed (`git ls-files` confirms both `*-snapshots/` dirs are tracked).

## Critical Issues

### CR-01: `relayer-tests` job cannot fail — stale `|| echo` escape on a now-real test suite, and the gate never runs relayer tests itself

**File:** `.github/workflows/phase-1-gates.yml:233`
**Issue:** The job runs:
```yaml
run: pnpm --filter @call-it/relayer test || echo "::notice::@call-it/relayer test script not yet populated (Plan 07). Will enforce when available."
```
The justification is stale: `apps/relayer/package.json` has `"test": "vitest run"` and `apps/relayer/__tests__/` contains 10+ test files (Plan 07 completed phases ago). A real relayer test failure exits non-zero from pnpm, is swallowed by `|| echo`, and the job goes green. This is the exact defect class (an `|| echo` escape making a gate unable to fail) that quick-260610-vab existed to remove from the Playwright step — it survives untouched one job above. Compounding it: `phase-1-complete-gate` lists `relayer-tests` in `needs:` but its own steps (a)–(h) never run the relayer suite, so relayer unit tests can currently fail without failing **any** CI job, per-push or gate. A green run proves nothing about the relayer suite — its output has been swallowed since the workflow first ran.
**Fix:**
```yaml
- name: Run relayer tests
  run: pnpm --filter @call-it/relayer test
```
Before merging, run the relayer suite once on a linux runner (dispatch) to confirm it has no undeclared environment dependencies (e.g., the local `callit-postgres` DB). If some tests require live services, skip those via an env guard inside the tests (the established `HAS_REAL_*` pattern) — never via a step-level `|| echo`.

## Warnings

### WR-01: Per-push `no-display-grid-eslint` job swallows real ESLint failures

**File:** `.github/workflows/phase-1-gates.yml:194`
**Issue:** `pnpm --filter @call-it/ui lint || echo "::notice::@call-it/ui not yet available (Plan 04)..."` — also stale: `packages/ui/package.json` has `"lint": "eslint src/"` and the package is long populated. Real lint failures (including the display:grid rule this job exists for) are swallowed on every push/PR. The gate job runs the same lint without an escape (step g, line 472), but the gate only executes on tag pushes or dispatch — so on the normal push/PR path, ESLint on `@call-it/ui` is decorative. The raw-grep fallback step (lines 196–207) only covers `apps/web/app/og/` and `apps/web/components/og/`, not `packages/ui/`.
**Fix:** Remove the `|| echo` escape:
```yaml
run: pnpm --filter @call-it/ui lint
```

### WR-02: USDC.e paste guard is case-sensitive — a lowercase paste evades it

**File:** `.github/workflows/phase-1-gates.yml:153` (also 482, same pattern in the gate job)
**Issue:** `grep -rE "0xFF970A61[A-Fa-f0-9]+"` matches only the checksummed prefix casing. Addresses copied from viem output, subgraph entities, or block explorers are frequently all-lowercase (`0xff970a61a04b1ca14834a43f5de4533ebddb5cc8`) — such a paste into a transfer path would sail through this guard, defeating its stated purpose ("accidental paste of bridged USDC would silently route funds to non-redeemable token").
**Fix:** Make the search case-insensitive (the four allowlisted fixture paths are unaffected since the `grep -v` filters match on path, not address):
```bash
VIOLATIONS=$(grep -riE "0xFF970A61[A-Fa-f0-9]+" \
  --include="*.sol" --include="*.ts" --include="*.tsx" \
  ...)
```

### WR-03: Trigger `paths` filters miss `packages/ui/**` and relayer test/config files — the gated code can change without running the gates

**File:** `.github/workflows/phase-1-gates.yml:22-27, 36-41`
**Issue:** Both `push.paths` and `pull_request.paths` list `packages/contracts/**`, `packages/shared/**`, `apps/relayer/src/**`, `apps/web/**`, and the workflow file. Two gaps:
1. `packages/ui/**` is absent entirely — yet two jobs exist specifically to gate that package (`no-display-grid-eslint` lints it; the design-system snapshots baseline its primitives). A push touching only a UI primitive triggers zero gates.
2. `apps/relayer/src/**` excludes `apps/relayer/__tests__/`, `apps/relayer/package.json`, and vitest config — a push that deletes or weakens relayer tests never triggers `relayer-tests` (compounds CR-01: a test-weakening change is invisible to CI under D-15).
**Fix:** Add to both paths lists:
```yaml
- 'packages/ui/**'
- 'apps/relayer/**'
```
(replacing `apps/relayer/src/**` with `apps/relayer/**`).

## Info

### IN-01: Playwright report artifact name collides on re-run attempts

**File:** `.github/workflows/phase-1-gates.yml:463`
**Issue:** `name: playwright-report-${{ github.run_id }}` — `run_id` is constant across re-run attempts, and `actions/upload-artifact@v4` returns a 409 conflict when an artifact with the same name already exists in the run. Re-running a failed gate would fail the upload step and lose the second attempt's report (cosmetic — the job is already failing — but it defeats the debuggability goal on exactly the flaky-retry path where it matters most).
**Fix:** `name: playwright-report-${{ github.run_id }}-${{ github.run_attempt }}`

### IN-02: Spec headers document a goldens path that does not exist

**File:** `apps/web/tests/design-system-snap.spec.ts:9`, `apps/web/tests/visual-smoke.spec.ts:9`
**Issue:** Both headers state goldens live in `apps/web/tests/__screenshots__/<spec>/`. That directory does not exist; the committed baselines live in the Playwright-default sibling dirs `design-system-snap.spec.ts-snapshots/` and `visual-smoke.spec.ts-snapshots/` (confirmed via `git ls-files`). An operator following the header to inspect or delete goldens would look in the wrong place. The new platform-guard comments correctly reference `-chromium-win32.png` naming but inherit the stale dir claim by pointing back to "the file header".
**Fix:** Update both headers to `apps/web/tests/<spec-file>-snapshots/`.

### IN-03: `NEXT_PUBLIC_NETWORK guard` step can never fail

**File:** `.github/workflows/phase-1-gates.yml:508-514`
**Issue:** Both branches of the `if` end in `echo` (a `::notice::` or a PASS); exit code is always 0. As a "gate" step it is decorative. Acceptable if intentionally advisory, but it sits unannotated among hard gates.
**Fix:** Either promote to `::error::` + `exit 1`, or rename the step to mark it advisory (e.g., "Advisory: NEXT_PUBLIC_NETWORK guard").

### IN-04: USDC allowlist `grep -v` filters are unanchored substring matches with unescaped dots

**File:** `.github/workflows/phase-1-gates.yml:158-161, 487-490`
**Issue:** `grep -v "packages/shared/src/constants/usdc.ts"` excludes any output **line** containing that substring — a real violation line that happens to mention the allowlisted path in an adjacent comment, or a violation in a nested copy (e.g., `vendor/packages/shared/src/constants/usdc.ts`), would be silently allowlisted. The `.` also matches any character (`usdcXts`). Low likelihood; noting for completeness.
**Fix:** Anchor on the grep path prefix: `grep -v "^\./packages/shared/src/constants/usdc\.ts:"` (grep -r output lines start with `./path:`).

### IN-05: Per-push Playwright job `signin-smoke` has no `timeout-minutes`

**File:** `.github/workflows/phase-1-gates.yml:270`
**Issue:** The gate job got `timeout-minutes: 45` specifically to cap "a hung Playwright webServer", but `signin-smoke` boots the same `pnpm start` webServer on every push with the 360-minute job default. Playwright's own per-test (30s) and webServer-start (30s) timeouts bound most scenarios, so this is a cost/robustness nit, not correctness.
**Fix:** Add `timeout-minutes: 20` to the `signin-smoke` job.

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
