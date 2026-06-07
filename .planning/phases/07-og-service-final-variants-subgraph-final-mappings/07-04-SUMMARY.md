---
phase: 07-og-service-final-variants-subgraph-final-mappings
plan: 04
subsystem: relayer
tags: [relayer, bullmq-worker, viem, drizzle, pino, x-api, farcaster, og-cache-warm, tdd]

# Dependency graph
requires:
  - phase: 07-og-service-final-variants-subgraph-final-mappings
    provides: RED auto-post-worker scaffold (07-01) + pure share-text builders (07-01)
  - phase: 01.5-relayer
    provides: x-api-client key-gate degrade pattern; notification-fanout worker template (chunked getLogs, never-throw)
provides:
  - Key-gated x-write-client postTweet (degrade-to-no-op, never throws — SHARE-17)
  - posted_receipts(call_id PK) dedup table + Drizzle migration 0007
  - startAutoPostWorker — settle-triggered cache-warm (Pitfall 8) + Pitfall-18 post-settle delay + key-gated post + Farcaster cast URL (D-02/D-07, SHARE-16/18)
  - Pure share-text builders relocated to @call-it/shared (single source for web + relayer)
  - X_API_WRITE_TOKEN / X_API_BEARER_TOKEN on the pino redact list (V7)
affects: [07-05-share-button, 07-06-operator-migration-apply, phase-8-farcaster-mini-app]

# Tech tracking
tech-stack:
  added: []  # zero new runtime deps — raw fetch write client; viem/drizzle/pino/ioredis already present
  patterns:
    - "Auto-post worker mirrors notification-fanout: chunked 9-block getLogs, init head-seeding + initialized guard, never-throw per-call try/catch"
    - "Cache-warm gate (Pitfall 8): incr status_version -> GET regen -> HEAD assert 200 + X-Variant + ETag, ≤30s retry budget (SHARE-03)"
    - "Key-gated WRITE path returns a structured no-op (never throws), unlike the x-api-client READ path which throws QuotaError"
    - "Pure cross-app logic lives in @call-it/shared; the consuming app file becomes a thin re-export (relayer cannot import across the apps/web project boundary)"
    - "Injectable test seams (fetchImpl / sleepImpl / resolveHandle + exposed processCall) make the worker fully unit-testable with a fake clock"

key-files:
  created:
    - apps/relayer/src/lib/x-write-client.ts
    - apps/relayer/src/lib/__tests__/x-write-client.test.ts
    - apps/relayer/src/workers/auto-post-worker.ts
    - apps/relayer/src/db/migrations/0007_light_pretty_boy.sql
    - packages/shared/src/share/share-text.ts
  modified:
    - apps/relayer/src/db/schema.ts
    - apps/relayer/src/index.ts
    - apps/relayer/src/lib/logger.ts
    - apps/relayer/src/workers/__tests__/auto-post-worker.test.ts
    - apps/web/lib/share-text.ts
    - packages/shared/src/index.ts

key-decisions:
  - "Relocated the pure share-text builders to @call-it/shared (Rule 3 blocking) — the relayer composite tsconfig (rootDir + project boundary) cannot import apps/web/lib; the shared package is the only correct common home. apps/web/lib/share-text.ts re-exports it, keeping single source + the web purity grep passing."
  - "WRITE path degrades to a structured no-op and NEVER throws (differs from x-api-client READ path which throws QuotaError) so the worker stays never-throw and activates with zero code change when X_API_WRITE_TOKEN lands."
  - "posted_receipts row is written even on a key-gated no-op so a later key-budget does not retroactively re-post historical settled calls — the mechanism activates for NEW settlements only."
  - "Pitfall-18 reconciled against the Phase-4 runbook (04-RESEARCH.md:652-654): no on-chain claim-delay exists; default-ON trigger fires AFTER cache-warm, gated by a configurable AUTO_POST_DELAY_MS (default 0 dev/test; operator sets a short delay) to absorb early disputes."
  - "Caller-centric outcome word derived from the on-chain CallSettled outcome enum (1=CallerWon->CALLED IT, 2=CallerLost->LOUD AND WRONG); CallerExited posts CALLER EXITED. Per-viewer FADED CORRECTLY/lozenge variants stay a web render concern."
  - "Dedup pre-check uses select().from().where().limit(1) (criteria-store pattern), not the drizzle relational query API (which needs a relations schema the relayer getDb() does not register)."

