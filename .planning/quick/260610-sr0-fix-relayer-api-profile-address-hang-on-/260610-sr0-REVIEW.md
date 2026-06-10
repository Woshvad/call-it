---
phase: quick-260610-sr0-fix-relayer-api-profile-address-hang
reviewed: 2026-06-10T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - apps/relayer/src/lib/with-timeout.ts
  - apps/relayer/src/lib/subgraph-client.ts
  - apps/relayer/src/lib/redis.ts
  - apps/relayer/src/lib/ens-resolver.ts
  - apps/relayer/src/routes/profile.ts
  - apps/relayer/__tests__/with-timeout.test.ts
  - apps/relayer/__tests__/profile-deadline.test.ts
  - apps/relayer/__tests__/ens-resolver.test.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Quick 260610-sr0: Code Review Report

**Reviewed:** 2026-06-10
**Depth:** standard
**Files Reviewed:** 8 (commits `e4b8e2d`, `8342c88`, `c735f8c`)
**Status:** issues_found

**Scope note:** The config listed test paths under `apps/relayer/src/__tests__/`; the actual diff files live at `apps/relayer/__tests__/`. The diff also touched `apps/relayer/__tests__/ens-resolver.test.ts` (Tests 7–8 added), which was reviewed even though it was not in the config file list.

## Summary

The hang-proofing mechanics are largely sound. Verified clean:

- **Timer hygiene:** `withTimeout` clears its timer in `.finally()` on every settle path and `unref()`s it (guarded for mocked environments). No leaked handles on resolve, reject, or timeout.
- **No unhandled rejections from the deadline race:** `Promise.race` subscribes to both promises, so the abandoned `resolveProfile()` promise's eventual settlement is always handled. `resolveProfile` cannot reject by construction (`allSettled` + guarded cache write), and the per-leg underlying promises are all wrapped so they never reject either.
- **Exactly-once response:** the deadline try/catch branches are mutually exclusive; `reply.send` is reached exactly once per request. No double-send path.
- **`ProfileResponseBody` contract:** `buildDegradedBody` carries all 15 fields with matching types, status 200, and Test B pins the exact key set against drift.
- **`commandTimeout` / BullMQ claim verified:** BullMQ Queue/Worker in `settlement-watcher.ts` (lines 262, 309, 732–733) use the separate `settlementRedisConfig` built in `index.ts:231` — the `getRedis()` singleton's `commandTimeout: 2000` does not touch BullMQ. The boot-time pub/sub compat check (`redis.duplicate()`) already resolves-on-timeout, so the inherited 2s command timeout is absorbed.
- **ENS guards:** cache-read rejection degrades to miss; cache-write rejection no longer discards a successfully resolved name (Tests 7–8 cover both).
- **Subgraph abort:** `AbortSignal.timeout(10_000)` covers connect, headers, and body read (`res.json()`), and Node unrefs its internal timer.

However, the central invariant this diff claims — "a transient stall must not poison the 60s cache" — is violated on the *dominant* degraded path (CR-01), and the regression test is timed such that it cannot catch it (WR-03).

## Critical Issues

### CR-01: Leg-timeout-degraded profile body IS cached for 60s — the no-cache guarantee only protects a nearly-unreachable path

**File:** `apps/relayer/src/routes/profile.ts:303-307` (unconditional cache write inside `resolveProfile`), interacting with lines 317-335 (deadline guard)

**Issue:** The route carefully avoids caching the *deadline*-degraded body, but with default tunings the deadline almost never fires: each leg is bounded at 5s (`PROFILE_LEG_TIMEOUT_MS`), so `Promise.allSettled` resolves by ~5s, plus a cache write bounded at 2s (`commandTimeout`) = ~7s, under the 8s deadline. In the primary hang scenario this task was built for — all upstreams stalled — the legs time out at 5s, `resolveProfile` resolves with a body that is **byte-identical to `buildDegradedBody`** (source `'truncated'`, `displayHandle: ''`, `ensName: null`, `settledCalls: 0`, `globalRep: 100`, verified flags false), and line 304 **unconditionally writes it to `profile:{address}` with a 60s TTL**. Every subsequent request for that address serves the degraded body from cache with `x-source: cache` and *no* degraded marker, indistinguishable from real data.

The partial case is worse in practice: one slow `displayHandle` RPC read (>5s, the exact tarpit-throttle scenario named in the file header) caches a profile that silently drops the user's on-chain display handle / ENS name for 60s. For a person-first reputation product, the cache now serves a wrong identity for a minute after any single transient stall — precisely the poisoning the route comment at lines 318-322 claims cannot happen.

