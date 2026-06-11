---
phase: quick-260611-lks
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/lib/leaderboard-client.ts
  - apps/web/lib/relayer-client.ts
  - apps/web/tests/subgraph-url-precedence.test.ts
autonomous: true
requirements: [D-27, D-15]

must_haves:
  truths:
    - "D-27: the Graph gateway API key can never ship in a client bundle — both web subgraph reads source their URL from the server-only SUBGRAPH_URL env var first"
    - "D-27: current deploys keep working before the Vercel env lands — leaderboard falls back to legacy NEXT_PUBLIC_SUBGRAPH_URL, settled-fields falls back to the keyless SUBGRAPH_URL_SEPOLIA const"
    - "D-27: no gateway URL or API key literal exists in any committed apps/web file — env names only"
    - "D-15: web vitest suite all green and web build exit 0, with new tests pinning the SUBGRAPH_URL precedence"
  artifacts:
    - path: "apps/web/lib/leaderboard-client.ts"
      provides: "Server-only SUBGRAPH_URL precedence for the Leaderboard RSC read"
      contains: "process.env['SUBGRAPH_URL']"
    - path: "apps/web/lib/relayer-client.ts"
      provides: "Env-driven settled-fields subgraph URL with const fallback"
      contains: "process.env['SUBGRAPH_URL']"
    - path: "apps/web/tests/subgraph-url-precedence.test.ts"
      provides: "Vitest pins for the precedence chain + gateway-literal leak guard"
  key_links:
    - from: "apps/web/lib/leaderboard-client.ts"
      to: "process.env SUBGRAPH_URL"
      via: "module-level const with NEXT_PUBLIC legacy fallback"
      pattern: "process\\.env\\['SUBGRAPH_URL'\\] \\?\\? process\\.env\\['NEXT_PUBLIC_SUBGRAPH_URL'\\]"
    - from: "apps/web/lib/relayer-client.ts"
      to: "process.env SUBGRAPH_URL"
      via: "module-level const with SUBGRAPH_URL_SEPOLIA fallback"
      pattern: "process\\.env\\['SUBGRAPH_URL'\\] \\?\\? SUBGRAPH_URL_SEPOLIA"
---

<objective>
Move the web app's subgraph access onto a server-only `SUBGRAPH_URL` env var so the new Graph gateway API key (embedded in the gateway URL path) never ships in a client bundle (D-27), with back-compat fallbacks so the live Vercel deploy keeps working until the env var lands.

Purpose: the subgraph just moved from the rate-limited Studio dev endpoint to the production Graph gateway, whose URL format embeds the key in the path (`.../api/<KEY>/subgraphs/id/<ID>`) — the key IS the URL. Putting it in `NEXT_PUBLIC_SUBGRAPH_URL` would inline it into every browser bundle; putting it in the shared `SUBGRAPH_URL_SEPOLIA` const would commit it to git. Both paths must become server-env-driven.

Output: two re-sourced URL consts in `apps/web/lib/`, updated rationale comments, and a new vitest file pinning the precedence + a leak guard. Single atomic commit. `packages/shared` untouched.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/web/lib/leaderboard-client.ts
@apps/web/lib/relayer-client.ts
@apps/web/tests/og-real-data-wiring.test.ts

Caller audit (verified during planning — do NOT re-derive):
- `getLeaderboard` is consumed ONLY by `apps/web/app/leaderboard/page.tsx`, a Server Component (pinned by `tests/leaderboard.spec.ts` Test 1). Server-only.
- `getSettledFields` is consumed ONLY by `apps/web/app/og/[callId]/route.ts` (Node-runtime Route Handler — `export const runtime = 'nodejs'`). Server-only.
- `getDuelSettledFields` is consumed ONLY by `apps/web/app/og/duel/[challengeId]/route.ts`. Server-only. It reads the SAME module-level `SUBGRAPH_URL` const at relayer-client.ts:235 — one change covers both functions.
- `relayer-client.ts` as a MODULE is also bundled client-side (getFeed, postPreflight, etc. are called from client components), so its module-level env read WILL evaluate in the browser: `process.env['SUBGRAPH_URL']` is undefined there (server-only vars are never inlined by Next) → falls back to the keyless `SUBGRAPH_URL_SEPOLIA` const. This is the documented-acceptable degrade — the two subgraph-reading functions are never invoked client-side anyway.
- grep of apps/web found NO other `NEXT_PUBLIC_SUBGRAPH_URL` / `SUBGRAPH_URL_SEPOLIA` consumers and no other hardcoded `thegraph.com` endpoints. No `.env.example` exists in apps/web.
- No existing vitest test pins either env read (`og-real-data-wiring.test.ts` only asserts export presence), so the new precedence tests are purely additive. `tests/leaderboard.spec.ts` is Playwright (not in the vitest gate) and asserts nothing about the env var name — it stays green untouched.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-source both subgraph URL consts to server-only SUBGRAPH_URL with back-compat fallbacks (D-27)</name>
  <files>apps/web/lib/leaderboard-client.ts, apps/web/lib/relayer-client.ts</files>
  <action>