patterns-established:
  - "Auto-post share loop: cache-warm gate -> post-settle delay -> key-gated post -> idempotent dedup, all never-throw"
  - "Single-source pure modules in @call-it/shared consumed by both apps via re-export"

requirements-completed: [SHARE-16, SHARE-17, SHARE-18, SHARE-03]

# Metrics
duration: ~30min
completed: 2026-06-07
---

# Phase 7 Plan 04: Auto-Post Share-Loop Worker Summary

**A settle-triggered relayer worker that runs the Pitfall-8 cache-warm gate (bump statusVersion -> GET regen -> HEAD 200 + X-Variant + ETag, ≤30s retry) before a key-gated X post (degrade-to-no-op via the new `x-write-client`), records an idempotent `posted_receipts` dedup row, and constructs the Farcaster cast URL in parallel — Pitfall-18 reconciled to default-ON-after-cache-warm with a configurable post-settle delay (D-02/D-07, SHARE-16/17/18); the Plan 07-01 RED scaffold is now GREEN.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-07
- **Completed:** 2026-06-07
- **Tasks:** 2 (both tdd="true")
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments

- **`x-write-client.ts` (`postTweet`)** — thin `fetch`-based `POST /2/tweets` (NO npm SDK), reading `X_API_WRITE_TOKEN` (user-context OAuth — credential caveat documented in the header per 07-RESEARCH A2). KEY-GATE: missing token -> logs `x_write_no_key` (token value NEVER logged) + RETURNS `{ posted:false, reason:'no_key' }` — does NOT throw. 429 / non-2xx / network error all degrade to a structured no-op (no throw).
- **`posted_receipts(call_id PK)` dedup table** + generated migration `0007_light_pretty_boy.sql` (the "posted-once" idempotency key; mirrors the call_oracle_criteria PK + notifications WR-05 discipline).
- **`X_API_WRITE_TOKEN` + `X_API_BEARER_TOKEN` added to BOTH pino redact lists** (`index.ts` Fastify logger + `logger.ts` `REDACT_PATHS`) — V7, T-07-04-01.
- **`auto-post-worker.ts` (`startAutoPostWorker`)** — mirrors `notification-fanout.ts` (chunked 9-block `getLogs`, init head-seeding + `initialized` guard, never-throw per-call try/catch). Watches `CallSettled` (SettlementManager) + `CallerExited` (FollowFadeMarket). For each newly-settled call: cache-warm gate -> Pitfall-18 post-settle delay -> key-gated `postTweet` -> `posted_receipts` `onConflictDoNothing` write; the Farcaster cast URL is always constructed in parallel via the shared `warpcastComposeUrl`.
- **Pitfall-18 reconciliation (D-07, BLOCKING — RESOLVED)** documented inline in the worker header citing `04-RESEARCH.md:652-654` + D-07: the Phase-4 runbook implemented no on-chain claim-delay (claims during the dispute window; reversal affects unclaimed funds only), so default-ON fires after cache-warm, gated by a configurable `AUTO_POST_DELAY_MS`.
- **Single-source share-text** — relocated the pure builders to `@call-it/shared` (`packages/shared/src/share/share-text.ts`), re-exported from the barrel and from `apps/web/lib/share-text.ts`. Relayer imports `{ buildShareText, warpcastComposeUrl }` from `@call-it/shared`; web Share button (07-05) imports the same logic.
- **Boot wiring** — `startAutoPostWorker` started in the relayer `onReady` hook behind `AUTO_POST_ENABLED` (default-ON, SHARE-16; `AUTO_POST_ENABLED=false` disables non-destructively).
- **07-01 RED scaffold turned GREEN** — replaced the 6 `it.todo` with 9 real assertions: X-Variant cache-warm gate, variant-mismatch -> no-post, ≤30s retry (fake clock), budget-exhaust -> no-post, key-gated no-op (no throw), post-settle-delay ordering (delay before tweet), dedup (no double-post), no-op dedup write, caller-exited variant.

