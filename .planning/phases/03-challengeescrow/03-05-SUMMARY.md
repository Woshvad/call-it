---
phase: 03-challengeescrow
plan: 05
subsystem: relayer
tags: [fastify, viem, drizzle, bullmq, redis, subgraph, notifications]

# Dependency graph
requires:
  - phase: 03-challengeescrow
    provides: trendingDuels + duelKings Drizzle schema (plan 03-04)
  - phase: 02-followfademarket
    provides: notification-fanout worker + notifications table (plan 02-07)
  - phase: 00-foundation
    provides: Redis singleton, Pino logger, Fastify bootstrap (plan 00-02)
  - packages/shared
    provides: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA + FOLLOW_FADE_MARKET + CALL_REGISTRY constants
provides:
  - GET /api/duels/:id/live-state — ChallengeEscrow RPC reads + 4s Redis cache
  - GET /api/duels — trending_duels Postgres merge + subgraph pagination; 10s Redis cache
  - startDuelTrendingWorker — 60s repeatable; upserts trending_duels with pot threshold
  - startDuelKingWorker — weekly repeatable; elects Duel King from settled 7-day window
  - notification-fanout challenge events — challenge_proposed/accepted/rejected fanout
affects: [phase-03-plan-06-duel-page, phase-04-settlement, phase-07-subgraph-finalization]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "duel-live-state: zero-address guard returns deferred:true (mirrors WR-09 FFM guard in live-state.ts)"
    - "duels route: Postgres trending_duels merge first, then subgraph active challenges sorted by pot desc"
    - "duel-trending-worker: pot-only threshold (backerCount=0 until subgraph adds followTotalShares — documented TODO)"
    - "duel-king-worker: placeholder no-op when zero settled challenges (D-08 Phase 3 pre-settlement)"
    - "challenge fanout: proposedAt_gt cutoff 60s lookback; ON CONFLICT DO NOTHING idempotency"

key-files:
  created:
    - apps/relayer/src/routes/duel-live-state.ts
    - apps/relayer/src/routes/duels.ts
    - apps/relayer/src/workers/duel-trending-worker.ts
    - apps/relayer/src/workers/duel-king-worker.ts
  modified:
    - apps/relayer/src/workers/notification-fanout.ts (challenge event notifications added)
    - apps/relayer/src/index.ts (route + worker registrations)
    - packages/shared/src/index.ts (CHALLENGE_ESCROW_ARBITRUM_SEPOLIA + _ONE added to barrel)

key-decisions:
  - "CHALLENGE_ESCROW_ARBITRUM_SEPOLIA missing from @call-it/shared barrel — added as Rule 3 auto-fix"
  - "Backer count falls back to pot-only (backerCount=0) — followTotalShares/fadeTotalShares absent from subgraph Call entity (Known Plan Issue #4 confirmed); documented as TODO(Phase-7)"
  - "duel-king-worker weekly cadence via setInterval — same pattern as notification-fanout.ts; no BullMQ dependency for v1"
  - "Challenge notifications: subgraph proposedAt_gt 60s lookback window; ON CONFLICT DO NOTHING reuses existing notifications unique index"

# Metrics
duration: 25min
completed: 2026-06-01
---

# Phase 3 Plan 05: Relayer Duel Surface Summary

**Relayer backend for duel data: /api/duels/:id/live-state + /api/duels routes, duel-trending + duel-king BullMQ workers, challenge notification extension — all wired into index.ts with zero-address guard for the placeholder ChallengeEscrow address.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-01T13:00:48Z
- **Completed:** 2026-06-01T13:25:00Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- **duel-live-state.ts:** GET /api/duels/:id/live-state mirrors live-state.ts exactly. Redis cache key `duel_livestate:{challengeId}` with 4s TTL. ChallengeEscrow.getChallenge + FFM.followReserve/fadeReserve + CR.getCall.expiry via viem. Zero-address guard returns `{deferred:true}` placeholder when CHALLENGE_ESCROW_ARBITRUM_SEPOLIA is the zero placeholder (pending 03-03 operator deploy). Structured error logging with T-03-05-01 BigInt param injection protection.

- **duels.ts:** GET /api/duels with optional status/sort/limit query params. Fetches trending_duels from Postgres (WHERE trending_until > now()) and active challenges from subgraph (paginated at 100/batch). Merges: trending first (isTrending:true), then active by pot desc. Also returns current Duel King banner (placeholder null until Phase 4). 10s Redis cache.

