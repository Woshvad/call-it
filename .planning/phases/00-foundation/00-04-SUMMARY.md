---
phase: 00-foundation
plan: 04
subsystem: operational-substrate
tags:
  - multisig
  - safe
  - calendar
  - synthetic-alert
  - runbooks
  - better-stack
  - stylus-deactivation
  - ledger
dependency_graph:
  requires:
    - "@call-it/shared constants from Plan 00-01"
    - "apps/relayer/src/routes/internal-test-alert.ts from Plan 00-02"
    - "apps/relayer/src/workers/alerts.ts (sendAlert) from Plan 00-02"
    - "apps/relayer/src/lib/logger.ts from Plan 00-02"
    - "@safe-global/protocol-kit v7.x in apps/relayer/node_modules"
  provides:
    - "scripts/deploy-safe.ts → parseDeployArgs/validateArgs/validateSigners/buildSafeAccountConfig/runDeploy (SAFETY-58)"
    - "scripts/fire-synthetic-alert.ts → fireAndVerify/generateNonce/buildHmac (D-16, Pitfall D)"
    - "scripts/seed-calendar.ts → OAuth setup + 4-event creation at T-30/15/7/1 before Stylus deploy (D-13)"
    - "scripts/repoint-calendar.ts → Phase 5 hook to update Calendar events to real activation expiry"
    - ".github/workflows/synthetic-alert.yml → daily 12:00 UTC cron firing + verifying Telegram round-trip"
    - "apps/relayer/src/workers/stylus-deactivation-watcher.ts → startStylusDeactivationWatcher() (D-13 second belt)"
    - "packages/shared/src/constants/stylus-calendar.json → placeholder for seed-calendar.ts event IDs"
    - "docs/runbooks/* → 6 runbooks with concrete steps (stylus-reactivation, multisig-promotion, relayer-key-rotation, env-diff-ritual, nft-twap-sanity, settlement-stuck)"
    - "docs/better-stack-dashboards.md → 5 dashboard configs (OPS-06, D-14, D-17)"
    - "docs/demo-seed-plan.md → 10+ call seed spec for Phase 6 Sepolia staging (OPS-20)"
    - "packages/contracts/deployments/ → directory for safe-{network}.json manifests"
  affects:
    - Phase 5 (repoint-calendar.ts runs after Stylus activation)
    - Phase 6 (deploy-safe.ts --execute; multisig-promotion.md; deploy:safe:mainnet npm script)
    - Phase 7.5 (env-diff-ritual.md mandatory pre-mainnet checklist)
    - Phase 4+ (nft-twap-sanity.md skeleton; settlement-stuck.md)
    - Ongoing (relayer-key-rotation.md quarterly; stylus-deactivation-watcher daily)
tech_stack:
  added:
    - "@call-it/scripts workspace package (new)"
    - "@safe-global/protocol-kit v7.x (Safe 2-of-3 deploy)"
    - "@safe-global/api-kit v4.x (Safe Transaction Service)"
    - "@ledgerhq/hw-app-eth v6.x (Ledger Nano X/S Plus signing)"
    - "@ledgerhq/hw-transport-node-hid v6.x (Ledger USB HID transport)"
    - "googleapis v144.x (Google Calendar API for Stylus reactivation)"
    - "pnpm-workspace.yaml: scripts/ added as workspace package"
    - "pnpm-workspace.yaml: node-hid and usb builds approved (required by Ledger transport)"
  patterns:
    - "SafeFactory.init() + predictSafeAddress() for dry-run path (Safe SDK v7 API)"
    - "buildHmac(secret, {event, nonce, timestamp}) matching relayer HMAC construction exactly"
    - "fireAndVerify() with injectable fetchFn for unit testing without live network calls"
    - "Stylus deactivation watcher: setInterval + Redis SET NX EX 86400 idempotency"
    - "Google Calendar OAuth: offline access_type + consent prompt for refresh token"
    - "Ledger: dynamic import @ledgerhq/* to avoid bundling issues when not using Ledger path"