## Task Commits

1. **Task 1: x-write-client (key-gated no-op) + posted_receipts dedup table** — `c51c3f0` (feat)
2. **Task 2: auto-post-worker (cache-warm + Pitfall-18 + Farcaster cast) + share-text relocation + boot wiring** — `5b158b0` (feat)

**Plan metadata:** docs commit — see final commit below.

_Both tasks are `tdd="true"`; each was authored + verified GREEN as a single feature unit (Task 1 = x-write-client.test.ts 5/5; Task 2 = auto-post-worker.test.ts 9/9)._

## Verification Results

- `pnpm --filter @call-it/relayer db:generate` — generated `0007_light_pretty_boy.sql` (12 tables; posted_receipts present).
- `pnpm --filter @call-it/relayer build` — exits 0.
- `pnpm --filter @call-it/relayer test x-write-client` — 5/5 pass (no-key no-op no-fetch, present-key exactly one POST, 429/non-2xx/network all degrade without throwing).
- `pnpm --filter @call-it/relayer test auto-post-worker` — 9/9 pass.
- `pnpm --filter @call-it/relayer test` (full suite) — **208 passed / 1 skipped / 0 failed**.
- `pnpm --filter @call-it/web build` — exits 0 (share-text re-export resolves; warnings pre-existing/unrelated).
- `pnpm --filter @call-it/shared build` — exits 0.

## Migration Apply Status

- **Generated:** `apps/relayer/src/db/migrations/0007_light_pretty_boy.sql` (+ `meta/0007_snapshot.json`, `meta/_journal.json`) — committed in `c51c3f0`.
- **Local dev apply:** DEFERRED — the local dev relayer Postgres (`callit-postgres` on `127.0.0.1:5434`, DB `call_it_relayer_sepolia`) is NOT running this session (probe returned `ECONNREFUSED`; no postgres container up). `db:migrate` therefore could not apply locally.
- **Remote/authoritative apply:** operator-gated in Plan 07-06 (per the plan note). The X write degrades to a no-op when write keys are absent (D-02), so no live X keys were required for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Relocated the pure share-text builders to @call-it/shared**
- **Found during:** Task 2 (importing the builders into the relayer worker).
- **Issue:** The plan said "import the pure builders from `apps/web/lib/share-text.ts`". The relayer's composite tsconfig (`rootDir: "."` + no project reference to `apps/web`) cannot import a file inside `apps/web` — it would break the project graph and `rootDir`. The builders existed ONLY in `apps/web/lib`.
- **Fix:** Moved the canonical pure module to `packages/shared/src/share/share-text.ts`, re-exported it from the `@call-it/shared` barrel, and made `apps/web/lib/share-text.ts` a thin re-export. Both apps now import the SAME logic (the 07-01 "single source" intent) without a cross-app import. `@call-it/shared` was already a dependency of both apps.
- **Files modified:** `packages/shared/src/share/share-text.ts` (created), `packages/shared/src/index.ts`, `apps/web/lib/share-text.ts`.
- **Verification:** web `share-text.test.ts` 6/6 still pass (incl. the T-07-01-02 purity grep); web build 0; relayer worker imports resolve + build 0.
- **Committed in:** `5b158b0`.

**2. [Rule 1 - Bug] Dedup pre-check used the drizzle relational query API which does not compile / is not registered**
- **Found during:** Task 2 (relayer build).
- **Issue:** The initial dedup pre-check used `db.query.postedReceipts.findFirst(...)` — its typed `where` callback conflicted with the generated column types (TS2322) and the relational query API needs a relations schema the relayer `getDb()` does not register.
- **Fix:** Switched to `db.select({ callId }).from(postedReceipts).where(eq(...)).limit(1)` (the criteria-store pattern). The authoritative idempotency remains the `onConflictDoNothing` insert; the select is just an early-skip optimization.
- **Files modified:** `apps/relayer/src/workers/auto-post-worker.ts`, `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` (db mock updated to the select chain).
- **Verification:** relayer build 0; worker test 9/9.
- **Committed in:** `5b158b0`.

