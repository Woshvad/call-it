---
phase: quick-260610-ed7
plan: 01
subsystem: relayer
tags: [relayer, privy, auth, session, fastify, gcp-secret-manager]
requirements-completed: [AUTH-19]

# Dependency graph
requires:
  - phase: "01"
    provides: "privySessionPreHandler + getPrivyClient (relayer session-auth gate)"
provides:
  - "getPrivyClient() app-id resolution preferring NEXT_PUBLIC_PRIVY_APP_ID with PRIVY_APP_ID fallback"
affects: [relayer-session-auth, onboarding-state, calls, all-user-facing-relayer-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Relayer Privy app-id resolved as NEXT_PUBLIC_PRIVY_APP_ID ?? PRIVY_APP_ID (nullish fallback preserves test 'test-app-id')"

key-files:
  created: []
  modified:
    - apps/relayer/src/lib/privy-auth.ts

key-decisions:
  - "Use ?? (nullish) not || so an empty-string NEXT_PUBLIC_PRIVY_APP_ID does not silently mask the fallback, and so existing tests (which set only PRIVY_APP_ID='test-app-id') still resolve to 'test-app-id' exactly as before"

# Metrics
duration: 6min
completed: 2026-06-10
---

# Quick 260610-ed7: Relayer Privy Verifier Reads NEXT_PUBLIC_PRIVY_APP_ID Summary

**One-liner:** `getPrivyClient()` now builds the relayer `PrivyClient` from the GCP-sourced / frontend-matching `NEXT_PUBLIC_PRIVY_APP_ID` (with `PRIVY_APP_ID` as a legacy fallback), so `verifyAuthToken` accepts valid frontend session tokens instead of returning `401 { code: 'invalid_session' }` and bouncing sign-in back to `/signin`.

## What Changed

`apps/relayer/src/lib/privy-auth.ts` — three edits, all inside / adjacent to `getPrivyClient()`:

1. **App-id resolution (~line 45):** `const appId = process.env.PRIVY_APP_ID;` → `const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID;`. The relayer's correct app id is loaded from GCP as `NEXT_PUBLIC_PRIVY_APP_ID` (secret-manager.ts mirrors it into `process.env` at boot) and matches the frontend app `cmphfvdy500230el7nv2vfo9x`. The stale `PRIVY_APP_ID` was the wrong app, so every valid frontend token verified against the wrong app and was rejected.
2. **Doc comment (~line 38):** now states the app id is read from `NEXT_PUBLIC_PRIVY_APP_ID` (primary) / `PRIVY_APP_ID` (fallback) plus `PRIVY_APP_SECRET`.
3. **Throw message (~line 49):** now names `NEXT_PUBLIC_PRIVY_APP_ID (primary) / PRIVY_APP_ID (fallback)` and `PRIVY_APP_SECRET` so the startup error points at the right vars.

Nothing else in the file was touched — singleton (`_privyClient`), testing helpers (`_resetPrivyClientForTesting` / `_setPrivyClientForTesting`), `verifyAuthToken` call, the preHandler logic, the `appSecret` line, and the module augmentation are all unchanged. No other file was modified (secret-manager.ts / types.ts / index.ts untouched).

## Why `??` (nullish), Not `||`

The nullish-coalescing operator preserves the existing 401-invalid_session tests. Those tests set `process.env.PRIVY_APP_ID='test-app-id'` and do **not** set `NEXT_PUBLIC_PRIVY_APP_ID`; with `??`, an unset `NEXT_PUBLIC_PRIVY_APP_ID` (undefined) falls through to `'test-app-id'` exactly as before. (`||` would behave identically for `undefined`, but `??` additionally avoids a future footgun where an empty-string `NEXT_PUBLIC_PRIVY_APP_ID` would mask the fallback — though here an empty string would still correctly trip the `!appId` guard.)

## Verification

- **Build:** `pnpm --filter @call-it/relayer build` (`tsc --build`) — **exits 0**, no new TS errors.
- **Tests:** `pnpm --filter @call-it/relayer test` (`vitest run`) — **37 test files passed / 1 skipped (38)**, **209 tests passed / 1 skipped (210)**. The 1 skip is the env-gated `test/kms-roundtrip.test.ts` (unchanged, pre-existing). The existing 401-invalid_session suites all pass with their `test-app-id` fallback behavior intact:
  - `__tests__/calls-dup-check.test.ts` (6 tests) — `privy_session_verified` / `privy_session_invalid` paths green
  - `__tests__/calls-preflight.test.ts` (9 tests) — green
  - `address-book.test.ts` — covered in the passing 209 (session-verified path green)
- **Diff scope:** `1 file changed, 8 insertions(+), 4 deletions(-)` — ONLY `apps/relayer/src/lib/privy-auth.ts`.

## Git

- **Staged (explicit, single file):** `git add apps/relayer/src/lib/privy-auth.ts` — confirmed exactly one staged file via `git diff --cached --name-only`. No `git add -A/./-u` was used; the background-soak's unrelated uncommitted files were NOT swept in.
- **Commit:** `6cf2edf` on `master` — `fix(quick-260610-ed7): relayer Privy verifier reads NEXT_PUBLIC_PRIVY_APP_ID`.
- **NOT pushed** — the operator redeploys the relayer from local source via `flyctl`.

## Deploy Contingency (operator — IMPORTANT)

- **This committed fix goes live on the operator's `flyctl` deploy — no GitHub push required.** The relayer redeploys from LOCAL source:
  ```
  flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .
  ```
  (run from the repo root). NOTE: `gh workflow run deploy-relayer.yml` is BROKEN (repo missing `FLY_API_TOKEN` / GCP-WIF secrets) — use the local `flyctl deploy` above. A `master` push redeploys WEB only (Vercel native), not the relayer.
- **Assumption this fix depends on:** GCP's `NEXT_PUBLIC_PRIVY_APP_ID` secret equals the current frontend Privy app id `cmphfvdy500230el7nv2vfo9x`.
- **Post-deploy check:** after the `flyctl` redeploy, verify a session route (e.g. `/api/onboarding/state`) returns **200** for a valid frontend token. If it STILL returns `401 invalid_session`, the GCP secret itself is stale — that is an **operator/GCP action** (rotate the GCP `NEXT_PUBLIC_PRIVY_APP_ID` secret to the current app id `cmphfvdy500230el7nv2vfo9x`), NOT a further code change.

## Deviations from Plan

None — plan executed exactly as written (one task, three edits, single-file commit).

## Self-Check: PASSED

- FOUND: `apps/relayer/src/lib/privy-auth.ts` (modified, contains `NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID`)
- FOUND: commit `6cf2edf` on master
