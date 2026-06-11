---
phase: quick-260611-p9a
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/relayer/src/routes/profile.ts
  - apps/relayer/src/lib/ens-resolver.ts
  - apps/relayer/src/lib/__tests__/ens-resolver.test.ts
  - apps/relayer/src/routes/__tests__/profile-registry-address.test.ts
  - apps/web/app/profile/[address]/settings/page.tsx
  - apps/web/tests/chain-pinning.test.ts
autonomous: true
requirements: [AUTH-11, AUTH-35, AUTH-44, D-13]
must_haves:
  truths:
    - "Relayer profile route reads ProfileRegistry at the canonical PROFILE_REGISTRY_ARBITRUM_SEPOLIA const from @call-it/shared — the env-or-zero fallback (NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS ?? zero address) is dead, so displayHandle/settledCalls reads never target the zero address (AUTH-11/AUTH-35; same landmine class fixed on web in quick-260611-npv)"
    - "resolveEns returns null immediately — no RPC attempted — when ENS_MAINNET_RPC_URL is unset (honest D-07 degrade: ENS not configured = no ENS name), so uncached profile requests no longer burn the 5s ENS leg timeout and the 60s profile cache fills again; when the env IS set, behavior is unchanged (bounded transport + public failover stays)"
    - "The CR-01 no-cache-on-timeout rule in profile.ts is UNTOUCHED — the fix removes the doomed leg, not the cache-safety rule"
    - "Settings handleSetDisplayHandle normalizes input once (trim + strip leading @) and uses the normalized value for the empty/length validations, the tx args, the read-back compare, and the post-success input sync — a user typing '@test' stores 'test' on-chain (no more '@@test' display)"
    - "Test suites are extended, never weakened (D-15): relayer vitest green + tsc build exit 0; web vitest green (245-passing baseline preserved) + next build exit 0"
  artifacts:
    - path: "apps/relayer/src/routes/profile.ts"
      provides: "getProfileRegistryAddress() returning the canonical shared const, never the zero address"
      contains: "PROFILE_REGISTRY_ARBITRUM_SEPOLIA"
    - path: "apps/relayer/src/lib/ens-resolver.ts"
      provides: "early null return in resolveEns when ENS_MAINNET_RPC_URL is unset"
      contains: "ENS_MAINNET_RPC_URL"
    - path: "apps/relayer/src/lib/__tests__/ens-resolver.test.ts"
      provides: "unit proof: env unset → null fast, no RPC; env set → behavior unchanged"
    - path: "apps/relayer/src/routes/__tests__/profile-registry-address.test.ts"
      provides: "pin: profile route address source is the canonical shared const / never zero"
    - path: "apps/web/app/profile/[address]/settings/page.tsx"
      provides: "normalized handle (trim + strip leading @) through the entire save flow"
      contains: "replace(/^@+/"
    - path: "apps/web/tests/chain-pinning.test.ts"
      provides: "source pins for the normalization wiring"
  key_links:
    - from: "apps/relayer/src/routes/profile.ts"
      to: "@call-it/shared"
      via: "PROFILE_REGISTRY_ARBITRUM_SEPOLIA import (mirrors notification-fanout.ts:48)"
      pattern: "PROFILE_REGISTRY_ARBITRUM_SEPOLIA"
    - from: "apps/relayer/src/lib/ens-resolver.ts"
      to: "process.env.ENS_MAINNET_RPC_URL"
      via: "configured-check guard at the top of resolveEns"
      pattern: "ENS_MAINNET_RPC_URL"
    - from: "apps/web/app/profile/[address]/settings/page.tsx"
      to: "ProfileRegistry.setDisplayHandle"
      via: "tx args carry the normalized handle"
      pattern: "args: \\[normalized\\]"
---

<objective>
Fix three fully-diagnosed live-UAT defects (2026-06-11) in the profile identity pipeline:

