---
phase: quick-260611-qbg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/relayer/src/lib/ens-resolver.ts
  - apps/relayer/__tests__/ens-resolver.test.ts
  - apps/relayer/src/lib/__tests__/ens-resolver.test.ts
autonomous: true
requirements: [AUTH-11]

must_haves:
  truths:
    - "A profile request never awaits an ENS RPC: resolveEns is cache-only (hit returns the cached value, miss kicks a fire-and-forget background resolve and returns null immediately), so a dead/hanging ENS_MAINNET_RPC_URL adds zero latency to /api/profile and the 60s profile cache can fill (D-07 honest degrade: first-ever view of an ENS-named address shows the fallback handle, the name appears from the next view; D-13 24h cache TTL unchanged)"
    - "Unconfigured ENS_MAINNET_RPC_URL returns null immediately — no cache read, no background kick (quick-260611-p9a guard stays FIRST in resolveEns; D-07)"
    - "Concurrent cache-misses for the same address share exactly ONE background RPC attempt (module-level in-flight dedup Map keyed by lowercased address, entry deleted in finally)"
    - "An ENS RPC failure writes the '::fail::' sentinel with 300s TTL — a dead/throttled endpoint is retried within minutes (not 24h) and never hammered per-request (Alchemy CU protection); resolveEns treats a '::fail::' hit as null WITHOUT kicking a new background resolve"
    - "Tests asserting the old synchronous first-call-returns-name contract are migrated to the new async contract per D-15 (intentional contract change, NOT test-weakening — updated tests assert the new contract precisely: first call null, background settles, cache fills, second call returns name); full relayer suite green at baseline 324 passed / 1 skipped plus the honestly-updated/added ens tests, zero failures"
  artifacts:
    - path: "apps/relayer/src/lib/ens-resolver.ts"
      provides: "Cache-only resolveEns + exported background resolver with dedup and failure cooldown"
      contains: "::fail::"
      exports: ["resolveEns", "resolveEnsInBackground"]
    - path: "apps/relayer/__tests__/ens-resolver.test.ts"
      provides: "8 pre-existing tests migrated to the new contract + new dedup/no-await/cooldown assertions"
    - path: "apps/relayer/src/lib/__tests__/ens-resolver.test.ts"
      provides: "p9a unconfigured-skip guard (test i) byte-identical; test ii minimally migrated to the new contract per D-15"
  key_links:
    - from: "apps/relayer/src/routes/profile.ts"
      to: "resolveEns"
      via: "unchanged signature (address, _redis?) => Promise<string|null> inside Promise.allSettled + withTimeout — profile.ts is NOT touched"
      pattern: "resolveEns\\(address"
    - from: "apps/relayer/src/lib/ens-resolver.ts"
      to: "apps/relayer/src/lib/cache.ts"
      via: "getCached/setCached (L1-first, never-throw)"
      pattern: "setCached\\("
---

<objective>
Take ENS resolution OUT of the profile request path: `resolveEns` becomes cache-only + background-warm (stale-while-revalidate). Today a dead/hanging ENS_MAINNET_RPC_URL burns the full 5s leg timeout on EVERY uncached profile request, and profile.ts CR-01 (correctly) refuses to cache any resolution with a timed-out leg, so the 60s profile cache never fills and every profile click pays ~6s (measured live 2026-06-11). After this change a dead ENS RPC can never slow profiles again.

Purpose: profile p50 sub-second after Fly redeploy; ENS_MAINNET_RPC_URL becomes harmless whether set, dead, or unset (D-07 honest degrade; D-13 cache strategy preserved).
Output: one rewritten code file (apps/relayer/src/lib/ens-resolver.ts), two migrated test files, one atomic commit. profile.ts UNTOUCHED.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/relayer/src/lib/ens-resolver.ts
@apps/relayer/__tests__/ens-resolver.test.ts
@apps/relayer/src/lib/__tests__/ens-resolver.test.ts
@apps/relayer/src/lib/cache.ts
@apps/relayer/src/lib/memory-cache.ts
@apps/relayer/src/routes/profile.ts

**Locked design (user-approved 2026-06-11 — do not redesign):**

Interface contract (consumed by profile.ts:243, which stays untouched):
- `resolveEns(address: \`0x${string}\`, _redis?: Redis): Promise<string | null>` — exact signature preserved. The route's `withTimeout(resolveEns(...), legTimeoutMs, 'ens')` wrapper becomes harmless: worst case is the 2s Redis read bound inside getCached, never an RPC.
- NEW export: `resolveEnsInBackground(address: \`0x${string}\`): Promise<void>` — module-internal worker, exported for deterministic tests.

