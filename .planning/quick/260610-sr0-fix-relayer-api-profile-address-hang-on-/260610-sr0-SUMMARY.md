---
phase: quick-260610-sr0
plan: 01
status: complete
one_liner: "Hang-proofed GET /api/profile/:address — bounded viem transports, per-leg withTimeout(5s), 8s route deadline with degraded 200 fallback, subgraph fetch abort, ioredis commandTimeout, and ENS Redis guards, plus 8 regression tests"
tasks_completed: 3/3
commits:
  - hash: e4b8e2d
    message: "fix(quick-260610-sr0): bound shared lib upstreams (withTimeout helper, subgraph abort, redis commandTimeout, ENS guards)"
  - hash: 8342c88
    message: "fix(quick-260610-sr0): hang-proof GET /api/profile/:address (bounded transport, per-leg timeouts, 8s route deadline)"
  - hash: c735f8c
    message: "test(quick-260610-sr0): regression coverage for hang-proof profile route + ENS Redis guards"
key-files:
  created:
    - apps/relayer/src/lib/with-timeout.ts
    - apps/relayer/__tests__/with-timeout.test.ts
    - apps/relayer/__tests__/profile-deadline.test.ts
  modified:
    - apps/relayer/src/routes/profile.ts
    - apps/relayer/src/lib/ens-resolver.ts
    - apps/relayer/src/lib/subgraph-client.ts
    - apps/relayer/src/lib/redis.ts
    - apps/relayer/__tests__/ens-resolver.test.ts
requirements: [QUICK-260610-SR0]
metrics:
  duration: ~10 minutes
  completed: 2026-06-10
  tests_before: 209 passed / 1 skipped
  tests_after: 217 passed / 1 skipped (+8 new, 0 removed, 0 weakened)
---

# Quick Task 260610-sr0: Fix relayer GET /api/profile/:address indefinite hang — Summary

Availability hardening only: every upstream of the profile route (Arbitrum RPC, mainnet ENS RPC, subgraph, Redis) is now bounded so the route ALWAYS responds within the 8s default deadline even when every dependency hangs forever. Response contract (ProfileResponseBody shape, status codes, AUTH-11 priority chain, x-source header, 60s cache, 400 invalid-address path) is unchanged; the only addition is the `x-degraded: deadline` header on the deadline-degraded path.

## What Changed Per File

### Created

- **apps/relayer/src/lib/with-timeout.ts** — dependency-free `withTimeout<T>(promise, ms, label)`: Promise.race against a timer that rejects with `"${label} timed out after ${ms}ms"`. Timer is always cleared in `finally` (no leaked vitest handles) and `unref?.()`'d (guarded for mocked environments). Original errors propagate unchanged.

### Modified — Task 1 (lib hardenings, commit e4b8e2d)

- **apps/relayer/src/lib/subgraph-client.ts** — `executeQuery` fetch now carries `signal: AbortSignal.timeout(SUBGRAPH_FETCH_TIMEOUT_MS)` (10s module constant). Bounds EVERY subgraph consumer (feed, profiles, settled fields). Nothing else changed.
- **apps/relayer/src/lib/redis.ts** — `getRedis()` ioredis options gain `commandTimeout: 2_000`; all prior options (maxRetriesPerRequest, enableReadyCheck, lazyConnect, enableOfflineQueue) intact. Safe for BullMQ: settlement-watcher uses its own redisConfig connection, not this singleton.
- **apps/relayer/src/lib/ens-resolver.ts** —
  - mainnet transport bounded: `http(url, { timeout: 5_000, retryCount: 1 })`
  - `redis.get(cacheKey)` guarded: rejection logs `ens_cache_read_failed` warn and degrades to cache miss (proceeds to RPC)
  - `redis.set(...)` moved OUT of the RPC try into its own try/catch: a quota rejection logs `ens_cache_write_failed` warn and STILL returns the resolved name (latent bug fixed — previously a cache-write rejection fell into the outer catch and discarded a successfully resolved name, returning null)
  - Behavior contract otherwise unchanged: '::null::' negative sentinel, 24h TTL, RPC failure returns null without caching, ens_resolved / ens_resolve_failed events unchanged