key_files:
  created:
    - scripts/deploy-safe.ts
    - scripts/fire-synthetic-alert.ts
    - scripts/seed-calendar.ts
    - scripts/repoint-calendar.ts
    - scripts/package.json
    - scripts/tsconfig.json
    - scripts/vitest.config.ts
    - scripts/test/deploy-safe.test.ts
    - scripts/test/fire-synthetic-alert.test.ts
    - .github/workflows/synthetic-alert.yml
    - apps/relayer/src/workers/stylus-deactivation-watcher.ts
    - apps/relayer/test/stylus-deactivation-watcher.test.ts
    - packages/shared/src/constants/stylus-calendar.json
    - packages/contracts/deployments/ (directory)
    - docs/runbooks/stylus-reactivation.md
    - docs/runbooks/multisig-promotion.md
    - docs/runbooks/relayer-key-rotation.md
    - docs/runbooks/env-diff-ritual.md
    - docs/runbooks/nft-twap-sanity.md
    - docs/runbooks/settlement-stuck.md
    - docs/better-stack-dashboards.md
    - docs/demo-seed-plan.md
    - docs/operator/README.md
  modified:
    - package.json (added deploy:safe:* npm scripts)
    - pnpm-workspace.yaml (added scripts/ package, node-hid/usb build approvals)
    - pnpm-lock.yaml (new deps: @safe-global/*, @ledgerhq/*, googleapis)
decisions:
  - "Safe SDK package is in apps/relayer/node_modules — scripts/ package references it via @safe-global/* in its own package.json; pnpm hoisting makes it available"
  - "Ledger transport (@ledgerhq/hw-transport-node-hid) dynamically imported to avoid bundling issues when not using Ledger path (test + env-key paths)"
  - "node-hid and usb native packages approved in pnpm-workspace.yaml (required by Ledger USB HID transport; node-gyp build)"
  - "fireAndVerify() injectable fetchFn pattern for testability without live network (same pattern as polled-events-fallback)"
  - "stylus-deactivation-watcher fires alerts at HIGHEST triggered threshold per tick (break after first match in descending [30,15,7,1] order) to avoid multi-threshold spam"
  - "Google Calendar --setup mode uses localhost:3333/callback for OAuth redirect (standard for desktop apps)"
  - "Live Sepolia Safe deploy DEFERRED to operator with Ledger Nano + funded ETH (hardware requirement)"
  - "4 Google Calendar events DEFERRED to operator post-plan setup (requires GOOGLE_CALENDAR_OAUTH_TOKEN)"
  - "Better Stack dashboard creation DEFERRED to operator (no config-as-code API in free tier)"
  - "Open Question 5 resolved: Telegram bot must be channel ADMIN with Post+Read rights for getUpdates"
  - "Open Question 6 resolved: Required scope = calendar.events (not full Calendar admin, T-00-34)"
metrics:
  duration: "~80 minutes"
  completed_date: "2026-05-22"
  tasks_completed: 4
  tasks_total: 4
  files_created: 23
  files_modified: 3
  tests_added: 14
  commits: 4
---

# Phase 00 Plan 04: Operational Substrate Summary

**One-liner:** Safe 2-of-3 deploy script with Ledger Nano + Sepolia dry-run; daily synthetic-alert CI cron with Telegram getUpdates nonce verification; Google Calendar Stylus reactivation seeding with Phase 5 repoint hook; relayer stylus-deactivation-watcher at T-30/15/7/1d thresholds; 6 operator runbooks + 5 Better Stack dashboard configs + Sepolia demo seed plan — Pitfalls 6, 17, C, D closed.

## What Was Built

### Task 1: Safe 2-of-3 Deploy Script (SAFETY-58, D-10, D-11)

**`scripts/deploy-safe.ts`**: Full CLI for Safe 2-of-3 deploy with:
- `parseDeployArgs()`, `validateArgs()`, `validateSigners()`, `buildSafeAccountConfig()`, `runDeploy()` — all exported for unit testing
- `--network` (sepolia|arbitrum-one), `--dry-run`/`--execute`, `--signer-source` (ledger|env)
- `--signer-source=env` FORBIDDEN with `--network=arbitrum-one` (D-11 mainnet guard enforced with exit code 1)
- Ledger path: dynamic import of `@ledgerhq/hw-transport-node-hid` + `@ledgerhq/hw-app-eth`; awaits Ledger confirmation
- Dry-run: `SafeFactory.predictSafeAddress()` without broadcasting
- Execute: `SafeFactory.deploySafe()` + `safe.getOwners()` / `safe.getThreshold()` post-deploy verification
- Writes `packages/contracts/deployments/safe-{network}.json` with `{ safeAddress, chainId, signers, threshold, deployedAt, deployerAddress, txHash }`

**Root npm scripts added:**
- `deploy:safe:sepolia:dry-run` — dry-run with env key (dev convenience)
- `deploy:safe:sepolia` — execute with Ledger Nano
- `deploy:safe:mainnet` — mainnet execute with Ledger Nano only

**`scripts/test/deploy-safe.test.ts`**: 6 unconditional unit tests + 2 gated tests:
- Parses `--dry-run` and `--execute` flags correctly
- Rejects `--signer-source=env --network=arbitrum-one` (D-11)
- Rejects missing `SAFE_SIGNER_1` (SAFE_SIGNER_X missing error message)
- Rejects malformed (non-address) signer values
- Builds correct `SafeAccountConfig` with `owners[3]` + `threshold: 2`
- 2 gated tests (dry-run + execute paths) skip cleanly without env vars

**New workspace package:** `@call-it/scripts` with `@safe-global/protocol-kit`, `@ledgerhq/*`, `googleapis`, `viem` dependencies. Added `scripts/` to `pnpm-workspace.yaml`.

### Task 2: Synthetic Alert CI Cron (D-16, Pitfall D)

**`scripts/fire-synthetic-alert.ts`**: CLI + library for end-to-end Telegram alert verification:
- `generateNonce()`: fresh UUID v4 per invocation (crypto.randomUUID)
- `buildHmac(secret, body)`: matches relayer's `synthetic-event-handler.ts` construction exactly
- `nonceFoundInUpdates(updates, nonce, chatId)`: scans Telegram `channel_post` entries for the nonce in multiple text formats
- `fireAndVerify(opts)`: injectable `fetchFn` for testing; returns `{ success, exitCode, nonce, error }`
  1. POST HMAC-signed request to `RELAYER_URL/internal/test-alert`
  2. On non-200: exits 1 immediately (does NOT poll Telegram — alert can't have fired)
  3. Polls `getUpdates?offset=-100&limit=50` every 5s up to `--wait-seconds`
  4. On nonce found: exits 0
  5. On timeout: exits 1 with "Nonce not seen in P0 channel within Xs — alert pipeline broken"
- `--seed-dashboards`: emits 5 synthetic Pino log lines for Better Stack dashboard bootstrapping

**`.github/workflows/synthetic-alert.yml`**: Daily CI cron:
- `on.schedule.cron: '0 12 * * *'` + `workflow_dispatch`
- `permissions: contents: read`
- Runs `pnpm tsx scripts/fire-synthetic-alert.ts --event rep_fallback --wait-seconds 60`
- Exit 1 from script = build fails = CI fails = operator notified

**`scripts/test/fire-synthetic-alert.test.ts`**: 4 tests with mocked fetch:
- Test 1: relayer 200 + nonce found in getUpdates → exits 0 ✓
- Test 2: relayer 200 + nonce NOT found within timeout → exits 1 with build-failer message ✓
- Test 3: relayer non-200 → exits 1; Telegram NOT polled ✓
- Test 4: each invocation generates unique UUID; HMACs differ; old nonces not matched ✓

**Open Question 5 resolved:** Telegram bot must be added as channel ADMINISTRATOR with "Post Messages" + "Read Messages" rights. Without admin rights, `getUpdates` returns empty even for the bot's own messages. Documented in workflow YAML comments.

### Task 3: Google Calendar Seeding + Stylus Deactivation Watcher (D-13, Pitfall C)

**`scripts/seed-calendar.ts`**: Google Calendar event creation:
- `--setup` mode: full OAuth flow (browser auth → refresh token printed for GCP Secret Manager)
- Default mode: creates 4 events at `placeholder_deploy_date - {30,15,7,1}d` via `google.calendar('v3').events.insert`
- `--dry-run`: prints events without API calls
- Writes event IDs to `packages/shared/src/constants/stylus-calendar.json`

**`scripts/repoint-calendar.ts`**: Phase 5 hook:
- Reads existing event IDs from `stylus-calendar.json`
- Computes `reactivation_deadline = stylus_deploy_date + 365 days`
- Calls `calendar.events.update()` for each of the 4 events with new dates
- Updates `stylus-calendar.json` `last_updated_via: 'phase-5-repoint'`
- Phase 5 comment block at top explicitly warns: "Failure to run = wrong calendar dates fire (Pitfall C)"

**`packages/shared/src/constants/stylus-calendar.json`**: Empty placeholder with all 4 `event_t*` fields + `_note` documenting the seeding workflow.

**`apps/relayer/src/workers/stylus-deactivation-watcher.ts`**: Daily cron worker:
- Exports `startStylusDeactivationWatcher(opts): { stop(): void }`
- `intervalMs` default: 24h
- Polls `arbitrumActivationExpiry()` via `publicClient.readContract` (ABI embedded)
- Computes `daysRemaining = (expiry - now) / 86400`
- For each threshold in `[30, 15, 7, 1]`:
  - If `daysRemaining <= N && daysRemaining > 0`
  - Acquires Redis lock `stylus:alert-fired:T-{N}d:YYYY-MM-DD` via `SET NX EX 86400`
  - If acquired: `sendAlert('stylus_reactivation', { daysRemaining, threshold, expiryTimestamp, stylusAddress })`
  - Break after first threshold match (prevents multi-threshold spam per tick)
- Error handling: logs `stylus_watcher_skipped` Pino event on readContract failure (does NOT crash)
- `stylusAddress: null` → logs `stylus_watcher_inactive` (Phase 0 expected path)

**`apps/relayer/test/stylus-deactivation-watcher.test.ts`**: 4 tests:
- Test 1: 45 days remaining → no alert fires ✓
- Test 2: 29 days remaining → T-30 alert fires; Redis SET NX called; on locked Redis → no duplicate ✓
- Test 3: readContract throws → graceful skip, no alert, no crash ✓
- Test 4: null stylusAddress → readContract NOT called, no alert ✓

**Open Question 6 resolved:** OAuth scope = `calendar.events` (not full Calendar admin). Sufficient for `events.insert` + `events.update`. Documented in script header.

### Task 4: Operator Runbooks + Better Stack Dashboards + Demo Seed Plan

**6 operator runbooks with concrete steps (not placeholders):**

1. **`docs/runbooks/stylus-reactivation.md`** (189 lines): Background on 365-day Stylus deactivation; alert thresholds T-30/15/7/1d; pre-flight checks (cast call for expiry, Ledger Nano verification, ETH balance); `cargo stylus activate` execution steps with expected output; `cast send` alternative; post-reactivation verification + `repoint-calendar.ts` call; 48h-before-demo escalation path (proxy.upgradeTo Solidity baseline); incident documentation template.

2. **`docs/runbooks/multisig-promotion.md`** (187 lines): D-10 signer composition (2 different HW wallet brands); Safe deployment pre-condition; 6-contract ownership transfer order table; per-contract `transferOwnership` + `acceptOwnership` via Safe UI + cast; post-promotion verification loop; failure mode table (Ownable v5 single-step detection); public commitment documentation.

3. **`docs/runbooks/relayer-key-rotation.md`** (197 lines): 5-key KMS inventory (nft-twap, defillama, cex, snapshot-tally, oauth-proof); quarterly cadence + triggers; ADDITIVE rotation (never REPLACE old version); `gcloud kms keys versions create`; Fly secrets update; `verifyKmsAddress()` boot verification requirement; `#manual-rep-compensation` anchor with full `emergencySetRep` procedure + public dispute log template.

4. **`docs/runbooks/env-diff-ritual.md`** (159 lines): Pitfall 5 background; Fly secrets diff; Vercel env grep for Sepolia refs; GCP Secret Manager diff; build artifact grep guard; 2-signer Telegram sign-off requirement; `scripts/env-diff.ts` Phase 6 scope note; failure mode recovery table.

5. **`docs/runbooks/nft-twap-sanity.md`** (108 lines): §13.2 TWAP spec; Phase 0 skeleton with `TODO_PHASE_4` markers; 6-collection address registry skeleton; observation-count validation; ≤5% cross-check threshold; manual sanity-check procedure for Phase 0-3 operators.

6. **`docs/runbooks/settlement-stuck.md`** (166 lines): OPS-14 background; EXACT GraphQL query for stuck calls (`calls(where: { status: "pending_settle", expiry_lt: <now-1500> })`); Better Stack `failed-tx-rate` diagnosis with 5 error types; `forceSettle(uint256)` cast command with 7d cooldown verification; public dispute documentation template.

**`docs/better-stack-dashboards.md`** (206 lines): 5 dashboard configurations with EXACT Pino source filters, widget types, aggregations, alert thresholds, time ranges, and seed data JSON for each. D-17 private-access note at the top. Bootstrapping procedure (1x setup + `--seed-dashboards` run).

**`docs/demo-seed-plan.md`** (170 lines): 10+ call specification matrix (2 price target, 1 spread, 5 event subtypes); per-call parameters (assetType, stake in USDC 6-decimals, conviction in basis points, expiry in seconds); Phase 6 `scripts/seed-call.ts` invocations; 48h staging gate checklist.

**`docs/operator/README.md`**: Index of all 6 runbooks + scripts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Safe SDK API mismatch — `SafeFactory.init()` requires `signer` as address, not private key**
- **Found during:** Task 1 implementation — Safe SDK v7 `SafeFactory.init()` changed the signer API from v4
- **Issue:** Plan referenced v4 API; relayer's installed `@safe-global/protocol-kit` is v7.x
- **Fix:** Used `signer: deployerAddress` (address string) for Ledger path; `signer: pk` (private key hex string) for env path per v7 SDK docs; dynamically imported Ledger transport to avoid bundling issues
- **Files modified:** `scripts/deploy-safe.ts`
- **Commit:** 5783e2b

**2. [Rule 2 - Missing Critical] Added stylus-deactivation-watcher Test 4 for null address**
- **Found during:** Task 3 implementation — Plan spec said 3 tests; Phase 0 null-address path needs explicit coverage
- **Issue:** Phase 0 operator running the relayer with no Stylus contract would cause readContract to throw even before connection — the null-address guard is a critical correctness requirement
- **Fix:** Added Test 4 verifying null address skips without calling readContract
- **Files modified:** `apps/relayer/test/stylus-deactivation-watcher.test.ts`
- **Commit:** 2274de6

## Authentication Gates

None — all live service interactions (Safe, Calendar, Telegram, Ledger) are gated behind env vars and documented as operator setup steps (DEFERRED). No hard blocks encountered.

## DEFERRED Items (Operator Setup Required)

| Item | Requires | Action |
|------|----------|--------|
| Live Sepolia Safe deploy | Ledger Nano + Sepolia ETH + 3 signer EOA env vars | Operator runs `pnpm deploy:safe:sepolia` with Ledger plugged in |
| 4 Google Calendar events | GOOGLE_CALENDAR_OAUTH_TOKEN (run `--setup`) | Operator runs `pnpm tsx scripts/seed-calendar.ts --setup` then default mode |
| 5 Better Stack dashboards | BETTERSTACK_SOURCE_TOKEN + relayer deployed | Operator creates dashboards per `docs/better-stack-dashboards.md` |
| Synthetic-alert CI cron live | GitHub Secrets: RELAYER_URL, RELAYER_INTERNAL_HMAC, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID_P0 | Operator sets secrets via `gh secret set` after Plan 00-05 deploy |
| Telegram bot admin rights | P0 channel admin permission granted to bot | Operator adds bot as admin with Post+Read rights (Open Question 5 resolved in code) |

## Open Question Outcomes

| Question | Status | Resolution |
|----------|--------|------------|
| OQ-5: Telegram bot getUpdates permission | **Resolved** | Bot must be channel admin with Post+Read rights; documented in workflow YAML + fire-synthetic-alert.ts header |
| OQ-6: Google Calendar OAuth scope | **Resolved** | `calendar.events` scope sufficient for insert + update; NOT full Calendar admin (T-00-34 minimal scope) |

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced beyond those already in the plan's threat model. All threats (T-00-27 through T-00-34) addressed:
- T-00-27: Ledger-only signing for mainnet; env-key mainnet rejection enforced with exit 1
- T-00-28: HMAC secret in GCP Secret Manager; fresh UUID nonce per CI run; 5-min replay window on relayer
- T-00-29: Two independent belts (Calendar + Watcher) with no shared failure mode
- T-00-34: OAuth token minimal scope (calendar.events); rotation documented in relayer-key-rotation.md

## Self-Check

| Check | Result | Notes |
|-------|--------|-------|
| `pnpm turbo run lint test build` | PASS | 18/18 tasks successful |
| `pnpm --filter @call-it/scripts exec vitest run test/deploy-safe.test.ts` | PASS | 6 pass, 2 skipped (gated) |
| `pnpm --filter @call-it/scripts exec vitest run test/fire-synthetic-alert.test.ts` | PASS | 4/4 tests pass |
| `pnpm --filter @call-it/relayer test test/stylus-deactivation-watcher.test.ts` | PASS | 4/4 tests pass |
| All 8 markdown files exist + meet minimum line counts | PASS | stylus-reactivation: 189, multisig-promotion: 187, relayer-key-rotation: 197, env-diff-ritual: 159, nft-twap-sanity: 108, settlement-stuck: 166, better-stack-dashboards: 206, demo-seed-plan: 170 |
| `#manual-rep-compensation` anchor in relayer-key-rotation.md | PASS | Grep confirms presence |
| All 5 dashboards by name in better-stack-dashboards.md | PASS | 5 matches for 5 dashboard names |
| D-17 private-access note in better-stack-dashboards.md | PASS | 3 grep matches |
| All 6 contracts in multisig-promotion.md | PASS | 13 grep matches for contract names |
| `forceSettle + GraphQL + failed-tx-rate` in settlement-stuck.md | PASS | 12 matches (≥3 required) |
| `cron: '0 12 * * *'` in synthetic-alert.yml | PASS | 1 match |
| `workflow_dispatch` in synthetic-alert.yml | PASS | 2 matches |
| `getUpdates` in fire-synthetic-alert.ts | PASS | 8 matches |
| `stylus-calendar.json` all 4 event_t* fields present | PASS | JSON validated |
| `SET NX` + `stylus:alert-fired` in deactivation-watcher | PASS | 2 matches |
| `sendAlert.*stylus_reactivation` in deactivation-watcher | PASS | 1 match |
| Sepolia Safe deployment (live) | DEFERRED | Hardware Ledger required |
| Calendar events (live) | DEFERRED | GOOGLE_CALENDAR_OAUTH_TOKEN required |
| Synthetic alert CI cron (live) | DEFERRED | GitHub Secrets required (Plan 00-05) |
| Better Stack dashboards (live) | DEFERRED | BETTERSTACK_SOURCE_TOKEN + relayer deploy |

## Self-Check: PASS

All automated checks pass. Four operator-provisioning items deferred (require hardware wallet, OAuth tokens, and deployed services — not code defects).
