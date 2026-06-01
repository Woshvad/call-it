---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 05
subsystem: indexer
tags: [the-graph, assemblyscript, subgraph, settlement, dispute, rep-delta, settlement-manager]

# Dependency graph
requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: SettlementManager deployed at 0xAc37a0e4A3e575EF21684c28a5b820dB44654595 (plan 04-03)
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: subgraph.yaml SettlementManager + FFM v2 datasource wiring (plan 04-03)
provides:
  - Real AssemblyScript handlers for all 7 SettlementManager events (replaces Phase-0 stub)
  - Call.status='Settled' indexed from CallSettled + CallForceSettled events
  - Call.status='Disputed' indexed exclusively from DisputeRaised event (T-04-05-04 single-source)
  - RepEvent entities capturing caller wins/losses/delta after each settlement
  - RepCalculatedFallback entities for Stylus fallback tracking (T-04-05-03)
  - Settlement, Dispute, DisputeResolution, ForceSettlement, SettlementDelayed entities
  - Profile.wins / Profile.losses / Profile.settledCalls updated on RepCalculated
affects: [04-07-settled-receipt-ui, 04-08-dispute-ui, phase-07-og-finalization]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AS handler pattern: ensureX(id) lazy-init helper with BigInt.fromI32(0) zero-defaults"
    - "Single-source dispute status: DisputeRaised event → handleDisputeRaised → Call.status='Disputed'"
    - "RepEvent reason field encodes conviction+consensus+winner as structured string for queryability"
    - "int256/int32 schema bridging: event.params.delta.toI32() for RepEvent.delta (Int! field)"

key-files:
  created: []
  modified:
    - packages/subgraph/src/settlement-manager.ts

key-decisions:
  - "Call.status='Disputed' is set ONLY in handleDisputeRaised — not in CallRegistry (no markDisputed function exists) — single authoritative path enforced (T-04-05-04)"
  - "RepEvent.delta uses toI32() bridge: schema Int! field vs ABI int256 — lossy but within rep scale bounds"
  - "RepEvent.reason encodes conviction/consensusPct/isWinner as structured string since schema has no separate fields for these"
  - "handleRepCalculatedFallback creates both a RepCalculatedFallbackEntity AND a fallback RepEvent (fallback=true) for frontend 'Stylus fallback fired' indicator"

patterns-established:
  - "Lazy-init entity helper: load → if null create with zero-defaults → return as Entity (no closures)"
  - "Immutable append-only records use txHash+logIndex as ID for uniqueness"

requirements-completed: [SETTLE-02, SETTLE-09, SETTLE-31, SETTLE-32, SETTLE-33, SETTLE-37, SETTLE-38, REP-25, REP-26, REP-27]

# Metrics
duration: 2min
completed: 2026-06-01
---

# Phase 4 Plan 05: SettlementManager Subgraph Real Handlers Summary

**Real AssemblyScript handlers for all 7 SettlementManager events — CallSettled/DisputeRaised/DisputeResolved/CallForceSettled/SettlementDelayed/RepCalculated/RepCalculatedFallback — replacing Phase-0 stub; graph codegen + build pass; stopped at Studio redeploy checkpoint**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-01T22:20:25Z
- **Completed:** 2026-06-01T22:22:42Z
- **Tasks:** 1 of 2 (stopped at checkpoint)
- **Files modified:** 1

## Accomplishments

- Replaced Phase-0 `handleBlock` no-op stub with 7 real event handlers covering all SettlementManager events
- `handleDisputeRaised` is the sole source of `Call.status='Disputed'` — enforcing the T-04-05-04 single-source invariant; CallRegistry has no `markDisputed` function
- `handleCallSettled` and `handleCallForceSettled` both set `Call.status='Settled'` idempotently (T-04-05-01)
- `handleRepCalculated` creates `RepEvent` + updates `Profile.wins`/`Profile.losses`/`Profile.settledCalls`/`Profile.globalRep`
- `handleRepCalculatedFallback` creates `RepCalculatedFallbackEntity` + a `fallback=true` `RepEvent` for frontend Stylus-fallback indicator (T-04-05-03)
- `graph codegen` and `graph build` pass cleanly: `SettlementManager.wasm` compiled successfully
- All AssemblyScript constraints applied: no closures, `BigInt.fromI32(0)` zero-init, `toI32()` for `Int!` schema fields, `new Bytes(0)` for bytes zero-init

## Task Commits

1. **Task 1: settlement-manager.ts real handlers** - `3f709f2` (feat)

**Plan metadata (docs):** see final docs commit after checkpoint

## Files Created/Modified

- `packages/subgraph/src/settlement-manager.ts` — Full Phase-4 real handlers; 7 exported handler functions; 3 lazy-init helpers (ensureSettlement, ensureDispute, ensureProfile); all AS constraints applied

## Decisions Made

1. **RepEvent.delta uses `.toI32()`** — Schema field is `Int!` (i32) but ABI has `int256`. Rep values stay within i32 range by design (max rep ~10,000). Documented in key-decisions.
2. **RepEvent.reason encodes structured string** — Schema lacks separate conviction/consensusPct/isWinner fields. Encoded as `"conviction:N,consensus:N,winner:true/false"` for queryability without schema change.
3. **handleRepCalculatedFallback creates dual records** — Both a `RepCalculatedFallbackEntity` (for the specific fallback audit trail) and a `RepEvent` with `fallback=true` (so frontend "Stylus fallback fired" indicator can query repEvents with fallback=true).
4. **subgraph.yaml already has real addresses** — Plan 04-03 already wired SM address `0xAc37a0e4A3e575EF21684c28a5b820dB44654595` and FFM v2 address `0x185e43526c0acd88AC236197e3Ee7629ebd601CA`. No address updates required in this plan.

## Deviations from Plan

None - plan executed exactly as written.

The subgraph.yaml address update mentioned in the task action was already done in Plan 04-03. No deviation — the addresses were already correct.

## Issues Encountered

None.

## Threat Surface Scan

No new network endpoints or trust boundaries introduced. This plan only modifies AssemblyScript subgraph mapping handlers (passive event indexing). All threat items from the plan's threat model are addressed:

- T-04-05-01: Both `handleCallSettled` and `handleCallForceSettled` update `Call.outcome` — stale outcome prevention confirmed
- T-04-05-02: `export function handleBlock` removed — grep confirmed zero matches for block handler export
- T-04-05-03: `handleRepCalculatedFallback` creates queryable entity + RepEvent with `fallback=true`
- T-04-05-04: `call.status='Disputed'` appears exactly once (in `handleDisputeRaised`) — grep-verified single source

## User Setup Required

**graph deploy checkpoint** — awaiting operator Studio deploy:

```
cd packages/subgraph && graph deploy --studio call-it-sepolia
```

Version to deploy: v0.4.0 (next after current v0.3.0 in Studio)
Subgraph slug: `call-it-sepolia`
Expected endpoint: `https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.4.0`

After deploy, update `NEXT_PUBLIC_SUBGRAPH_URL` in `.env` if the endpoint version changes.

## Next Phase Readiness

After Studio deploy:
- Subgraph indexes `CallSettled`, `DisputeRaised`, `RepCalculated` events in real-time
- Plan 04-07 (Settled Receipt UI) can query `settlements { callId outcome priceDelta settledAt }`
- Plan 04-08 (Dispute UI) can query `disputes { callId disputer evidenceHash status raisedAt }`
- `repEvents` queryable for caller rep history

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-01*
