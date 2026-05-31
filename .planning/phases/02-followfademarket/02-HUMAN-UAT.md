---
status: partial
phase: 02-followfademarket
source: [02-VERIFICATION.md]
started: 2026-05-30
updated: 2026-05-30
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live follow/fade transaction
expected: Execute follow() and fade() against the deployed Sepolia FollowFadeMarket (0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362) on a live call; shares are minted and Followed/Faded events emit.
result: [pending]

### 2. Caller exit end-to-end
expected: Trigger callerExit() on a live call; penalty is charged, reputation slashed via ProfileRegistry.applyRepDelta, CallerExited event emits, and the amber "CALLER EXITED" banner appears on /call/[id].
result: [pending]

### 3. Notification delivery
expected: After a real CallerExited event, the fan-out worker inserts a notification row into Fly Postgres and the NotificationBell unread badge increments for affected holders.
result: [pending]

### 4. OG card render
expected: GET /og/[callId] on the deployed web app returns a 1200x630 PNG with the live follow%/fade% bar, time-left, and corner brackets.
result: [pending]

### 5. Subgraph indexing
expected: After on-chain activity, querying https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.0.1 returns populated Position / CallerExit entities.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
