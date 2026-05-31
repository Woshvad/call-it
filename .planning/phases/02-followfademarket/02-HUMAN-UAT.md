---
status: partial
phase: 02-followfademarket
source: [02-VERIFICATION.md]
started: 2026-05-30
updated: 2026-05-31
---

## Current Test

[testing paused — all 5 items blocked on a stood-up environment + a seeded on-chain call]

## Tests

### 1. Live follow/fade transaction
expected: Execute follow() and fade() against the deployed Sepolia FollowFadeMarket (0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362) on a live call; shares are minted and Followed/Faded events emit.
result: blocked
blocked_by: prior-phase
reason: "Requires browser Privy sign-in + a funded embedded wallet + an existing call. getCall(1) reverts — zero calls exist on-chain yet. Creating one needs the Phase 1 sign-up->fund->compose flow run in a browser. Web app IS up at localhost:3001, so this is runnable manually once a call is created with a funded wallet."

### 2. Caller exit end-to-end
expected: Trigger callerExit() on a live call; penalty is charged, reputation slashed via ProfileRegistry.applyRepDelta, CallerExited event emits, and the amber "CALLER EXITED" banner appears on /call/[id].
result: blocked
blocked_by: prior-phase
reason: "Depends on Test 1 (a created call with positions) plus the 24h caller-exit lock. Cannot run headless."

### 3. Notification delivery
expected: After a real CallerExited event, the fan-out worker inserts a notification row into Fly Postgres and the NotificationBell unread badge increments for affected holders.
result: blocked
blocked_by: prior-phase
reason: "Depends on Test 2 (a real CallerExited event). Separately, the relayer would not boot locally this session — it crashes at config/runtime-config.ts:22 reading process.env.RPC_URL_ARBITRUM_SEPOLIA (undefined). Two compounding pre-existing local-dev defects: (a) the dev script `tsx watch src/index.ts` does not load apps/relayer/.env.local (no --env-file, no dotenv shim), so all env is undefined; (b) the var name is mismatched — env files define ARBITRUM_SEPOLIA_RPC_URL, code reads RPC_URL_ARBITRUM_SEPOLIA. Tracked as a follow-up; does NOT affect the on-disk Phase 2 relayer code, which gsd-verifier already confirmed (notification-fanout worker, notifications table, Privy-gated mark-read route all present)."

### 4. OG card render
expected: GET /og/[callId] on the deployed web app returns a 1200x630 PNG with the live follow%/fade% bar, time-left, and corner brackets.
result: blocked
blocked_by: other
reason: "CORRECTION (prior PASS was wrong — those headers were copied from source, not observed). Actual observed: GET http://localhost:3001/og/1 -> HTTP 500 (text/html), error 'the request of a dependency is an expression'. CRUCIALLY this also affects /api/og/1, the PRE-EXISTING Phase 0 fallback route — so it is a local `next dev --webpack` bundling issue with @vercel/og / viem dynamic deps, NOT a Phase 2 regression (the Phase 0 route passed CI/build previously, and `pnpm --filter @call-it/web build` passed during Phase 2 execution). OG render must be verified against a PRODUCTION build (`next build` / Vercel), not the dev server. Not marked pass (unverified) and not an issue against Phase 2 code."

### 5. Subgraph indexing
expected: After on-chain activity, querying https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.0.1 returns populated Position / CallerExit entities.
result: blocked
blocked_by: other
reason: "PARTIAL — deployed + queryable but sync UNCONFIRMED. POST query succeeds: deployment=QmRyZoED61... (matches published hash), hasIndexingErrors=false, Position/CallerExit schema resolves, entities empty (correct — no on-chain activity). BUT _meta.block.number=758961 while Arbitrum Sepolia head is ~272,461,032 and our contracts deployed at block 272,458,674 — the indexer is ~271M blocks behind the deploy, so it has NOT reached our contract range yet (early sync, or a sync/startBlock concern to recheck). Cannot confirm it will index Position/CallerExit until (a) the indexer head passes 272,458,674 AND (b) Test 1 produces a follow/fade event. Re-verify both once activity exists. No code defect identified — subgraph.yaml startBlocks are set to the correct deploy blocks."

## Summary

total: 5
passed: 0
issues: 0
pending: 0
blocked: 5
skipped: 0

## Gaps

[No Phase 2 code defects identified. All 5 runtime smoke tests are BLOCKED on environment/seed-data prerequisites, not bugs — none could be fully exercised this session:
  - Tests 1-3 (follow/fade, caller-exit, notification): need a browser Privy wallet + a created on-chain call (getCall(1) reverts — zero calls exist) + the 24h caller-exit lock.
  - Test 4 (OG render): /og/1 AND the Phase 0 /api/og/1 both 500 under `next dev --webpack` ('request of a dependency is an expression' bundling error) — a dev-server bundling issue affecting a pre-existing route, NOT a Phase 2 regression. Verify against a production build (next build / Vercel).
  - Test 5 (subgraph): deployed + queryable + hasIndexingErrors=false, but indexed head (758961) is ~271M blocks behind the deploy block (272,458,674) — sync not yet at our contract range; recheck once it catches up + activity exists.

Two pre-existing (non-Phase-2) defects surfaced and spawned as follow-up tasks:
  1. Relayer local boot: `tsx watch` doesn't load .env.local (POSTGRES_URL undefined) + RPC_URL_ARBITRUM_SEPOLIA vs ARBITRUM_SEPOLIA_RPC_URL name mismatch.
  2. (rolled into #1) — OG dev-bundling 500 is a separate `next dev --webpack` + @vercel/og concern worth confirming a prod build still renders.

Phase 2 remains code-complete (gsd-verifier: 22/22 must-haves, 34/34 requirement IDs on disk). These are runtime/staging verifications awaiting a stood-up environment, not blockers on the Phase 2 implementation.]
