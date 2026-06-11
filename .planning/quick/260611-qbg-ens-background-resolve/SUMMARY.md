---
phase: quick-260611-qbg
plan: 01
status: complete
completed: 2026-06-11
duration: ~5min
commit: b4f3514
subsystem: relayer/profile-identity
tags: [ens, cache, latency, stale-while-revalidate, alchemy-cu]
requirements: [AUTH-11]
dependency-graph:
  requires: [quick-260611-p9a, quick-260611-h36, quick-260610-sr0]
  provides: [cache-only resolveEns, resolveEnsInBackground, fail-sentinel 300s cooldown]
  affects: [/api/profile latency, ENS_MAINNET_RPC_URL operational posture]
key-files:
  modified:
    - apps/relayer/src/lib/ens-resolver.ts
    - apps/relayer/__tests__/ens-resolver.test.ts
    - apps/relayer/src/lib/__tests__/ens-resolver.test.ts
decisions:
  - "D-15 honored: old synchronous first-call-returns-name assertions migrated (not weakened) to the new async contract - first call null, deterministic background await, second call serves the name"
  - "Failure cooldown is a cached '::fail::' sentinel (300s) - retried in minutes, never hammered per-request (Alchemy CU protection)"
---

# quick-260611-qbg: ENS out of the profile request path Summary

**One-liner:** resolveEns is now cache-only (hit -> value, miss -> immediate null + deduped fire-and-forget background warm with a 5-min '::fail::' cooldown), so a dead/hanging ENS_MAINNET_RPC_URL adds zero latency to /api/profile and the 60s profile cache can finally fill.

## What Changed

**apps/relayer/src/lib/ens-resolver.ts (only code file; profile.ts untouched - diff guard 0 lines):**
- `resolveEns(address, _redis?)` keeps its exact signature. p9a unconfigured guard stays FIRST (env unset -> null, no cache read, no background kick). Cache hit returns the value; `'::null::'` and NEW `'::fail::'` sentinels read as null - a `'::fail::'` hit explicitly does NOT kick a new background resolve (the cooldown is the point). Cache miss: `void resolveEnsInBackground(address); return null;` - the request path NEVER awaits an RPC (worst case = 2s Redis read bound inside getCached).
- NEW export `resolveEnsInBackground(address): Promise<void>` - module-level `inFlight` Map keyed by lowercased address dedups concurrent misses to exactly ONE RPC attempt (same promise instance returned while in flight); entry deleted in `finally`. Success -> `setCached(name ?? '::null::', 86400)` + `ens_resolved` log. Failure -> `ens_resolve_failed` warn (message now says the cooldown sentinel is being cached) + `setCached('::fail::', 300)`. Fully-chained promise (`.catch(() => {}).finally(cleanup)`) stored in the Map - never an unhandled rejection.
- NEW export `_clearInFlightForTesting()` (test hygiene, mirrors `memoryCache._clearAllForTesting`).
- Constants: `ENS_CACHE_TTL_SECONDS = 86400` kept; added `ENS_FAIL_SENTINEL = '::fail::'`, `ENS_FAIL_TTL_SECONDS = 300`. Module-scope `mainnetClient` with bounded fallback transport kept byte-identical.

**apps/relayer/__tests__/ens-resolver.test.ts - 8 tests migrated to the new contract per D-15 (intentional contract change, NOT test-weakening), +1 new:**
- T1 (cache hit) and T4 ('::null::' hit) unchanged.
- T2 -> deterministic deferred-promise recipe covering no-await (null while RPC provably pending, no setCached yet), dedup (join while in-flight = same promise instance, 1 getEnsName total), and success warm ('EX', 86400 + ens_resolved log + second call serves from L1).
- T3 -> INVERTED per the plan: failure now CACHES '::fail::' with 'EX', 300 (old "does NOT cache" assertion was the old contract; inversion called out in the test comment) + follow-up resolveEns returns null with NO new RPC kick.
- T5/T6/T7/T8 -> first call null, background settlement awaited via `vi.waitFor` (no sleeps), L1 serves the value on the second call; T6 also asserts the lowercased WRITE key.
- NEW T9: '::fail::' read from Redis -> null, no getEnsName, no setCached, no background kick.
- beforeEach adds `_clearInFlightForTesting()`; logger mock made a shared hoisted instance so ens_resolved/ens_resolve_failed events are assertable.

