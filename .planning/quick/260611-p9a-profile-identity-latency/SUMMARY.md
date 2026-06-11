---
phase: quick-260611-p9a
plan: 01
status: complete
subsystem: profile-identity
tags: [relayer, web, profile, ens, latency]
requirements: [AUTH-11, AUTH-35, AUTH-44, D-13]
key-files:
  modified:
    - apps/relayer/src/routes/profile.ts
    - apps/relayer/src/lib/ens-resolver.ts
    - apps/relayer/__tests__/ens-resolver.test.ts
    - apps/web/app/profile/[address]/settings/page.tsx
    - apps/web/tests/chain-pinning.test.ts
  created:
    - apps/relayer/src/lib/__tests__/ens-resolver.test.ts
    - apps/relayer/src/routes/__tests__/profile-registry-address.test.ts
commits:
  - b6d825e
  - 5d8efc4
completed: 2026-06-11
---

# Quick Task quick-260611-p9a: Profile Identity + Latency Summary

**One-liner:** Relayer profile route now reads ProfileRegistry at the canonical shared const (was env-or-zero → zero-address reads → "truncated" identity), skips the doomed 5s ENS leg when ENS_MAINNET_RPC_URL is unset (60s cache fills again), and the web settings page strips a leading @ before saving the handle on-chain (no more "@@name").

## What Changed

### Commit 1 — `b6d825e` (relayer)
- `apps/relayer/src/routes/profile.ts` — `getProfileRegistryAddress()` returns `PROFILE_REGISTRY_ARBITRUM_SEPOLIA` from `@call-it/shared` (mirrors notification-fanout.ts). The `NEXT_PUBLIC_*` env-or-zero fallback is DELETED — displayHandle/settledCalls reads can never target the zero address again. CR-01 `anyLegTimedOut` cache rule UNTOUCHED.
- `apps/relayer/src/lib/ens-resolver.ts` — `resolveEns` early-returns `null` (no cache read, no RPC, no logging) when `ENS_MAINNET_RPC_URL` is unset; per-call env read (testable pattern). Configured path byte-identical (bounded transport + public failover stays).
- NEW `apps/relayer/src/lib/__tests__/ens-resolver.test.ts` — (i) env unset → null + getEnsName NOT called; (ii) env set → getEnsName drives the result (called once).
- NEW `apps/relayer/src/routes/__tests__/profile-registry-address.test.ts` — source pins: canonical const present, `@call-it/shared` imported, `NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS` and `?? zero-address` patterns dead; plus unit pin that the shared const is not the zero address.
- `apps/relayer/__tests__/ens-resolver.test.ts` (DEVIATION, see below) — pre-existing suite now sets `ENS_MAINNET_RPC_URL` in `beforeEach` (save/restore in `afterEach`) so its 8 configured-path tests keep exercising cache/RPC semantics. Zero assertions changed (D-15).

### Commit 2 — `5d8efc4` (web)
- `apps/web/app/profile/[address]/settings/page.tsx` — `handleSetDisplayHandle` normalizes once (`handleInput.trim().replace(/^@+/, '')`); `normalized` flows through the empty check, the 50-char check, the tx `args`, the read-back compare, and post-success `setHandleInput(normalized)`. One help sentence appended to the AUTH-35 paragraph. Owner guard, chain alignment, receipt gate, error taxonomy untouched.
- `apps/web/tests/chain-pinning.test.ts` — new describe block with 4 pins: `replace(/^@+/` exists, `args: [normalized]`, `onChainHandle === normalized`, and `args: [handleInput]` is dead. No existing test modified.

## Gates Evidence

| Gate | Result |
|---|---|
| `pnpm --filter @call-it/relayer test` | GREEN — 324 passed, 1 skipped, 0 failed (51 files passed, 1 skipped) |
| `pnpm --filter @call-it/relayer build` (`tsc --build`) | exit 0 |
| `pnpm --filter @call-it/web test` | GREEN — 249 passed, 0 failed (27 files; 245 baseline + 4 new pins) |
| `pnpm --filter @call-it/web build` (`next build --webpack`) | exit 0 |
| Staged lists verified with `git diff --cached --name-only` before each commit | only plan files (+1 documented deviation file in commit 1) |

## Deviations from Plan

**1. [Rule 3 - Blocking] Pre-existing top-level ENS test suite required env setup**
- **Found during:** Task 1 verification (relayer vitest run)
- **Issue:** The plan assumed `ens-resolver.test.ts` was new, but `apps/relayer/__tests__/ens-resolver.test.ts` (top-level dir, also in the vitest include glob) already existed with 8 tests exercising the cache/RPC path WITHOUT setting `ENS_MAINNET_RPC_URL` — the new early-return correctly made 6 of them fail.
- **Fix:** Added `process.env.ENS_MAINNET_RPC_URL = 'https://eth-mainnet.example/test'` in `beforeEach` + save/restore in `afterEach`. All original assertions untouched (extends, never weakens — D-15).
- **Files modified:** apps/relayer/__tests__/ens-resolver.test.ts
- **Commit:** b6d825e

## Operator Notes

- **Relayer changes are INERT until a Fly redeploy** (operator-gated). Working command per live-ops notes, from repo root: `flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .` (the `gh workflow run deploy-relayer.yml` path is broken — repo missing FLY_API_TOKEN/GCP-WIF secrets). Web deploys via Vercel on master push.
- **Optional:** set `ENS_MAINNET_RPC_URL` on Fly later to re-enable ENS names — this fix makes its absence honest + fast instead of slow; setting the env restores full ENS resolution with no code change.
- **Post-deploy expectation:** `GET https://call-it-relayer-sepolia.fly.dev/api/profile/0x7304a289aa8d5a4db23eb78c143e9aa376415ced` returns `displayHandle:"test", source:"display_handle"`, and repeat requests hit the 60s cache (`x-source: cache`) instead of paying ~6s each.

## Self-Check: PASSED

- Both commits exist on master (b6d825e, 5d8efc4); nothing pushed.
- All 7 touched files exist on disk; no deletions in either commit.
- No secrets printed, committed, or set.