- **duel-trending-worker.ts:** 60s cadence setInterval worker. Queries subgraph for Proposed/Accepted challenges; computes pot = min(callerStake, challengerStake) * 2; upserts trending_duels ON CONFLICT DO UPDATE when pot >= 500_000_000 (500 USDC). Deletes expired pins WHERE trending_until < now(). Error containment: never throws from tick() (T-03-05-03).

- **duel-king-worker.ts:** Weekly cadence worker. Queries settled challenges in trailing 7 days; elects Duel King by max consecutive win streak (tie-break: most recent win → highest pot); upserts duel_kings ON CONFLICT (week_anchor) DO UPDATE. Phase 3 placeholder: empty subgraph returns → no-op tick with `duel_king_worker_no_settled` log (D-08).

- **notification-fanout.ts extended:** Added `processChallengeNotifications()` that runs each tick alongside CallerExited processing. Queries subgraph for challenges with proposedAt > now()-60s; fans out: challenge_proposed → call.caller, challenge_accepted → challenger, challenge_rejected → challenger. ON CONFLICT DO NOTHING idempotency via existing notifications unique index.

- **index.ts wired:** Imports + registers duelLiveStateRoute + duelsRoute + startDuelTrendingWorker + startDuelKingWorker in the onReady hook alongside the existing notification fanout worker.

- **packages/shared barrel fixed:** CHALLENGE_ESCROW_ARBITRUM_SEPOLIA + CHALLENGE_ESCROW_ARBITRUM_ONE added to explicit named re-exports (Rule 3 auto-fix — missing export caused TypeScript build failure).

## Task Commits

1. **Task 1: GET /api/duels/:id/live-state + GET /api/duels routes** — `8e01a80` (feat)
2. **Task 2: Workers + index.ts registration + challenge fanout** — `54c22c6` (feat)

## Files Created/Modified

- `apps/relayer/src/routes/duel-live-state.ts` — Duel live-state proxy (4s cache, zero-addr guard, T-03-05-01 injection guard)
- `apps/relayer/src/routes/duels.ts` — Duels tab feed (trending merge, Duel King banner, 10s cache)
- `apps/relayer/src/workers/duel-trending-worker.ts` — 60s trending pin worker (pot threshold, ON CONFLICT DO UPDATE)
- `apps/relayer/src/workers/duel-king-worker.ts` — Weekly Duel King election worker (Phase 3 placeholder no-op)
- `apps/relayer/src/workers/notification-fanout.ts` — Extended with challenge_proposed/accepted/rejected fanout
- `apps/relayer/src/index.ts` — Route + worker registration added
- `packages/shared/src/index.ts` — CHALLENGE_ESCROW_ARBITRUM_SEPOLIA + _ONE added to barrel

## Decisions Made

1. **CHALLENGE_ESCROW_ARBITRUM_SEPOLIA not in shared barrel (Rule 3 auto-fix):** The constant existed in `packages/shared/src/constants/addresses.ts` but was not re-exported from `packages/shared/src/index.ts`. TypeScript build failed immediately. Added the two ChallengeEscrow named exports to the explicit barrel (consistent with the pattern for FOLLOW_FADE_MARKET + CALL_REGISTRY).