1. **Wrong identity served:** ProfileRegistry `displayHandle(0x73047a88...5ced)` returns "test" on-chain, but the live relayer returns `displayHandle:"", source:"truncated"` — `getProfileRegistryAddress()` in `apps/relayer/src/routes/profile.ts:102-107` falls back to the ZERO ADDRESS when `NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS` is unset (it is unset on Fly), so every registry read silently returns ''/0n.
2. **~6s on every profile click:** `apps/relayer/src/lib/ens-resolver.ts:34-42` passes `http(undefined)` (viem default public mainnet RPC) when `ENS_MAINNET_RPC_URL` is unset (it is unset on Fly) — the ENS leg burns its full 5s `withTimeout` cap on every uncached request, AND the CR-01 rule correctly refuses to cache any resolution with a timed-out leg, so the 60s cache never fills and EVERY request pays ~5.86s.
3. **"@@test" handle:** the settings page stores a user-typed leading `@` as part of the on-chain handle (`apps/web/app/profile/[address]/settings/page.tsx` uses raw `handleInput` at the length check :131, the tx args :160, and the read-back compare :181).

Root causes are VERIFIED — do not re-litigate. Fix the causes; do NOT touch the CR-01 cache rule.

Purpose: live profile identity must be honest (display the on-chain handle the user paid gas to set) and fast (cacheable, no doomed RPC leg).
Output: two atomic commits — one relayer, one web — with tests extended (D-15), suites green, builds exit 0. No push (orchestrator pushes).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/relayer/src/routes/profile.ts
@apps/relayer/src/lib/ens-resolver.ts
@apps/relayer/src/workers/notification-fanout.ts
@apps/web/app/profile/[address]/settings/page.tsx
@apps/web/tests/chain-pinning.test.ts
@apps/relayer/src/lib/__tests__/x-write-client.test.ts

Key facts discovered during planning (verified against source):