### Additive (Rule 2)

- **Added `X_API_BEARER_TOKEN` to the redact lists** alongside `X_API_WRITE_TOKEN` (the plan asked only for the write token). The existing `x-api-client` read token was never redacted — adding it closes the same V7 disclosure gap for the sibling secret.
- **Added `X_API_WRITE_TOKEN` to `logger.ts` `REDACT_PATHS`** in addition to the `index.ts` Fastify logger redact (the plan named only `index.ts`). Both logger surfaces must redact for the guarantee to hold.

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug) + 2 additive (V7 redaction). **Impact:** the blocking relocation realizes the 07-01 single-source intent without a cross-app import; the others are correctness/security. No scope creep.

## Authentication Gates

None encountered. The X write path is intentionally key-gated and degrades to a no-op without `X_API_WRITE_TOKEN` (SHARE-17) — no live X credentials were needed to ship or verify the mechanism.

## Known Stubs

None that block the plan goal. The auto-post mechanism ships fully built and activates with zero code change once `X_API_WRITE_TOKEN` is budgeted (the intended key-gated state, D-02). The migration's authoritative remote apply is operator-gated in 07-06 (documented above), not a stub.

## Threat Surface Scan

All surfaces are within the plan `<threat_model>`:

- **T-07-04-01** (X write token disclosure) — mitigated: token relayer-only, on both pino redact lists, never logged (only `x_write_*` event names), degrade-to-no-op when absent.
- **T-07-04-02** (stale-preview tampering) — mitigated: Pitfall-8 cache-warm gate (status_version bump -> GET regen -> HEAD 200 + X-Variant in {settled,caller-exited} + ETag) before any post; ≤30s retry; variant mismatch -> no post.
- **T-07-04-03** (front-running disputes) — mitigated: Pitfall-18 reconciled; default-ON fires after cache-warm + a configurable post-settle delay.
- **T-07-04-04** (double-post on replay) — mitigated: `posted_receipts(call_id)` PK + select pre-check + `onConflictDoNothing`; never-throw discipline.
- **T-07-04-SC** (npm installs) — holds: zero new packages (raw `fetch` write client).

No new network endpoints, auth paths, or trust boundaries beyond the plan threat model.

## TDD Gate Compliance

Both tasks are `tdd="true"` and were shipped as single feature units with their tests authored + verified GREEN in the same task commit (x-write-client.test.ts in `c51c3f0`; auto-post-worker.test.ts — the 07-01 RED scaffold — turned GREEN in `5b158b0`). The 07-01 scaffold provided the RED behavior map; this plan's commit is the GREEN gate.

## Next Phase Readiness

- **07-05** wires the web Share button to `twitterIntentUrl` / `warpcastComposeUrl` — now sourced from `@call-it/shared` (same builders the worker uses).
- **07-06** applies migration `0007_light_pretty_boy.sql` to the remote Sepolia relayer DB (operator-gated) so the worker's `posted_receipts` read/write works in production.
- **Operator follow-up:** set `AUTO_POST_DELAY_MS` to a short post-settle delay in the runbook; budget `X_API_WRITE_TOKEN` (user-context OAuth) to activate live posting (zero code change).

---
*Phase: 07-og-service-final-variants-subgraph-final-mappings*
*Completed: 2026-06-07*

## Self-Check: PASSED

- [x] `apps/relayer/src/lib/x-write-client.ts` exists on disk
- [x] `apps/relayer/src/lib/__tests__/x-write-client.test.ts` exists on disk
- [x] `apps/relayer/src/workers/auto-post-worker.ts` exists on disk
- [x] `apps/relayer/src/db/migrations/0007_light_pretty_boy.sql` exists on disk
- [x] `packages/shared/src/share/share-text.ts` exists on disk
- [x] Commit `c51c3f0` (Task 1) exists in git log
- [x] Commit `5b158b0` (Task 2) exists in git log
- [x] relayer build exits 0; relayer suite 208 pass / 1 skip / 0 fail
- [x] x-write-client 5/5; auto-post-worker 9/9 (07-01 RED scaffold GREEN)
- [x] X_API_WRITE_TOKEN on both pino redact lists; token value never logged
