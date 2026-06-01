---
phase: 03-challengeescrow
plan: 04
subsystem: db+subgraph
tags: [drizzle, drizzle-migration, subgraph, assemblyscript, challengeescrow, trending]

requires:
  - phase: 03-challengeescrow
    provides: ChallengeEscrow.sol compiled artifact with ABI (plan 03-02)
  - phase: 03-challengeescrow
    provides: DeployPhase3.s.sol + placeholder addresses.ts (plan 03-03)
  - phase: 02-followfademarket
    provides: follow-fade-market.ts AssemblyScript handler pattern + schema.graphql base

provides:
  - trending_duels + duel_kings Drizzle table definitions in schema.ts
  - Drizzle migration 0003_unusual_nekra.sql (NOT applied — deferred operator action)
  - Real AssemblyScript handlers for all 7 ChallengeEscrow events in challenge-escrow.ts
  - Updated schema.graphql Challenge/ChallengePayout/UnclaimedOverage entities
  - ChallengeEscrow.json ABI (64 entries from forge build artifact)
  - subgraph.yaml ChallengeEscrow data source with eventHandlers (blockHandlers removed)

affects: [plan-03-05, plan-03-06, plan-04-settlement]

tech-stack:
  added: []
  patterns:
    - "Drizzle uniqueIndex dedup pattern: ON CONFLICT DO UPDATE for trending_duels re-pin"
    - "Drizzle weekly anchor pattern: duel_kings uniqueIndex on weekAnchor for one-row-per-week"
    - "AssemblyScript no-null pattern: BigInt.fromI32(0), new Bytes(0) for zero defaults"
    - "Subgraph immutable vs mutable: Challenge+UnclaimedOverage @entity(immutable: false); ChallengePayout @entity(immutable: true)"
    - "Subgraph TvlSnapshot on accept: records callerStake deposit entering escrow"
    - "Pitfall E enforced: blockHandlers removed from ChallengeEscrow yaml section"

key-files:
  created:
    - apps/relayer/src/db/migrations/0003_unusual_nekra.sql
    - apps/relayer/src/db/migrations/meta/0003_snapshot.json
  modified:
    - apps/relayer/src/db/schema.ts
    - packages/subgraph/src/challenge-escrow.ts
    - packages/subgraph/schema.graphql
    - packages/subgraph/subgraph.yaml
    - packages/subgraph/abis/ChallengeEscrow.json

key-decisions:
  - "Challenge.call stored as String! (callId string) not Call! relation — mirrors Position.callId pattern in FFM; avoids needing CallRegistry data in the ChallengeEscrow mapping context"
  - "ChallengePayout entity fields: challengeId/winner/payout/protocolFee/timestamp — not a Challenge relation; avoids cross-data-source entity load complexity in AssemblyScript"
  - "TvlSnapshot created on ChallengeAccepted (not Proposed) — the USDC enters escrow only when accepted; follows the PoolInitialized pattern in follow-fade-market.ts"
  - "UnclaimedOverage id = challengeId.toString() — one overage per challenge (D-03); Phase 4 will add handleOverageClaimedEvent to flip claimed=true"
  - "ChallengeEscrow.json ABI: 64 entries copied directly from forge build artifact; prebuild copy-abis.cjs auto-refreshes on subsequent builds"

metrics:
  duration: 20min
  completed: 2026-06-01T12:55:54Z
  tasks_completed: 2
  tasks_deferred: 2
  files_modified: 7
---

# Phase 3 Plan 4: Drizzle Schema Extension + Subgraph Real Handlers Summary

**Drizzle trending_duels/duel_kings tables + migration 0003 generated; Phase 0 challenge-escrow.ts blockHandler stub replaced with 7 real AssemblyScript event handlers; graph build passes cleanly; 2 operator infra actions deferred.**

## Performance

- **Duration:** 20 min
- **Completed:** 2026-06-01T12:55:54Z
- **Tasks completed (code):** 2 of 4
- **Tasks deferred (operator):** 2 of 4 (Task 2: DB migration apply; Task 3 deploy step: graph deploy:sepolia)

## Accomplishments

### Task 1 — Drizzle Schema + Migration Generation