Cache helper contract (apps/relayer/src/lib/cache.ts — do not modify):
- `getCached<T>(key, backfillTtlSeconds?)` — never throws; L1 → Redis(2s bound) → JSON.parse; backfills L1 on Redis hit with the passed TTL.
- `setCached<T>(key, value, ttlSeconds)` — never throws; L1 first, Redis best-effort.

Known accepted edge (document in header comment, do NOT redesign around it): resolveEns reads with `getCached<string>(key, ENS_CACHE_TTL_SECONDS)`; if the process restarts inside a 300s '::fail::' cooldown window and Redis still holds the sentinel, the L1 backfill stores '::fail::' with the 24h backfill TTL. Impact: that one address shows the fallback handle for up to 24h — identical to a negative-cache hit, inside the D-13 staleness envelope, self-heals on next restart/L1 eviction. Accepted.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rewrite ens-resolver.ts to cache-only + deduped background warm; migrate both test files to the new contract</name>
  <files>apps/relayer/src/lib/ens-resolver.ts, apps/relayer/__tests__/ens-resolver.test.ts, apps/relayer/src/lib/__tests__/ens-resolver.test.ts</files>
  <behavior>
    New resolveEns contract (assert each precisely):
    - Test A (no-await): cache miss with a PENDING RPC (deferred promise) → resolveEns resolves null immediately while the RPC is still pending; no setCached call yet.
    - Test B (dedup): while the background RPC is pending, a second cache-miss call for the same address does NOT invoke getEnsName again — exactly 1 RPC invocation total; `resolveEnsInBackground(addr)` called while in-flight returns the SAME promise instance.
    - Test C (success warm, D-13): after the background promise settles with a name → setCached called with `ens:{lowercased}` / JSON `"alice.eth"` / 'EX' / 86400, ens_resolved logged, and a SECOND resolveEns call returns the name (served from L1).
    - Test D (no-name warm): background settles with null → '::null::' cached 24h; subsequent resolveEns returns null without RPC.
    - Test E (failure cooldown): background RPC rejects → warn ens_resolve_failed AND setCached called with '::fail::' / 'EX' / 300; subsequent resolveEns treats the '::fail::' hit as null WITHOUT kicking a new background resolve (getEnsName not called again); background promise never produces an unhandled rejection.
    - Test F (sentinel reads): cached '::null::' → null; cached '::fail::' → null; neither calls getEnsName nor setCached.
    - Test G (unconfigured skip, p9a — must stay green byte-identical): env unset → null immediately, no RPC, no cache read, no background kick.
    - Test H (cache-hit fast path): cached positive name returns without any viem call (pre-existing Test 1, unchanged).
    - Tests I (Redis degradation, quick-260610-sr0): redis.get rejection = miss → null + background kick still resolves and L1 holds the name; redis.set rejection inside the background resolve does not discard the name (L1 write succeeded → second resolveEns returns it).
  </behavior>
  <action>
    **Code — apps/relayer/src/lib/ens-resolver.ts (single code file; keep the module-scope `mainnetClient` with its bounded fallback transport exactly as-is):**

    1. `resolveEns(address, _redis?)` — exact existing signature (profile.ts compatibility; `_redis` stays deprecated-ignored):
       a. KEEP the quick-260611-p9a unconfigured guard FIRST and per-call: `ENS_MAINNET_RPC_URL` unset → return null immediately — no cache read, no background kick, no logging (D-07 honest degrade).
       b. Cache check: `getCached<string>(\`ens:${address.toLowerCase()}\`, ENS_CACHE_TTL_SECONDS)`. HIT: `'::null::'` sentinel → null; NEW `'::fail::'` sentinel → null (and explicitly NO background kick — the cooldown is the point); otherwise return the name.
       c. MISS: `void resolveEnsInBackground(address);` then `return null;` — the caller NEVER awaits RPC.
    2. NEW export `resolveEnsInBackground(address): Promise<void>`:
       - Module-level `const inFlight = new Map<string, Promise<void>>()` keyed by `address.toLowerCase()`. If an entry exists, return it (concurrent misses share ONE RPC attempt). Map growth is bounded by promise settlement: transports are bounded 5s timeout × 1 retry × 2 fallback legs, so every promise settles; delete the entry in `finally`.
       - Body (async IIFE or named async fn): `mainnetClient.getEnsName({ address })`. Success → `setCached(key, name ?? '::null::', ENS_CACHE_TTL_SECONDS)` + existing `ens_resolved` info log. Failure → existing `ens_resolve_failed` warn event (update the message text to say the cooldown sentinel is being cached) + `setCached(key, ENS_FAIL_SENTINEL, ENS_FAIL_TTL_SECONDS)`.
       - The stored/returned promise must NEVER produce an unhandled rejection: catch everything internally (setCached/getLogger are never-throw by contract, but wrap defensively — a trailing `.catch(() => {})` on the chain before `.finally` cleanup is acceptable). Store the fully-chained promise in the Map so awaiting it observes settlement after cleanup.
    3. Constants: keep `ENS_CACHE_TTL_SECONDS = 86400`; add `ENS_FAIL_SENTINEL = '::fail::'` and `ENS_FAIL_TTL_SECONDS = 300`.
    4. OPTIONAL (recommended for test hygiene, mirrors `memoryCache._clearAllForTesting`): export `_clearInFlightForTesting()` that clears the dedup Map; call it in each test file's beforeEach so a failed test cannot leak an in-flight entry.
    5. Header comment: rewrite to document the cache-only request path + background warm (stale-while-revalidate), BOTH sentinels ('::null::' 24h negative, '::fail::' 300s failure cooldown / Alchemy CU protection), the unconfigured skip, the in-flight dedup, the accepted L1-backfill edge for '::fail::' after a restart (see context block), and the honest D-07 framing: first-ever view of an ENS-named address shows the fallback handle; the name appears from the next view (≤24h staleness window unchanged). Keep the D-13/AUTH-11/T-01-60 requirement/security lines and the prior-fix provenance notes (p9a, h36, sr0).

    **Tests — apps/relayer/__tests__/ens-resolver.test.ts (8 pre-existing tests; env set in beforeEach):**

    INTENTIONAL CONTRACT CHANGE (D-15): tests asserting "first call returns the resolved name" describe the OLD synchronous contract and MUST be updated to the new contract — this is an intentional behavior change, NOT test-weakening. Each updated test must assert the NEW contract precisely (first call null → background promise settles → cache filled → second call returns name). NO arbitrary sleeps — use deferred promises + the exported background function, or `vi.waitFor`, to await completion deterministically.

    Deterministic recipe (use for Tests A/B/C — the deferred makes dedup race-free because the join happens while the RPC is provably pending):
    - `mockGetEnsName.mockImplementationOnce(() => new Promise(res => { resolveRpc = res; }))`
    - `await resolveEns(addr)` → expect null; expect `mockGetEnsName` called once already (kicked synchronously); expect `mockRedisSet` NOT called (no-await proof).
    - `const bg = resolveEnsInBackground(addr)` while pending → dedup join, still exactly 1 getEnsName call.
    - `resolveRpc('alice.eth'); await bg;` → assert setCached args (`'EX', 86400`), then `await resolveEns(addr)` returns 'alice.eth' from L1.
    Migration map for the existing 8: T1 (cache hit) and T4 ('::null::' hit) keep as-is; T2/T5 → new-contract success/no-name (recipe above / kick + await background); T3 → failure now CACHES '::fail::' with `'EX', 300` (old "does NOT cache" assertion inverts — say so in the test comment) + follow-up resolveEns returns null with no new RPC; T6 (lowercased key) keep the getCached-key assertion, await background settlement before exiting the test; T7/T8 → Redis-degradation per Tests I (first call null, background settles, name served from L1 on second call). Add a '::fail::'-from-Redis read test (Test F). Update the file's header docblock to list the new tests. In beforeEach keep `memoryCache._clearAllForTesting()` and add the in-flight clear (step 4) so no test leaks a pending background promise.

    **Tests — apps/relayer/src/lib/__tests__/ens-resolver.test.ts (p9a guards):**

    - Test (i) — the unconfigured-skip regression guard, the guard that matters — stays BYTE-IDENTICAL and must pass unchanged (new contract still returns null immediately with zero RPC when env is unset).
    - Test (ii) DEVIATION NOTE (flag in SUMMARY): the task brief labels this file "must stay green unchanged", but test (ii) asserts the OLD synchronous configured-path contract (`expect(result).toBe('vitalik.eth')` on the first call) which is mathematically incompatible with cache-only resolveEns (this file's cache mock always misses and setCached is a noop, so no call can ever return a name here). Per the brief's own D-15 rule it MUST be migrated, minimally: first call returns null (cache-only request path) + `await vi.waitFor(() => expect(getEnsNameSpy).toHaveBeenCalledTimes(1))` proving the configured path still drives the RPC in the background. Do not restructure anything else in the file; update its header comment's guard (2) wording to match.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/relayer exec vitest run ens-resolver</automated>
  </verify>
  <done>Both ens test files green under the new contract: cache miss returns null without awaiting RPC; two concurrent misses share one RPC invocation; failure writes '::fail::' with 300s TTL and a '::fail::' hit returns null without a new background kick; success caches 24h as before; p9a test (i) passes byte-identical; no unhandled-rejection warnings in vitest output.</done>
</task>

<task type="auto">
  <name>Task 2: Full relayer suite + build green, then single atomic commit</name>
  <files>apps/relayer/src/lib/ens-resolver.ts, apps/relayer/__tests__/ens-resolver.test.ts, apps/relayer/src/lib/__tests__/ens-resolver.test.ts</files>
  <action>
    1. Run the full relayer suite: `pnpm --filter @call-it/relayer test`. Gate: ZERO failures. Baseline is 324 passed / 1 skipped; the passed count may rise by the number of newly added ens assertions — any change to non-ens tests is a regression, investigate before committing.
    2. Type-check/build: `pnpm --filter @call-it/relayer build` (runs `tsc --build`) — exit 0.
    3. Single atomic commit. Stage ONLY the three files:
       `git add apps/relayer/src/lib/ens-resolver.ts apps/relayer/__tests__/ens-resolver.test.ts apps/relayer/src/lib/__tests__/ens-resolver.test.ts`
       `git commit -m "fix(quick-260611-qbg): ENS out of the profile request path — cache-only reads + deduped background warm + 5min failure cooldown (dead ENS RPC can no longer slow profiles)"`
       NEVER stage: packages/contracts/lib/openzeppelin-contracts, "call it frontend/", docs/, evidence/, .claude/, .planning/, .gitignore files, soak scripts, snapshots. Verify with `git status --porcelain` after staging that exactly 3 paths are staged. NO push.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/relayer test && pnpm --filter @call-it/relayer build && git log -1 --stat</automated>
  </verify>
  <done>Full relayer suite green (baseline 324/1 ± honestly-updated ens tests, 0 failures); tsc build exit 0; exactly one commit on master containing exactly the three files; working tree's other untracked/modified paths untouched and unpushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relayer → ENS Mainnet RPC | external RPC response feeds the profile-identity cache |
| client → /api/profile | untrusted address param reaches resolveEns (existing, unchanged) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qbg-01 | Tampering | ENS cache (T-01-60 lineage) | mitigate | dedicated ENS_MAINNET_RPC_URL + bounded fallback transport unchanged; 24h TTL; cache keys derived from lowercased address only |
| T-qbg-02 | DoS | background resolve fan-out | mitigate | in-flight dedup Map (one RPC per address) + '::fail::' 300s cooldown caps RPC rate against a dead/throttled endpoint (Alchemy CU protection) |
| T-qbg-03 | DoS | unhandled rejection crashing the Fastify process | mitigate | background promise catches everything internally; setCached/getCached are never-throw by contract; test asserts no unhandled rejection |
| T-qbg-04 | DoS | inFlight Map unbounded growth | accept | bounded by promise settlement — transports are 5s timeout × 1 retry × 2 legs, every promise settles and deletes its entry in finally |
| T-qbg-SC | Tampering | package installs | accept | no new dependencies in this change |
</threat_model>

<verification>
- `pnpm --filter @call-it/relayer exec vitest run ens-resolver` — both ens test files green under the new contract.
- `pnpm --filter @call-it/relayer test` — full suite, 0 failures (baseline 324 passed / 1 skipped ± updated ens tests).
- `pnpm --filter @call-it/relayer build` — tsc --build exit 0.
- `git show --stat HEAD` — exactly 3 files in the commit; `git status` shows no other staged paths.
- Grep guards: `grep -c "::fail::" apps/relayer/src/lib/ens-resolver.ts` ≥ 1; `grep -c "resolveEnsInBackground" apps/relayer/src/lib/ens-resolver.ts` ≥ 2 (definition + miss-path kick); `git diff HEAD~1 --name-only` contains NO `apps/relayer/src/routes/profile.ts`.
</verification>

<success_criteria>
- resolveEns request path is cache-only: hit → value (sentinels → null), miss → immediate null + fire-and-forget background warm; a dead/hanging ENS RPC can never add latency to a profile request again.
- p9a unconfigured skip preserved first; in-flight dedup proven by test; '::fail::' 300s cooldown proven by test (write TTL + read-as-null-without-rekick); success path still caches 24h (D-13).
- D-15 honored: old synchronous-contract assertions migrated (not weakened) with the deviation on the p9a file's test (ii) explicitly documented in the SUMMARY.
- One atomic commit with exactly the three files, not pushed; profile.ts untouched.
</success_criteria>

<output>
Create `.planning/quick/260611-qbg-ens-background-resolve/SUMMARY.md` when done.

SUMMARY must include the operator note: **Inert until Fly redeploy** (`flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .` from repo root — the gh workflow is broken, missing FLY_API_TOKEN). After deploy: profile p50 sub-second + the 60s profile cache fills (no leg timeouts); ENS_MAINNET_RPC_URL may stay set (a dead RPC is now harmless and CU-protected by the 5-min cooldown) or be unset (skip path) — operator's choice, no urgency. Also record the test (ii) D-15 deviation note.
</output>
