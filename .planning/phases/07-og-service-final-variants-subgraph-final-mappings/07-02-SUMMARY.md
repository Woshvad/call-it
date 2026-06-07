---
phase: 07-og-service-final-variants-subgraph-final-mappings
plan: 02
subsystem: relayer + subgraph
tags: [drizzle, postgres, migration, live-state, subgraph, graph-ts, statement, d-05, d-03, ops-04]

# Dependency graph
requires:
  - phase: 07-01
    provides: RED scaffold packages/subgraph/tests/call-statement.test.ts (turned GREEN here)
  - phase: 05.1-relayer
    provides: call_oracle_criteria off-chain string-bridge pattern (call_statement mirrors it)
provides:
  - relayer call_statement table + migration 0006 (callId PK, statement, createdAt)
  - insertCallStatement (idempotent, length-capped V5) + resolveCallStatement (null=absent) helpers
  - live-state marketLine served from the relayer statement store (IN-03 closure, D-05)
  - subgraph Call.statement nullable field + templated default mapping (D-03/D-05 safe fallback)
affects: [07-03-og-real-data-wiring]

# Tech tracking
tech-stack:
  added: []  # zero new packages — drizzle-orm/drizzle-kit + graph-cli already pinned
  patterns:
    - "Off-chain authoritative-prose store mirroring call_oracle_criteria (distinct table, PK-only lookup)"
    - "Fail-safe non-fatal persist in handleCallCreated (own try/log/continue block — DB outage never blocks call creation)"
    - "live-state marketLine omitted (undefined) on null resolve so the OG falls back to the subgraph templated mirror"
    - "Flat AssemblyScript template helper (marketTypeLabel if/else + string concat, no closures/no null-on-value-type)"

key-files:
  created:
    - apps/relayer/src/db/migrations/0006_mean_lady_deathstrike.sql
  modified:
    - apps/relayer/src/db/schema.ts
    - apps/relayer/src/db/criteria-store.ts
    - apps/relayer/src/workers/calls-preflight.ts
    - apps/relayer/src/routes/live-state.ts
    - apps/relayer/src/workers/__tests__/criteria-store.test.ts
    - packages/subgraph/schema.graphql
    - packages/subgraph/src/call-registry.ts
    - packages/subgraph/tests/call-statement.test.ts

key-decisions:
  - "Statement persist wired into the worker handleCallCreated (the documented criteria-store writer), NOT a POST /api/calls/criteria route — that route does not exist in the codebase (the worker is never yet called by a route). The plan's literal route reference was inaccurate; the worker is the real seam."
  - "Templated subgraph default built from marketType + callId only — the CallCreated event carries NO asset string and NO targetValue, so the plan's 'marketType+asset+targetValue' template is not buildable in-mapping. Used the data actually on the event; deterministic and never empty."
  - "call_statement is a DISTINCT table from reasoning (D-05 discretion): reasoning = caller's argument, statement = the market line."
  - "Migration applied to the LOCAL dev DB (callit-postgres :5434, call_it_relayer_sepolia) and column existence verified. Remote/Sepolia authoritative apply remains operator-gated in Plan 07-06."

requirements-completed: [OPS-04]

# Metrics
duration: ~25min
completed: 2026-06-07
---

# Phase 7 Plan 02: Statement Vertical Slice (relayer marketLine + subgraph templated mirror) Summary

**The human-readable market statement is now stored by the relayer (authoritative prose, D-05) and served via `/api/calls/:id/live-state` `marketLine`, mirrored as an in-mapping templated fallback on the subgraph `Call.statement` field (D-03) so the OG route + receipt never crash before enrichment runs.**

## Migration apply status

