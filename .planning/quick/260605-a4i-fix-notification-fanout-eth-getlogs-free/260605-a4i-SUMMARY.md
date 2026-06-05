---
phase: quick
plan: 260605-a4i
subsystem: relayer-worker
tags: [notification-fanout, eth-getLogs, alchemy-free-tier, arbitrum-sepolia, viem, WR-05]
requirements: [SOCIAL-23, SOCIAL-24, WR-05]

dependency_graph:
  requires:
    - phase: 02-followfademarket
      provides: notification-fanout worker (original implementation)
  provides:
    - Free-tier-safe chunked getLogs in notification-fanout tick()
  affects:
    - CallerExited push notification delivery (SOCIAL-23/24)
    - Redis statusVersion OG cache-bust (D-09)
    - processChallengeNotifications (SOCIAL-40/41/42) — unaffected, still runs once per tick

tech_stack:
  patterns:
    - "Chunked getLogs: while(lastBlockSeen < head && windows < maxWindowsPerTick) with explicit numeric fromBlock/toBlock bigints"
    - "Break-on-getLogs-failure: errors++ then break; lastBlockSeen NOT advanced — retry same window next tick"
    - "Env-configurable tunables: NOTIFICATION_FANOUT_BLOCK_SPAN (default 9n), NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK (default 50)"
    - "Single getBlockNumber() call per tick for head (not per window) — minimizes RPC calls"

key_files:
  modified:
    - apps/relayer/src/workers/notification-fanout.ts

decisions:
  - "blockSpan default 9n: Alchemy free tier hard cap is 10 blocks; 9 gives an unambiguous 1-block safety margin"
  - "maxWindowsPerTick default 50: 50 windows × 9 blocks = 450 blocks per tick; at 0.25s Arbitrum blocks this catches up 112.5 seconds per tick, faster than any realistic backlog accumulation rate"
  - "getBlockNumber() once per tick (not per window) to reduce RPC usage on free tier"
  - "processChallengeNotifications runs unconditionally after the window loop even when the loop hits the window cap — challenge notifications are subgraph/time-windowed and independent of getLogs block range"

metrics:
  duration: 8min
  completed: 2026-06-05
  tasks: 2
  files: 1
---

# Quick Task 260605-a4i: Fix notification-fanout eth_getLogs free-tier failure

**Chunked getLogs fan-out replacing single `toBlock:'latest'` call with a bounded window loop (blockSpan=9n, maxWindowsPerTick=50) that keeps every Alchemy free-tier eth_getLogs call under the 10-block hard cap on Arbitrum Sepolia.**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite tick() to chunk getLogs into free-tier-safe windows | 79ca33c | apps/relayer/src/workers/notification-fanout.ts |
| 2 | Verify relayer vitest suite passes and commit | 79ca33c | (same file, single atomic commit) |

## Changes Made

### apps/relayer/src/workers/notification-fanout.ts

**Removed:**
- `const MAX_BLOCK_RANGE_PER_TICK = 10_000n` (module-level const, line 52 of original)
- Entire old `tick()` body: single `getLogs({ fromBlock, toBlock: 'latest' })` with the optional `getBlockNumber()` cap that still passed `'latest'` when the head read failed

**Added in `startNotificationFanout` (before `let lastBlockSeen`):**
- `blockSpan: bigint` — env-configurable via `NOTIFICATION_FANOUT_BLOCK_SPAN`, defaults to `9n`
- `maxWindowsPerTick: number` — env-configurable via `NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK`, defaults to `50`

**New `tick()` body:**
1. Same init-guard (unchanged — re-seeds `lastBlockSeen` if init failed)
2. Single `getBlockNumber()` call to read `head`; on failure, skips to challenge notifications then returns
3. `while (lastBlockSeen < head && windows < maxWindowsPerTick && !stopped)` loop:
   - `from = lastBlockSeen + 1n`, `to = min(from + blockSpan - 1n, head)`
   - `getLogs({ fromBlock: from, toBlock: to })` — always explicit numeric bigints, never `'latest'`
   - `getLogs` failure: `errors++`, `break` (does NOT advance `lastBlockSeen` — retries same window next tick)
   - Event processing loop (unchanged from before): `processCallerExitedEvent`, `totalEventsProcessed++`, blockNumber tracking
   - `lastBlockSeen = to` after successful window; `windows++`
4. Window-cap log: `notification_fanout_catching_up` if `lastBlockSeen < head && windows >= maxWindowsPerTick`
5. `processChallengeNotifications` — unchanged, runs once per tick after the window loop

## Verification Results

### End-state grep checks (all expected values met)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `grep -c "MAX_BLOCK_RANGE_PER_TICK" notification-fanout.ts` | 0 | 0 | PASS |
| `grep -c "toBlock.*latest" notification-fanout.ts` | 0 | 0 | PASS |
| `grep -c "NOTIFICATION_FANOUT_BLOCK_SPAN" notification-fanout.ts` | >= 1 | 2 | PASS |
| `grep -c "notification_fanout_catching_up" notification-fanout.ts` | 1 | 1 | PASS |

### Build

```
$ pnpm -C apps/relayer build
$ tsc --build
(exits 0 — no errors)
```

### Test suite

```
Test Files  27 passed | 1 skipped (28)
      Tests 136 passed | 1 skipped (137)
   Duration  10.20s
```

The 1 skipped file is `test/kms-roundtrip.test.ts` — pre-existing skip requiring live GCP KMS credentials; unrelated to this change.

### Commit

```
commit 79ca33c343b754ede991dc57b4031d29767463c4
 apps/relayer/src/workers/notification-fanout.ts | 161 +++++++++++---------
 1 file changed, 100 insertions(+), 61 deletions(-)
```

`git show --stat HEAD` confirms exactly one file changed.

## Deviations from Plan

None — plan executed exactly as written. All 4 changes (delete const, add tunables, rewrite tick()) applied in order. Commit trailer updated per constraints (`Claude Opus 4.8 (1M context)` instead of `Claude Sonnet 4.6`).

## Known Stubs

None introduced by this change.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. The change only modifies how an existing `getLogs` call is chunked — the same RPC endpoint, same event filter, same Postgres + Redis sinks.

## Self-Check: PASSED

- [x] `apps/relayer/src/workers/notification-fanout.ts` modified and committed
- [x] `grep -c "MAX_BLOCK_RANGE_PER_TICK"` returns 0
- [x] `grep -c "toBlock.*latest"` returns 0
- [x] `grep -c "NOTIFICATION_FANOUT_BLOCK_SPAN"` returns 2
- [x] `grep -c "notification_fanout_catching_up"` returns 1
- [x] `pnpm -C apps/relayer build` exits 0
- [x] `pnpm -C apps/relayer test` 136 passed / 0 new failures
- [x] `git show --stat HEAD` touches exactly one file: `apps/relayer/src/workers/notification-fanout.ts`
- [x] Commit `79ca33c` exists in git log
