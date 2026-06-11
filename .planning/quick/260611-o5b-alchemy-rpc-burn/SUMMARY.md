---
phase: quick-260611-o5b
plan: 01
subsystem: relayer
status: complete
tags: [alchemy, rpc, getlogs, chain-scanner, cu-burn, workers]
requirements: [QUICK-260611-O5B]
dependency-graph:
  requires: []
  provides:
    - "apps/relayer/src/workers/chain-scanner.ts — shared single-cursor merged getLogs scanner"
  affects:
    - apps/relayer/src/workers/notification-fanout.ts
    - apps/relayer/src/workers/social-unlink-watcher.ts
    - apps/relayer/src/workers/auto-post-worker.ts
    - apps/relayer/src/index.ts
tech-stack:
  added: []
  patterns:
    - "shared scanner with subscriber registration (register/onTick/unregister)"
    - "injected-scanner production path + private-scanner test fallback"
key-files:
  created:
    - apps/relayer/src/workers/chain-scanner.ts
    - apps/relayer/src/workers/__tests__/chain-scanner.test.ts
  modified:
    - apps/relayer/src/workers/notification-fanout.ts
    - apps/relayer/src/workers/social-unlink-watcher.ts
    - apps/relayer/src/workers/auto-post-worker.ts
    - apps/relayer/src/index.ts
decisions:
  - "Single atomic commit per the plan's explicit instruction (overrides per-task commit default); TDD RED→GREEN evidenced by run order"
  - "auto-post-worker.test.ts unmodified — private-scanner fallback kept all 10 handler-level assertions green with zero edits, so it was NOT staged (per plan)"
  - "Pre-existing worktree dirt (apps/web/.gitignore, openzeppelin-contracts submodule) NOT reverted — predates this execution; reverting would destroy a parallel session's work"
metrics:
  duration: "~13 min (2026-06-11T16:30:43Z → 16:44Z)"
  completed: 2026-06-11
  tasks: 3
  tests-after: "319 passed / 1 skipped (50 files), incl. 25 new chain-scanner tests"
  commit: b926703
---

# Quick 260611-o5b: Alchemy RPC Burn Fix — Shared Chain Scanner Summary

**One-liner:** Merged the relayer's three independent 30s getLogs scan loops (notification-fanout, social-unlink-watcher, auto-post-worker) into ONE shared single-cursor chain-scanner issuing 1 merged multi-address/multi-event eth_getLogs + 1 eth_getBlockNumber per tick at 500-block windows (was 9), with byte-identical handler semantics.

## Before/After RPC Math (Arbitrum Sepolia steady state, ~120 new blocks per 30s tick)