### Modified — Task 2 (route, commit 8342c88)

- **apps/relayer/src/routes/profile.ts** —
  - `arbitrumClient` transport bounded: `{ timeout: 5_000, retryCount: 1 }` (env-var URL fallback chain untouched)
  - Per-request env-tunable timeouts: `PROFILE_LEG_TIMEOUT_MS` (default 5000), `PROFILE_DEADLINE_MS` (default 8000)
  - All 4 `Promise.allSettled` legs wrapped in `withTimeout(..., legTimeoutMs, label)` with labels 'ens' / 'displayHandle' / 'settledCalls' / 'socials'; existing fulfilled-status mapping degrades timed-out legs to fallback values unchanged
  - Resolution block (allSettled + mapping + AUTH-11 chain + body + guarded cache write + profile_resolved log) extracted into local `resolveProfile()` (cannot reject by construction) and raced via `withTimeout(resolveProfile(), deadlineMs, 'profile_deadline')`
  - Deadline path: `profile_deadline_degraded` warn, headers `x-source: live` + `x-degraded: deadline`, 200 with `buildDegradedBody(address)` (truncated handle, source 'truncated', nulls/zeros, globalRep 100 matching REP-01, verified flags false). Degraded body is NEVER cached; the still-running resolveProfile populates the cache itself when its bounded legs settle (~legTimeoutMs later) — intentional

### Modified/Created — Task 3 (tests, commit c735f8c)

- **apps/relayer/__tests__/with-timeout.test.ts** (NEW, 4 tests) — pass-through resolve, original-error rejection pass-through, timeout rejects with label+ms, timer cleanup via fake timers (`vi.getTimerCount() === 0` after settle)
- **apps/relayer/__tests__/profile-deadline.test.ts** (NEW, 2 tests) — own mock topology (profile.test.ts conventions PLUS a subgraph-client mock); env timeouts set per test and deleted in afterEach; real timers.
  - Test A: hung displayHandle leg + LEG=120ms → 200, source 'truncated', NO x-degraded, x-source 'live', fast
  - Test B: ALL legs hang + DEADLINE=200ms → 200, `x-degraded: deadline`, truncated handle pattern, verified flags false, exact 15-field ProfileResponseBody key set asserted (shape drift fails loudly), no `profile:` cache write, fast
- **apps/relayer/__tests__/ens-resolver.test.ts** (EXTENDED, +2 tests; existing 6 untouched) — redis.get quota rejection → degrades to cache miss and returns resolved name; redis.set rejection → resolved name still returned (asserts the Task 1 bug fix)

## Test Counts

| | Files | Tests |
|---|---|---|
| Before | 37 passed / 1 skipped | 209 passed / 1 skipped |
| After | 39 passed / 1 skipped | 217 passed / 1 skipped |

`pnpm --filter @call-it/relayer test` green; `pnpm --filter @call-it/relayer build` (tsc --build) exit 0. Zero existing tests removed, modified, or weakened.

## Verification Gates

- Grep gates: `withTimeout(` x5 in profile.ts (4 legs + deadline race); `AbortSignal.timeout` in subgraph-client.ts; `commandTimeout` in redis.ts; `ens_cache_read_failed` + `ens_cache_write_failed` in ens-resolver.ts; `x-degraded` in profile.ts — all present
- Contract gate: ProfileResponseBody interface character-identical (never edited); 400 invalid-address path untouched; all 7 existing profile.test.ts tests pass unmodified
- Out-of-scope gate: all 3 commits touch ONLY apps/relayer files (verified per-commit with `git show --name-only`); no deploy config, Fly secrets, or env-var fixes in code

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None introduced by this plan.

## Threat Flags

None — no new security surface beyond the plan's threat model; T-q260610sr0-01..04 mitigations implemented as registered, T-05/SC accepted as registered.

## Self-Check: PASSED

- apps/relayer/src/lib/with-timeout.ts — FOUND
- apps/relayer/__tests__/with-timeout.test.ts — FOUND
- apps/relayer/__tests__/profile-deadline.test.ts — FOUND
- Commits e4b8e2d, 8342c88, c735f8c — FOUND in git log
