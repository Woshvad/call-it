---
phase: 07-og-service-final-variants-subgraph-final-mappings
plan: 06
subsystem: deploy + verification (web + subgraph + relayer-ops)
tags: [playwright, subgraph-coverage, ops-04, share-14, share-21, share-13, d-01, d-04, d-08, operator-gated, checkpoint]

# Dependency graph
requires:
  - phase: 07-02
    provides: call_statement migration 0006 + live-state marketLine (D-05) + subgraph Call.statement templated mirror (D-03)
  - phase: 07-04
    provides: posted_receipts dedup migration 0007 + auto-post worker (key-gated no-op)
  - phase: 07-03
    provides: OG real-data wiring (reads marketLine / subgraph Settlement+RepEvent)
  - phase: 07-05
    provides: ShareButton + Leaderboard page (the new /leaderboard public route)
provides:
  - apps/web/tests/receipt-meta.spec.ts — Tier-1 og:image ?v= cache-buster + twitter:card + public carve-out assertions (SHARE-14/21); Tier-2 incognito-load env-gated
  - packages/subgraph/scripts/verify-event-coverage.ts — ~20-event OPS-03 coverage + CallCreated <30s sync-lag (OPS-04); configurable endpoint; non-zero on core gap/lag
  - docs/operator/phase-7-deploy-runbook.md — full operator runbook (Studio v0.9.0 + both relayer migrations + Vercel + Fly CORS + smoke + Twitter Card Validator)
affects: [phase-4-uat-1-2-3-unblock, phase-8-farcaster, phase-10-mainnet-DN-publish]

# Tech tracking
tech-stack:
  added: []  # zero new packages — @playwright/test + graph-cli already pinned; coverage script uses native fetch
  patterns:
    - "Tier-1 (static source assertion, always-run CI gate) + Tier-2 (live browser/incognito, env-gated on PLAYWRIGHT_BASE_URL) — mirrors og-fallback.spec.ts + profile-shell.spec.ts"
    - "Configurable subgraph endpoint (--endpoint flag -> SUBGRAPH_COVERAGE_URL -> SUBGRAPH_URL_SEPOLIA), never hardcoded; exits 2 with a guidance message when absent so Task 1 can author+typecheck with no live endpoint"
    - "failOnEmpty core/rare event split — core money/rep paths hard-fail on empty; rare paths (Dispute/ForceSettle/Challenge*) WARN so an unseeded seed run is not a false failure"
    - "Operator-gated live steps captured as an executable runbook BEFORE the human-action checkpoint, not fabricated as done"

key-files:
  created:
    - apps/web/tests/receipt-meta.spec.ts
    - packages/subgraph/scripts/verify-event-coverage.ts
    - docs/operator/phase-7-deploy-runbook.md
  modified: []  # layout.tsx (?v={statusVersion}) + middleware.ts (/leaderboard) already correct from prior plans — verified, no change needed

key-decisions:
  - "No change to apps/web/app/call/[id]/layout.tsx — generateMetadata already injects /og/{id}?v={statusVersion} (line 70, wired 07-02/SHARE-04); the plan asked to VERIFY it survived the 07-02 marketLine wiring, and it did. The receipt-meta spec now locks it as a test-of-record."
  - "No change to apps/web/middleware.ts — /leaderboard (and /call,/profile,/duel) are already in PUBLIC_PREFIXES (carved out in a prior session, fd79a74 + 07-05). The plan said 'add it if missing'; it was present, so the spec asserts it instead."
  - "Coverage script maps ~20 OPS-03 on-chain events to the subgraph ENTITIES the handlers write (CallSettled->settlements, RepCalculated->repEvents, Challenge*->challenges/challengePayouts, etc.) — the subgraph models the domain, not raw logs; counting the destination entity proves the handler indexes."
  - "Endpoint configurability is a hard requirement (the live Studio v0.9.0 endpoint does not exist until the operator publishes in Task 2) — flag/env resolution + exit-2 guard, no hardcoded URL."