**apps/relayer/src/lib/__tests__/ens-resolver.test.ts (p9a guards):**
- Test (i) - the unconfigured-skip regression guard - BYTE-IDENTICAL and passing.
- Test (ii) - migrated minimally (see Deviations).
- beforeEach adds `_clearInFlightForTesting()`; header guard (2) wording updated.

## Gate Evidence

| Gate | Result |
|---|---|
| vitest run ens-resolver | 2 files / 11 tests passed, 0 failed, no unhandled-rejection warnings |
| Full relayer suite (pnpm --filter @call-it/relayer test) | **325 passed / 1 skipped / 0 failed** (baseline 324/1 + exactly 1 new ens test T9; no non-ens test changed) |
| pnpm --filter @call-it/relayer build (tsc --build) | exit 0 |
| Grep guards | '::fail::' x9 in ens-resolver.ts; resolveEnsInBackground x3 (definition + miss-path kick + map join) |
| profile.ts diff guard | git diff --stat -- apps/relayer/src/routes/profile.ts = 0 lines (untouched) |
| Commit hygiene | b4f3514 - exactly 3 files, 330+/110-, no deletions, nothing else staged, NOT pushed |

## Deviations from Plan

**1. [Planned deviation - flagged by the plan itself] p9a file test (ii) migrated per D-15**
- **Found during:** Task 1
- **Issue:** test (ii) asserted the OLD synchronous configured-path contract (expected the FIRST call to return 'vitalik.eth'), which is mathematically incompatible with cache-only resolveEns (that test file mocks the cache to always miss and setCached as a noop, so no call can ever return a name there).
- **Fix (minimal, per the plan):** first call asserts null (cache-only request path) + `await vi.waitFor(() => expect(getEnsNameSpy).toHaveBeenCalledTimes(1))` proving the configured path still drives the RPC in the background. Header comment guard (2) wording updated. Test (i) untouched.
- **Commit:** b4f3514

No other deviations - plan executed as written.

## Documented Edge Cases (accepted, in the header comment)

- **'::fail::' L1-backfill after restart:** if the process restarts inside a 300s cooldown window and Redis still holds the sentinel, the getCached L1 backfill stores '::fail::' with the 24h backfill TTL. Impact: that one address shows the fallback handle for up to 24h - identical to a negative-cache hit, inside the D-13 staleness envelope; self-heals on next restart/L1 eviction. Accepted by design, do not redesign around it.
- **inFlight Map growth:** bounded by promise settlement - transports are 5s timeout x 1 retry x 2 fallback legs, every promise settles and deletes its entry in finally (T-qbg-04 accept).
- **D-07 honest degrade:** first-ever view of an ENS-named address shows the fallback handle; the name appears from the next view (<=24h staleness, D-13 unchanged).

## Operator Note

**Inert until Fly redeploy.** Deploy with (from repo root; the gh workflow is broken - missing FLY_API_TOKEN):

    flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .

After deploy: profile p50 sub-second and the 60s profile cache fills (no leg timeouts - the ENS leg can no longer burn its 5s withTimeout budget). **ENS_MAINNET_RPC_URL may stay set or be unset - the choice is the operator to make, no urgency:** a dead/throttled RPC is now harmless (cache-only request path) and CU-protected by the 5-min '::fail::' cooldown; unset keeps the p9a skip path (no ENS names at all).

## Self-Check: PASSED

- apps/relayer/src/lib/ens-resolver.ts - FOUND
- apps/relayer/__tests__/ens-resolver.test.ts - FOUND
- apps/relayer/src/lib/__tests__/ens-resolver.test.ts - FOUND
- commit b4f3514 - FOUND on master, exactly 3 files, not pushed