**APPLIED to the LOCAL dev DB and verified.** `pnpm --filter @call-it/relayer db:migrate` was run against `callit-postgres` on `127.0.0.1:5434` (DB `call_it_relayer_sepolia`, the project's local dev relayer Postgres per project notes). The `call_statement` table now exists there with `call_id` (integer PK), `statement` (text NOT NULL), `created_at` (timestamp DEFAULT now()) — confirmed via `\d call_statement`. The remote/Sepolia relayer DB authoritative apply is intentionally NOT performed here — it remains operator-gated in Plan 07-06.

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-06-07
- **Tasks:** 2 (both `tdd="true"`)
- **Files modified:** 9 (1 created migration, 8 modified)

## Accomplishments

- **Relayer (Task 1, D-05):** Added `call_statement` pgTable mirroring `callOracleCriteria`; `insertCallStatement` (idempotent `onConflictDoNothing`, length-capped at `STATEMENT_MAX_LEN=280` per V5, empty/whitespace skipped) + `resolveCallStatement` (single-key, null on absent) in `criteria-store.ts`; wired `handleCallCreated` to persist the statement in its own fail-safe non-fatal try/log/continue block (applies to ALL oracle types, runs before the criteria-store guard); wired `live-state.ts` `marketLine` from `resolveCallStatement(Number(callId))` with its own fail-safe (a statement-store outage never 502s the on-chain live-state read), omitting marketLine on null so the client/OG falls back to the subgraph mirror (D-03). Generated migration `0006_mean_lady_deathstrike.sql` and applied+verified it on the local dev DB.
- **Subgraph (Task 2, D-03/D-05, OPS-04):** Added nullable `Call.statement` field (distinct from `reasoning`); added flat AssemblyScript `marketTypeLabel` + `templateStatement` helpers (if/else + string concat — no closures, no null-on-value-type); set the deterministic templated default in `handleCallCreated` (and the `handleCallQuoted` forward-compat stub); turned the Plan 07-01 RED scaffold `call-statement.test.ts` GREEN (4 source assertions). codegen regenerated `generated/` with the new field and all 5 data sources compiled — existing ~20 handlers intact (OPS-04 unbroken). Studio v0.9.0 deploy deferred to operator-gated Plan 07-06 (D-01).

## Task Commits

1. **Task 1: relayer call_statement column + persist + live-state marketLine (D-05)** — `b2a66e9` (feat)
2. **Task 2: subgraph Call.statement templated mirror + v0.9.0 build (D-03/D-05, OPS-04)** — `52de21c` (feat)

## Verification Results

- **relayer:** `db:generate` produced migration `0006_mean_lady_deathstrike.sql`; `pnpm --filter @call-it/relayer build` exits 0; criteria-store vitest **10/10 green** (5 original + 5 new: statement insert / length-cap / empty-skip / resolve-found / resolve-null).
- **relayer DB:** `db:migrate` applied to local dev DB; `call_statement` table + columns verified via `psql \d call_statement`.
- **subgraph:** `pnpm --filter @call-it/subgraph build` exits 0 (codegen + all 5 wasm data sources compile); `pnpm --filter @call-it/subgraph test` **7/7 green** (4 call-statement now GREEN + 3 schema intact).

## Decisions Made

1. **Persist wired into the worker, not a `/api/calls/criteria` route.** The plan said to extend a `POST /api/calls/criteria` route in `routes/calls-preflight.ts`, but (a) `routes/calls-preflight.ts` is the `/api/calls/preflight` gate route, not a criteria route, and (b) no `routes/calls-criteria.ts` exists — the criteria endpoint was never built; `workers/calls-preflight.ts handleCallCreated` is the documented writer with no route caller yet. The statement persist was therefore wired into `handleCallCreated` (the real seam), with an optional `statement` param on `CallCreatedParams`. (Deviation Rule 3.)
2. **Subgraph template uses marketType + callId, not marketType+asset+targetValue.** The `CallCreated` event ABI carries only `id, caller, marketType, stake`. `asset` is `''` and `targetValue` is absent in-mapping (relayer enriches both later). The deterministic flat template (`marketTypeLabel + ' call #' + callId`) is built from the data actually present. (Deviation Rule 1/3.)
3. **`STATEMENT_MAX_LEN=280`** as the storage backstop (V5) — generously above the OG render truncation (~77/87 chars) so a full prose line survives intact while pathological input is clipped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Statement persist wired into the worker `handleCallCreated` instead of a non-existent `POST /api/calls/criteria` route**
- **Found during:** Task 1 (locating the criteria route the plan referenced)
- **Issue:** `routes/calls-preflight.ts` is the preflight gate, not the criteria writer; `routes/calls-criteria.ts` does not exist. The documented writer is `workers/calls-preflight.ts handleCallCreated`, which is not yet called by any route.
- **Fix:** Added an optional `statement` field to `CallCreatedParams` and a fail-safe non-fatal persist block in `handleCallCreated`. When a criteria/create route is eventually built it passes `statement` through.
- **Files modified:** `apps/relayer/src/workers/calls-preflight.ts`
- **Commit:** `b2a66e9`

**2. [Rule 1 - Bug] Subgraph templated default uses (marketType, callId), not (marketType, asset, targetValue)**
- **Found during:** Task 2 (reading the CallCreated ABI in the mapping)
- **Issue:** The event carries no asset string and no targetValue; the plan's template inputs are not available in-mapping (AssemblyScript cannot read the relayer DB).
- **Fix:** `templateStatement(marketType, callId)` — deterministic, never empty, built from on-event data. The relayer marketLine remains the authoritative prose (D-05).
- **Files modified:** `packages/subgraph/src/call-registry.ts`
- **Commit:** `52de21c`

**3. [Rule 3 - Blocking] tsc strict-typing fix in the new test for the vi.fn mock-call argument**
- **Found during:** Task 1 (relayer build)
- **Issue:** `mockValues` is inferred as a zero-arg `vi.fn`, so `.mock.calls[0]![0]` failed tsc (`Tuple type '[]' has no element at index '0'`).
- **Fix:** Cast `mockValues.mock.calls` through `unknown` to `Array<[{ statement: string }]>` before indexing.
- **Files modified:** `apps/relayer/src/workers/__tests__/criteria-store.test.ts`
- **Commit:** `b2a66e9`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug). **Impact:** Necessary for correctness — #1 and #2 reconcile the plan with the actual codebase shape and ABI; #3 is a test-typing cleanup. No scope creep; the D-05/D-03/OPS-04 intent is fully delivered.