requirements-completed: []  # OPS-04/SHARE-13/14/21/02/03 are operator-gated; CI-safe code is authored, but the AUTHORITATIVE gates (live coverage run, Twitter Card Validator, CORS smoke, incognito 200) are operator Task 2 — NOT marked complete here

# Metrics
duration: ~20min
completed: 2026-06-07
---

# Phase 7 Plan 06: Share-Loop Deploy + Verify (CI-safe code complete; live deploy operator-gated) Summary

**The CI-safe verification artifacts for the Sepolia share-loop go-live are shipped: a receipt-meta Playwright spec (og:image `?v={statusVersion}` cache-buster + `twitter:card` + the `/call`/`/leaderboard` public carve-out — SHARE-14/21), a configurable-endpoint ~20-event subgraph coverage script with a CallCreated <30s sync-lag check (OPS-04), and a full operator deploy runbook. The live deploy/publish/secret/remote-migrate/validator steps are intentionally PAUSED behind a `human-action` checkpoint — they require operator credentials (Studio deploy key, Vercel project, Fly CORS secret, relayer DB access) this automated session cannot and must not supply.**

## Execution pattern

This plan is `autonomous: false` with two tasks: Task 1 (`type="auto"`, CI-safe code) and Task 2 (`type="checkpoint:human-action"`, operator deploy). Per the checkpoint protocol, Task 1 was built, verified, and committed; Task 2 is returned as a structured operator checklist and was NOT executed. No deploy success is fabricated.

## What shipped (Task 1 — CI-safe, committed)

- **`apps/web/tests/receipt-meta.spec.ts`** — Tier-1 (always-run) source assertions: `generateMetadata` injects `/og/${id}?v=${statusVersion}` (SHARE-14, D-09 cache-buster), `twitter:card: summary_large_image`, 1200×630 dimensions, and `/call` + `/leaderboard` + `/profile` + `/duel` are in `middleware.ts` PUBLIC_PREFIXES (SHARE-21). Tier-2 incognito 200-no-auth load + rendered-meta assertions are env-gated on `PLAYWRIGHT_BASE_URL` (the live load is operator Task 2 — skipped, not fabricated).
- **`packages/subgraph/scripts/verify-event-coverage.ts`** — enumerates the ~20 OPS-03 events mapped to their subgraph entities, queries each for indexed rows, and runs an OPS-04 CallCreated <30s sync-lag probe (`--seeded-call-id`). Core money/rep paths hard-fail on empty; rare paths WARN. Endpoint is configurable (`--endpoint` / `SUBGRAPH_COVERAGE_URL` / `SUBGRAPH_URL_SEPOLIA`) and exits 2 with guidance when absent. Exits 1 on any core gap or >30s lag, 0 on full coverage.
- **`docs/operator/phase-7-deploy-runbook.md`** — exact operator commands: Studio v0.9.0 publish (D-01, NO DN), authoritative coverage run, BOTH relayer migrations (call_statement 0006 + posted_receipts 0007) via `fly proxy` + `db:migrate` with `\d` confirmation, Vercel `call-it-web-sepolia` deploy with `NEXT_PUBLIC_*` set BEFORE build (Pitfall 5), Fly CORS env + restart (D-04), OPTIONS preflight smoke (exact origin not `*`), incognito hydration checklist, and the 5-variant Twitter Card Validator checklist (SHARE-13, D-08).

## What is operator-deferred (Task 2 — human-action checkpoint, NOT executed)

1. Subgraph v0.9.0 publish to Sepolia Studio (`SUBGRAPH_STUDIO_DEPLOY_KEY`) + authoritative coverage run (OPS-04).
2. Apply BOTH relayer DB migrations (0006 call_statement + 0007 posted_receipts) to the remote Sepolia relayer Postgres.
3. Vercel `call-it-web-sepolia` deploy with `NEXT_PUBLIC_*` baked before build.
4. Fly relayer CORS env (Vercel origin) + restart.
5. CORS OPTIONS preflight smoke + incognito receipt/leaderboard/profile hydration.
6. Twitter Card Validator on all 5 variant receipt URLs (D-08 checklist).