- Added `trendingDuels` table to `apps/relayer/src/db/schema.ts`:
  - Fields: `id`, `challengeId` (integer, unique index for ON CONFLICT DO UPDATE), `trendingUntil` (timestamp, index for expiry scan), `potUsdc` (varchar 30), `backerCount`, `createdAt`, `updatedAt`
  - Two indexes: `trendingDuelsChallengeIdx` (unique — dedup), `trendingDuelsTrendingUntilIdx` (expiry scan)
- Added `duelKings` table:
  - Fields: `id`, `winnerAddress` (varchar 42), `winStreak`, `highestPotUsdc` (varchar 30), `lastWinAt` (nullable), `weekAnchor` (timestamp, unique for one-row-per-week), `createdAt`
  - One index: `duelKingsWeekIdx` (unique on `weekAnchor`)
- Generated `0003_unusual_nekra.sql` via `pnpm --filter @call-it/relayer run db:generate` — contains both CREATE TABLE statements + 3 indexes
- schema.ts typechecks cleanly (`tsc --noEmit --skipLibCheck src/db/schema.ts` → 0 errors)

### Task 3 — ChallengeEscrow Subgraph Real Handlers

- Populated `packages/subgraph/abis/ChallengeEscrow.json` from `packages/contracts/out/ChallengeEscrow.sol/ChallengeEscrow.json` (64 ABI entries including 13 events); prebuild `copy-abis.cjs` auto-refreshes this file
- Replaced `packages/subgraph/src/challenge-escrow.ts` Phase 0 stub entirely:
  - `handleBlock` export removed (Pitfall E)
  - `ensureChallenge()` lazy-init helper with AssemblyScript zero defaults
  - 7 exported handlers: `handleChallengeProposed`, `handleChallengeAccepted`, `handleChallengeRejected`, `handleChallengeRefunded`, `handleChallengeSettled`, `handlePayoutClaimed`, `handleUnclaimedOverageCreated`
  - TvlSnapshot created on `handleChallengeAccepted` (tracks callerStake entering escrow)
- Updated `packages/subgraph/schema.graphql`:
  - `Challenge` entity: added `caller: Bytes!`, `challengerStake: BigInt!`, `callerStake: BigInt!`, `overageClaimed: Boolean!`; changed `call` from `Call!` relation to `String!`; removed from `Call.challenges @derivedFrom`
  - `ChallengePayout` entity: rewrote to `challengeId/winner/payout/protocolFee/timestamp` (immutable event record, no entity relation)
  - `UnclaimedOverage` entity: rewrote to `challengeId/beneficiary/amount/claimed/timestamp`
- Updated `packages/subgraph/subgraph.yaml` ChallengeEscrow data source:
  - Removed `blockHandlers` section (Pitfall E — ChallengeEscrow section only)
  - Added 7 `eventHandlers` with exact Solidity event signatures
  - Address: placeholder `0x0...0` with TODO comment; startBlock: `1` with TODO comment (both updated after Phase 3 deploy)
- `graph codegen` succeeds (all 5 data sources); `graph build` succeeds (5 WASM files compiled)

## Task Commits

1. **Task 1: Drizzle schema + 0003 migration** — `46d491f` (feat)
2. **Task 3: Subgraph handlers + schema + ABI + yaml** — `afb4a63` (feat)

## Deferred Operator Actions

| Action | Type | Status | Prerequisite |
|--------|------|--------|--------------|
| Task 2: Apply 0003_unusual_nekra.sql migration to Fly Postgres | Operator | Deferred — already in STATE.md "Deferred Live Infra (Phase 3)" item 3 | `fly proxy 5433:5432 -a call-it-pg-sepolia` then `pnpm --filter @call-it/relayer run db:migrate` |
| Task 3 deploy: `graph auth + graph deploy:sepolia` | Operator | Deferred — same STATE.md item 3 | SUBGRAPH_STUDIO_DEPLOY_KEY + real address/startBlock from Phase 3 contract deploy (STATE.md item 1-2) |

Both deferred actions were already tracked in STATE.md "Deferred Live Infra (Phase 3) — item 3" before this plan ran. This plan added the code artifacts; the operator actions remain blocked on Phase 3 contract deploy completing first.

## Deviations from Plan