## Authentication Gates

None — no auth gates encountered. The [BLOCKING] migration was applied to the reachable local dev DB (no operator checkpoint required); the remote apply stays operator-gated in 07-06 by design.

## Known Stubs

None that block this plan's goal. The subgraph `Call.statement` templated default is the intentional safe fallback (D-03), explicitly superseded by the relayer-authoritative marketLine (D-05) — documented in both the schema comment and the mapping helper. The relayer `statement` value is real (caller prose) when present; absence cleanly yields the subgraph mirror.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries beyond the plan's `<threat_model>`.
- **T-07-02-01 (Tampering — statement in render):** mitigated — length-capped on persist (`STATEMENT_MAX_LEN`); Satori renders text not HTML; subgraph templated fallback guarantees a safe default.
- **T-07-02-02 (DoS — call creation blocked by DB write):** mitigated — statement persist is in its own fail-safe non-fatal block; a DB outage logs + continues.
- **T-07-02-03 (Info disclosure — subgraph query key):** mitigated — no `NEXT_PUBLIC_*` subgraph key added; reads stay relayer-side.
- **T-07-02-SC (npm installs):** mitigated — zero new packages.

## Next Phase Readiness

- **07-03** reads `live-state.marketLine` (now populated, D-05) as the OG real-data statement source, with the subgraph `Call.statement` templated mirror as the pre-enrichment fallback (D-03).
- **07-06** applies the migration to the remote/Sepolia relayer DB (operator-gated) and deploys the v0.9.0 subgraph to Studio (`SUBGRAPH_STUDIO_DEPLOY_KEY`).

---
*Phase: 07-og-service-final-variants-subgraph-final-mappings*
*Completed: 2026-06-07*

## Self-Check: PASSED

- [x] `apps/relayer/src/db/migrations/0006_mean_lady_deathstrike.sql` exists
- [x] `apps/relayer/src/db/schema.ts` exists (call_statement added)
- [x] `apps/relayer/src/db/criteria-store.ts` exists (insertCallStatement + resolveCallStatement)
- [x] `apps/relayer/src/routes/live-state.ts` exists (marketLine wired)
- [x] `packages/subgraph/schema.graphql` exists (Call.statement added)
- [x] `packages/subgraph/src/call-registry.ts` exists (templated default)
- [x] `packages/subgraph/tests/call-statement.test.ts` exists (4 GREEN)
- [x] `07-02-SUMMARY.md` exists
- [x] Commit `b2a66e9` (Task 1) exists in git log
- [x] Commit `52de21c` (Task 2) exists in git log
- [x] relayer build exits 0; criteria-store vitest 10/10; subgraph build exits 0; subgraph vitest 7/7
- [x] call_statement column verified in local dev DB (psql \d call_statement)