These gates (live coverage exit-0, Twitter Card Validator 5/5, live CORS smoke, remote migration apply, incognito 200 with seeded data) are NOT marked passed — they need live infra + seeded data.

## Verification Results (CI-safe)

- `pnpm --filter @call-it/web build` — **exit 0**.
- `pnpm --filter @call-it/web exec playwright test receipt-meta.spec.ts` — **6 Tier-1 passed / 3 Tier-2 skipped** (env-gated on `PLAYWRIGHT_BASE_URL`, as designed).
- `node packages/subgraph/scripts/verify-event-coverage.ts --check-only` (no endpoint) — exits **2** with the configurable-endpoint guidance message (intentional soft-fail; authoritative run is operator Task 2). Typechecks **clean** (`tsc --noEmit` with `@types/node` in scope, exit 0).

## Decisions Made

1. **layout.tsx + middleware.ts needed no change.** The plan said to verify the `?v={statusVersion}` injection survived the 07-02 marketLine wiring and to add `/leaderboard` to PUBLIC_PREFIXES if missing. Both were already correct (layout.tsx line 70; middleware.ts already lists `/call`, `/duel`, `/profile`, `/leaderboard`, `/dev`). The spec now locks both as tests-of-record rather than re-editing working code.
2. **Coverage maps events → entities, not raw logs.** Several on-chain events fan into shared domain entities by design; the script counts the destination entity (e.g. `settlements` for CallSettled, `repEvents` for RepCalculated) to prove the handler indexes.
3. **Core/rare failOnEmpty split.** Not every seed run exercises Dispute/ForceSettle/Challenge*; those WARN on empty while core money/rep paths hard-fail — avoids false failures on a partial seed while still gating the share-loop-critical paths.

## Deviations from Plan

None requiring code changes. The only adjustment was discovering the two referenced source edits (layout.tsx `?v=`, middleware `/leaderboard`) were already present from prior plans — so the spec asserts them as tests-of-record instead of re-editing. This is verification-only, not a deviation in behavior.

## Authentication Gates

The plan's Task 2 is itself the auth/credential gate (operator-held Studio deploy key, Vercel, Fly, relayer DB). It is returned as a structured `human-action` checkpoint, not an in-task auth error. No auth errors were encountered building the CI-safe artifacts.

## Known Stubs

None. The receipt-meta Tier-2 assertions and the coverage script's live run are env-gated/operator-gated by design (they need a deployed origin + live Studio endpoint), not stubbed-out placeholders. The runbook records exactly which gate runs where.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries beyond the plan's `<threat_model>`. The coverage script is a read-only GraphQL client against a configurable Studio endpoint (no secret — the public query URL); the Studio DEPLOY key stays operator-side per the runbook (T-07-06-02 / D-27). CORS allowlist (T-07-06-01) and the Twitter Card Validator (T-07-06-04) are exercised in the operator runbook, not in CI.

## Next Phase Readiness

- The operator runbook is ready to execute; once Task 2 completes it unblocks Phase-4 UAT-1/2/3 (visual page render) and the live PITFALLS share-loop checks.
- DN publish + `api.callitapp.xyz` cutover remain **Phase 10** (need mainnet contracts).

---
*Phase: 07-og-service-final-variants-subgraph-final-mappings*
*Completed: 2026-06-07 (CI-safe code; live deploy operator-gated)*

## Self-Check: PASSED

- [x] `apps/web/tests/receipt-meta.spec.ts` exists on disk
- [x] `packages/subgraph/scripts/verify-event-coverage.ts` exists on disk
- [x] `docs/operator/phase-7-deploy-runbook.md` exists on disk
- [x] Commit `1aed14e` (Task 1, the 3 CI-safe artifacts) exists in git log
- [x] web build exits 0; receipt-meta Tier-1 6/6 pass + 3 Tier-2 env-gated skip
- [x] coverage script typechecks clean + exits 2 (guarded) with no endpoint
