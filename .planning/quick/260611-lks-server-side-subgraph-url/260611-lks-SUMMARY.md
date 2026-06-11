---
phase: quick-260611-lks
plan: 01
status: complete
one_liner: "Server-only SUBGRAPH_URL env var now wins in both web subgraph readers (leaderboard + settled-fields) so the key-bearing Graph gateway URL never enters a client bundle or git (D-27), with keyless back-compat fallbacks and 5 new vitest pins."
requirements: [D-27, D-15]
commits:
  - hash: 3a59cd6
    message: "fix(quick-260611-lks): server-only SUBGRAPH_URL precedence for gateway key safety (D-27) — leaderboard + settled-fields"
key-files:
  modified:
    - apps/web/lib/leaderboard-client.ts
    - apps/web/lib/relayer-client.ts
  created:
    - apps/web/tests/subgraph-url-precedence.test.ts
metrics:
  completed: 2026-06-11
  tasks: 2/2
  tests: "236 passed / 0 failed (231 baseline + 5 new)"
  build: "pnpm --filter @call-it/web build exit 0"
---

# Quick 260611-lks: Server-side SUBGRAPH_URL Summary

**Server-only `SUBGRAPH_URL` precedence wired into both web subgraph readers so the Graph gateway API key (embedded in the gateway URL path) can never ship in a client bundle or be committed to git (D-27).**

## What Changed

1. **`apps/web/lib/leaderboard-client.ts`** — module const now reads
   `process.env['SUBGRAPH_URL'] ?? process.env['NEXT_PUBLIC_SUBGRAPH_URL'] ?? ''`
   (trailing-slash strip kept). Header D-27 paragraph and `getLeaderboard` doc
   comment rewritten to the key-bearing-gateway-URL rationale; `NEXT_PUBLIC_SUBGRAPH_URL`
   is documented as LEGACY (keyless Studio URL only). Empty-string guard unchanged
   (no URL → empty board, not an error).

2. **`apps/web/lib/relayer-client.ts`** — settled-fields const now reads
   `process.env['SUBGRAPH_URL'] ?? SUBGRAPH_URL_SEPOLIA` (keyless shared const as
   fallback; `@call-it/shared` import kept, `packages/shared` untouched). Stale
   "hardcoding is intentional" comment block replaced with both runtime halves:
   (a) server-side (og Route Handlers, the only callers) `SUBGRAPH_URL` wins;
   (b) client bundles evaluate the line with the var undefined → keyless Studio
   fallback, acceptable degrade since no client path calls the subgraph readers.
   `getSettledFields` doc comment updated (was claiming `NEXT_PUBLIC_SUBGRAPH_URL`).

3. **`apps/web/tests/subgraph-url-precedence.test.ts`** (new, 5 tests) —
   behavioral precedence pins for leaderboard-client (`SUBGRAPH_URL` wins; legacy
   `NEXT_PUBLIC` fallback works; neither set → empty board + fetch never called)
   via `vi.resetModules` + `vi.stubEnv` + fetch stub (only `https://example.com/...`
   placeholders); static pin of the relayer-client env-first pattern; leak guard
   rejecting the gateway host literal in either lib file (needle built from
   joined fragments so the host never appears as a plain literal in the repo).

## Verification

- `pnpm --filter @call-it/web build` — exit 0 (note: a stale `.next/lock` from the
  Task-1 build had to be removed before the Task-2 build re-run; not code-related).
- `pnpm --filter @call-it/web exec vitest run` — 26 files, **236 passed, 0 failed**
  (suite baseline had grown to 231 since the plan's 206 figure; all green + 5 new).
- `grep -rn "gateway.thegraph" apps/web/lib apps/web/tests` — zero matches (no
  plain host literal anywhere; test builds the needle from fragments).
- `git show --stat HEAD` — exactly the 3 plan files; no excluded paths; no push.

## Operator Env-Name Table (action required for gateway cutover)

| Where | Env var | Value | Notes |
|---|---|---|---|
| Vercel (web project) — **ADD** | `SUBGRAPH_URL` | the full Graph **gateway** query URL (`https://gateway.../api/<KEY>/subgraphs/id/<ID>`) | **Server-only** — do NOT prefix with `NEXT_PUBLIC_`. Wins for both the Leaderboard RSC read and the og-route settled-field reads. |
| Vercel (web project) — keep as-is | `NEXT_PUBLIC_SUBGRAPH_URL` | legacy keyless Studio URL | LEGACY fallback for the leaderboard only. NEVER put a gateway/key-bearing URL here — it inlines into every browser bundle. |
| (no change) | `SUBGRAPH_URL_SEPOLIA` const in `@call-it/shared` | keyless Studio URL | Committed fallback for settled-fields; stays keyless forever. |

Until the Vercel `SUBGRAPH_URL` env lands, behavior is unchanged: leaderboard uses
the legacy `NEXT_PUBLIC_SUBGRAPH_URL`, settled-fields use the keyless shared const.

## Deviations from Plan

None - plan executed exactly as written. (Only adjustment within Task 2's own spec:
Test 2 stubs `SUBGRAPH_URL` to `undefined` rather than `''`, since an empty string
is not nullish and would not exercise the `??` fallback the plan mandates.)

## Self-Check: PASSED

- apps/web/lib/leaderboard-client.ts — FOUND (env-first pattern present)
- apps/web/lib/relayer-client.ts — FOUND (env-first pattern present)
- apps/web/tests/subgraph-url-precedence.test.ts — FOUND (5/5 passing)
- Commit 3a59cd6 — FOUND on master