**Fix:** Track whether any leg timed out and skip (or short-TTL) the cache write:

```typescript
const results = [ensName, displayHandle, settledCallsRaw, socials];
const anyLegTimedOut = results.some(
  (r) => r.status === 'rejected' && String(r.reason?.message ?? '').includes('timed out'),
);

if (!anyLegTimedOut) {
  try {
    await redis.set(cacheKey, JSON.stringify(responseBody), 'EX', 60);
  } catch (cacheErr) { /* existing warn */ }
} else {
  logger.warn({ event: 'profile_cache_skipped_degraded', address: normalizedAddress }, 'Leg timeout — not caching degraded body');
}
```

(Cleaner variant: have `withTimeout` reject with a dedicated `TimeoutError` class and check `instanceof` instead of string matching.)

**Fixed:** `62eb292` — exported `TimeoutError` class from with-timeout.ts; route skips the 60s cache write when any leg rejected with `instanceof TimeoutError` (logs `profile_cache_skipped_degraded`); only fully-resolved profiles are cached.

## Warnings

### WR-01: `commandTimeout: 2000` on the shared singleton breaks the SETNX idempotency semantics in `upstash-counter.ts` (T-01-45) — silent permanent undercount

**File:** `apps/relayer/src/lib/redis.ts:53`; affected consumer `apps/relayer/src/lib/upstash-counter.ts:83-96`

**Issue:** The new `commandTimeout` applies to every `getRedis()` consumer, not just the profile route, and it converts "slow but successful" commands into client-side rejections while the command still executes server-side. `incrementPaymasterCount` claims an idempotency slot with `SET ... NX EX 30d` (line 83) and then increments the lifetime counter with `INCRBY` (line 96). Two new failure windows:

1. The SETNX executes on the server but the reply times out at 2s → the claim is recorded, the error propagates, the increment never happens. Every retry sees `claimed === null` → `alreadyCounted: true` → that userOp is **permanently never counted**.
2. SETNX succeeds, then the INCRBY times out (even if it executed, the caller can't know) → same retry-blocked undercount.

This counter gates the §10.7 paymaster 80%-cap operator alert, so undercounting weakens a safety control. The diff comment only justified safety for BullMQ blocking commands; the timeout-vs-executed ambiguity for non-idempotent claim/increment pairs on the singleton was not addressed.

**Fix:** Make claim+increment atomic so a reply timeout cannot split them — e.g. a single Lua script (`EVAL`: SETNX claim, and INCRBY only if claimed, returning the new count), or store the increment inside the claim transaction (`MULTI`/`EXEC`). At minimum, log a distinct event when the SETNX path throws so undercounts are observable.

**Disposition:** removed `commandTimeout` instead (orchestrator) — `62eb292` reverts the singleton options to pre-e4b8e2d (no client-side reply timeout, so the SETNX/INCRBY pair can never split); the profile route's response-critical Redis calls are bounded per-call with `withTimeout` instead.

### WR-02: `PROFILE_LEG_TIMEOUT_MS` / `PROFILE_DEADLINE_MS` accept NaN/0 — a malformed env var makes every response instantly degraded (and cached, per CR-01)

**File:** `apps/relayer/src/routes/profile.ts:182-183`

**Issue:** `Number(process.env.PROFILE_LEG_TIMEOUT_MS ?? 5_000)` yields `NaN` for `"5s"` and `0` for an empty-string env var (a common Fly/Vercel misconfiguration). `setTimeout(fn, NaN)` and `setTimeout(fn, 0)` both fire immediately, so every leg times out instantly on every request — the route serves only truncated bodies, and (per CR-01) caches them for 60s. A one-character env typo silently zeroes out the entire profile feature with no error anywhere.

**Fix:**

```typescript
const parseTimeout = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const legTimeoutMs = parseTimeout(process.env.PROFILE_LEG_TIMEOUT_MS, 5_000);
const deadlineMs = parseTimeout(process.env.PROFILE_DEADLINE_MS, 8_000);
```

**Fixed:** `62eb292` — `parseTimeout` helper with `Number.isFinite(n) && n > 0` guard, defaults 5000/8000; regression Test C added (empty-string + `"5s"` env vars → fully-resolved response, cache written).

### WR-03: Test B's "never cached" assertion is checked before the background write can occur — it passes today while CR-01 exists, and the test leaks a 5s background resolution past teardown

**File:** `apps/relayer/__tests__/profile-deadline.test.ts:161-198`

**Issue:** Test B sets `PROFILE_LEG_TIMEOUT_MS=5000`, `PROFILE_DEADLINE_MS=200`. The inject returns at ~200ms and the test immediately asserts zero `profile:` writes on `mockRedisSet` (lines 192-195). But the abandoned `resolveProfile` is still running; its legs time out at 5000ms, *after which it writes the degraded body to the `profile:` cache* — exactly the CR-01 bug. The assertion is true only because it races ahead of the write, so the test asserts the invariant at a moment when it cannot yet have been violated. Two consequences:

1. **False confidence:** the regression test for "degraded body never cached" cannot detect the actual cache-poisoning path.
2. **Test hygiene:** three unref'd 5s timers and the pending `resolveProfile` continue past `afterEach`/`app.close()`; the late `mockRedisSet` and logger-mock calls land in whatever mock state a later test has (the timers are unref'd so the process exits, but `vi.clearAllMocks()` in the next `beforeEach` does not cancel the in-flight resolution — any later test asserting on `mockRedisSet` call counts can flake).

