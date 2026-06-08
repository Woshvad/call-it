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
    - apps/web/vercel.json   # Task 2 deploy-config: pnpm install/build at workspace root for the monorepo Vercel deploy
    - .vercelignore          # Task 2 deploy-config: slims the web deploy upload (~3GB -> tens of MB)
  modified:
    - packages/shared/src/constants/addresses.ts  # SUBGRAPH_URL_SEPOLIA bumped to v0.9.0 (Task 2, commit 1b0f9ff)

key-decisions:
  - "No change to apps/web/app/call/[id]/layout.tsx — generateMetadata already injects /og/{id}?v={statusVersion} (line 70, wired 07-02/SHARE-04); the plan asked to VERIFY it survived the 07-02 marketLine wiring, and it did. The receipt-meta spec now locks it as a test-of-record."
  - "No change to apps/web/middleware.ts — /leaderboard (and /call,/profile,/duel) are already in PUBLIC_PREFIXES (carved out in a prior session, fd79a74 + 07-05). The plan said 'add it if missing'; it was present, so the spec asserts it instead."
  - "Coverage script maps ~20 OPS-03 on-chain events to the subgraph ENTITIES the handlers write (CallSettled->settlements, RepCalculated->repEvents, Challenge*->challenges/challengePayouts, etc.) — the subgraph models the domain, not raw logs; counting the destination entity proves the handler indexes."
  - "Endpoint configurability is a hard requirement (the live Studio v0.9.0 endpoint does not exist until the operator publishes in Task 2) — flag/env resolution + exit-2 guard, no hardcoded URL."

requirements-completed: [SHARE-14, SHARE-21, SHARE-02, SHARE-03]  # SHARE-14/21 (receipt og:image ?v= + public no-auth carve-out) + SHARE-02/03 (OG served from Vercel origin via NEXT_PUBLIC_OG_BASE_URL with CORS) are satisfied by the live deploy. OPS-04 (authoritative live coverage run) + SHARE-13 (Twitter Card Validator 5/5) remain operator-pending — NOT marked complete (see Documented Residuals).

# Metrics
duration: ~20min (CI-safe) + live deploy (operator+orchestrator, 2026-06-08)
completed: 2026-06-08
---

# Phase 7 Plan 06: Share-Loop Deploy + Verify (CI-safe code + live deploy DONE; 3 residuals operator-pending) Summary

**The CI-safe verification artifacts for the Sepolia share-loop go-live are shipped: a receipt-meta Playwright spec (og:image `?v={statusVersion}` cache-buster + `twitter:card` + the `/call`/`/leaderboard` public carve-out — SHARE-14/21), a configurable-endpoint ~20-event subgraph coverage script with a CallCreated <30s sync-lag check (OPS-04), and a full operator deploy runbook. The live deploy/publish/secret/remote-migrate/validator steps are intentionally PAUSED behind a `human-action` checkpoint — they require operator credentials (Studio deploy key, Vercel project, Fly CORS secret, relayer DB access) this automated session cannot and must not supply.**

## Execution pattern

This plan is `autonomous: false` with two tasks: Task 1 (`type="auto"`, CI-safe code) and Task 2 (`type="checkpoint:human-action"`, operator deploy). Per the checkpoint protocol, Task 1 was built, verified, and committed (2026-06-07, commits `1aed14e` + `6ccf082`). Task 2 was then executed LIVE by the operator + orchestrator together on **2026-06-08** (the operator supplied the credentials Claude cannot hold — Studio deploy key, Vercel account, Fly secret, relayer DB access). Steps 1–5 are DONE and verified; 3 browser-only / seeded-data residuals remain operator-pending and are NOT marked passed. No deploy success is fabricated — every live outcome below is recorded with its commit / endpoint / verification artifact in `docs/operator/phase-7-deploy-runbook.md`.

## What shipped (Task 1 — CI-safe, committed)

- **`apps/web/tests/receipt-meta.spec.ts`** — Tier-1 (always-run) source assertions: `generateMetadata` injects `/og/${id}?v=${statusVersion}` (SHARE-14, D-09 cache-buster), `twitter:card: summary_large_image`, 1200×630 dimensions, and `/call` + `/leaderboard` + `/profile` + `/duel` are in `middleware.ts` PUBLIC_PREFIXES (SHARE-21). Tier-2 incognito 200-no-auth load + rendered-meta assertions are env-gated on `PLAYWRIGHT_BASE_URL` (the live load is operator Task 2 — skipped, not fabricated).
- **`packages/subgraph/scripts/verify-event-coverage.ts`** — enumerates the ~20 OPS-03 events mapped to their subgraph entities, queries each for indexed rows, and runs an OPS-04 CallCreated <30s sync-lag probe (`--seeded-call-id`). Core money/rep paths hard-fail on empty; rare paths WARN. Endpoint is configurable (`--endpoint` / `SUBGRAPH_COVERAGE_URL` / `SUBGRAPH_URL_SEPOLIA`) and exits 2 with guidance when absent. Exits 1 on any core gap or >30s lag, 0 on full coverage.
- **`docs/operator/phase-7-deploy-runbook.md`** — exact operator commands: Studio v0.9.0 publish (D-01, NO DN), authoritative coverage run, BOTH relayer migrations (call_statement 0006 + posted_receipts 0007) via `fly proxy` + `db:migrate` with `\d` confirmation, Vercel `call-it-web-sepolia` deploy with `NEXT_PUBLIC_*` set BEFORE build (Pitfall 5), Fly CORS env + restart (D-04), OPTIONS preflight smoke (exact origin not `*`), incognito hydration checklist, and the 5-variant Twitter Card Validator checklist (SHARE-13, D-08).

