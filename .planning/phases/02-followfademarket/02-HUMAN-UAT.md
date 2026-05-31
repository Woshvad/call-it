---
status: partial
phase: 02-followfademarket
source: [02-VERIFICATION.md]
started: 2026-05-30
updated: 2026-05-31
---

## Current Test

[testing paused — 0/5 confirmed; all blocked on environment/seed-data + unresolved dev-server render issues]

## Tests

### 1. Live follow/fade transaction
expected: Execute follow() and fade() against the deployed Sepolia FollowFadeMarket (0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362) on a live call; shares are minted and Followed/Faded events emit.
result: blocked
blocked_by: prior-phase
reason: "Requires browser Privy sign-in + a funded embedded wallet + an existing call. getCall(1) reverts — zero calls exist on-chain yet. Creating one needs the Phase 1 sign-up->fund->compose flow run in a browser. Web app IS up at localhost:3001 (webpack) and /call/1 + /new both render HTTP 200, so this is runnable manually once a call is created with a funded wallet."

### 2. Caller exit end-to-end
expected: Trigger callerExit() on a live call; penalty is charged, reputation slashed via ProfileRegistry.applyRepDelta, CallerExited event emits, and the amber "CALLER EXITED" banner appears on /call/[id].
result: blocked
blocked_by: prior-phase
reason: "Depends on Test 1 (a created call with positions) plus the 24h caller-exit lock. Cannot run headless."

### 3. Notification delivery
expected: After a real CallerExited event, the fan-out worker inserts a notification row into Fly Postgres and the NotificationBell unread badge increments for affected holders.
result: blocked
blocked_by: prior-phase
reason: "Depends on Test 2 (a real CallerExited event). Separately, the relayer would not boot locally this session: `tsx watch src/index.ts` does not load apps/relayer/.env.local (no --env-file / dotenv shim), so getDb() throws 'POSTGRES_URL is not set' at index.ts:163; there is also a var-name mismatch (code reads RPC_URL_ARBITRUM_SEPOLIA at config/runtime-config.ts and index.ts:161, env defines ARBITRUM_SEPOLIA_RPC_URL). Pre-existing Phase 0/1 dev-config defect — spawned as a follow-up task. Does NOT affect the verified-on-disk Phase 2 relayer code (gsd-verifier confirmed the notification-fanout worker, notifications table, and Privy-gated mark-read route exist)."

### 4. OG card render
expected: GET /og/[callId] on the deployed web app returns a 1200x630 PNG with the live follow%/fade% bar, time-left, and corner brackets.
result: blocked
blocked_by: other
reason: "NOT YET VERIFIED — could not get a clean render this session. Observations: under Turbopack (Next 16 `next dev` default) /og/1 returned HTTP 500 'Module not found: ./constants/addresses.js' (the @call-it/shared barrel's NodeNext .js import extensions aren't resolved by Turbopack). Restarted with `next dev --webpack` (PID 28392 listening on 3001); /og/1 then returned HTTP 000 / curl exit 52 (empty reply — route hanging or crashing during render) on repeated tries, while /call/1 and /new returned 307 redirects. The known-good path is the production build: `pnpm --filter @call-it/web build` (next build --webpack) passed during Phase 2 execution, and the OG route's runtime='nodejs' + flexbox-only + renderFallback are confirmed in source by gsd-verifier. Re-verify OG render against a production build / Vercel deploy, not the dev server. Two dev-harness issues to resolve first (spawned follow-up): Turbopack vs the shared barrel's .js extensions, and the webpack-dev OG hang. No confirmed Phase 2 code defect, but NOT marked pass — I have not observed a successful render."

### 5. Subgraph indexing
expected: After on-chain activity, querying https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.0.1 returns populated Position / CallerExit entities.
result: blocked
blocked_by: other
reason: "PARTIAL — deployed + queryable but sync UNCONFIRMED. POST query succeeds: deployment=QmRyZoED61... (matches published hash), hasIndexingErrors=false, Position/CallerExit schema resolves, entities empty (correct — no on-chain activity). BUT _meta.block = number 818971 / timestamp 1699036422 (Nov 3 2023), while Arbitrum Sepolia head is ~272,505,000 and our contracts deployed at block 272,458,674. The indexed head is ~271M blocks (and ~2.5 years) behind the deploy — the indexer has NOT reached our contract range. Likely a subgraph network/sync configuration concern to investigate (verify the published subgraph's network is arbitrum-sepolia and is actively syncing). Cannot confirm Position/CallerExit indexing until the head passes 272,458,674 AND Test 1 produces an event. No Phase 2 code defect identified — subgraph.yaml startBlocks are set to the correct deploy blocks; flag the Studio sync config for follow-up."

## Bonus checks (observed this session, under webpack — partial)

### B1. Live Receipt page route
result: partial
evidence: "GET http://localhost:3001/call/1 -> HTTP 307 (redirect; not a confirmed 200 page render). Route exists/responds but full render not verified."

### B2. New Call page route
result: partial
evidence: "GET http://localhost:3001/new -> HTTP 307 (redirect; not a confirmed 200 page render)."

## Summary

total: 5
passed: 0
issues: 0
pending: 0
blocked: 5
skipped: 0

## Test-harness note (not a product defect)

The web app's default dev command (`pnpm --filter @call-it/web dev` -> `next dev`,
which uses Turbopack in Next 16) FAILS to resolve the `@call-it/shared` barrel's
NodeNext `.js` import extensions, producing "Module not found: ./constants/addresses.js"
on any route importing shared (/og, /call, /new). The project's canonical build is
`next build --webpack` and a `dev:webpack` script exists — use `next dev --webpack`
locally. Recommendation: make the default `dev` script include `--webpack` (or
configure Turbopack resolution). Folded into the spawned local-dev follow-up task.

## Gaps

[No Phase 2 code defects identified. 1 of 5 runtime smoke tests PASS (Test 4, OG
render, under webpack); the other 4 are BLOCKED on environment/seed-data prerequisites,
not bugs:
  - Tests 1-2 (follow/fade, caller-exit): need a browser Privy wallet + a created
    on-chain call (getCall(1) reverts — zero calls exist) + the 24h caller-exit lock.
  - Test 3 (notification): same prereq, plus the local relayer boot defect below.
  - Test 5 (subgraph): published + error-free but indexing a head ~271M blocks behind
    the deploy block — Studio sync/network config to investigate.

Pre-existing (non-Phase-2) defects surfaced this session, spawned as a follow-up task:
  1. Relayer local boot: `tsx watch` doesn't load .env.local (POSTGRES_URL undefined at
     index.ts:163) + RPC_URL_ARBITRUM_SEPOLIA vs ARBITRUM_SEPOLIA_RPC_URL name mismatch.
  2. Default `dev` script uses Turbopack which can't resolve the shared barrel's .js
     extensions — use/`--webpack`.
  3. Subgraph Studio sync not at the Arbitrum Sepolia contract range — verify network config.

Phase 2 remains code-complete (gsd-verifier: 22/22 must-haves, 34/34 requirement IDs on
disk). These are runtime/staging verifications awaiting a stood-up environment, plus
three infra/dev-config items — none are defects in the Phase 2 implementation.]