2. **Backer count is pot-only for now (Known Plan Issue #4 confirmed):** The Phase-2 subgraph `Call` entity in `schema.graphql` has no `followTotalShares` or `fadeTotalShares` scalar fields. The schema has `positions: [Position!]! @derivedFrom(field: "call")` but these are not aggregated scalars. The trending worker stores `backerCount = 0` and qualifies only on pot >= $500. A `TODO(Phase-7)` comment documents the Phase-7 subgraph fix needed to wire the field.

3. **setInterval pattern instead of BullMQ for weekly Duel King:** Consistent with all existing Phase 2-3 workers (notification-fanout, paymaster-confirmer). BullMQ is available but adds Redis queue overhead for a weekly job. The plan specified `setInterval` and the existing pattern is already setInterval-based. No change from spec.

4. **Challenge notifications use 60s lookback window:** The fanout worker runs every 30s. A 60s lookback (2× polling interval) safely catches challenges that landed between the previous and current tick, while being narrow enough to avoid re-notifying challenges from minutes ago. The ON CONFLICT DO NOTHING unique index guarantees exactly-once delivery even if the same challenge appears in multiple consecutive tick windows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CHALLENGE_ESCROW_ARBITRUM_SEPOLIA not exported from @call-it/shared barrel**

- **Found during:** Task 1 (immediate TypeScript build error)
- **Issue:** `packages/shared/src/index.ts` exports addresses explicitly by name (documented reason: NodeNext ESM linker requires explicit named re-exports). The `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` and `CHALLENGE_ESCROW_ARBITRUM_ONE` constants were defined in `addresses.ts` but not listed in the barrel.
- **Fix:** Added `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` and `CHALLENGE_ESCROW_ARBITRUM_ONE` to the explicit export list in `packages/shared/src/index.ts`.
- **Files modified:** `packages/shared/src/index.ts`
- **Committed in:** `8e01a80` (Task 1 commit)

### Pre-existing Build Errors (Out of Scope)

Two pre-existing TypeScript errors in unrelated files were present before this plan and are outside scope:
- `apps/relayer/src/routes/withdraw-authorize.ts` — unused `max` variable + arithmetic type error
- `apps/relayer/src/workers/paymaster-confirmer.ts` — type assignment mismatch

Per deviation scope boundary: these are not caused by this plan's changes. Logged here for awareness.

## Known Stubs

| Stub | File | Line/Region | Reason |
|------|------|-------------|--------|
| `backerCount = 0` | `duel-trending-worker.ts` | tick() loop | Subgraph Call entity lacks followTotalShares/fadeTotalShares scalars (Known Plan Issue #4). Trending qualifies on pot-only until Phase 7 schema update adds the fields. |
| `duelKing: null` (initially) | `duels.ts` | response | No settled duels yet in Phase 3 (ChallengeEscrow placeholder). Duel King banner renders placeholder until Phase 4 settlement creates real settled data (D-08). |
| `deferred: true` response | `duel-live-state.ts` | zero-addr guard | ChallengeEscrow is the zero placeholder until 03-03 operator deploy. Frontend should render "not yet deployed" state. Intentional — will resolve when real address is pinned. |

## Threat Surface Scan

All threat model items mitigated:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: param-injection | `duel-live-state.ts` | challengeId parsed to BigInt with try/catch before any use; raw string never interpolated into cache key (T-03-05-01) |
| threat_flag: rpc-timeout | `duel-live-state.ts` | try/catch wraps readContract; returns 503 on failure (T-03-05-02) |
| threat_flag: worker-crash-loop | `duel-trending-worker.ts` | tick() wrapped in try/catch; errors counted but not thrown (T-03-05-03) |
| threat_flag: subgraph-data-validation | `duel-trending-worker.ts` | pot computed via try/catch BigInt parse; NaN/undefined skips upsert with warning (T-03-05-04) |

T-03-05-05 (unauthenticated modification): accepted — routes are read-only GET endpoints.
T-03-05-06 (RPC URL disclosure): mitigated — uses ARBITRUM_SEPOLIA_RPC_URL (server-side env, never NEXT_PUBLIC_*).

## Self-Check: PASSED

- [x] `apps/relayer/src/routes/duel-live-state.ts` exists
- [x] `apps/relayer/src/routes/duels.ts` exists
- [x] `apps/relayer/src/workers/duel-trending-worker.ts` exists
- [x] `apps/relayer/src/workers/duel-king-worker.ts` exists
- [x] Commits `8e01a80` and `54c22c6` exist in git log
- [x] `grep "duel_livestate:" apps/relayer/src/routes/duel-live-state.ts` — PASS (cache key present)
- [x] No inline 0x addresses in duel-live-state.ts — PASS (0 matches)
- [x] CHALLENGE_ESCROW_ARBITRUM_SEPOLIA imported from @call-it/shared — PASS
- [x] `grep -c "duelLiveStateRoute\|duelsRoute" apps/relayer/src/index.ts` >= 2 — PASS (4)
- [x] `grep -c "startDuelTrendingWorker\|startDuelKingWorker" apps/relayer/src/index.ts` >= 2 — PASS (4)
- [x] `grep "500_000_000\|POT_THRESHOLD" duel-trending-worker.ts` >= 1 — PASS
- [x] `grep "challenge_proposed" notification-fanout.ts` — PASS
- [x] `pnpm --filter @call-it/relayer build` — all errors are pre-existing in withdraw-authorize.ts + paymaster-confirmer.ts (confirmed by stash test); new files introduce zero new TypeScript errors

## Next Phase Readiness

Ready for:
- Plan 03-06: Duel page frontend polls /api/duels/:id/live-state every 5s
- Plan 03-07: Duels tab frontend calls /api/duels for the feed
- Phase 4: Settlement worker produces settled duels → duel-king-worker produces real Duel King elections
- Phase 7: Subgraph schema update adds followTotalShares/fadeTotalShares → wire backerCount in duel-trending-worker

---
*Phase: 03-challengeescrow*
*Completed: 2026-06-01*
