---
phase: 0
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-21
---

# Phase 0 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Sourced from `00-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (Solidity)** | Foundry (`forge test`) — pinned via `foundry-rs/foundry-toolchain@v1` |
| **Framework (TS)** | Vitest 1.x (ESM-native, viem-friendly; installed Wave 0) |
| **Framework (Stylus)** | `cargo stylus check` + Motsu (OpenZeppelin Stylus testing) |
| **Framework (subgraph)** | Matchstick (`graph test`) |
| **Framework (E2E)** | Playwright (skeleton only in Phase 0; full QA gate lands Phase 7) |
| **Config file (root)** | `turbo.json` — pipeline `test` task per package |
| **Config file (per package)** | `vitest.config.ts` per TS package; `foundry.toml` for contracts; `Cargo.toml` for Stylus |
| **Quick run command** | `pnpm turbo run test --filter=<package>` |
| **Full suite command** | `pnpm turbo run lint test build` |
| **Estimated runtime** | ~3–5 min full suite for Phase 0 |

---

## Sampling Rate

- **After every task commit:** Run `pnpm turbo run test --filter=<affected-package>` (typically <30s for unit tests of the touched package)
- **After every plan wave:** Run `pnpm turbo run lint test build` (~3–5 min full pipeline)
- **Before `/gsd-verify-work`:** Full suite must be green + 3 grep guards pass + 1 successful synthetic-alert daily cron run + Safe deploy dry-run logs verified
- **Max feedback latency:** 30 seconds per-task; 5 minutes per-wave

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| OPS-01 | Subgraph schema deploys to Studio | integration | `pnpm --filter @call-it/subgraph deploy:sepolia --dry-run` | ❌ W0 | ⬜ pending |
| OPS-02 | Polled-events fallback runs against local anvil | integration | `pnpm --filter @call-it/relayer test:polled-events` | ❌ W0 | ⬜ pending |
| OPS-03 | Subgraph schema includes all 23 entity types | unit | `pnpm --filter @call-it/subgraph test:schema` | ❌ W0 | ⬜ pending |
| OPS-05 | Pino logs emit structured fields | unit | `pnpm --filter @call-it/relayer test:logger` | ❌ W0 | ⬜ pending |
| OPS-06 | 5 Better Stack dashboards exist | manual | Operator visually verifies in Better Stack UI | n/a | ⬜ pending |
| OPS-07 | Telegram alert routes settle-fail to P0 | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=settleFailed` | ❌ W0 | ⬜ pending |
| OPS-08 | Telegram alert routes pause to P0 | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=paused` | ❌ W0 | ⬜ pending |
| OPS-09 | Telegram alert routes disputeRaised to P0 | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=disputeRaised` | ❌ W0 | ⬜ pending |
| OPS-10 | Telegram alert routes paymaster 80% to P1 | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=paymaster80` | ❌ W0 | ⬜ pending |
| OPS-11 | Telegram alert routes TVL approach to P1 | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=tvlApproach` | ❌ W0 | ⬜ pending |
| OPS-12 | Telegram alert routes RepCalculatedFallback to P0 | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=repFallback` | ❌ W0 | ⬜ pending |
| OPS-13 | Telegram alert routes CallForceSettled to P0 | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=forceSettle` | ❌ W0 | ⬜ pending |
| OPS-14 | Telegram alert routes settle-stuck >25m to P1 | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=settleStuck` | ❌ W0 | ⬜ pending |
| OPS-07..14 | Daily synthetic-alert pipeline end-to-end | integration (CI cron) | `.github/workflows/synthetic-alert.yml` fires + verifies via Telegram getUpdates within 60s | ❌ W0 | ⬜ pending |
| OPS-17 | Per-exchange CEX scraper heartbeat (8 stubs) | unit | `pnpm --filter @call-it/relayer test:cex-heartbeat` | ❌ W0 | ⬜ pending |
| OPS-18 | NFT TWAP sanity-check runbook | manual | Operator review of `docs/runbooks/nft-twap-sanity.md` | n/a | ⬜ pending |
| OPS-19 | KMS signer round-trips against Sepolia | integration | `pnpm --filter @call-it/relayer test:kms-roundtrip` (KMS sign + ecrecover → expected address) | ❌ W0 | ⬜ pending |
| OPS-20 | Demo seed plan documented | manual | Review `docs/demo-seed-plan.md` | n/a | ⬜ pending |
| OPS-21 | Network is Arbitrum mainnet hardcoded (chain ID 42161) | unit | `pnpm --filter @call-it/shared test:networks` | ❌ W0 | ⬜ pending |
| OPS-22 | USDC address single source-of-truth | integration | `.github/workflows/grep-guards.yml` job `usdc-paste` | ❌ W0 | ⬜ pending |
| OPS-23 | Next.js + Privy + wagmi + viem + Tailwind pinned versions | unit | `pnpm --filter @call-it/web test:deps` | ❌ W0 | ⬜ pending |
| OPS-24 | Fastify + BullMQ + Pino installed; /health returns 200 | integration | `pnpm --filter @call-it/relayer test:health` | ❌ W0 | ⬜ pending |
| OPS-25 | RepCalculatedFallback alert links to compensation runbook | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=repFallback --check=link` | ❌ W0 | ⬜ pending |
| OPS-26 | Sponsored campaign owner-allowlist endpoint stub | unit | `pnpm --filter @call-it/relayer test:allowlist-admin` | ❌ W0 | ⬜ pending |
| SAFETY-12 | Solidity pragma `=0.8.30` everywhere | integration | `.github/workflows/grep-guards.yml` job `solidity-pragma` | ❌ W0 | ⬜ pending |
| SAFETY-13 | USDC address hardcoded; `require(token == USDC_ARB)` template | unit | `forge test --match-path test/USDC.t.sol` | ❌ W0 | ⬜ pending |
| SAFETY-15 | Paymaster daily cap counter exists in Redis | unit | `pnpm --filter @call-it/relayer test:paymaster-counter` | ❌ W0 | ⬜ pending |
| SAFETY-16 | Admin endpoint for cap update gated by IAM | unit | `pnpm --filter @call-it/relayer test:paymaster-admin` | ❌ W0 | ⬜ pending |
| SAFETY-17 | Alert fires at 80% cap | unit | `pnpm --filter @call-it/relayer test:paymaster-alert` | ❌ W0 | ⬜ pending |
| SAFETY-58 | Safe 2-of-3 deploys to Sepolia (dry-run) | integration | `pnpm tsx scripts/deploy-safe.ts --network sepolia --dry-run` | ❌ W0 | ⬜ pending |
| SHARE-09 | Fallback OG card renders correct layout (visual regression) | unit (snapshot) | `pnpm --filter @call-it/web test:og-fallback` | ❌ W0 | ⬜ pending |
| SHARE-10 | Fallback serves when real URL 404s | integration | `pnpm --filter @call-it/web test:og-fallback-routing` | ❌ W0 | ⬜ pending |
| SHARE-11 | Fallback renders in <100ms warm (p95 over 100 runs) | unit (benchmark) | `pnpm --filter @call-it/web test:og-fallback-bench` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Greenfield repo — Wave 0 must create all test infrastructure from scratch:

- [ ] `packages/contracts/foundry.toml` — pin `solc_version = "0.8.30"`
- [ ] `packages/contracts/src/constants/USDC.sol` — single source-of-truth constant
- [ ] `packages/contracts/test/USDC.t.sol` — assert constant value
- [ ] `packages/shared/src/constants/{usdc,networks,addresses,pyth-feed-ids}.ts` + Vitest tests
- [ ] `packages/shared/vitest.config.ts`
- [ ] `apps/web/app/api/og/fallback/route.ts` + `apps/web/tests/og-fallback.spec.ts` (Playwright snapshot + benchmark)
- [ ] `apps/relayer/src/index.ts` (Fastify + /health)
- [ ] `apps/relayer/src/kms-signer.ts` + KMS round-trip test
- [ ] `apps/relayer/src/workers/alerts.ts` + 9-event unit tests
- [ ] `apps/relayer/src/lib/redis.ts` (Upstash connection) + paymaster-counter test
- [ ] `apps/relayer/vitest.config.ts`
- [ ] `apps/relayer/Dockerfile` + `apps/relayer/fly.toml`
- [ ] `packages/subgraph/schema.graphql` (23-entity schema derived from spec §12.1–12.5)
- [ ] `packages/subgraph/subgraph.yaml` (sepolia network, stub addresses)
- [ ] `packages/subgraph/src/*.ts` AssemblyScript stubs per contract
- [ ] `.github/workflows/ci.yml` (Turborepo lint + test + build)
- [ ] `.github/workflows/grep-guards.yml` (3 guards: USDC.e paste, pragma, env-network)
- [ ] `.github/workflows/synthetic-alert.yml` (daily cron + verification)
- [ ] `.github/workflows/deploy-{web,relayer,subgraph}.yml`
- [ ] `scripts/fire-synthetic-alert.ts` (CI helper)
- [ ] `scripts/deploy-safe.ts` (Sepolia dry-run)
- [ ] `scripts/seed-calendar.ts` (placeholder Stylus reactivation invites)
- [ ] `scripts/verify-versions.ts` (Wave 0 sanity check vs CLAUDE.md pinned versions)
- [ ] `docs/runbooks/{stylus-reactivation,multisig-promotion,relayer-key-rotation,env-diff-ritual,nft-twap-sanity}.md`
- [ ] `turbo.json`, `pnpm-workspace.yaml`, root `package.json`, `tsconfig.json`, `.env.example`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 5 Better Stack dashboards visible in operator UI | OPS-06 | Better Stack dashboards exist as hosted resources, not code artifacts | Operator logs in to Better Stack, confirms 5 named dashboards exist with correct widget set; one-time post-Wave-4 check |
| NFT TWAP sanity-check runbook written | OPS-18 | Runbook is a markdown document, not executable code | Review `docs/runbooks/nft-twap-sanity.md` for completeness against §13.2 |
| Demo seed plan documented | OPS-20 | Plan is documentation; execution lives in Phase 7.5 smoke test | Review `docs/demo-seed-plan.md` |
| Google Calendar reactivation events seeded | D-13 / Pitfall 17 | Calendar is a hosted resource; programmatic verification requires OAuth in CI | Operator runs `pnpm tsx scripts/seed-calendar.ts` once, then visually confirms 4 events at T-30d/T-15d/T-7d/T-1d in Google Calendar UI |
| Telegram P0 and P1 channels exist + bot has post permission | D-15 | Telegram channels are hosted resources | Operator creates 2 channels in Telegram, adds bot as admin with post permission, records IDs in GCP Secret Manager |
| GCP projects `call-it-sepolia` + `call-it-mainnet` provisioned | D-09 | GCP project provisioning requires operator console action | Operator creates both projects, enables KMS + Secret Manager APIs, creates 5 KMS keys per project |

---

## Validation Sign-Off

- [ ] All 32 phase requirements have automated test or documented manual-only justification
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (Wave 0 ensures coverage)
- [ ] Wave 0 covers all MISSING file references above
- [ ] No watch-mode flags (`--watch` forbidden in CI commands)
- [ ] Feedback latency < 30s for per-task; < 5min for per-wave
- [ ] `nyquist_compliant: true` set in frontmatter after all checkboxes pass

**Approval:** approved 2026-05-21