**Fix:** Drop the leg timeout to e.g. 400ms (still > the 200ms deadline so the deadline path fires), then wait for the background block to settle before asserting:

```typescript
process.env.PROFILE_LEG_TIMEOUT_MS = '400';
process.env.PROFILE_DEADLINE_MS = '200';
// ... inject + response assertions ...
await vi.waitFor(() => {
  // background legs have timed out and resolveProfile has settled
}, { timeout: 2_000 });
const profileCacheWrites = mockRedisSet.mock.calls.filter(([key]) => String(key).startsWith('profile:'));
expect(profileCacheWrites).toHaveLength(0);
```

Note: with the current implementation this strengthened test FAILS — which is correct; it exposes CR-01. Land it together with the CR-01 fix.

**Fixed:** `62eb292` — Test B leg timeout dropped to 400ms; shared logger spies + `vi.waitFor` on `profile_resolved` await the background resolution settling BEFORE the zero-cache-write assertion (fails against pre-CR-01 code, passes after); Test A also asserts the partial body is never cached; `afterEach` clears mocks so late calls cannot leak into later tests.

## Info

### IN-01: `FEED_QUERY` declares `$cursor_time` / `$cursor_id` but never uses them — cursor pagination is a no-op and the operation is spec-invalid

**File:** `apps/relayer/src/lib/subgraph-client.ts:90-117` (pre-existing; file touched by this diff)

**Issue:** The operation signature declares `$cursor_time: BigInt, $cursor_id: ID` but the `where` clause only contains `status_not: "draft"` — the decoded cursor (lines 274-289) is passed as variables that never filter anything, so every "next page" returns the same first N items. GraphQL spec §5.8.4 (All Variables Used) also makes this operation invalid under strict validators. Pre-existing, out of this diff's blast radius, but worth a follow-up task.

**Fix:** Add `createdAt_lt: $cursor_time` (with id tie-break) to the `where` clause, or remove the unused variable declarations until pagination is implemented.

### IN-02: Arbitrum RPC fallback derives an "RPC URL" from `NEXT_PUBLIC_SUBGRAPH_URL` — guaranteed-dead endpoint in the fallback chain

**File:** `apps/relayer/src/routes/profile.ts:68` (pre-existing; line reformatted by this diff)

**Issue:** `process.env.NEXT_PUBLIC_SUBGRAPH_URL?.replace('/subgraphs', '')` produces a Graph gateway host, not a JSON-RPC endpoint. If the two real RPC env vars are unset but the subgraph URL is set, every `readContract` hits a GraphQL server and fails (silently degraded by the inner try/catch) — and it also shadows the working public-RPC fallback on the next line. With the new 5s/retry-1 transport this now burns ~10s-bounded failures instead of hanging, but the fallback entry is still wrong.

**Fix:** Delete the `NEXT_PUBLIC_SUBGRAPH_URL` line from the fallback chain.

### IN-03: The 8s route deadline does not cover the initial cache read — true worst case is ~10s

**File:** `apps/relayer/src/routes/profile.ts:168-178, 323-324`

**Issue:** The `redis.get(cacheKey)` cache read at line 169 runs before `withTimeout(resolveProfile(), deadlineMs, ...)` starts, so a stalled Redis adds up to `commandTimeout` (2s) on top of the 8s deadline. Still bounded (which is the goal), but the "8s route deadline" is actually ~10s end-to-end. Document or fold the cache read inside the deadline if the SLA matters.

**Fixed:** `62eb292` — initial cache read now wrapped in `withTimeout(redis.get(cacheKey), 2_000, 'profile-cache-read')` (needed anyway after the WR-01 `commandTimeout` removal); a timeout lands in the existing catch and degrades to a cache miss. Worst case stays bounded at ~deadline + 2s, now explicitly documented in the route.

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