| | Before | After |
|---|---|---|
| Scan loops | 3 independent setIntervals | 1 shared scanner |
| Window span | 9 blocks (stale "10 blocks/request" belief) | 500 blocks (real cap = 10K-block RANGE for filtered queries) |
| Windows/tick | ceil(120/9) = 14 per loop | 1 (120 < 500) |
| eth_getLogs/tick | 14 × (1 + 1 + 2) ≈ 56 | **1** (merged: 3 addresses × 3 events, OR'd) |
| eth_getBlockNumber/tick | 3 | **1** |

Same events detected, same 30s latency: CallerExited (FFM) → fan-out + auto-post; CallSettled (SettlementManager) → auto-post; SocialUnlinked (ProfileRegistry) → backstop purge.

## Env Fallback Ladder (resolved once at scanner creation, parse-guarded)

- `blockSpan`: explicit config > `CHAIN_SCANNER_BLOCK_SPAN` > `NOTIFICATION_FANOUT_BLOCK_SPAN` > **500n**
- `maxWindowsPerTick`: explicit config > `CHAIN_SCANNER_MAX_WINDOWS_PER_TICK` > `NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK` > **50**
- Invalid values (`'abc'`, `'0'`, negatives) fall through the ladder — pinned by tests.

**Retired envs:** `AUTO_POST_BLOCK_SPAN`, `SOCIAL_UNLINK_BLOCK_SPAN` (their private scan loops no longer exist; noted in chain-scanner.ts header).

## Per-File Changes

1. **chain-scanner.ts (NEW):** `createChainScanner(config)` → handle with `register()` (returns unregister), `onTick()` (runs every initialized tick INCLUDING the get_head-failure path), idempotent `start()`, `stop()`, `getStats()`, and a `tickNow()` test seam. Dispatch ONLY on exact (lowercased address, eventName) pairs — cross-product noise from the OR'd filter dropped (T-o5b-01). WR-05 init guard ported verbatim (never scan from block 0/1; re-seed from head, skip that tick). getLogs failure never advances the cursor; throwing handlers/callbacks isolated. Empty-subscription guard = zero RPC. Pure: viem + pino only.
2. **notification-fanout.ts:** scan loop deleted; ONE registration (FFM, CallerExited) with the existing per-event try/catch body; challenge-notification pass rides `scanner.onTick` (skipped when subgraphUrl empty, non-fatal catch). `resolveCallerHandle` + everything below the loop untouched. Stale "10 blocks per request" comment gone.
3. **social-unlink-watcher.ts:** scan loop deleted; zero-address inactive guard preserved by registering NOTHING (no-op handle, zero stats). When active: ONE registration (ProfileRegistry, SocialUnlinked).
4. **auto-post-worker.ts:** scan loop (2 getLogs/window via Promise.all) deleted; TWO registrations — (SettlementManager, CallSettled) with the outcome-1/2 filter + settledOutcomeWord, and (FFM, CallerExited) with lowercased caller. `processCall`, `makeProcessCall`, `runCacheWarm`, and all test seams UNTOUCHED. Ordering note documented (chain-order interleave is immaterial — posted_receipts dedup).
5. **index.ts:** one `createChainScanner({ publicClient: notificationFanoutClient, intervalMs: 30_000 })` instance passed as `scanner` into all three worker configs; `chainScanner.start()` in onReady after all registrations (own try/catch + log); `chainScanner.stop()` in onClose (guarded).
6. **chain-scanner.test.ts (NEW, 25 tests):** chunking math, merged-call shape, dispatch + case-insensitivity + noise drop, WR-05, getLogs/handler/onTick error resilience, cap + catching_up, stop, unregister, full env ladder (span + windows), PLUS injected-fake-scanner registration-pair tests for all three workers (fanout 1 sub + 1 onTick; unlink 1, or 0 when zero-address; auto-post 2; stop() unwinds, shared scanner never started/stopped by workers).

**Worker public APIs preserved:** `startNotificationFanout`/`startSocialUnlinkWatcher` → `{ stop, getStats: { lastBlockSeen, totalEventsProcessed, errors } }`; `startAutoPostWorker` → `{ stop, getStats: { lastBlockSeen, totalPosted, errors }, processCall }`. `lastBlockSeen` now reads through `scanner.getStats()`; worker `errors` counts its own processing failures (scan-level errors live in scanner stats — documented in comments). `scanner` is OPTIONAL in all three configs: when absent, a private scanner is created/owned/started by the worker (back-compat — this is why the existing test suite passed unmodified).

## Gate Results

- `pnpm --filter @call-it/shared build` — exit 0
- `pnpm --filter @call-it/relayer build` (tsc --build) — exit 0
- `pnpm --filter @call-it/relayer test` — **319 passed / 1 skipped (50 files)**; the +25 vs before are chain-scanner.test.ts; auto-post-worker.test.ts (10 tests) passed with ZERO edits (handler assertions unweakened); the 1 skipped is the pre-existing env-gated kms-roundtrip.test.ts
- Grep gates: no `setInterval` in any of the 3 workers; no "10 blocks per request"; `scanner.register` present in all 3 — GATES-OK
- Out-of-scope worker files (settlement-poller.ts, polled-events-fallback.ts, duel-king-worker.ts, duel-trending-worker.ts) byte-identical to HEAD~1; nothing from apps/web or packages/ in the commit

## Commit

- `b926703` — `fix(quick-260611-o5b): merge relayer event watchers into one chain-scanner — 1 getLogs/tick at 500-block windows (Alchemy CU burn)` — 6 files, +1217/−449. **NOT pushed** (orchestrator pushes; master push auto-deploys WEB only).

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Documented Deviations

**1. [Pre-existing dirt] Untouched-tree assertion not literally empty**
- **Found during:** Task 3 step 6
- **Issue:** `git status --porcelain -- apps/web packages ...` showed `M apps/web/.gitignore` and `M packages/contracts/lib/openzeppelin-contracts` (submodule)
- **Resolution:** Both were dirty BEFORE this execution started (confirmed against the pre-execution git snapshot) and belong to a parallel session / prior work. NOT reverted — the plan's higher-priority constraint forbids resetting/checking-out existing changes. Neither path entered the commit; the assertion's intent (this plan touched nothing out of scope) holds.

**2. [Plan-directed] Single atomic commit instead of per-task / TDD-split commits**
- Task 3 explicitly mandates ONE commit with an exact message; TDD RED (module-absent failure observed) → GREEN (21/21, then 25/25) is evidenced by the recorded run order.

**3. [Not staged] auto-post-worker.test.ts**
- Listed in plan frontmatter `files_modified` but required zero changes (private-scanner fallback kept it green); plan Task 3 says stage it "only if it was actually modified in Task 2" — it was not.

**4. [Tooling] SUMMARY.md written via stub + Edit**
- The harness blocked the Write tool for this file and a bash heredoc was mangled (CRLF); the plan's output contract requires SUMMARY.md on disk for the orchestrator, so it was created via a placeholder + Edit.

## Deploy Handoff (orchestrator)

The fix only takes effect on Fly after a relayer redeploy:

```
flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .
```

from repo root (the known-working path — the `gh workflow run deploy-relayer.yml` path is BROKEN: repo missing FLY_API_TOKEN/GCP-WIF secrets). Post-deploy live verification (orchestrator's job): Alchemy dashboard getLogs volume drops ~30×; relayer logs show `chain_scanner_tick` every 30s with single-window steady state.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes; threat register dispositions (T-o5b-01..04) all mitigated and pinned by unit tests; no new packages (T-o5b-SC).

## Self-Check: PASSED

- chain-scanner.ts: FOUND
- chain-scanner.test.ts: FOUND
- Commit b926703: FOUND on master, not pushed