## What was executed live (Task 2 — operator + orchestrator, 2026-06-08) — DONE

All five live steps were executed and verified; the runbook (`docs/operator/phase-7-deploy-runbook.md` § "Outputs to record") holds the per-step evidence:

1. **Step 1 — Subgraph v0.9.0 published to Sepolia Studio** (D-01 honored — NO Decentralized-Network publish). Build `QmYrrSgVxrpgg3Bgc7P1e2ZjdGNSjW3fhExcsieVPgcimJ`; `SUBGRAPH_URL_SEPOLIA` bumped to `https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.0` (commit `1b0f9ff`). Subgraph `_meta` healthy: block `275026674`, `hasIndexingErrors:false`.
2. **Step 2 — BOTH relayer DB migrations applied to the remote Sepolia Postgres** (`call-it-pg-sepolia` → DB `call_it_relayer_sepolia`) via `db:migrate` over a `fly proxy 5499:5432` tunnel: `0006 call_statement` (`call_id PK, statement text, created_at`) + `0007 posted_receipts` (`call_id PK, posted_at`) — both verified present. (Note: relayer reads via `DATABASE_URL`; drizzle-kit reads `POSTGRES_URL`.)
3. **Step 3 — `apps/web` deployed to Vercel `call-it-web-sepolia`** at `https://call-it-web-sepolia.vercel.app`. Net-new monorepo deploy config added this session: `apps/web/vercel.json` (pnpm install/build at workspace root) + root `.vercelignore` (slimmed the upload ~3GB → tens of MB); Root Directory = `apps/web`. Smoke-verified: `/feed` 200, `/leaderboard` 200, fallback OG `/og/fallback` → 200 `image/png`, relayer `/api/feed` 200 JSON.
4. **Step 4 — Fly relayer CORS allowlist** set to the Vercel origin (`fly secrets set CORS_ALLOWED_ORIGINS=https://call-it-web-sepolia.vercel.app -a call-it-relayer-sepolia`; machine restarted healthy). `X_API_WRITE_TOKEN` remains UNSET (auto-post degrades to no-op, D-02).
5. **Step 5 — CORS OPTIONS preflight smoke PASSED**: 204, `access-control-allow-origin: https://call-it-web-sepolia.vercel.app` (the EXACT origin, NOT `*`), methods `GET, POST, PATCH, OPTIONS`, `vary: Origin`.

**Deploy commits (6):** `1b0f9ff` (SUBGRAPH_URL_SEPOLIA → v0.9.0), `2d1d93e` (record Steps 1–2 outcomes), `8b82d70` (root vercel.json for pnpm-monorepo deploy), `0d2aa40` (.vercelignore), `046cca9` (move vercel.json into apps/web), `f7f495b` (record Steps 3–5 verified live).

## Documented Residuals (operator-pending — NOT marked passed)

These three gates are post-deploy follow-ups; they need a browser or a fresh seeded-settled-call run and are explicitly NOT recorded as passed:

1. **Step 6 — Twitter Card Validator on the 5 variant receipt URLs** (SHARE-13, D-08): browser-only operator checklist (`cards-dev.twitter.com/validator`) — PENDING.
2. **SC1 200px outcome-word baselines + authoritative `verify-event-coverage.ts` live run** (OPS-04 live confirm): PENDING a fresh seeded-settled-call run on the deployed app, then the 200px spec with `--update-snapshots` and the coverage script with `--endpoint <v0.9.0> --seeded-call-id <id>`.
3. **Incognito visual hydration spot-check** of `/call/[id]`, `/profile`, `/leaderboard`: PENDING the visual pass (CORS + 200s already curl-confirmed in Step 5).

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

- Task 2 live deploy is DONE (2026-06-08): Sepolia web app live at `https://call-it-web-sepolia.vercel.app`, subgraph v0.9.0 published, both relayer migrations applied, CORS allowlist = the exact Vercel origin. This unblocks Phase-4 UAT-1/2/3 (visual page render) and the live PITFALLS share-loop checks (the CORS + 200s are curl-confirmed; the incognito visual pass is a residual).
- 3 residuals remain operator-pending (Twitter Card Validator 5/5, SC1 200px baselines + authoritative live coverage run, incognito visual hydration) — tracked above; they need a browser + a fresh seeded-settled run.
- DN publish + `api.callitapp.xyz` cutover remain **Phase 10** (need mainnet contracts).

---
*Phase: 07-og-service-final-variants-subgraph-final-mappings*
*CI-safe code completed: 2026-06-07. Live deploy (Task 2) completed: 2026-06-08 (operator + orchestrator), 3 residuals operator-pending.*

## Self-Check: PASSED

- [x] `apps/web/tests/receipt-meta.spec.ts` exists on disk
- [x] `packages/subgraph/scripts/verify-event-coverage.ts` exists on disk
- [x] `docs/operator/phase-7-deploy-runbook.md` exists on disk
- [x] Commit `1aed14e` (Task 1, the 3 CI-safe artifacts) exists in git log
- [x] web build exits 0; receipt-meta Tier-1 6/6 pass + 3 Tier-2 env-gated skip
- [x] coverage script typechecks clean + exits 2 (guarded) with no endpoint
- [x] Task-2 deploy commits exist in git log: `1b0f9ff`, `2d1d93e`, `8b82d70`, `0d2aa40`, `046cca9`, `f7f495b`
- [x] Net-new deploy-config artifacts exist on disk: `apps/web/vercel.json`, `.vercelignore`
- [x] Subgraph v0.9.0 endpoint + remote migration + CORS smoke recorded in `docs/operator/phase-7-deploy-runbook.md` § Outputs to record