### Schema Entity Reconciliation (Rule 1 — Bug Fix)

**Issue found:** `schema.graphql` already had `Challenge`, `ChallengePayout`, `UnclaimedOverage` entities from Phase 0 scaffold, but with wrong field shapes for the real handlers:
- `Challenge.call` was typed `Call!` (relation) — but handlers assign a string callId; changed to `String!`
- `Challenge` was missing `caller`, `callerStake`, `challengerStake`, `overageClaimed` fields present in the event data
- `ChallengePayout` used `challenge: Challenge!` relation and `amount`/`paidAt` — but Phase 0 scaffold is incompatible with the immutable event-record pattern; replaced with `challengeId/payout/protocolFee/timestamp`
- `UnclaimedOverage` used `challenge: Challenge!` relation — replaced with `challengeId/timestamp`
- `Call.challenges @derivedFrom(field: "call")` removed (call field no longer a relation)

**Fix:** Reconciled all 3 entities to match handler code; `graph codegen` + `graph build` validate the alignment.
**Files modified:** `packages/subgraph/schema.graphql`
**Committed in:** `afb4a63`

### Pre-existing Relayer Build Errors (Out of Scope)

The relayer `tsc --build` has pre-existing errors in `src/routes/withdraw-authorize.ts` and `src/workers/paymaster-confirmer.ts` — both unrelated to schema.ts. Confirmed via `tsc --noEmit --skipLibCheck src/db/schema.ts` which exits 0. Logged to deferred-items.md is not necessary as these are pre-existing and out of scope for this plan.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `address: "0x0000000000000000000000000000000000000000"` | `packages/subgraph/subgraph.yaml` | ChallengeEscrow source | Placeholder until Phase 3 contract deploy (STATE.md Deferred Live Infra item 1-2) |
| `startBlock: 1` | `packages/subgraph/subgraph.yaml` | ChallengeEscrow source | Placeholder; real deploy block feeds into this after operator runs DeployPhase3.s.sol |

Both stubs are intentional and documented with TODO comments. The subgraph builds and compiles cleanly with them; they are replaced as part of the Phase 3 live infra close-out.

## Threat Surface Scan

No new network endpoints or auth paths introduced. All changes are code artifacts (Drizzle schema, SQL migration file, AssemblyScript handlers). The threat flags from the plan's threat model were addressed:

| T-ID | Status |
|------|--------|
| T-3-04-01 Wrong ChallengeEscrow address | Mitigated — address is explicitly placeholder `0x0...0` with TODO comment; correct address inserted after STATE.md item 1 closes |
| T-3-04-02 Phase 0 blockHandlers conflict | Mitigated — blockHandlers removed from ChallengeEscrow yaml section (Pitfall E); `grep blockHandlers subgraph.yaml` shows only SettlementManager (Phase 4 stub, unrelated) |
| T-3-04-03 AssemblyScript null for BigInt | Mitigated — `ensureChallenge()` uses `BigInt.fromI32(0)` and `new Bytes(0)` for all non-nullable fields; graph build validates AssemblyScript types |
| T-3-04-04 Drizzle migration schema drift | Mitigated (code-side) — `db:generate` produces migration from schema.ts diff; operator applies and verifies tables via psql as specified |
| T-3-04-05 Subgraph deploy key exposure | N/A for this plan — deploy deferred; key never read |

## Self-Check: PASSED

- [x] `apps/relayer/src/db/schema.ts` contains `trendingDuels` and `duelKings`
- [x] `apps/relayer/src/db/migrations/0003_unusual_nekra.sql` exists with both CREATE TABLE statements
- [x] `packages/subgraph/src/challenge-escrow.ts` exports `handleChallengeProposed` (no `handleBlock` export)
- [x] `packages/subgraph/schema.graphql` contains `Challenge @entity`
- [x] `packages/subgraph/subgraph.yaml` ChallengeEscrow section has eventHandlers, no blockHandlers
- [x] `packages/subgraph/abis/ChallengeEscrow.json` is non-empty (64 ABI entries)
- [x] `graph codegen` exits 0
- [x] `graph build` exits 0 (Build completed: build\subgraph.yaml)
- [x] Commits `46d491f` and `afb4a63` exist in git log
