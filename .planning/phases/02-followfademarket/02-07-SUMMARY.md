---
phase: 02-followfademarket
plan: 07
subsystem: api
tags: [fastify, viem, drizzle, redis, notifications, pino, arbitrum-sepolia]

# Dependency graph
requires:
  - phase: 02-followfademarket
    provides: notifications + quoteStance Drizzle schema (plan 02-05), FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA constant (addresses.ts)
  - phase: 02-followfademarket
    provides: FollowFadeMarket contract ABI compiled (plan 02-01/02)
provides:
  - GET /api/calls/:id/live-state — FFM contract reads (followReserve, fadeReserve, followTotalShares, fadeTotalShares) with 4s Redis cache
  - GET /api/calls/quote-stance?quoteCallId=X — reads quote stance from quoteStance table
  - POST /api/calls/quote-stance — writes following/fading stance to quoteStance table
  - GET /api/notifications?user={address}&cursor={iso} — paginated inbox + unreadCount
  - POST /api/notifications/mark-read — privySessionPreHandler-gated mark-read (WHERE userAddress enforced)
  - CallerExited event fan-out worker (30s poll, subgraph holder resolution, per-user DB insert, Redis statusVersion bump, P1 Telegram alert)
  - FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA + FOLLOW_FADE_MARKET_ARBITRUM_ONE exported from @call-it/shared barrel
affects: [plan-02-08-ui, plan-02-09-og-card, future-phases-notifications]

# Tech tracking
tech-stack:
  added: [viem multicall server-side, parseAbiItem, arbitrumSepolia chain, drizzle inArray/isNull/and operators]
  patterns:
    - live-state.ts: Fastify plugin + Redis 4s TTL cache + viem multicall for batched contract reads
    - notification-fanout.ts: polled-events-fallback.ts worker shape (config interface, handle with stop()+getStats(), setInterval tick loop, no-throw error handling)
    - notifications.ts: cursor-based pagination with ISO timestamp cursor
    - shared barrel export: explicit named re-exports for new FFM address constants

key-files:
  created:
    - apps/relayer/src/routes/live-state.ts
    - apps/relayer/src/routes/quote-stance.ts
    - apps/relayer/src/routes/notifications.ts
    - apps/relayer/src/workers/notification-fanout.ts
  modified:
    - apps/relayer/src/index.ts (route registration + worker startup + viem/shared imports)
    - apps/relayer/src/workers/alerts.ts (caller_exited_broadcast P1 event added)
    - packages/shared/src/index.ts (FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA + FOLLOW_FADE_MARKET_ARBITRUM_ONE added to barrel)

key-decisions:
  - "Used publicClient.multicall (not readContracts) for batched FFM reads — viem 2.50.4 does not expose readContracts on the client instance; multicall is the correct API"
  - "FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA added to @call-it/shared barrel (was in addresses.ts but not exported) — required for import from @call-it/shared"
  - "Notification fan-out uses polling (getLogs) not event subscription — consistent with polled-events-fallback.ts pattern; avoids persistent WS connection"
  - "CallerExitedLog args accessed via type assertion (log as unknown as { args?: ... }) — viem's base Log type lacks args; getLogs with typed event returns them at runtime"

patterns-established:
  - "live-state.ts: 4s Redis cache shorter than 5s frontend poll — ensures cache miss on every 5th client request at worst"
  - "notification-fanout tick: advance lastBlockSeen even on empty getLogs result to avoid rescanning same blocks"
  - "processCallerExitedEvent: log+skip on subgraph failure (T-02-07-03); continue to statusVersion bump on DB insert failure"
  - "notifications route GET: public read by address; POST /mark-read: privySessionPreHandler + WHERE userAddress = normalizedAddress (T-02-07-02)"

requirements-completed: [SOCIAL-23, SOCIAL-24, SOCIAL-25, SOCIAL-43, SOCIAL-44, SOCIAL-45]

# Metrics
duration: 12min
completed: 2026-05-29
---

# Phase 2 Plan 7: Relayer Data Routes and Notification Worker Summary

**Fastify live-state proxy (viem multicall + 4s Redis), CallerExited notification fan-out worker (30s poll, subgraph holder resolution, per-user DB insert, Redis statusVersion bump), quote-stance CRUD, and Privy-gated notifications inbox — completing the relayer backend vertical for Plan 08 UI**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-29T17:29:22Z
- **Completed:** 2026-05-29T17:41:32Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- live-state route: `GET /api/calls/:id/live-state` — batches 4 FFM contract reads via viem `multicall`, caches 4s in Redis, returns `followReserve`, `fadeReserve`, `followTotalShares`, `fadeTotalShares`, `followPct`; Pino `{ event: 'live_state_*' }` structured logging; no inline FFM address
- notification-fanout worker: 30s polling loop, viem `getLogs` for `CallerExited`, subgraph holder resolution paginated at 100/batch (T-02-07-03), per-user `notifications` table batch inserts, Redis `status_version:{callId}` INCR (D-09), P1 `caller_exited_broadcast` Telegram alert; all errors caught with no-throw to keep interval running
- quote-stance route: `GET /api/calls/quote-stance?quoteCallId=X` (reads DB) + `POST /api/calls/quote-stance` (validates stance, inserts row, 201 response)
- notifications route: `GET /api/notifications` (cursor pagination, unreadCount) + `POST /api/notifications/mark-read` (privySessionPreHandler auth, WHERE userAddress enforced — T-02-07-02)
- `@call-it/shared` barrel: added `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` + `FOLLOW_FADE_MARKET_ARBITRUM_ONE` explicit named exports

## Task Commits

Each task was committed atomically:

1. **Task 1: live-state route + quote-stance route** - `397ae94` (feat)
2. **Task 2: notification-fanout worker + notification API routes** - `73ebf74` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/relayer/src/routes/live-state.ts` — GET /api/calls/:id/live-state; viem multicall; 4s Redis cache; Pino structured logs
- `apps/relayer/src/routes/quote-stance.ts` — GET + POST /api/calls/quote-stance; Drizzle quoteStance table
- `apps/relayer/src/routes/notifications.ts` — GET /api/notifications (cursor pagination + unreadCount) + POST /api/notifications/mark-read (privySessionPreHandler)
- `apps/relayer/src/workers/notification-fanout.ts` — CallerExited getLogs worker; subgraph holder resolution; notifications DB insert; Redis statusVersion bump; sendAlert
- `apps/relayer/src/index.ts` — imports + registers 3 new routes + starts notificationFanout in onReady hook
- `apps/relayer/src/workers/alerts.ts` — adds `caller_exited_broadcast` to AlertEvent union (P1)
- `packages/shared/src/index.ts` — adds `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` + `FOLLOW_FADE_MARKET_ARBITRUM_ONE` to barrel exports

## Decisions Made

1. Used `publicClient.multicall` (not `readContracts`) for batched FFM reads — viem 2.50.4 exposes `multicall` on the public client, not `readContracts`. This matches wagmi's `useReadContracts` which uses multicall3 under the hood.
2. Added `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` to `@call-it/shared` barrel — the constant existed in `addresses.ts` but wasn't re-exported from the barrel index; this is required for `import { FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA } from '@call-it/shared'` to work in the relayer.
3. CallerExited log args accessed via type assertion — viem's base `Log` type doesn't expose `args`; `getLogs` with a typed event returns args at runtime but the TypeScript type needs an explicit cast.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA to @call-it/shared barrel**
- **Found during:** Task 1 (live-state.ts implementation)
- **Issue:** `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` was defined in `packages/shared/src/constants/addresses.ts` but not included in the barrel export at `packages/shared/src/index.ts`. The relayer's ESM resolver requires explicit named exports in the barrel (documented in the barrel file header).
- **Fix:** Added `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` and `FOLLOW_FADE_MARKET_ARBITRUM_ONE` to the explicit named export list in `packages/shared/src/index.ts`
- **Files modified:** `packages/shared/src/index.ts`
- **Verification:** TypeScript build resolves the import without TS2305 error
- **Committed in:** `397ae94` (Task 1 commit)

**2. [Rule 1 - Bug] Used publicClient.multicall instead of readContracts**
- **Found during:** Task 1 (live-state.ts — TypeScript compilation)
- **Issue:** Plan specified "viem readContracts" but `publicClient.readContracts` does not exist in viem 2.50.4; `readContracts` is not a method on `PublicClient`. The correct batch read API is `publicClient.multicall`.
- **Fix:** Changed `publicClient.readContracts(...)` to `publicClient.multicall({ contracts: [...], allowFailure: true })`
- **Files modified:** `apps/relayer/src/routes/live-state.ts`
- **Verification:** TypeScript build passes; `multicall` is semantically equivalent
- **Committed in:** `397ae94` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical / barrel export, 1 bug / API name)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep. Plan intent preserved exactly.

## Issues Encountered

**Pre-existing TypeScript errors in relayer (out of scope):**
3 TypeScript errors existed before this plan in `apps/relayer/src/routes/withdraw-authorize.ts` (lines 43 + 111) and `apps/relayer/src/workers/paymaster-confirmer.ts` (line 152). Confirmed pre-existing via `git stash` test. Not in files touched by this plan. Per deviation scope boundary rule, these are not fixed here — logged in deferred-items.

## Known Stubs

None — all routes and workers have real implementations wired to live dependencies (viem RPC, Drizzle DB, Redis).

## Threat Flags

None — all new network endpoints and auth paths were already documented in the plan's threat model (T-02-07-01 through T-02-07-05). No unplanned threat surface introduced.

## Next Phase Readiness

- Plan 02-08 (UI / Live Receipt page) can now use:
  - `GET /api/calls/:id/live-state` for server-side FFM state proxy
  - `GET + POST /api/calls/quote-stance` for FADING/FOLLOWING annotation
  - `GET /api/notifications + POST /mark-read` for the notification inbox
- Notification fan-out worker is registered and will activate once FFM contract is deployed and the subgraph URL is set in env
- `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` is now importable from `@call-it/shared` in any relayer or web consumer

---
*Phase: 02-followfademarket*
*Completed: 2026-05-29*

## Self-Check: PASSED

- [x] `apps/relayer/src/routes/live-state.ts` exists on disk
- [x] `apps/relayer/src/routes/quote-stance.ts` exists on disk
- [x] `apps/relayer/src/routes/notifications.ts` exists on disk
- [x] `apps/relayer/src/workers/notification-fanout.ts` exists on disk
- [x] Commits `397ae94` and `73ebf74` exist in git log
- [x] `grep "liveStateRoute\|quoteStanceRoute\|notificationsRoute" apps/relayer/src/index.ts` — all 3 registered
- [x] `grep "startNotificationFanout" apps/relayer/src/workers/notification-fanout.ts` — function exported
- [x] `grep "status_version:" apps/relayer/src/workers/notification-fanout.ts` — statusVersion Redis key bump present
- [x] `grep "caller_exited_broadcast" apps/relayer/src/workers/notification-fanout.ts` — alert fired
- [x] `grep "FOLLOW_FADE_MARKET" apps/relayer/src/routes/live-state.ts` — uses constant from @call-it/shared
- [x] Pre-existing build errors confirmed out-of-scope (in withdraw-authorize.ts + paymaster-confirmer.ts, not touched by this plan)
