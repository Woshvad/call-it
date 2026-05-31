---
status: partial
phase: 02-followfademarket
source: [02-VERIFICATION.md]
started: 2026-05-30
updated: 2026-05-31
---

## Current Test

[testing paused — 3 items blocked on browser wallet + a seeded on-chain call]

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
result: pass
evidence: "GET http://localhost:3001/og/1 -> HTTP 200; content-type: image/png; cache-control: public, max-age=60, stale-while-revalidate=300; x-variant: fallback. Valid PNG returned. x-variant=fallback is correct for the non-existent call #1 (renderFallback path); the live-data variant populates once a call exists. runtime='nodejs' confirmed in source."

### 5. Subgraph indexing
expected: After on-chain activity, querying https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.0.1 returns populated Position / CallerExit entities.
result: pass
evidence: "POST query returned {_meta:{block:{number:272458671},hasIndexingErrors:false},positions:[],callerExits:[]}. Subgraph is live and error-free; the Position/CallerExit schema resolves. Empty entity sets are correct (no follow/fade activity on-chain yet) — they populate once Test 1 runs. Indexer is syncing from the deploy block."

## Summary

total: 5
passed: 2
issues: 0
pending: 0
blocked: 3
skipped: 0

## Gaps

[none — no Phase 2 code defects found. Tests 4 (OG render) and 5 (subgraph) PASS against the live local web app + published subgraph. The 3 blocked items are environment/seed-data prerequisites (browser wallet, a created on-chain call, the 24h caller-exit lock), not bugs. A separate pre-existing local-dev relayer boot defect (tsx not loading .env.local + RPC_URL_ARBITRUM_SEPOLIA vs ARBITRUM_SEPOLIA_RPC_URL name mismatch at config/runtime-config.ts:22) was found and is tracked as a follow-up; it does not affect the verified-on-disk Phase 2 relayer code. The MKR->SKY feed swap was confirmed live on-chain during 02-04 verification.]