Per D-27, make the server-only `SUBGRAPH_URL` env var the first-precedence subgraph URL source in both modules. Do NOT touch `packages/shared` and NEVER write any actual gateway URL or API key into either file — env var NAMES only.

1. `apps/web/lib/leaderboard-client.ts` line 22 — change the const to read `process.env['SUBGRAPH_URL']` first, then `process.env['NEXT_PUBLIC_SUBGRAPH_URL']`, then empty string, keeping the existing trailing-slash `.replace(/\/$/, '')`. Keep bracket notation (prevents accidental Next.js build-time inlining of the server var name). Update the header D-27 paragraph (currently lines 10-14) to the new rationale: `SUBGRAPH_URL` is server-only because the gateway URL embeds the API key in its path; the `NEXT_PUBLIC_SUBGRAPH_URL` fallback is LEGACY (keyless Studio URL only — keeps the current deploy working until the Vercel env lands); never put a gateway URL in any `NEXT_PUBLIC_*` var. Also touch up the `getLeaderboard` doc comment sentence about D-27 ("the Studio key never reaches the bundle") to say the server-only env var keeps the gateway key out of the bundle. The empty-string guard at the top of `getLeaderboard` (no URL configured → empty board, not an error) is unchanged.

2. `apps/web/lib/relayer-client.ts` line 235 — change the const to read `process.env['SUBGRAPH_URL']` first with `SUBGRAPH_URL_SEPOLIA` as the nullish-coalescing fallback, keeping the trailing-slash replace. Keep the `SUBGRAPH_URL_SEPOLIA` import from `@call-it/shared`. Rewrite the comment block at lines 230-234: it currently claims hardcoding is INTENTIONAL (stale-Vercel-env rationale) — the rationale has changed: the gateway URL is key-bearing and can therefore never be committed to the shared const, so the URL is now env-driven server-side with the keyless Sepolia Studio const as fallback. State both halves of the runtime behavior in the comment: (a) server-side — the ONLY place `getSettledFields`/`getDuelSettledFields` are ever invoked (the two og Route Handlers) — `SUBGRAPH_URL` wins when set; (b) client bundles also evaluate this module-level line because relayer-client.ts is imported by client components — there the server var is undefined and the const falls back to the keyless Studio URL, an acceptable degrade since no client code path calls the subgraph readers.

3. Also fix the stale `getSettledFields` doc comment around line 287 ("the subgraph URL is read from NEXT_PUBLIC_SUBGRAPH_URL") — it must now say the URL comes from the server-only `SUBGRAPH_URL` env var with the `SUBGRAPH_URL_SEPOLIA` const fallback, and that the function is server-only (the Node-runtime og routes are its only callers).
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && grep -n "process.env\['SUBGRAPH_URL'\]" apps/web/lib/leaderboard-client.ts apps/web/lib/relayer-client.ts && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Both module-level consts read SUBGRAPH_URL first (leaderboard: NEXT_PUBLIC legacy fallback; relayer-client: SUBGRAPH_URL_SEPOLIA const fallback); all three stale comment blocks rewritten to the key-bearing-URL rationale; web build exit 0; packages/shared untouched; no gateway URL or key literal anywhere in the diff.</done>
</task>

<task type="auto">
  <name>Task 2: Lockstep vitest pins for the precedence + leak guard, run gates, atomic commit (D-15)</name>
  <files>apps/web/tests/subgraph-url-precedence.test.ts</files>
  <action>
Create `apps/web/tests/subgraph-url-precedence.test.ts` (vitest — `.test.ts` suffix so it runs in the `pnpm --filter @call-it/web exec vitest run` gate, NOT `.spec.ts` which is Playwright). Follow the static source-assertion style of `tests/og-real-data-wiring.test.ts` (readFileSync + join(process.cwd(), ...)) plus behavioral env-stub tests:

Behavioral tests (leaderboard-client precedence — D-27/D-15). Because `SUBGRAPH_URL` is read at module load, each test needs `vi.resetModules()` then a fresh `await import('@/lib/leaderboard-client')`; stub env with `vi.stubEnv` and fetch with `vi.stubGlobal('fetch', mock)`; clean up with `vi.unstubAllEnvs()` + `vi.unstubAllGlobals()` in afterEach. The fetch mock resolves `{ ok: true, json: async () => ({ data: { profiles: [] } }) }` and records the URL it was called with:
- Test 1: both `SUBGRAPH_URL` and `NEXT_PUBLIC_SUBGRAPH_URL` set to distinct https example URLs → `getLeaderboard()` fetches the `SUBGRAPH_URL` value (server-only var WINS).
- Test 2: only `NEXT_PUBLIC_SUBGRAPH_URL` set → fetch hits the legacy value (back-compat fallback).
- Test 3: neither set (stub both to '') → `getLeaderboard()` resolves `{ rows: [], windowedDataAvailable: false }` and fetch is NEVER called.
Use only `https://example.com/...` placeholder URLs in stubs — never a real endpoint.

Static source assertions:
- Test 4: `lib/relayer-client.ts` source matches `/process\.env\['SUBGRAPH_URL'\] \?\? SUBGRAPH_URL_SEPOLIA/` (env-first with const fallback) and still imports `SUBGRAPH_URL_SEPOLIA` from `@call-it/shared`.
- Test 5 (leak guard): neither `lib/leaderboard-client.ts` nor `lib/relayer-client.ts` contains the gateway host literal. Build the needle WITHOUT writing it as a plain literal in the test file (the commit rule forbids committing the gateway URL anywhere): e.g. `const GATEWAY_HOST = ['gateway', 'thegraph', 'com'].join('.');` then `expect(src).not.toContain(GATEWAY_HOST)`.

Gates (both must pass from repo root):
- `pnpm --filter @call-it/web build` exit 0
- `pnpm --filter @call-it/web exec vitest run` all green (existing 206 + the new tests, 0 fail)

Commit (single atomic): stage ONLY `apps/web/lib/leaderboard-client.ts`, `apps/web/lib/relayer-client.ts`, `apps/web/tests/subgraph-url-precedence.test.ts` plus the quick-task planning docs for this task. Message: `fix(quick-260611-lks): server-only SUBGRAPH_URL precedence for gateway key safety (D-27) — leaderboard + settled-fields`. NEVER stage the usual exclusions (submodule `packages/contracts/lib/openzeppelin-contracts`, 'call it frontend/', docs/, evidence/, .claude/, .planning/config.json, .gitignore files, soak scripts, snapshots). No push.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/web exec vitest run && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>New vitest file passes all 5 tests; full web vitest suite green (0 fail); web build exit 0; exactly one commit on master containing only the three code/test files + planning docs; no push; no gateway URL/key literal in the committed diff.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| server env → client bundle | Next.js build-time inlining: anything in NEXT_PUBLIC_* ships to every browser |
| repo → git history | anything committed to a shared const is permanently public in the repo |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lks-01 | Information Disclosure | Graph gateway API key via NEXT_PUBLIC_* inlining | mitigate | server-only SUBGRAPH_URL read first (Task 1); NEXT_PUBLIC fallback documented as keyless-legacy-only; bracket notation prevents accidental inlining |
| T-lks-02 | Information Disclosure | Graph gateway API key via committed SUBGRAPH_URL_SEPOLIA const | mitigate | const stays keyless Studio URL (packages/shared untouched); leak-guard test rejects gateway host literal in either lib file (Task 2 Test 5) |
| T-lks-03 | Denial of Service | client-side eval falls back to old Studio URL if a client path ever called the readers | accept | documented degrade; caller audit proves both readers are server-only (og routes); keyless fallback fails soft (empty fields / em-dashes per SHARE-10) |
</threat_model>

<verification>
- `pnpm --filter @call-it/web build` exit 0 (both tasks).
- `pnpm --filter @call-it/web exec vitest run` all green — existing suite (206) + new precedence/leak tests, 0 fail (D-15).
- `grep -rn "gateway.thegraph" apps/web/lib apps/web/tests` returns only the joined-fragment construction in the new test file (i.e. no plain host literal) — the actual gateway URL/key appears nowhere.
- `git show --stat HEAD` shows exactly the three code/test files (+ planning docs), no excluded paths, no push.
</verification>

<success_criteria>
- D-27 satisfied: setting `SUBGRAPH_URL` (server-only, Vercel env) routes BOTH the Leaderboard RSC read and the og-route settled-field reads through the gateway without the key ever entering a client bundle or git.
- Back-compat proven by tests: legacy `NEXT_PUBLIC_SUBGRAPH_URL` still works for the leaderboard until the new env lands; settled-fields degrade to the keyless `SUBGRAPH_URL_SEPOLIA` const when the env is absent (including in client bundles, where the readers are never invoked).
- All three stale comments rewritten to the key-bearing-URL rationale; `packages/shared` untouched.
- Single atomic commit, no push, exclusions respected.
</success_criteria>

<output>
Create `.planning/quick/260611-lks-server-side-subgraph-url/260611-lks-SUMMARY.md` when done.
</output>