- **Canonical-address precedent:** `apps/relayer/src/workers/notification-fanout.ts:48` already does `import { PROFILE_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared'` and guards against the zero address at :74 before reading `displayHandle`. The relayer is Sepolia-staging single-network today — same assumption notification-fanout makes. Do NOT invent a network switch.
- **profile.ts structure:** `getProfileRegistryAddress()` (lines 101-107) is called at two read sites (:244 `displayHandle`, :260 `settledCalls`) inside the `Promise.allSettled` block. Both reads have inner try/catch returning ''/`BigInt(0)` — which is exactly why the zero-address reads degrade silently to `truncated`.
- **ens-resolver structure:** module-scope `mainnetClient` (lines 34-42) with `fallback([http(process.env.ENS_MAINNET_RPC_URL, ...), http(undefined, ...)])`. `resolveEns` (line 58) checks the L1/Redis cache via `getCached` first, then calls `mainnetClient.getEnsName`.
- **Relayer test conventions:** vitest, env vars saved/restored per test with `beforeEach`/`afterEach` delete-and-restore (see `x-write-client.test.ts:15-26` — env is read PER CALL in that module, no `vi.resetModules` dance). `subgraph-breaker.test.ts:21` shows the `vi.mock('../logger.js', ...)` pattern. Vitest include globs (`apps/relayer/vitest.config.ts:6`) cover `src/**/__tests__/**/*.test.ts`, so a new `src/routes/__tests__/` dir is picked up automatically.
- **Web test conventions:** `apps/web/tests/chain-pinning.test.ts` already pins this exact settings file with `readFileSync` source assertions (the quick-260611-npv describe block at :107-145). Extend it.
- **Scripts:** relayer `test` = `vitest run`, `build` = `tsc --build`; web `test` = `vitest run`, `build` = `next build --webpack`. `@call-it/shared` dist is gitignored — if a build/test fails on missing shared dist, run `pnpm --filter @call-it/shared build` first.
- **Windows box:** use Bash/Git Bash and QUOTE all paths containing `[address]` / `[id]`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Relayer — canonical ProfileRegistry address + skip unconfigured ENS leg (one commit)</name>
  <files>apps/relayer/src/routes/profile.ts, apps/relayer/src/lib/ens-resolver.ts, apps/relayer/src/lib/__tests__/ens-resolver.test.ts (new), apps/relayer/src/routes/__tests__/profile-registry-address.test.ts (new)</files>
  <action>
    **1a — profile.ts (root cause A):** Add `PROFILE_REGISTRY_ARBITRUM_SEPOLIA` to the imports from `@call-it/shared` (new import line — profile.ts does not currently import from the shared package; mirror `notification-fanout.ts:48`). Replace the body of `getProfileRegistryAddress()` (lines 102-107) so it returns `PROFILE_REGISTRY_ARBITRUM_SEPOLIA as \`0x${string}\`` — delete the `process.env.NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS ?? zero-address` expression entirely (the same kill the web npv fix applied; `NEXT_PUBLIC_` is a web-ism that was never set on Fly, and an env-or-zero fallback is the verified root cause of the truncated identity). No env override is kept — the canonical shared const is the single source, exactly like notification-fanout. Update the comment above the function: canonical shared const per quick-260611-p9a; the old env-or-zero fallback sent displayHandle/settledCalls reads to the zero address on Fly (inner catch → ''/0n → handle fell through to truncated). Note the Sepolia-staging single-network assumption (same as notification-fanout — no network switch). Do NOT write the literal text `?? '0x0000000000000000000000000000000000000000'` anywhere in the new comment (the pin test below asserts that exact code pattern is absent — grep-gate hygiene).

    **1b — ens-resolver.ts (root cause B):** At the very top of `resolveEns` (before the cache read), add a configured-check guard: read `const ensConfigured = Boolean(process.env.ENS_MAINNET_RPC_URL)` INSIDE the function (per-call read — this matches the repo's testable env pattern in `x-write-client.test.ts`, where tests delete/set the env per test without module re-import; a module-scope read would freeze the value at first import and break that pattern). When not configured, return `null` immediately — no cache read, no RPC attempt, no per-request logging (this is the common path on Fly today; log spam would be worse than silence, and the honest D-07 semantics are "ENS not configured = no ENS name"). Leave the module-scope `mainnetClient` and its `fallback([http(env), http(undefined)])` transport UNTOUCHED — when the env IS set, behavior is byte-identical (bounded transport + public failover stays). Update the file header comment: when `ENS_MAINNET_RPC_URL` is unset, `resolveEns` returns null immediately (quick-260611-p9a) — previously `http(undefined)` fell through to viem's default public mainnet RPC, which hangs/throttles from Fly, burning the full 5s leg timeout on every uncached profile request; combined with CR-01 (timed-out legs are never cached) the 60s profile cache could never fill, so every profile click paid ~6s. Do NOT touch profile.ts's CR-01 `anyLegTimedOut` cache rule.

    **1c — Tests (D-15, extend, never weaken):**

    NEW `apps/relayer/src/lib/__tests__/ens-resolver.test.ts`: `vi.mock('../cache.js', ...)` with `getCached` resolving `null` and `setCached` a resolved no-op (isolates from L1/Redis); `vi.mock('../logger.js', ...)` returning a stub logger (mirror `subgraph-breaker.test.ts:21`); `vi.mock('viem', ...)` using `importOriginal` to keep `fallback`/`http`/chain exports while replacing `createPublicClient` with a factory returning `{ getEnsName: getEnsNameSpy }` (the client is created at module scope, so the mock must be in place before the module loads — vi.mock hoisting handles this; import `resolveEns` normally or via dynamic import after the mocks). Save/restore `ENS_MAINNET_RPC_URL` with the `ORIGINAL_*` + beforeEach-delete + afterEach-restore pattern from `x-write-client.test.ts:15-26`. Test (i): env UNSET → `await resolveEns('0x7304a289aa8d5a4db23eb78c143e9aa376415ced')` resolves `null` AND `getEnsNameSpy` was NOT called (proves early return before any RPC). Test (ii): env SET (e.g. `https://eth-mainnet.example/test`) → `getEnsNameSpy` mock-resolves a name (e.g. `vitalik.eth`), `resolveEns` returns it and the spy was called once (proves configured behavior unchanged).

    NEW `apps/relayer/src/routes/__tests__/profile-registry-address.test.ts` (vitest include glob `src/**/__tests__/**/*.test.ts` already covers this new dir): source-assertion style mirroring `apps/web/tests/chain-pinning.test.ts:107-145` — `readFileSync` the profile.ts source (resolve the path relative to the test file, e.g. `path.resolve(__dirname, '../profile.ts')`) and assert: (1) contains `PROFILE_REGISTRY_ARBITRUM_SEPOLIA`, (2) contains `@call-it/shared`, (3) does NOT contain `NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS`, (4) does NOT contain the dead code pattern `?? '0x0000000000000000000000000000000000000000'`. Plus one unit assertion importing `PROFILE_REGISTRY_ARBITRUM_SEPOLIA` from `@call-it/shared` and asserting it is not the zero address (the const itself can never silently regress to zero).

    **Commit 1 (exact message):** `fix(quick-260611-p9a): relayer profile identity + latency — canonical ProfileRegistry addr (was env-or-zero) + skip unconfigured ENS leg (was 5s burn blocking the cache)` — stage ONLY the four files in this task's file list via explicit `git add` paths. NEVER stage: packages/contracts/lib/openzeppelin-contracts, "call it frontend/", docs/, evidence/, .claude/, .planning/config.json, any .gitignore. No push. Never print/commit/set SETTLEMENT_SIGNER_PRIVATE_KEY or any secret.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/relayer test && pnpm --filter @call-it/relayer build</automated>
  </verify>
  <done>Relayer vitest suite green (existing tests untouched + new ens-resolver and profile-registry-address specs passing); `tsc --build` exit 0; profile.ts source contains PROFILE_REGISTRY_ARBITRUM_SEPOLIA and no NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS / env-or-zero pattern; resolveEns early-returns null when ENS_MAINNET_RPC_URL is unset with no RPC attempted; CR-01 cache rule untouched; commit 1 exists with exactly the four task files staged.</done>
</task>

<task type="auto">
  <name>Task 2: Web — settings handle input strips leading @ before save (one commit)</name>
  <files>apps/web/app/profile/[address]/settings/page.tsx, apps/web/tests/chain-pinning.test.ts</files>
  <action>
    **2a — handleSetDisplayHandle (root cause C):** In `apps/web/app/profile/[address]/settings/page.tsx`, normalize ONCE at the top of `handleSetDisplayHandle` (line 126): `const normalized = handleInput.trim().replace(/^@+/, '');` — then switch every downstream use to `normalized`: the empty check at :127 becomes `if (!normalized)` (so a bare `@` is rejected as empty), the length check at :131 becomes `normalized.length > 50` (so `@` + 50 chars measures 50, not 51), the tx `args` at :160 become `args: [normalized]`, and the read-back compare at :181 becomes `onChainHandle === normalized`. On the success branch (where `setHandleSaved(true)` fires), also call `setHandleInput(normalized)` so the UI input reflects exactly what was stored on-chain. A help line already exists (the AUTH-35 paragraph at :234-236), so per the task spec you MAY append one short sentence there — e.g. "Type it without the @ — a leading @ is stripped automatically." — but do NOT redesign the form, placeholder, or any other section. No other changes to the file (owner guard, chain alignment, receipt gate, error taxonomy all stay byte-identical).

    **2b — Tests (D-15):** Extend `apps/web/tests/chain-pinning.test.ts` — add a new describe block (e.g. `settings handle input normalization (quick-260611-p9a)`) next to the existing npv ProfileRegistry-writes block, using the same `read('app/profile/[address]/settings/page.tsx')` source-assertion helper. Assert the source: (1) contains `replace(/^@+/` (the normalization exists), (2) contains `args: [normalized]` (the tx sends the normalized value, not raw `handleInput`), (3) contains `onChainHandle === normalized` (the read-back compares against what was actually submitted), and (4) does NOT contain `args: [handleInput]` (the raw-input tx pattern is dead). Do not weaken or modify any existing test.

    **Commit 2 (exact message):** `fix(quick-260611-p9a): settings handle input strips leading @ before save (was stored on-chain → "@@name" display)` — stage ONLY `"apps/web/app/profile/[address]/settings/page.tsx"` (QUOTE the bracketed path in Bash) and `apps/web/tests/chain-pinning.test.ts`. Same never-stage list as Task 1. No push.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/web test && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Web vitest suite green (245-passing baseline preserved + new normalization pins passing); `next build` exit 0 (run `pnpm --filter @call-it/shared build` first if shared dist is missing); normalized value flows through validation, tx args, read-back compare, and post-success input sync; commit 2 exists with exactly the two task files staged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Public internet → relayer GET /api/profile/:address | Untrusted address param; response shapes public identity |
| Browser user input → on-chain setDisplayHandle tx | User-typed handle becomes permanent on-chain state |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-p9a-01 | Spoofing | profile.ts registry reads | mitigate | Canonical shared const removes the zero-address read path that misrepresented a user's identity as truncated; AUTH-11 priority chain unchanged |
| T-p9a-02 | DoS | ens-resolver.ts | mitigate | Unconfigured ENS leg no longer ties up 5s per uncached request (self-DoS on Fly); configured path keeps bounded transport (5s timeout, 1 retry) |
| T-p9a-03 | Tampering | profile cache (CR-01) | accept | CR-01 no-cache-on-timeout rule explicitly untouched — degraded bodies still never poison the 60s cache |
| T-p9a-04 | Tampering | setDisplayHandle input | mitigate | Normalization strips only a leading @ (trim + `/^@+/`); maxLength 50 validation now measures the stored value; read-back verifies the chain reflects exactly what was submitted |
| T-p9a-SC | Tampering | npm installs | accept | No new packages installed in this plan |
</threat_model>

<verification>
1. `pnpm --filter @call-it/relayer test` — full relayer suite green including the two new spec files.
2. `pnpm --filter @call-it/relayer build` — exit 0.
3. `pnpm --filter @call-it/web test` — full web suite green (baseline 245 passing + new pins).
4. `pnpm --filter @call-it/web build` — exit 0.
5. `git log --oneline -2` shows exactly the two commits with the specified messages; `git show --stat` per commit shows only the whitelisted files. Nothing pushed.
</verification>

<success_criteria>
- Relayer profile route can never read the zero-address registry again (canonical const, pin test guards regression).
- Unconfigured ENS = immediate honest null; the profile route's 60s cache fills again (no timed-out leg on the common path); CR-01 untouched.
- A user typing "@test" gets "test" stored and displayed; the input syncs to the stored value on success.
- Both suites green, both builds exit 0, two atomic commits as specified, nothing pushed, no secrets touched.
</success_criteria>

<output>
Create `.planning/quick/260611-p9a-profile-identity-latency/SUMMARY.md` when done.

**MUST note in SUMMARY (operator-facing):**
- Relayer changes need a Fly redeploy to take effect (operator-gated — the working command per live-ops notes is local `flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .` from repo root); web deploys via Vercel on master push.
- Operator may OPTIONALLY set `ENS_MAINNET_RPC_URL` on Fly later to re-enable ENS names — this fix makes its absence honest + fast instead of slow; setting the env restores full ENS resolution with no code change.
- Post-deploy expectation: `GET https://call-it-relayer-sepolia.fly.dev/api/profile/0x7304...5ced` returns `displayHandle:"test", source:"display_handle"`, and repeat requests hit the 60s cache (x-source: cache) instead of paying ~6s each.
</output>
