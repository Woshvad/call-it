# Phase 0: Foundation — Research

**Researched:** 2026-05-21
**Domain:** Always-live operational infrastructure for an onchain social prediction product (monorepo, CI safety guards, hosted relayer skeleton, subgraph scaffold, OG fallback variant, KMS + Secret Manager wiring, multisig deploy script, observability + Telegram alert pipeline, Stylus reactivation calendar)
**Confidence:** HIGH — stack is fully locked by CLAUDE.md + STACK.md; all Phase 0 work is about *wiring* the locked components, not selecting between alternatives. The only MEDIUM areas are (a) Upstash↔BullMQ command compatibility, (b) the GCP-KMS viem signer wrapper landscape in 2026, and (c) the exact font-loading path inside @vercel/og on Node runtime.

---

## Summary

Phase 0 is the foundation phase. It ships the operational substrate that every subsequent phase EXTENDS rather than REPLACES: pnpm + Turborepo monorepo with 6 packages, exact-version-pinned Solidity + Stylus toolchains, a Fastify + BullMQ + Pino relayer skeleton hosted on Fly.io with Upstash Redis, a subgraph schema scaffold deployed to The Graph Studio for Arbitrum Sepolia, a working OG Fallback variant (SHARE-09) deployable in <100ms with zero on-chain dependency, three CI grep guards that fail builds on USDC.e paste / floating `^0.8.x` pragma / `arbitrum-sepolia` in mainnet env, a Safe 2-of-3 multisig deploy script dry-run-tested on Sepolia with Ledger Nano as deployer, GCP KMS with 5 attestation keys + GCP Secret Manager + separate `call-it-sepolia` / `call-it-mainnet` GCP projects, Better Stack dashboards seeded by synthetic events, 2-channel Telegram alerting (P0/P1) with daily synthetic-event CI verification, and a Stylus reactivation calendar pre-seeded with a placeholder deploy date.

**Primary recommendation:** Build greenfield, but build the whole monorepo skeleton including empty contract source files, empty subgraph mappings, a stubbed Fastify relayer, and the OG Fallback route in Wave 0 — then layer CI guards, KMS wiring, multisig deploy script, and synthetic alert pipeline on top. The phase produces zero user-visible features; its success is that Phase 1 can land a real `CallRegistry.createCall` call and have it (a) compile under exact Solidity `=0.8.30`, (b) emit events that the subgraph mapping is ready to index, (c) get sponsored by the Phase-0-defined paymaster gating layer, (d) settle through the Phase-0-prepared Fallback OG card when its real receipt isn't yet cache-warm, and (e) page the operator via the Phase-0-tested Telegram pipeline when any of OPS-07..14 events fire.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hosting + Region**
- **D-01:** Relayer + OG service host on **Fly.io**. Long-lived workers needed for 30-min Pyth retry, BullMQ jobs, CEX scrapers. Fly Postgres/Upstash pair cleanly.
- **D-02:** Single region: **US-East (iad)**. Hackathon-appropriate; multi-region deferred until traffic justifies.
- **D-03:** Redis: **Upstash serverless** (pay-per-request, ~$5/mo). Works with BullMQ; global edge endpoints; no idle cost.
- **D-04:** Frontend host: **Vercel** (Next.js 16 App Router, Node runtime for any OG endpoint that ends up on the web app).
- **D-05:** Phase 0 uses **default Fly + Vercel domains** for relayer/OG canonical URLs. The `api.callitapp.xyz` / `app.callitapp.xyz` rebrand happens in Phase 7 with OG cache-warm cutover.

**Secret / KMS Strategy**
- **D-06:** Signing keys live in **Google Cloud KMS**. viem GCP-KMS signer wrapper for relayer integration. Spec mandates KMS — env files are forbidden.
- **D-07:** **5 separate KMS keys**, one per attestation type: NFT-TWAP, DefiLlama, CEX, Snapshot/Tally, OAuth-proof. EIP-712 domain includes `attestationType` to bind signatures (Pitfall 7 mitigation).
- **D-08:** Non-signing secrets (Privy app secret, Alchemy API key, RPC URLs, Pinata, Telegram bot token, Better Stack token) live in **GCP Secret Manager**. Injected into Fly at deploy time via a `gcloud secrets versions access` step in the deploy workflow.
- **D-09:** **Separate GCP projects per network**: `call-it-sepolia` and `call-it-mainnet`. No KMS key, secret, or service account is ever reachable from the wrong network. IAM separation hardens Pitfall 5 mitigation beyond the grep guard.

**Multisig + Bootstrap**
- **D-10:** Safe 2-of-3 signer composition: **operator (user) + 2 trusted humans the user controls**, each holding a hardware wallet. Two different hardware-wallet brands across the three signers to harden against single-brand firmware risk.
- **D-11:** Hardware wallet for the Phase 0–5 single-owner deployer key: **Ledger Nano X / S Plus**. Best Foundry/Cast clear-signing for proxy-admin txs and EIP-712. The deployer key is the SAME hardware wallet that becomes one of the 3 multisig signers in Phase 6.
- **D-12:** Domain registration **deferred to Phase 7**. Phase 0–6 ship against Fly + Vercel default domains. Planning, OG canonical URL placeholders, and CI must accept env-variable host substitution rather than hardcoding the eventual domain.
- **D-13:** Stylus reactivation calendar: **Google Calendar invites + Telegram bot duplicate alerts** at T-30d / T-15d / T-7d / T-1d before the 365-day expiry. Calendar invites carry the runbook URL; Telegram fires through the same P0 channel as other critical alerts. Belt + suspenders for Pitfall 17.

**Observability + Alerts**
- **D-14:** Observability platform: **Better Stack** (Logtail + Uptime + Status pages). Pino-native; one vendor for log storage + dashboards + uptime. 5 dashboards: Total TVL, calls/hour, settlement latency, dispute rate, failed-tx rate.
- **D-15:** Telegram alerts route to **two channels**: **P0 (immediate / paged)** for pause / dispute / `CallForceSettled` / `RepCalculatedFallback`; **P1 (digest / informational)** for paymaster 80% / TVL approach / settle-stuck > 25min.
- **D-16:** Synthetic alert pipeline test: **daily CI cron + weekly manual fire**. CI fires a synthetic event (e.g., `paused`, `RepCalculatedFallback`) once per day and fails the build if the alert doesn't arrive in Telegram within 60s.
- **D-17:** Better Stack dashboards are **private (operator + co-signers only)**.

### Claude's Discretion
- **D-18:** Monorepo tooling: **pnpm workspaces + Turborepo** (remote cache via Vercel free tier). 6 packages: `apps/web`, `apps/relayer`, `packages/contracts`, `packages/subgraph`, `packages/shared`, `packages/config` (fixed by success criterion #1).
- **D-19:** CI provider: **GitHub Actions**.
- **D-20:** IPFS pinning in Phase 0: **provision Pinata account + smoke-test a pin only**. Application pinning lands in Phase 7.
- **D-21:** Solidity exact pin enforced as `pragma solidity =0.8.30` (not `^0.8.24` from the constraint text). CI grep guard rejects any other version.

### Deferred Ideas (OUT OF SCOPE)
- Public status page (D-17 dashboards are private in v1; public uptime page is v1.1 candidate).
- Multi-region relayer (D-02 is US-East single; EU multi-region kicks in if traffic justifies post-mainnet).
- MPC signer as third multisig key (Turnkey as the third signer is a v1.1 swap option).
- Turborepo remote cache promotion (start on Vercel free-tier remote cache; promote later if CI slows).
- Per-event-type Telegram channels (D-15 ships 2-channel routing; granular per-event channels are v1.1 polish).
- IPFS application-level pinning (D-20 only smoke-tests Pinata; receipt hash pinning + asset pinning land in Phase 7).
- Real domain registration (D-12 defers `callitapp.xyz` to Phase 7).

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | The Graph subgraph as primary indexed event source from day 1 | Subgraph Studio scaffold; mappings stubbed per-contract |
| OPS-02 | Polled-events fallback during subgraph deploy gaps | `viem.getLogs` polling stub at 5s interval against local anvil |
| OPS-03 | Subgraph indexes the 23 event types from §12.1–12.5 | `schema.graphql` defines all entities; mappings reference real event sigs even when contracts are stubs |
| OPS-05 | Structured relayer logging (Pino or equivalent) | Pino 9.x + Fastify-native integration → Better Stack log source |
| OPS-06 | Metrics dashboard exposes Total TVL, calls/hour, settlement latency, dispute rate, failed-tx rate | 5 Better Stack dashboards seeded with synthetic-event data |
| OPS-07 | Telegram bot alerts on failed `settle()` invocation | Alert bot module wired to P0 channel; verified by daily synthetic CI |
| OPS-08 | Telegram bot alerts on `pause()` invocation | P0 channel; synthetic pause fired daily in CI |
| OPS-09 | Telegram bot alerts on dispute raised | P0 channel |
| OPS-10 | Telegram bot alerts when paymaster daily spend hits 80% of cap | P1 channel; counter lives in Upstash Redis from day one |
| OPS-11 | Telegram bot alerts when TVL approaches cap | P1 channel; `getTvl()` placeholder reads zero in Phase 0 |
| OPS-12 | Telegram bot alerts on `RepCalculatedFallback` firing | P0 channel; synthetic fixture event in CI |
| OPS-13 | Telegram bot alerts on `CallForceSettled` invocation | P0 channel |
| OPS-14 | Telegram bot alerts when settlement stuck >25 min (approaching SLA breach) | P1 channel; settle-watcher uses subgraph + RPC join |
| OPS-17 | Per-exchange CEX scraper resilience — independent + health-reported | 8 scraper module STUBS each emit a `cex_scraper_alive{exchange="..."}` heartbeat; weekly synthetic CI cron lands in Phase 4 but the heartbeat skeleton ships here |
| OPS-18 | NFT TWAP operator runbook with on-chain TWAP sanity-check script | Skeleton runbook in `docs/runbooks/nft-twap-sanity.md`; actual sanity-check script lands in Phase 4 |
| OPS-19 | Relayer signing keys held in KMS / secret manager | GCP KMS with 5 keys, viem signer wrapper proven against a Sepolia test tx |
| OPS-20 | Demo seed plan funds 10-15 calls across Privy and external wallets | Seed-plan SKELETON document; actual Sepolia seeding runs in Phase 6 |
| OPS-21 | Network is Arbitrum mainnet hardcoded; not multi-chain in v1 | `packages/shared/constants/networks.ts` with single mainnet entry + Sepolia for staging |
| OPS-22 | Currency is USDC on Arbitrum — hardcoded address in every transfer path | `packages/config/usdc.ts` single source of truth + CI grep guard against `0xff970a61` |
| OPS-23 | Frontend stack: Next.js + React + Privy + wagmi/viem + Tailwind | `apps/web` scaffolded with pinned versions from CLAUDE.md Technology Stack |
| OPS-24 | Backend stack: Node.js + Fastify on Railway or Fly.io | `apps/relayer` scaffolded with Fastify 5.6.1 + BullMQ + Pino; deployed to Fly.io iad |
| OPS-25 | Owner informed of `RepCalculatedFallback` for manual compensation | P0 Telegram alert + runbook reference |
| OPS-26 | Sponsored campaigns — owner-controlled allowlist additions | Allowlist contract slot + admin endpoint deferred to Phase 4; Phase 0 ships the empty admin endpoint + KMS-protected ownership pattern |
| SAFETY-12 | Solidity version pinned (resolved to `=0.8.30` exact per D-21) | `foundry.toml` `solc_version = "0.8.30"` + CI grep guard against `^0.8` |
| SAFETY-13 | USDC address hardcoded; every transfer path enforces `require(token == USDC_ARB)` | `packages/config/usdc.ts` + `packages/contracts/src/constants/USDC.sol` + CI guard |
| SAFETY-15 | Paymaster global daily cap is $50/day at launch | Counter stub in Upstash Redis; ratchet logic + auto-disable wiring stub here, full enforcement in Phase 1 |
| SAFETY-16 | Daily cap owner-tunable via `setPaymasterDailyCap(uint256)` on relayer config | Admin endpoint stub gated by GCP IAM (operator service account only) |
| SAFETY-17 | Telegram alert fires when daily paymaster spend hits 80% of cap | P1 channel; counter increment hooks into alert evaluator |
| SAFETY-58 | Single owner key controls pause / setTvlCap / forceSettle / proxy admin / resolveDispute in v1 | Safe 2-of-3 deploy script dry-run on Sepolia; ownership transfer script template; deployer = Ledger Nano |
| SHARE-09 | Fallback Card "A CALL WAS MADE" — 3px accent border + 4px corner brackets + #09090E bg + CALL IT wordmark Syne 48px + asymmetric hero "A CALL WAS MADE" Syne 64px + by @[handle] + "The receipt is being prepared. Tap to view live." + footer | `apps/web/app/api/og/fallback/route.ts` via @vercel/og + Satori on Node runtime; flexbox-only template; Syne/Space Grotesk/JetBrains Mono fonts shipped from `apps/web/public/fonts/` |
| SHARE-10 | Fallback Card serves when real receipt URL returns 404 OR settled image hasn't regenerated OR OG service is fully down; CDN cache 60 seconds | Vercel `Cache-Control: public, max-age=60, stale-while-revalidate=300` + handler that catches missing-call by returning fallback instead of 404 |
| SHARE-11 | Fallback Card renders in <100ms using stripped template that pulls only `[handle]` from URL | Pure Satori flexbox; fonts pre-loaded from `public/fonts/`; no on-chain reads; no subgraph query; no IPFS fetch; benchmark-tested in CI |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Monorepo workspace + build pipeline | Build tooling (root) | — | pnpm-workspace + Turborepo cache live at repo root, not inside any app |
| Solidity + Stylus toolchains | Contracts package | Foundry CLI | `packages/contracts` owns Foundry config, pragma pin, USDC constant; Rust Stylus crate lives at `packages/contracts/stylus/` |
| CI grep guards (USDC paste, pragma, env-network) | CI (GitHub Actions) | — | Build-failing steps in `.github/workflows/ci.yml`; not lint warnings |
| Frontend skeleton + OG Fallback route | Frontend Server (Vercel Next.js Node runtime) | — | OG is a Next.js API route; Node runtime mandatory per CLAUDE.md (Satori + resvg-wasm bundle issues on edge) |
| Relayer skeleton (Fastify + BullMQ + Pino) | API / Backend (Fly.io) | — | Long-lived workers + 30-min Pyth retry preclude Vercel functions |
| Redis (BullMQ backing + paymaster counter) | Backend storage (Upstash serverless) | — | Per D-03; serverless Redis-protocol endpoint |
| Subgraph schema + mappings stub | Indexer (The Graph Studio, Arbitrum Sepolia in Phase 0) | viem polled-events fallback | Studio for dev; Decentralized Network promotion lands in Phase 7 |
| Signing keys for relayer | KMS (GCP KMS, 5 separate keys) | viem GCP-KMS signer wrapper | Key never leaves KMS; only signature output returns to viem |
| Non-signing secrets (Privy app secret, Alchemy key, RPC URLs, Pinata JWT, Telegram bot token, Better Stack token) | Secret Manager (GCP Secret Manager) | Fly.io deploy-time injection | Two separate GCP projects per network (D-09) |
| Multisig deploy + ownership transfer script | Contracts package + script runner | Safe SDK + Ledger Nano | Phase 0 deploys the Safe but contracts that get owned by the multisig deploy in Phase 1+ |
| Observability platform | Better Stack (Logtail + Uptime + Status) | Pino source on relayer | One vendor for logs + dashboards + uptime; private to operator + co-signers |
| Telegram alerting | Alert bot module in relayer | P0 + P1 channels | Two channels via Telegram Bot API; channel routing decided per event type |
| Stylus reactivation calendar | Google Calendar (T-30/15/7/1 invites) + Telegram bot duplicate alerts | — | Belt + suspenders for Pitfall 17 |
| Pinata smoke-test only | Backend (relayer) | — | Provision account + smoke pin; app-level pinning deferred to Phase 7 |

---

## Standard Stack

### Core (locked by CLAUDE.md Technology Stack section)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | latest (8.x or 9.x) | Monorepo package manager | Required by spec stack; better hoisting + workspace handling vs npm/yarn |
| Turborepo | latest (2.x) | Monorepo build orchestrator + remote cache | Incremental builds; per-affected CI; Vercel free-tier remote cache |
| solc | `=0.8.30` exact (NOT `^0.8.24`) | Solidity compiler | Pre-bug version per STACK.md — avoids 0.8.28–0.8.33 IR storage-clearing bug (fixed in 0.8.34+); pinned in `foundry.toml` and every pragma |
| Foundry | nightly (last stable v1.x May 2026) | Build, test, fuzz, deploy | Forge/Cast/Anvil; native Rust+Solidity fuzzing |
| @openzeppelin/contracts | `5.6.1` | ReentrancyGuard, Ownable2Step, ERC1967Proxy, SafeERC20 | v5 modernized line; Ownable2Step for single-owner-key sensitivity (Pitfall 6 mitigation) |
| stylus-sdk | `=0.10.7` (May 19, 2026) | Stylus contracts toolchain | Stable workspace support; type-safe cross-contract calls via `#[public]` traits |
| cargo-stylus | `0.6.3` | CLI: build, check, deploy, activate, verify | Standard install: `cargo install --force cargo-stylus` + `rustup target add wasm32-unknown-unknown` |
| openzeppelin-stylus | `=0.3.0` (alpha-line) | Stylus-side primitives | Exact pin per STACK.md; alpha line — pin with `=` not `^` |
| Node.js | 22.x LTS | Backend runtime | Both LTS lines support @vercel/og 0.11.1, Fastify 5.6.1, Stylus SDK toolchain |
| Fastify | `5.6.1` | Relayer HTTP server | Better than Express for schema validation + plugin ecosystem; long-running worker model |
| BullMQ | latest | Job queue for Pyth retry, NFT TWAP polling, CEX scrapers | Redis-backed; delayed-job pattern fits Pyth 30-retry × 60s naturally |
| Pino | `9.x` | Structured logging | Fastify-native; Better Stack Logtail consumes Pino directly |
| Upstash Redis | serverless tier | BullMQ backing + paymaster daily counter + DefiLlama cache | Pay-per-request ~$5/mo; global edge endpoints; no idle cost. **VERIFY:** BullMQ requires PUBSUB + blocking commands; Upstash supports both per their 2025 docs but pin verification in Wave 0. |
| viem | `2.50.4` | Server-side chain reads/writes | Same lib as frontend — single dependency surface |
| @vercel/og | `0.11.1` | OG image rendering | Wraps satori@0.26.0 + resvg-wasm; **Node runtime mandatory** (not edge) |
| satori | `0.26.0` | HTML→SVG renderer | **Flexbox-only**; CSS Grid silently misrenders (Pitfall 8 prep) |
| Next.js | `16.2.6` | Frontend + OG host | App Router; `'use client'` at top of provider tree |
| @graphprotocol/graph-cli | `0.98.1` (May 18, 2026) | Subgraph: `graph init/codegen/build/deploy` | Standard; Studio is the only path post-Hosted-Service-sunset (June 2024) |
| @graphprotocol/graph-ts | `0.38.2` | AssemblyScript types for mappings | Pinned by graph-cli compatibility |

### Phase 0 Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| GitHub Actions | n/a | CI runner | All CI guards, deploys, daily synthetic-alert cron |
| ripgrep (`rg`) | runner-bundled | Grep guards in CI | Three guards: USDC.e address, floating `^0.8.x` pragma, `arbitrum-sepolia` in mainnet env |
| @google-cloud/kms | latest (`5.x`) | Node.js client for GCP KMS sign API | Used by viem-kms-signer wrapper [VERIFIED: googleapis.dev/nodejs/kms; package on npm] |
| GCP-KMS viem signer | viem-gcp-kms-signer (`^1.x` from Pre-Web3-Labs / serokell forks) **[ASSUMED]** OR custom 50-line wrapper | viem-compatible Account that delegates `signMessage`/`signTypedData`/`signTransaction` to GCP KMS | `[ASSUMED]` — multiple maintained forks exist (`@cloud-cryptographic-wallet/cloud-kms-signer`, `viem-gcp-kms-signer`), but the canonical 2026 winner needs Wave 0 verification. Fallback: write a 50-line viem `toAccount({ signMessage, signTypedData, signTransaction })` that calls `@google-cloud/kms`'s `asymmetricSign` and reformats the DER signature to viem's `0x{r}{s}{v}` shape. |
| @google-cloud/secret-manager | latest (`5.x`) | Fetch non-signing secrets at relayer boot + at GitHub Actions deploy time | Standard library; `gcloud secrets versions access` in GH Actions |
| @safe-global/protocol-kit | `^4.x` | Programmatically deploy a Safe 2-of-3 + craft transactions | The canonical Safe Wallet SDK [VERIFIED: docs.safe.global] |
| @safe-global/api-kit | `^2.x` | Submit Safe transactions to Safe Transaction Service | For Sepolia dry-run + future ownership-transfer dispatch |
| node-telegram-bot-api | latest | Telegram Bot API client | Simple; supports sendMessage with parse_mode for formatted P0/P1 alerts |
| @logtail/pino | latest | Better Stack Logtail transport for Pino | Direct Pino → Logtail ingestion; one require statement |
| @logtail/node | latest | Optional: direct log API for non-Pino paths (CI scripts) | Used by the synthetic-alert CI script to inject test events |
| zod | `^3.x` | Shared schema validation in `packages/shared/schemas/` | OG input, dispute evidence, social-link, env-config |
| tsx | latest | Run TS files directly (dev + scripts) | Replaces ts-node for relayer dev mode and Foundry-adjacent JS scripts |
| typescript | `5.6+` | Type safety | Standard |
| eslint + @typescript-eslint | latest | Linting | Shared config in `packages/config/eslint/base.js` |
| prettier | latest | Formatting | Shared config in `packages/config/prettier/base.js` |
| Playwright | latest | OG render benchmark + 200px-viewport readability checks (smoke test prep) | Phase 0 ships only the Playwright skeleton; full QA gate lands in Phase 7 |
| eslint custom rule: no-display-grid | TBD (write a 30-line rule in `packages/config/eslint/no-display-grid.js`) | Block `display: grid` in OG template files (Pitfall 15 prep — Satori silently misrenders) | Wave 1 of Phase 0; full enforcement lands in Phase 7 with all 5 variants but the rule is in place from day one |
| husky + lint-staged | latest | Pre-commit hooks for lint + format + grep guards (local mirror of CI guards) | Optional; CI is the source of truth — pre-commit speeds feedback but never substitutes |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pnpm + Turborepo | npm workspaces alone | npm hoisting causes phantom-dep bugs in monorepos; Turborepo's per-affected build is a major CI speedup vs running every package every time |
| Fly.io (iad) | Railway, AWS ECS, GCP Cloud Run | Railway is simpler to operate but Fly.io's global region story + always-on machine model fits the 30-min Pyth retry loop better; AWS ECS / Cloud Run are overkill for hackathon scale (already locked to Fly.io per D-01) |
| Upstash serverless Redis | Fly Postgres + Redis sidecar, Railway Redis, AWS Elasticache | Upstash is pay-per-request with no idle cost; Redis sidecar on Fly is cheap but ops overhead; managed AWS is overkill (locked to Upstash per D-03) |
| GCP KMS + Secret Manager | AWS KMS + Secrets Manager, HashiCorp Vault | AWS is equivalent functionality; user-locked to GCP per D-06/D-08 (Wave 0 should still verify that the GCP KMS asymmetric-sign-with-secp256k1 key type is GA, not preview, in May 2026) |
| Better Stack | Grafana Cloud + Prometheus, Datadog, Highlight.io | Better Stack is cheapest at v1 scale + Pino-native; Grafana Cloud is comparable but more ops overhead; Datadog is overkill at $/month; Highlight.io is newer and less battle-tested (locked to Better Stack per D-14) |
| Safe Wallet 2-of-3 | Aragon DAO, MPC-based multisig (Lit Protocol) | Safe is the dominant Arbitrum multisig; ecosystem maturity makes 2-of-3 the right starting point (locked per D-10) |
| Subgraph Studio → Decentralized Network | Goldsky, Envio, self-hosted Graph Node | The Graph is locked per spec §3060 and CLAUDE.md; Goldsky has faster onboarding but the spec explicitly chose The Graph |
| @vercel/og + Satori | Native canvas + sharp | @vercel/og is faster to ship + better DX; native canvas is faster wall-clock but worse to maintain |
| GitHub Actions | CircleCI, GitLab CI | Industry default; Fly + Vercel both have first-class GH Actions integrations (locked per D-19) |

**Installation (root + per-package):**
```bash
# root
pnpm init
pnpm add -wD turbo typescript prettier eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser tsx husky lint-staged
echo "packages:\n  - 'apps/*'\n  - 'packages/*'" > pnpm-workspace.yaml

# packages/contracts (Foundry init separately; pnpm only for ABI codegen tooling)
cd packages/contracts && forge init --no-git --no-commit
cd ../.. && pnpm add --filter @call-it/contracts @openzeppelin/contracts@5.6.1 forge-std

# packages/contracts/stylus (Rust)
cd packages/contracts/stylus && cargo init --lib
# Cargo.toml additions:
#   stylus-sdk = "=0.10.7"
#   openzeppelin-stylus = "=0.3.0"

# apps/web
cd apps/web && pnpm dlx create-next-app@16.2.6 --typescript --tailwind --app --no-eslint --use-pnpm . --no-git
pnpm add @privy-io/react-auth@3.27.0 @privy-io/wagmi@1.32.5 wagmi@2.18.0 viem@2.50.4 @tanstack/react-query@5.100.11 @vercel/og@0.11.1 satori@0.26.0

# apps/relayer
cd apps/relayer && pnpm init
pnpm add fastify@5.6.1 bullmq pino@9 viem@2.50.4 @google-cloud/kms @google-cloud/secret-manager node-telegram-bot-api @logtail/pino @logtail/node zod @safe-global/protocol-kit @safe-global/api-kit
pnpm add -D tsx typescript @types/node

# packages/subgraph
cd packages/subgraph && pnpm dlx @graphprotocol/graph-cli@0.98.1 init --product subgraph-studio --network arbitrum-sepolia --abi-dir ../contracts/out call-it-sepolia .
# (will be overwritten with real schema.graphql + subgraph.yaml per OPS-03)

# packages/shared, packages/config: blank TS packages; populated as types/schemas/constants land
```

**Version verification (Wave 0 task):**
Before writing any code, verify each pinned version against the npm registry on the build-day:
```bash
npm view solc version
npm view @openzeppelin/contracts version
npm view stylus-sdk version  # NOT on npm — verify via crates.io: cargo search stylus-sdk
npm view openzeppelin-stylus version  # crates.io: cargo search openzeppelin-stylus
npm view next version
npm view @privy-io/react-auth version
npm view @privy-io/wagmi version
npm view wagmi version
npm view viem version
npm view @tanstack/react-query version
npm view fastify version
npm view @vercel/og version
npm view satori version
npm view @graphprotocol/graph-cli version
npm view @graphprotocol/graph-ts version
npm view bullmq version
npm view pino version
npm view @google-cloud/kms version
npm view @google-cloud/secret-manager version
npm view @safe-global/protocol-kit version
npm view @safe-global/api-kit version
```
Document the verified version + publish date. If any pinned version is more than 3 months behind current, surface to discuss-phase rather than silently update.

---

## Architecture Patterns

### System Architecture Diagram

```
                              ┌───────────────────────────────────────────────────────┐
                              │  GitHub repo (call-it/) — pnpm + Turborepo monorepo    │
                              │                                                        │
                              │  apps/                  packages/                      │
                              │  ├─ web/               ├─ contracts/  (Solidity+Stylus)│
                              │  ├─ relayer/           ├─ subgraph/                    │
                              │                        ├─ shared/                     │
                              │                        └─ config/                     │
                              └────────────────────────┬──────────────────────────────┘
                                                       │
                                                       │ push to master / PR
                                                       ▼
                              ┌───────────────────────────────────────────────────────┐
                              │  GitHub Actions CI                                     │
                              │  ├─ ci.yml (lint + test + build per-affected)         │
                              │  ├─ grep-guards.yml (USDC paste / pragma / env-net)   │
                              │  ├─ synthetic-alert.yml (daily cron, fails on no-msg) │
                              │  ├─ deploy-web.yml (→ Vercel on tag/main)             │
                              │  ├─ deploy-relayer.yml (→ Fly.io on tag/main)         │
                              │  └─ deploy-subgraph.yml (→ Studio on tag)             │
                              └────┬───────────────────┬──────────────────┬───────────┘
                                   │                   │                  │
                                   ▼                   ▼                  ▼
            ┌──────────────────────────────┐  ┌───────────────┐  ┌─────────────────┐
            │  Vercel (Next.js 16 web)     │  │  Fly.io iad   │  │  Subgraph Studio│
            │  - Node runtime              │  │  - relayer    │  │  (arbitrum-     │
            │  - /og/fallback (SHARE-09)   │  │    Fastify+   │  │    sepolia)      │
            │  - default *.vercel.app      │  │    BullMQ+    │  │  - stub mappings │
            │                              │  │    Pino       │  │                 │
            │  Secrets injected from       │  │  - alert bot  │  │  Subgraph URL    │
            │  Vercel project envs at      │  │  - OG mirror? │  │  → frontend env  │
            │  build (NEXT_PUBLIC_*) and   │  │  - default    │  │                 │
            │  runtime (server-only)       │  │    *.fly.dev  │  │                 │
            └──────┬───────────────────────┘  └─────┬─────────┘  └──┬──────────────┘
                   │                                │                │
                   │ reads (NEXT_PUBLIC_*)          │ reads          │ reads
                   │                                │ GCP secrets    │ (Studio API key)
                   │                                │                │
                   ▼                                ▼                │
         ┌──────────────────────────────────────────────────────┐    │
         │  GCP project: call-it-sepolia    │  call-it-mainnet  │    │
         │  - KMS keyring "attestations" (5 keys):              │    │
         │      nft-twap / defillama / cex / snapshot-tally /   │    │
         │      oauth-proof                                     │    │
         │  - Secret Manager (Privy app secret, Alchemy key,    │    │
         │      RPC URL, Pinata JWT, Telegram bot token, etc.)  │    │
         │  - Service accounts: GH Actions deployer (read);     │    │
         │      relayer runtime (sign + read)                   │    │
         └──────────────────────────────────────────────────────┘    │
                   │                                                  │
                   │ GCP KMS asymmetric-sign                          │
                   ▼                                                  │
         ┌──────────────────────────────────────────────────────┐    │
         │  Upstash Redis (serverless)                          │    │
         │  - BullMQ queues (Pyth retry, CEX scrape, alert)     │    │
         │  - Paymaster daily counter (key prefix paymaster:)   │    │
         │  - DefiLlama cache                                   │    │
         └──────────────────────────────────────────────────────┘    │
                                                                     │
                              ┌──────────────────────────────────────┘
                              ▼
                    ┌────────────────────────────────┐
                    │  Arbitrum Sepolia (Phase 0)    │
                    │  - Empty contracts deployable  │
                    │    but NOT yet deployed        │
                    │    (CallRegistry stub lands    │
                    │    in Phase 1)                 │
                    │  - Safe 2-of-3 multisig         │
                    │    DRY-RUN-DEPLOYED here       │
                    │    (signers identified;        │
                    │    Ledger Nano is deployer)    │
                    └────────────────────────────────┘

                    ┌────────────────────────────────┐
                    │  Better Stack                  │
                    │  - Logtail source: Fly relayer │
                    │    via @logtail/pino           │
                    │  - 5 dashboards (TVL,          │
                    │    calls/hr, settle latency,   │
                    │    dispute rate, failed-tx     │
                    │    rate) seeded with           │
                    │    synthetic events            │
                    │  - Uptime monitors on          │
                    │    /health (relayer) +         │
                    │    /og/fallback (web)          │
                    └────────────────────────────────┘

                    ┌────────────────────────────────┐
                    │  Telegram Bot (single bot,     │
                    │  2 channels)                   │
                    │  - P0: pause / dispute /       │
                    │    CallForceSettled /          │
                    │    RepCalculatedFallback /     │
                    │    failed settle / Stylus      │
                    │    reactivation T-N            │
                    │  - P1: paymaster 80% / TVL     │
                    │    approach / settle-stuck     │
                    │    >25min                      │
                    └────────────────────────────────┘

                    ┌────────────────────────────────┐
                    │  Google Calendar               │
                    │  - 4 placeholder invites        │
                    │    seeded at T-30d/T-15d/T-7d/ │
                    │    T-1d before placeholder     │
                    │    Stylus deploy date (Phase   │
                    │    5+). Update script repoints │
                    │    invites when real deploy    │
                    │    lands.                       │
                    └────────────────────────────────┘
```

### Recommended Project Structure

```
call-it/
├── apps/
│   ├── web/                                  # Next.js 16, Node runtime
│   │   ├── app/
│   │   │   ├── layout.tsx                    # root layout
│   │   │   ├── providers.tsx                 # 'use client' — Privy/QueryClient/Wagmi stack stub
│   │   │   ├── page.tsx                      # /  (empty placeholder; Phase 1 fills feed)
│   │   │   └── api/
│   │   │       └── og/
│   │   │           ├── fallback/
│   │   │           │   └── route.ts          # SHARE-09 implementation
│   │   │           └── (other variants stubbed; lands Phase 1+)
│   │   ├── public/
│   │   │   └── fonts/                        # Syne, Space Grotesk, JetBrains Mono (.ttf)
│   │   ├── tailwind.config.ts                # Color tokens, neobrutalist
│   │   ├── next.config.ts
│   │   ├── tsconfig.json                     # extends ../../packages/config/tsconfig/next.json
│   │   └── package.json
│   │
│   └── relayer/                              # Fastify backend, Fly.io
│       ├── src/
│       │   ├── index.ts                      # Fastify app + /health endpoint
│       │   ├── env.ts                        # Loads from GCP Secret Manager at boot
│       │   ├── kms-signer.ts                 # viem-compatible signer wrapping @google-cloud/kms
│       │   ├── workers/
│       │   │   ├── alerts.ts                 # Telegram bot module + P0/P1 routing
│       │   │   ├── synthetic-event-handler.ts # Receives test events from CI cron
│       │   │   └── (other workers stubbed: settle-cron.ts, pyth-retry.ts, cex-scrapers/*)
│       │   ├── routes/
│       │   │   └── health.ts                 # GET /health → 200
│       │   └── lib/
│       │       ├── redis.ts                  # Upstash connection
│       │       ├── logger.ts                 # Pino + @logtail/pino
│       │       └── telegram.ts               # Bot send helpers
│       ├── fly.toml                          # iad, always-on machines, sized M
│       ├── Dockerfile
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── constants/
│   │   │   │   └── USDC.sol                  # uint256 constant USDC_ARB_NATIVE = 0xaf88...e5831
│   │   │   └── (CallRegistry.sol etc. — file stubs with pragma + import only)
│   │   ├── stylus/                           # Rust Stylus crate stub
│   │   │   ├── Cargo.toml                    # stylus-sdk = "=0.10.7"
│   │   │   └── src/lib.rs                    # empty pure function placeholder
│   │   ├── test/                             # Foundry test scaffolding only
│   │   ├── script/
│   │   │   ├── DeploySafe.s.sol              # Phase 0: dry-run on Sepolia
│   │   │   └── TransferOwnership.template.s.sol  # Template; populated as contracts exist
│   │   ├── foundry.toml                      # solc_version = "0.8.30" pinned
│   │   ├── remappings.txt
│   │   └── package.json
│   │
│   ├── subgraph/
│   │   ├── schema.graphql                    # All 23 entities (Call, Position, Challenge, Settlement, Profile, RepEvent, Dispute, etc.)
│   │   ├── subgraph.yaml                     # network: arbitrum-sepolia, address fields empty
│   │   ├── src/
│   │   │   ├── call-registry.ts              # AssemblyScript stubs (per-event handler skeleton)
│   │   │   ├── follow-fade-market.ts
│   │   │   ├── challenge-escrow.ts
│   │   │   ├── settlement-manager.ts
│   │   │   └── profile-registry.ts
│   │   ├── abis/                             # symlinks to packages/contracts/out/*.json
│   │   └── package.json
│   │
│   ├── shared/                               # Cross-app types + zod schemas + constants
│   │   ├── src/
│   │   │   ├── constants/
│   │   │   │   ├── usdc.ts                   # USDC_ARB_NATIVE = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
│   │   │   │   ├── addresses.ts              # Per-network contract addresses (empty until Phase 1)
│   │   │   │   ├── networks.ts               # { arbitrum: 42161, arbitrumSepolia: 421614 }
│   │   │   │   └── fees.ts                   # 1.0 / 0.4 / 0.3 / $10 creation
│   │   │   ├── schemas/
│   │   │   │   ├── og-input.ts               # zod for OG route input
│   │   │   │   ├── env-config.ts             # zod for env shape
│   │   │   │   └── synthetic-event.ts        # zod for synthetic alert test events
│   │   │   └── utils/
│   │   │       └── format.ts                 # USDC <-> $ display
│   │   └── package.json
│   │
│   └── config/
│       ├── eslint/
│       │   ├── base.js
│       │   └── no-display-grid.js            # Custom rule blocking display:grid in OG templates
│       ├── prettier/base.js
│       ├── tsconfig/
│       │   ├── base.json
│       │   ├── next.json
│       │   └── node.json
│       └── package.json
│
├── docs/
│   ├── runbooks/
│   │   ├── stylus-reactivation.md            # Pre-seeded with placeholder deploy date
│   │   ├── multisig-promotion.md             # Refers to Phase 6 gate
│   │   ├── settlement-stuck.md               # Stub; populated in Phase 4
│   │   ├── nft-twap-sanity.md                # Stub; populated in Phase 4
│   │   ├── relayer-key-rotation.md           # Live in Phase 0 — KMS rotation procedure
│   │   └── env-diff-ritual.md                # Pre-mainnet checklist
│   └── architecture/                         # Mermaid renders of ARCHITECTURE.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml                            # Turborepo lint + test + build
│       ├── grep-guards.yml                   # The 3 USDC.e / pragma / env-network guards
│       ├── synthetic-alert.yml               # Daily cron — fires test events, fails if Telegram silent
│       ├── deploy-web.yml                    # → Vercel
│       ├── deploy-relayer.yml                # → Fly.io
│       ├── deploy-subgraph.yml               # → Subgraph Studio
│       └── contracts-test.yml                # Foundry + cargo stylus check on contracts/* changes
│
├── scripts/
│   ├── verify-versions.ts                    # Wave 0 — npm view + crates.io check
│   ├── seed-calendar.ts                      # Phase 0 — Google Calendar invites for Stylus reactivation
│   ├── deploy-safe.ts                        # Phase 0 — Safe 2-of-3 dry-run on Sepolia
│   ├── fire-synthetic-alert.ts               # CI helper — emits one of 7 event types
│   └── env-diff.ts                           # Phase 6+ — diffs Vercel/Fly/Studio envs
│
├── turbo.json                                # Pipeline: lint, test, build with per-package deps
├── pnpm-workspace.yaml                       # apps/* + packages/*
├── package.json                              # Root devDeps (turbo, prettier, eslint)
├── tsconfig.json                             # references all packages
├── .env.example                              # All required env vars with comments + placeholders
└── README.md
```

### Pattern 1: Exact-version pin on Solidity pragma (Pitfall 1 + SAFETY-12 mitigation)

**What:** Every `.sol` file uses `pragma solidity =0.8.30;` (exact, not `^`). `foundry.toml` sets `solc_version = "0.8.30"`. CI grep guard rejects any other version.
**When to use:** Every Solidity file in `packages/contracts/src/` from Phase 0 onward.
**Example:**
```solidity
// Source: STACK.md + Solidity 0.8.30 release announcement
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

// Floating ^ in this position blocks the build via grep-guards.yml.
import {USDC_ARB_NATIVE} from "./constants/USDC.sol";
```

```toml
# packages/contracts/foundry.toml
[profile.default]
solc_version = "0.8.30"
optimizer = true
optimizer_runs = 200
via_ir = false   # IMPORTANT: 0.8.30 IR pipeline is pre-bug, but we set via_ir = false explicitly
                  # to make it obvious in code review when someone toggles it. 0.8.34+ fixes
                  # the bug; until then via_ir = true is still risky if our pin ever drifts.
```

### Pattern 2: Single source of truth for USDC address (Pitfall 1 + SAFETY-13 + OPS-22 mitigation)

**What:** Both Solidity and TypeScript import from a single constants module. No inline literals anywhere. CI grep guard fails on USDC.e address (`0xff970a61` case-insensitive).
**Example:**
```typescript
// packages/shared/src/constants/usdc.ts
export const USDC_ARB_NATIVE = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
export const USDC_DECIMALS = 6;
// Negative-test fixture (only place USDC.e may legally appear in src):
export const USDC_E_BRIDGED_DO_NOT_USE = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as const;
```

```solidity
// packages/contracts/src/constants/USDC.sol
// Source: CLAUDE.md "Pinned Addresses" — Arbitrum One native USDC
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

address constant USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
```

CI grep guard `.github/workflows/grep-guards.yml`:
```yaml
- name: USDC.e bridged address paste check
  run: |
    # The bridged USDC.e address must only appear inside packages/shared/src/constants/usdc.ts
    # (as the documented negative-test fixture) — nowhere else.
    if rg --hidden --no-ignore -t sol -t ts -t js -t rs --ignore-case '0xff970a61' \
        --glob '!packages/shared/src/constants/usdc.ts' \
        --glob '!**/node_modules/**' \
        --glob '!**/out/**' \
        --glob '!**/.next/**' \
        ; then
      echo "::error::Bridged USDC.e address found outside the documented negative-test fixture. Use 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (native USDC) instead."
      exit 1
    fi
```

### Pattern 3: GCP-KMS-backed viem signer (OPS-19 + Pitfall 7 mitigation)

**What:** The relayer never holds private key material. All signatures are made via GCP KMS's `asymmetricSign` API. viem sees a normal `Account` object whose `signMessage`/`signTypedData`/`signTransaction` methods are wrappers around KMS calls.
**Why:** Compromise of the relayer VM (Fly machine SSH, container escape, supply-chain attack on a dep) does not yield the signing key — the attacker can sign messages only as long as they hold the GCP service-account credential, which is rotatable + auditable + can be IAM-revoked instantly.
**Example:**
```typescript
// apps/relayer/src/kms-signer.ts
// Source: viem.sh + @google-cloud/kms docs
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { toAccount } from 'viem/accounts';
import {
  hashMessage,
  hashTypedData,
  signatureToHex,
  hexToBytes,
  bytesToHex,
  type Hex,
  type TypedDataDefinition,
} from 'viem';

const kms = new KeyManagementServiceClient();

// Returns a viem Account that signs via GCP KMS for one specific attestation type.
// In Phase 0 we create 5 of these (NFT-TWAP, DefiLlama, CEX, Snapshot/Tally, OAuth-proof).
export function gcpKmsAccount(opts: {
  projectId: string;        // 'call-it-sepolia' or 'call-it-mainnet'
  locationId: string;       // 'global' or 'us-east1'
  keyRingId: string;        // 'attestations'
  keyId: string;            // 'nft-twap' | 'defillama' | 'cex' | 'snapshot-tally' | 'oauth-proof'
  keyVersion: string;       // '1' initially; bump on rotation
  expectedAddress: Hex;     // Verified once at boot — KMS pubkey -> address
}) {
  const versionName = kms.cryptoKeyVersionPath(
    opts.projectId,
    opts.locationId,
    opts.keyRingId,
    opts.keyId,
    opts.keyVersion,
  );

  async function signDigest(digest: Hex): Promise<Hex> {
    const [resp] = await kms.asymmetricSign({
      name: versionName,
      digest: { sha256: hexToBytes(digest) },
    });
    if (!resp.signature) throw new Error('KMS returned empty signature');
    // KMS returns DER-encoded (r,s). Convert to viem-style (0x{r}{s}{v}).
    // v needs ecrecover round-trip to determine — see derToCompact + recoverAddress.
    return derToViemHex(resp.signature as Uint8Array, digest, opts.expectedAddress);
  }

  return toAccount({
    address: opts.expectedAddress,
    async signMessage({ message }) {
      const digest = hashMessage(message);
      return signDigest(digest);
    },
    async signTypedData(td: TypedDataDefinition) {
      const digest = hashTypedData(td);
      return signDigest(digest);
    },
    async signTransaction(/* tx */) {
      throw new Error('Use KMS-backed transaction signer with serializeTransaction + signDigest');
    },
  });
}

// derToViemHex helper: parse DER signature, normalize s (low-S), try both recovery bits,
// pick the one whose recovered address == expectedAddress. ~40 lines; standard pattern.
```

**Why per-attestation-type keys (D-07):** EIP-712 domains include `attestationType` so a signature minted for an NFT-TWAP cannot be replayed as a DefiLlama attestation. Compromise of one key bounds blast radius to that oracle path only. This is documented as a Pitfall 7 mitigation in PITFALLS.md §7.

### Pattern 4: Fly.io always-on machine sizing for long-lived workers (OPS-24 + D-01 wiring)

**What:** `fly.toml` configures the relayer machine to NOT auto-stop/auto-suspend (the default Fly behavior optimizes for cost on idle requests; that's wrong for a worker that runs cron jobs and BullMQ workers).
**Example:**
```toml
# apps/relayer/fly.toml
app = "call-it-relayer"
primary_region = "iad"

[build]
dockerfile = "Dockerfile"

[env]
NODE_ENV = "production"
PORT = "8080"
# Non-secret config — secrets injected separately via `fly secrets set` (sourced from GCP at deploy)

[[services]]
internal_port = 8080
protocol = "tcp"
auto_stop_machines = false   # ★ critical for long-lived BullMQ workers + Pyth retry cron
auto_start_machines = true   # cold-start is fine on first request
min_machines_running = 1     # ★ always at least one machine up

[[services.http_checks]]
interval = "30s"
timeout = "5s"
grace_period = "10s"
method = "GET"
path = "/health"
protocol = "http"

[[services.ports]]
port = 80
handlers = ["http"]
force_https = true

[[services.ports]]
port = 443
handlers = ["tls", "http"]

[[vm]]
cpu_kind = "shared"
cpus = 2
memory_mb = 1024   # Adequate for Fastify + Pino + BullMQ workers + 8 Playwright scrapers (when they land)
                    # If Playwright pushes memory in Phase 4, bump to 2048.
```

### Pattern 5: Telegram 2-channel alert routing (D-15 + OPS-07..14 wiring)

**What:** One Telegram bot, two channel IDs. Event → severity → channel routing happens in a single switch in `apps/relayer/src/workers/alerts.ts`.
**Example:**
```typescript
// apps/relayer/src/workers/alerts.ts
import TelegramBot from 'node-telegram-bot-api';
import { env } from '../env';

const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: false });

export type AlertEvent =
  | 'pause'              // OPS-08 — P0
  | 'dispute_raised'      // OPS-09 — P0
  | 'force_settle'        // OPS-13 — P0
  | 'rep_fallback'        // OPS-12 — P0
  | 'settle_failed'       // OPS-07 — P0
  | 'stylus_reactivation' // D-13   — P0
  | 'paymaster_80'        // OPS-10 — P1
  | 'tvl_approach'        // OPS-11 — P1
  | 'settle_stuck_25m';   // OPS-14 — P1

const P0: ReadonlySet<AlertEvent> = new Set([
  'pause', 'dispute_raised', 'force_settle', 'rep_fallback',
  'settle_failed', 'stylus_reactivation',
]);

export async function sendAlert(event: AlertEvent, payload: Record<string, unknown>): Promise<void> {
  const chatId = P0.has(event) ? env.TELEGRAM_CHAT_ID_P0 : env.TELEGRAM_CHAT_ID_P1;
  const tier = P0.has(event) ? '🚨 P0' : '📊 P1';
  const text = `${tier} *${event}*\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}
```

### Pattern 6: OG Fallback via @vercel/og + Satori on Node runtime (SHARE-09/10/11)

**What:** A Next.js API route at `apps/web/app/api/og/fallback/route.ts` that takes a `?handle=...` query string and renders the §16.6 Fallback card in <100ms. Pure flexbox. Fonts loaded from `apps/web/public/fonts/` at startup. `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
**When to use:** Whenever a real receipt URL would 404 OR settled image hasn't yet regenerated OR OG service is fully down (the wrapping route handler returns the fallback variant instead of 404).
**Example:**
```typescript
// apps/web/app/api/og/fallback/route.ts
// Source: vercel.com/docs/og-image-generation + @vercel/og 0.11.1 API + SPEC §16.6
import { ImageResponse } from '@vercel/og';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs'; // ★ MUST be Node runtime (Satori + resvg-wasm bundling on edge is broken)

// Load fonts ONCE at module init. Read from public/fonts at server start.
const syneBold = readFileSync(path.join(process.cwd(), 'public/fonts/Syne-Bold.ttf'));
const spaceGrotesk = readFileSync(path.join(process.cwd(), 'public/fonts/SpaceGrotesk-Regular.ttf'));
const jetBrainsMono = readFileSync(path.join(process.cwd(), 'public/fonts/JetBrainsMono-Regular.ttf'));

export async function GET(req: Request) {
  const url = new URL(req.url);
  const handle = (url.searchParams.get('handle') ?? '').slice(0, 32); // bound input

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#09090E',
          display: 'flex',              // ★ FLEXBOX ONLY — Satori does not support display: grid
          flexDirection: 'column',
          position: 'relative',
          border: '3px solid #E8F542',  // §16.6 accent border
        }}
      >
        {/* 4 corner brackets */}
        <CornerBracket pos="topLeft" />
        <CornerBracket pos="topRight" />
        <CornerBracket pos="bottomLeft" />
        <CornerBracket pos="bottomRight" />

        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '40px 56px 0 56px' }}>
          <div style={{ fontFamily: 'Syne', fontSize: 48, color: '#E8F542', display: 'flex' }}>CALL IT</div>
          <div style={{ fontFamily: 'JetBrainsMono', fontSize: 12, color: '#94A3B8', display: 'flex' }}>
            arbitrum mainnet
          </div>
        </div>

        {/* Asymmetric hero — ~40% from left */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '80px 56px 0 56px', marginLeft: '5%' }}>
          <div style={{ fontFamily: 'Syne', fontSize: 64, color: '#F1F5F9', display: 'flex', lineHeight: 1.05 }}>
            A CALL WAS MADE
          </div>
          <div style={{ fontFamily: 'SpaceGrotesk', fontSize: 28, color: '#94A3B8', display: 'flex', marginTop: 16 }}>
            by @{handle || 'someone'}
          </div>
        </div>

        {/* Subtext */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '56px 56px 0 56px', marginLeft: '5%' }}>
          <div style={{ fontFamily: 'SpaceGrotesk', fontSize: 18, color: '#94A3B8', display: 'flex' }}>
            The receipt is being prepared.
          </div>
          <div style={{ fontFamily: 'SpaceGrotesk', fontSize: 18, color: '#94A3B8', display: 'flex' }}>
            Tap to view live.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          position: 'absolute', bottom: 32, left: 56, right: 56,
        }}>
          <div style={{ fontFamily: 'SpaceGrotesk', fontSize: 14, color: '#94A3B8', display: 'flex' }}>
            callitapp.xyz · Be right in public.
          </div>
          {/* Arbitrum logo small (text fallback in Phase 0; SVG inline in Phase 7) */}
          <div style={{ fontFamily: 'JetBrainsMono', fontSize: 12, color: '#94A3B8', display: 'flex' }}>
            ⬢ ARBITRUM
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Syne', data: syneBold, style: 'normal', weight: 700 },
        { name: 'SpaceGrotesk', data: spaceGrotesk, style: 'normal', weight: 400 },
        { name: 'JetBrainsMono', data: jetBrainsMono, style: 'normal', weight: 400 },
      ],
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Variant': 'fallback',
      },
    },
  );
}

function CornerBracket({ pos }: { pos: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }) {
  const base = { position: 'absolute' as const, width: 24, height: 24, border: '4px solid #E8F542', display: 'flex' };
  if (pos === 'topLeft')     return <div style={{ ...base, top: 16, left: 16, borderRight: 'none', borderBottom: 'none' }} />;
  if (pos === 'topRight')    return <div style={{ ...base, top: 16, right: 16, borderLeft: 'none', borderBottom: 'none' }} />;
  if (pos === 'bottomLeft')  return <div style={{ ...base, bottom: 16, left: 16, borderRight: 'none', borderTop: 'none' }} />;
  return                            <div style={{ ...base, bottom: 16, right: 16, borderLeft: 'none', borderTop: 'none' }} />;
}
```

**Where do the fonts live?** Self-hosted in `apps/web/public/fonts/`. **[VERIFIED via @vercel/og 0.11.1 docs]** @vercel/og does NOT ship Syne / Space Grotesk / JetBrains Mono bundled — only the default Inter is auto-available. Fonts must be loaded as `Uint8Array` via `fs.readFileSync` at module init time (cold-start cost is amortized across all subsequent renders). Font CDN fetch is possible but adds latency; self-host is the consistent <100ms path.

**Where does the OG Fallback live in Phase 0?** **On the Vercel-hosted Next.js app at `/api/og/fallback`** — NOT on the relayer. Three reasons: (a) @vercel/og is built for Next.js; running it under raw Fastify works but requires more glue; (b) Vercel's Edge Network auto-caches the response globally — no Fly CDN to wire; (c) the Fly relayer's job is long-running workers, not static-card rendering. Per D-05, the canonical URL is `https://<vercel-project>.vercel.app/api/og/fallback?handle=...` until Phase 7's domain cutover.

### Pattern 7: Subgraph schema scaffold from spec events (OPS-01/02/03 wiring)

**What:** `packages/subgraph/schema.graphql` defines all entity shapes derived from §12.1–12.5 even though no contract has deployed yet. `subgraph.yaml` lists each future contract with an empty `address` field (Studio rejects this for actual deploy, so Phase 0 deploys the subgraph against a known-deployed dummy contract on Sepolia — e.g., the existing Sepolia USDC contract — just to prove the deploy pipeline works; the real address field gets populated as each contract lands in Phase 1+). `viem.getLogs` polled-events fallback at 5s interval is wired against local Anvil per success criterion #4.

**Example schema.graphql excerpt:**
```graphql
# packages/subgraph/schema.graphql
# Source: SPEC §12.1–12.5 + ARCHITECTURE.md §2.9

type Call @entity {
  id: ID!   # callId as string
  caller: Bytes!
  marketType: Int!
  stake: BigInt!
  expiry: BigInt!
  status: String!   # 'Live' | 'CallerExited' | 'Settled' | 'Disputed'
  outcome: String
  createdAt: BigInt!
  positions: [Position!]! @derivedFrom(field: "call")
  challenges: [Challenge!]! @derivedFrom(field: "call")
}

type Position @entity {
  id: ID!   # callId-user-side
  call: Call!
  user: Bytes!
  side: String!   # 'FOLLOW' | 'FADE'
  stake: BigInt!
  shares: BigInt!
  entryTime: BigInt!
  claimed: Boolean!
}

type Challenge @entity { id: ID! call: Call! challenger: Bytes! stake: BigInt! status: String! winner: Bytes }
type Settlement @entity { id: ID! call: Call! outcome: String! priceDelta: BigInt settledAt: BigInt! }
type Profile @entity { id: ID! globalRep: Int! categoryRep: [Int!]! settledCalls: Int! wins: Int! losses: Int! twitterHandle: String farcasterHandle: String }
type RepEvent @entity { id: ID! user: Bytes! delta: Int! reason: String! callId: String! fallback: Boolean! }
type Dispute @entity { id: ID! call: Call! disputer: Bytes! evidenceHash: Bytes! bondAmount: BigInt! status: String! }
```

### Pattern 8: Safe 2-of-3 dry-run deploy on Sepolia with Ledger Nano deployer (D-10/D-11 + SAFETY-58)

**What:** A script that uses `@safe-global/protocol-kit` to deploy a Safe 2-of-3 to Arbitrum Sepolia, with the three signer EOAs provided as inputs. The deployer transaction is signed by a Ledger Nano via `viem`'s `createWalletClient({ account: ledgerAccount })`. Phase 0 deploys the Safe but no protocol contracts exist yet — the Safe sits empty, ready to accept ownership in Phase 6.
**Example skeleton:**
```typescript
// scripts/deploy-safe.ts
import Safe, { SafeFactory, SafeAccountConfig } from '@safe-global/protocol-kit';
import { createWalletClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

async function main() {
  const signers = [
    process.env.SAFE_SIGNER_1!, // operator (user) — Ledger A
    process.env.SAFE_SIGNER_2!, // trusted human #2 — Ledger B (different brand recommended per D-10)
    process.env.SAFE_SIGNER_3!, // trusted human #3 — Ledger C
  ];
  // ledgerAccount is constructed via @ledgerhq/hw-app-eth — clear-signing for EIP-712 + tx
  const ledgerAccount = await connectLedger();
  const walletClient = createWalletClient({ account: ledgerAccount, chain: arbitrumSepolia, transport: http(process.env.RPC_URL!) });

  const safeAccountConfig: SafeAccountConfig = { owners: signers, threshold: 2 };
  const safeFactory = await SafeFactory.init({ provider: process.env.RPC_URL!, signer: ledgerAccount.address });
  const safeSdk = await safeFactory.deploySafe({ safeAccountConfig });
  const safeAddress = await safeSdk.getAddress();
  console.log('Safe deployed on Arbitrum Sepolia at:', safeAddress);
  // Verify on Arbiscan Sepolia
  // Save the address to packages/contracts/deployments/safe-sepolia.json for Phase 6 reuse
}
```

**Why dry-run on Sepolia in Phase 0:** Proves the signer composition works, the Ledger signs cleanly, the Safe transaction service accepts the deploy, and the address-saving pipeline is in place. In Phase 6 the same script runs against Arbitrum One with the same three signers (Ledger keys are persistent — same keys on testnet and mainnet for this product).

### Pattern 9: CI synthetic-alert daily cron (D-16 + Pitfall 2 prep)

**What:** A GitHub Actions workflow that runs daily, fires a synthetic Telegram event through the relayer's `/internal/test-alert` endpoint (gated by a CI-only HMAC), and waits up to 60s for a corresponding message in the P0 channel via the Telegram Bot `getUpdates` API. If silent → build fails. This is the build-failing version of "alert pipeline is healthy."

```yaml
# .github/workflows/synthetic-alert.yml
name: Daily synthetic alert
on:
  schedule:
    - cron: '0 12 * * *'  # 12:00 UTC daily
  workflow_dispatch:        # also allow manual fire

jobs:
  fire-and-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - name: Fire synthetic event + wait for Telegram
        env:
          RELAYER_URL: ${{ secrets.RELAYER_URL }}
          RELAYER_INTERNAL_HMAC: ${{ secrets.RELAYER_INTERNAL_HMAC }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID_P0: ${{ secrets.TELEGRAM_CHAT_ID_P0 }}
        run: |
          pnpm tsx scripts/fire-synthetic-alert.ts \
            --event rep_fallback \
            --wait-seconds 60 \
            --expect-chat-id "$TELEGRAM_CHAT_ID_P0"
          # Exit code 1 if message not seen in channel within 60s
```

```typescript
// scripts/fire-synthetic-alert.ts (skeleton)
// 1. Compute timestamp + nonce + HMAC over { event, nonce, timestamp }
// 2. POST { event, nonce, timestamp } to ${RELAYER_URL}/internal/test-alert
//    (relayer verifies HMAC, then calls sendAlert(event, { synthetic: true, nonce, timestamp }))
// 3. Poll Telegram getUpdates with the bot token, scanning P0 channel for a message containing the nonce
// 4. Found within 60s → exit 0; else exit 1
```

### Anti-Patterns to Avoid

- **`display: grid` in OG card templates** — Satori silently misrenders; ESLint custom rule `no-display-grid` enforces flex-only from day one (Pitfall 8 prep).
- **Floating Solidity pragma (`^0.8.x`)** — drifts into the 0.8.28–0.8.33 IR bug. Exact pin `=0.8.30` enforced by grep guard (SAFETY-12).
- **Bridged USDC.e address (`0xFF970A61...DB5CC8`) anywhere except the documented negative-test fixture** — single source of truth + CI guard (Pitfall 1 + SAFETY-13).
- **Signing keys in `.env` files OR `NEXT_PUBLIC_*` envs** — every signature path goes through GCP KMS. The frontend never sees a private key (ARCHITECTURE.md anti-pattern 4).
- **Auto-stopping Fly.io machines** — `auto_stop_machines = false`, `min_machines_running = 1`. Long-lived BullMQ workers cannot tolerate scale-to-zero.
- **Edge runtime for the OG fallback** — Node runtime mandatory per Vercel 2026 guidance; resvg-wasm bundling on edge is broken outside `next/og` adapter.
- **Single GCP project for Sepolia + mainnet** — IAM separation is a layered defense beyond grep guards (D-09).
- **One Telegram channel for all events** — alert fatigue blunts P0 response; 2-channel routing is locked (D-15).
- **`arbitrum-sepolia` in a mainnet env profile** — grep guard catches it; the env-diff ritual in Phase 6 catches what the grep guard misses (Pitfall 5).
- **Per-attestation-type keys re-used** — five separate KMS keys, EIP-712 domain binds attestationType (D-07, Pitfall 7).
- **Hardcoding `callitapp.xyz` in any URL during Phases 0–6** — domain is deferred to Phase 7; every URL must be constructed from env (`NEXT_PUBLIC_OG_BASE_URL`, `RELAYER_URL`) per D-12.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KMS signing wrapper for viem | A custom KMS sign + DER-to-compact reformatter from scratch with no test coverage | `viem-gcp-kms-signer` or `@cloud-cryptographic-wallet/cloud-kms-signer` if either is current in May 2026; ELSE a thoroughly-tested 50-line wrapper around `@google-cloud/kms` `asymmetricSign` that delegates to `viem`'s `toAccount({ signMessage, signTypedData })`. Critical that the wrapper has Sepolia round-trip tests on every PR. | DER parsing + low-S normalization + recovery-bit search has subtle bugs; getting it wrong silently produces invalid signatures that revert on-chain. **[ASSUMED]** — Wave 0 must verify which library is current. |
| Multisig deployment | Manual Safe UI clicks for the 2-of-3 deploy | `@safe-global/protocol-kit` + `@safe-global/api-kit` programmatic deploy | Reproducible; CI-testable; works the same on Sepolia and mainnet. |
| Subgraph mappings boilerplate | Writing entity codegen by hand | `graph codegen` from `@graphprotocol/graph-cli` | AssemblyScript bindings are auto-generated from schema.graphql + ABIs; hand-written drifts. |
| OG image rendering | Native canvas + sharp from scratch | `@vercel/og` 0.11.1 (wraps Satori + resvg-wasm) | Standard for the 2026 ecosystem; <100ms render budget is met out of the box. |
| Telegram bot framework | A custom HTTP poller of `getUpdates` | `node-telegram-bot-api` | Polling + retry + message-formatting + reply-to-thread support out of the box. |
| Pino → Better Stack integration | Custom HTTP shipper from Pino streams | `@logtail/pino` transport | One require statement; structured fields preserved end-to-end. |
| BullMQ Redis backing on Upstash | Custom Redis client + own job state machine | BullMQ over Upstash (verify Upstash command-set compat in Wave 0) | BullMQ handles retries, delays, dead-letter queues, concurrency limits — all proven. |
| Pre-commit USDC paste / pragma guards | A custom Node script that walks files | `ripgrep` (`rg`) inside a `.github/workflows/grep-guards.yml` job | rg is fast + handles gitignore + glob patterns natively. CI is the source of truth; local pre-commit is optional convenience. |
| Safe ownership-transfer script | A bespoke Foundry script per contract | A templated Foundry script in `packages/contracts/script/TransferOwnership.template.s.sol` populated by codegen per deployment manifest | Reusable; deterministic; testable on Sepolia before mainnet. |
| Ledger Nano EIP-712 signing | A custom WebHID dance | `@ledgerhq/hw-app-eth` + `viem`'s `toAccount` with custom `signTypedData` calling Ledger's `signEIP712Message` | Clear-signing supported; viem integration is well-documented. |
| Calendar reminder seeding | Outlook/iCal manual creation | A `scripts/seed-calendar.ts` that uses the Google Calendar API with the operator's OAuth token (one-time setup) | Reproducible; updateable when real deploy date lands. |

**Key insight:** Phase 0 is plumbing. Custom solutions for plumbing problems leak operationally (key rotation breaks, alert pipeline silently dies, Safe deploy fails on edge cases). Use the maintained library every time; the only thing worth hand-rolling is the very thin glue between two libraries, and that glue should have a synthetic-CI test (per D-16 pattern) so silent breakage fails the build.

---

## Common Pitfalls

### Pitfall A: Upstash BullMQ command-set incompatibility (HIGH priority Wave 0 check)
**What goes wrong:** BullMQ requires Redis blocking commands (`BRPOPLPUSH`, `BLPOP`) and `SUBSCRIBE`/`PSUBSCRIBE` for event notifications. Upstash's serverless tier historically had subsets of these commands. If BullMQ workers silently degrade to polling (or fail entirely), settle retries don't fire, paymaster counters drift, and CEX scrapers never tick.
**Why it happens:** Upstash's serverless tier was originally designed for stateless-function workloads (Vercel functions, Cloudflare Workers) — long-running connections weren't first-class. Their 2024-2025 docs added BullMQ support, but the exact commands supported on the free / pay-per-request tier vs the pro tier need verification.
**How to avoid:**
- **Wave 0 task:** Spin up Upstash free-tier instance + a minimal BullMQ producer/consumer + run for 5 minutes. Verify delayed jobs (`add({ delay: 5000 })`) execute, that blocking pops work, and that `QueueEvents` PUBSUB fires. If any fails → upgrade to Upstash Pro (~$10/mo) OR swap to Fly Redis sidecar (~$5/mo).
- **Fallback design:** if Upstash limitations persist, BullMQ is portable — only the Redis URL changes.
**Warning signs:** Delayed Pyth retries don't fire at 60s; `QueueEvents` listeners never receive `completed`/`failed` events.
**Recovery:** Swap the Redis URL to a Fly Redis instance; BullMQ is unaware of the change. Cost: ~$5/mo.

### Pitfall B: GCP KMS asymmetric-sign secp256k1 not in expected region or expensive
**What goes wrong:** The relayer needs `signMessage` calls at sub-200ms p95 to keep settle latency under SLA. GCP KMS asymmetric-sign latency is region-bound (us-east1 → Fly iad is ideal; us-central1 → iad adds ~15ms; eu-* → iad adds ~80ms). Also, GCP KMS asymmetric-sign costs $0.03 per 10K operations + $0.06 per key-version per month — at ~1000 daily signs, that's $0.003/day operations + $0.30/key/month × 5 keys = $1.50/month. Cheap, but verify pricing didn't change in 2026.
**Why it happens:** Easy to provision the KMS keyring in `global` location for convenience — that adds latency. Pricing surprises happen on hidden line items (HSM-backed keys cost ~5× more than software).
**How to avoid:**
- Provision keyring in `us-east1`, NOT `global` (or `us-central1`). Wave 0 measures p95 sign latency from Fly iad to GCP us-east1 — expect <30ms.
- Use software-backed (not HSM-backed) keys for v1. HSM (~$1/key/month) is justified at v1.1+ scale; software is fine for hackathon volume.
- Set `protection_level = SOFTWARE` + `algorithm = EC_SIGN_SECP256K1_SHA256` explicitly when creating each key.
**Warning signs:** p95 settle latency creeps up; KMS bill comes in higher than expected.
**Recovery:** Recreate keys in the right region; rotate gradually using viem's per-keyVersion bumping.

### Pitfall C: Stylus reactivation calendar invites pinned to a placeholder date that never gets updated
**What goes wrong:** Phase 0 ships 4 Google Calendar invites at T-30d/T-15d/T-7d/T-1d before a placeholder Stylus deploy date (e.g., "2026-07-01"). When Stylus actually deploys (Phase 5+) on a different date, nobody updates the calendar. The T-30d alert fires for the wrong cycle.
**Why it happens:** The placeholder is set once and forgotten. Phase 5 work doesn't have "update Stylus reactivation calendar" on its checklist.
**How to avoid:**
- **Make the calendar invites self-deactivating.** The script that creates them stores the calendar event IDs in `packages/shared/src/constants/stylus-calendar.json`. Phase 5 has a hard task: "Run `pnpm tsx scripts/repoint-calendar.ts <real-deploy-block-timestamp>`," which updates all 4 invites to the real T-30/15/7/1 from the actual activation timestamp queried from the Stylus contract on-chain. The task is enforced as a Phase 5 success criterion.
- **Telegram alert is the second belt** — even if calendar is wrong, the relayer's daily check polls `arbitrumActivationExpiry(stylusAddress)` and fires P0 alerts independently when <30/15/7/1 days remain. (D-13: "belt + suspenders".)
**Warning signs:** Phase 5 ships, calendar shows wrong dates, nobody notices because Telegram alerts at the right time anyway. Phase 0 placeholder is forgotten.
**Recovery:** `scripts/repoint-calendar.ts` always works; can be re-run whenever drift is detected.

### Pitfall D: Synthetic alert CI cron runs but doesn't actually verify the message landed
**What goes wrong:** The CI script fires the synthetic event but doesn't actually check Telegram. The build "passes" while the pipeline is broken.
**Why it happens:** Asynchronous verification is hard to write correctly. Easier to write `fetch('/internal/test-alert') → assert 200` and call it verified.
**How to avoid:**
- The verification step uses Telegram Bot API's `getUpdates` to read recent messages in the P0 channel and matches against a UUID-nonce embedded in the synthetic payload. Exit non-zero if the nonce isn't found within 60 seconds.
- Bot needs `can_read_all_group_messages = true` permission via BotFather to read its own channel messages. Wave 0 task to set this.
- Idempotency: each daily run uses a fresh nonce. Old nonces are ignored.
**Warning signs:** The CI workflow shows green daily but nobody can recall actually receiving a synthetic Telegram message recently.
**Recovery:** Audit the verification logic; ensure it cannot silently pass when Telegram fails.

### Pitfall E: Vercel env vars for the OG Fallback drift between Preview and Production
**What goes wrong:** Per Pitfall 5, Vercel's Preview vs Production environment-variable namespaces are independent. A `NEXT_PUBLIC_OG_BASE_URL` set to a Sepolia subgraph URL in Preview accidentally promotes to Production when "Promote to Production" runs without a manual env check.
**Why it happens:** Vercel's "Promote" UI flips the deployment artifact but doesn't compare env-var snapshots. The bundled artifact has the right `NEXT_PUBLIC_*` for whichever branch was deploying.
**How to avoid:**
- The OG fallback route uses ZERO `NEXT_PUBLIC_*` env vars — it has no on-chain dependency, no subgraph query, and no relayer call. The only input is the `?handle=...` query string. This makes the route immune to env-var drift.
- For other routes (Phase 1+), CI step asserts that `NEXT_PUBLIC_NETWORK === 'mainnet'` env in production has `NEXT_PUBLIC_CHAIN_ID === '42161'` and no `421614` substring anywhere in the bundled `.next/static/` output.
**Warning signs:** OG fallback works fine; other share previews break on Production but work on Preview.
**Recovery:** Audit Vercel env page; fix the offending var; redeploy.

### Pitfall F: Fonts not bundled at build, fail to render in serverless Vercel function cold-start
**What goes wrong:** `readFileSync` at module init works locally but Vercel's build doesn't include `public/fonts/*.ttf` in the serverless function bundle. Fonts fail to load on cold start, OG render falls back to default Inter (no Syne, no neobrutalist branding).
**Why it happens:** Vercel's bundler is selective about what it includes from `public/` for API routes — the route's code doesn't reference the files at the URL level so they're excluded.
**How to avoid:**
- Use Next.js's recommended pattern: place font files at `app/fonts/*.ttf` (NOT `public/fonts/`), import with relative paths, or use `next/font/local`. Vercel's bundler tree-shakes correctly.
- Alternative: bundle fonts as base64 strings via a build step that reads `.ttf` → `Uint8Array` → committed as `.ts` files. Trade-off: larger bundle, but cold-start-safe.
- **[VERIFIED via @vercel/og docs]** Vercel recommends fetching fonts from a URL during build with `experimental-edge` runtime (NOT for our Node runtime case), OR using `next/font/local`. For Node runtime, the canonical pattern in 2026 is to commit the font bytes inline.
**Warning signs:** OG fallback renders the right content with the wrong font on Vercel; works locally.
**Recovery:** Move fonts to `app/fonts/` or base64-encode them; redeploy.

### Pitfall G: Better Stack dashboards seeded only with synthetic data look broken until real data lands
**What goes wrong:** In Phase 0, the relayer emits zero real Pino events because no contracts exist. The 5 Better Stack dashboards (TVL, calls/hr, settlement latency, dispute rate, failed-tx rate) read empty — "no data." Operator can't tell if dashboards work or are just empty.
**Why it happens:** Phase 0 is pure infrastructure; the data sources are mostly empty.
**How to avoid:**
- The synthetic-event CI cron also emits synthetic Pino log lines tagged `synthetic=true` that populate dashboards with mock data. Dashboards have a "exclude synthetic" toggle.
- Each dashboard panel has a "last updated" timestamp; if no events in last 24h, panel shows a "WAITING FOR DATA" placeholder rather than an empty chart.
- Wave 0 task: confirm each dashboard renders the synthetic point after a single fire from the CI script.
**Warning signs:** Operator demos a dashboard to a stakeholder, dashboards look broken, stakeholder loses confidence in observability.
**Recovery:** Add the synthetic-data injection step; document the "exclude synthetic" toggle.

---

## Code Examples

(Detailed examples shown inline above in Architecture Patterns sections 1–9.)

Key file:line references for the planner:
- USDC single-source-of-truth: `packages/shared/src/constants/usdc.ts` + `packages/contracts/src/constants/USDC.sol`
- Solidity pragma pin: `packages/contracts/foundry.toml` line `solc_version = "0.8.30"` + every `*.sol` file line 2
- KMS signer wrapper: `apps/relayer/src/kms-signer.ts`
- Telegram routing: `apps/relayer/src/workers/alerts.ts`
- OG Fallback route: `apps/web/app/api/og/fallback/route.ts`
- Fly.io machine config: `apps/relayer/fly.toml`
- Synthetic alert CI: `.github/workflows/synthetic-alert.yml` + `scripts/fire-synthetic-alert.ts`
- Grep guards: `.github/workflows/grep-guards.yml`
- Safe deploy script: `scripts/deploy-safe.ts`
- Calendar seed: `scripts/seed-calendar.ts`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Solidity `^0.8.24` floating pragma | Exact pin `=0.8.30` | Feb 2026 (0.8.34 IR bug fix shipped; 0.8.30 confirmed safe by avoiding the bug range entirely) | Build determinism; avoids 0.8.28–0.8.33 IR storage-clearing bug |
| Stylus SDK 0.9.x | `stylus-sdk = =0.10.7` | March/May 2026 | Stable workspace support; type-safe cross-contract calls |
| OG image rendering on Vercel edge | Node runtime mandatory | 2025-2026 (Vercel official guidance) | resvg-wasm bundling pain on edge outside next/og adapter |
| The Graph Hosted Service | Subgraph Studio → Decentralized Network | June 12, 2024 (sunset) | Phase 0 deploys to Studio for Sepolia; Phase 7 promotes to Decentralized Network |
| Reservoir NFT API | Alchemy NFT API + relayer-computed TWAP | October 15, 2025 (Reservoir sunset) | Spec already corrected; documented in CLAUDE.md "What NOT to Use" |
| Bridged USDC.e on Arbitrum | Native USDC (`0xaf88d065...e5831`) | 2023 (Circle CCTP launch); reinforced 2024 | Per spec §10.5 + Pitfall 1 — single source-of-truth + CI guard |
| Privy `wagmi-connector` (v1-only) | `@privy-io/wagmi` (no `-connector`) | Privy 3.0 release line | v3 broke v2 imports; do not mix v2 examples |
| Manual deploy ritual on mainnet day | GitHub Actions deploy workflows with env-snapshot pre-check | Industry default since 2023 | Phase 0 establishes the workflows so Phase 7 mainnet day is mechanical |
| MATIC/USD Pyth feed | POL/USD Pyth feed | 2024 (Polygon migration) | Spec correction landed; Phase 4 wiring uses POL |
| RNDR/USD Pyth feed | RENDER/USD Pyth feed | 2024 (token migration) | Spec correction landed; Phase 4 wiring uses RENDER |

**Deprecated/outdated:**
- Hardhat alone for contract development (Foundry is the modern standard; Hardhat-Foundry plugin used only for JS-side scripting; not needed in Phase 0).
- Vercel Functions for long-running workers (5-15 min limit on hobby/pro tiers; the 30-min Pyth retry needs Fly.io).
- ENV files for relayer signing keys (KMS mandatory per spec; D-06).
- Single Telegram channel for all alerts (D-15 mandates 2-channel routing).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A maintained `viem-gcp-kms-signer` (or equivalent) package exists in May 2026 and works with viem 2.50.4 | Standard Stack, Pattern 3 | If absent, write a 50-line custom wrapper around `@google-cloud/kms` `asymmetricSign` — known pattern, but takes a day instead of an hour. Tests must catch DER/low-S/recovery-bit edge cases. |
| A2 | Upstash serverless Redis supports BullMQ blocking commands + PUBSUB in 2026 | Standard Stack (Upstash + BullMQ) | If not: swap Redis backend to Fly Redis sidecar (~$5/mo). Code is portable. Wave 0 validation task required. |
| A3 | GCP KMS asymmetric-sign secp256k1 latency from Fly.io iad to GCP us-east1 is <30ms p95 | Pitfall B | If higher: settle latency creeps up; mitigate by caching frequent signatures or batching. Wave 0 measurement task required. |
| A4 | Vercel's @vercel/og 0.11.1 on Node runtime can render the Fallback card in <100ms with self-hosted Syne/SpaceGrotesk/JetBrainsMono fonts | Pattern 6, SHARE-11 | If render time exceeds 100ms: bundle base64 fonts inline; if still slow, pre-render the static portion once and only substitute `[handle]`. Phase 0 Wave 0 benchmark task. |
| A5 | The "synthetic event endpoint" pattern (`/internal/test-alert` gated by CI HMAC) is sufficient to verify the Telegram alert path without false positives | Pattern 9, D-16 | If false negatives (alert fires but verification step misses it): refine matching nonce window; add Better Stack as a secondary verification (logs show the synthetic event was processed). |
| A6 | Google Calendar API write access works with the operator's OAuth token in a one-time setup; reinvocation can update events | Pattern (Stylus reactivation calendar) | If OAuth scope creep: fallback to .ics file generation + manual import per quarter. Acceptable degradation. |
| A7 | Safe `@safe-global/protocol-kit` v4 supports Arbitrum Sepolia deploys in May 2026 | Pattern 8 | If deprecated: use Safe Wallet UI for the Sepolia deploy (one-time manual click); no CI loss because this script runs once in Phase 0 and once in Phase 6. |
| A8 | The two-different-hardware-wallet-brands recommendation (D-10) doesn't increase ops complexity beyond acceptable | Standard Stack (multisig) | If one brand's firmware breaks during demo week: 2-of-3 still functions with the other two; risk is fully mitigated by 2-of-3 design. |
| A9 | Pino + `@logtail/pino` + Better Stack supports all 5 dashboards out of the box without custom log parsing | Architecture (Better Stack) | If dashboards require custom query language beyond Pino's structured fields: more configuration time in Phase 0; not a blocker. |
| A10 | Phase 0 doesn't need IPFS application-level pinning — Pinata smoke-test only is sufficient (D-20) | Deferred Ideas | If Phase 1 needs Pinata immediately (e.g., reasoning text uploads in `createCall`): Phase 0 still provisioned the account + smoke-tested a pin; only the application-level wiring waits until needed. Trade-off captured in D-20. |
| A11 | The OG fallback rendering at <100ms (SHARE-11) on Vercel Node runtime is achievable cold-start; warm-start is trivially under 100ms | SHARE-11 success criterion | Vercel cold-start adds 100-300ms before the function code runs; the <100ms budget refers to the route handler's wall-clock once cold-start completes. Document explicitly in plan: warm-start <100ms; cold-start <500ms total. If unacceptable, set `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` to keep the function warm, or use Vercel's "Pro plan" pre-warming. |

**Several claims tagged `[ASSUMED]` — surface to user during plan-check if any becomes load-bearing.**

---

## Open Questions

1. **Which GCP-KMS viem signer wrapper is current and maintained as of May 2026?**
   - What we know: At least two forks exist (`viem-gcp-kms-signer`, `@cloud-cryptographic-wallet/cloud-kms-signer`); both are likely usable but maintenance status varies.
   - What's unclear: Whether either is published with viem 2.50 peer-dep compatibility.
   - Recommendation: Wave 0 task — `npm view` both packages, check last-publish dates and dependency ranges. If neither current, write a 50-line custom wrapper with Sepolia round-trip test.

2. **Does Upstash serverless support BullMQ's full command set in 2026?**
   - What we know: Upstash docs added BullMQ guidance in 2024-2025.
   - What's unclear: Free-tier vs Pro-tier command coverage; whether `BRPOPLPUSH` works.
   - Recommendation: Wave 0 task — spin up Upstash free instance + minimal BullMQ producer/consumer test. If fails, swap to Fly Redis (~$5/mo).

3. **What's the cold-start p95 for a Vercel Node-runtime API route rendering @vercel/og in May 2026?**
   - What we know: @vercel/og on warm runtime is sub-100ms.
   - What's unclear: Cold-start with font loading from `public/fonts/`.
   - Recommendation: Wave 0 benchmark — deploy a stub fallback route + run 100 cold-fired requests; pick the bundling pattern (`public/fonts` vs `app/fonts` vs inline base64) that meets <500ms cold + <100ms warm.

4. **Does Vercel's @vercel/og 0.11.1 actually work on Next.js 16.2.6 App Router?**
   - What we know: Vercel docs say "yes" but Next.js 16 is recent.
   - What's unclear: Any breaking changes between Next.js 15 and 16 for `ImageResponse`.
   - Recommendation: Wave 0 task — install Next.js 16.2.6 + @vercel/og 0.11.1 + render a hello-world image. If broken, fall back to Next.js 15.x temporarily or wait for @vercel/og's matching release.

5. **What's the minimum Telegram Bot API permission set for `getUpdates` to read messages from the bot's own channel?**
   - What we know: BotFather has a "Group Privacy" toggle; channels require admin rights.
   - What's unclear: Whether `getUpdates` even returns channel posts the bot itself made.
   - Recommendation: Wave 0 task — test the daily synthetic-alert verification with a real Telegram channel; if `getUpdates` doesn't surface own-channel posts, use the Channel's message-id from `sendMessage` response and verify via separate dashboard read.

6. **For the Stylus reactivation calendar, can `scripts/seed-calendar.ts` create events with a deterministic deletion path (so re-running the script in Phase 5 cleans up the placeholder events)?**
   - What we know: Google Calendar API exposes event create/update/delete.
   - What's unclear: Whether the OAuth token's scope at first run is sufficient for delete at later run.
   - Recommendation: One-time OAuth flow grants `calendar.events` scope; script stores event IDs in repo; Phase 5 re-run uses stored IDs to update (not delete) the events.

7. **Where exactly does the polled-events fallback (OPS-02) live in Phase 0?**
   - What we know: It's a viem `getLogs` poll at 5s interval against the contracts.
   - What's unclear: Frontend or relayer? Phase 0 has no UI feed yet.
   - Recommendation: Phase 0 wires the polled-events fallback in `apps/relayer/src/workers/polled-events-fallback.ts` as a stub that polls a known Sepolia contract (e.g., the test USDC). Phase 1 promotes it to poll CallRegistry once that contract exists. Frontend consumes the relayer's emitted events for now; Phase 7 migrates frontend to subgraph as primary.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | All packages | ✓ (assume installed by user; if not, `npm install -g pnpm` or use Corepack) | 8.x or 9.x | — |
| Node.js | Build + runtime | ✓ (assume 22.x LTS) | 22.x LTS | If only 20.x available, document and verify @vercel/og + Fastify 5.6.1 compatibility |
| Rust toolchain + wasm32 target | Stylus crate (`packages/contracts/stylus`) | ✓ if user has it; else `rustup install stable && rustup target add wasm32-unknown-unknown` | stable | Skip Stylus build in Phase 0 (only stub Rust crate needed) |
| Foundry | `packages/contracts/` | ✓ if user has it; else `curl -L https://foundry.paradigm.xyz \| bash && foundryup` | nightly v1.x | — |
| cargo-stylus | Stylus build | Wave 0: `cargo install --force cargo-stylus` | 0.6.3 | Defer Stylus checks to Phase 5; Phase 0 only stubs Cargo.toml |
| `gh` CLI (GitHub Actions setup) | CI provisioning | Likely available | latest | Use GitHub web UI to add secrets if `gh` absent |
| `gcloud` CLI | GCP project + KMS provisioning | User-installable | latest | GCP web console as fallback for one-off setup |
| Docker | Fly.io image builds | User-installable | latest | Required for Fly.io deploy; no fallback |
| `flyctl` | Fly.io app management | User-installable | latest | Required for Fly.io deploy |
| `vercel` CLI | Vercel project management (optional; GH integration is the primary path) | User-installable | latest | Vercel web UI works for initial setup |
| Ledger Nano X / S Plus | Deployer key + multisig signer (D-11) | User-owned hardware wallet | n/a | Required per D-11; no software fallback for hardware-key path |
| Google Calendar API access | Stylus reactivation calendar (D-13) | User's Google account + OAuth grant | n/a | Fallback to `.ics` files + manual import quarterly |
| Telegram bot + 2 channels | Alert pipeline (OPS-07..14) | User must create via @BotFather | n/a | Required; no fallback |
| Better Stack account | Observability (D-14) | User must sign up; ~$25/mo | latest | Wave 0 provisioning task |
| Upstash account | Redis (D-03) | User must sign up; ~$5/mo | serverless | Fallback: Fly Redis sidecar (~$5/mo) if Upstash incompatibility surfaces |
| GCP account + 2 projects (D-09) | KMS + Secret Manager | User must create | n/a | Required; no fallback within D-06/D-08 lock |
| Pinata account | Phase 0 smoke pin only (D-20); application use in Phase 7 | User must sign up; ~$20/mo paid tier OR free tier for Phase 0 smoke | n/a | Free tier sufficient for Phase 0 smoke pin |
| Privy account | Auth (Phase 1+); Phase 0 only provisions the app and stores app secret in GCP | User must sign up | n/a | Phase 0 just creates the Privy app; no integration yet |
| Alchemy account | RPC + NFT API (Phase 4+); Phase 0 only provisions the API key and stores in GCP | User must sign up; free tier sufficient | n/a | Phase 0 just creates account; no usage yet |
| Safe Wallet on Arbitrum Sepolia | Multisig deploy (D-10) | Use `@safe-global/protocol-kit` programmatically | n/a | Manual Safe Wallet UI deploy if SDK breaks |

**Missing dependencies with no fallback:**
- Ledger Nano X / S Plus hardware wallet (D-11 locked; no software substitute).
- GCP account + 2 projects (D-06/D-08/D-09 locked).
- Telegram bot + 2 channels (D-15 locked).

**Missing dependencies with fallback:**
- Upstash Redis → Fly Redis sidecar (Pitfall A path).
- GCP-KMS viem signer library → custom 50-line wrapper (A1).
- Google Calendar API → `.ics` files (A6).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (Solidity) | Foundry (`forge test`) — pinned via `foundry-rs/foundry` toolchain |
| Framework (TS) | Vitest 1.x (Wave 0 install; preferred over Jest for speed + ESM-native + viem-friendly) |
| Framework (Stylus) | `cargo stylus check` + Motsu (OpenZeppelin Stylus testing) |
| Framework (subgraph) | `graph test` (matchstick) |
| Framework (E2E) | Playwright (skeleton only in Phase 0; full QA gate lands Phase 7) |
| Config file (root) | `turbo.json` — pipeline `test` task per package |
| Config file (per package) | `vitest.config.ts` per TS package; `foundry.toml` for contracts; `Cargo.toml` for Stylus |
| Quick run command | `pnpm turbo run test --filter=<package>` |
| Full suite command | `pnpm turbo run lint test build` |
| Phase gate | All checks green + grep guards pass + synthetic alert fired today |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | Subgraph schema deploys to Studio | integration | `pnpm --filter @call-it/subgraph deploy:sepolia --dry-run` | ❌ Wave 0 |
| OPS-02 | Polled-events fallback runs against local anvil | integration | `pnpm --filter @call-it/relayer test:polled-events` | ❌ Wave 0 |
| OPS-03 | Subgraph schema includes all 23 entity types | unit | `pnpm --filter @call-it/subgraph test:schema` (greps schema.graphql for entity names) | ❌ Wave 0 |
| OPS-05 | Pino logs emit structured fields | unit | `pnpm --filter @call-it/relayer test:logger` | ❌ Wave 0 |
| OPS-06 | 5 dashboards exist in Better Stack | manual-only | Operator checks Better Stack UI; one-time verification | n/a |
| OPS-07..14 | Telegram alerts route to correct channel per event type | unit | `pnpm --filter @call-it/relayer test:alerts -- --event=<eventName>` | ❌ Wave 0 |
| OPS-07..14 | Alert pipeline end-to-end | integration (daily CI cron) | `.github/workflows/synthetic-alert.yml` fires + verifies | ❌ Wave 0 |
| OPS-17 | Per-exchange CEX scraper heartbeat | unit | `pnpm --filter @call-it/relayer test:cex-heartbeat` (test that each of 8 stubs emits `cex_scraper_alive{exchange}`) | ❌ Wave 0 |
| OPS-19 | KMS signer round-trips against Sepolia | integration | `pnpm --filter @call-it/relayer test:kms-roundtrip` (KMS sign + ecrecover → expected address) | ❌ Wave 0 |
| OPS-21 | Network is Arbitrum mainnet hardcoded | unit | `pnpm --filter @call-it/shared test:networks` (greps for hard-coded chain ID) | ❌ Wave 0 |
| OPS-22 | USDC address single source-of-truth | integration | `.github/workflows/grep-guards.yml` job `usdc-paste` | ❌ Wave 0 |
| OPS-23 | Next.js + Privy + wagmi + viem + Tailwind installed at pinned versions | unit | `pnpm --filter @call-it/web test:deps` (asserts package.json contains exact versions) | ❌ Wave 0 |
| OPS-24 | Fastify + BullMQ + Pino installed; relayer responds 200 to /health | integration | `pnpm --filter @call-it/relayer test:health` | ❌ Wave 0 |
| SAFETY-12 | Solidity pragma `=0.8.30` everywhere | integration | `.github/workflows/grep-guards.yml` job `solidity-pragma` (rejects `^0.8` in any .sol) | ❌ Wave 0 |
| SAFETY-13 | USDC address hardcoded with require(token == USDC_ARB) | unit | Foundry test `USDC.t.sol` — asserts constant value matches `0xaf88...e5831` | ❌ Wave 0 |
| SAFETY-15 | Paymaster daily cap counter exists in Redis | unit | `pnpm --filter @call-it/relayer test:paymaster-counter` | ❌ Wave 0 |
| SAFETY-16 | Admin endpoint for cap update gated by IAM | unit | `pnpm --filter @call-it/relayer test:paymaster-admin` (asserts 401 without GCP service account; 200 with) | ❌ Wave 0 |
| SAFETY-17 | Alert fires at 80% cap | unit | `pnpm --filter @call-it/relayer test:paymaster-alert` | ❌ Wave 0 |
| SAFETY-58 | Safe 2-of-3 deploys to Sepolia (dry-run) | integration | `pnpm tsx scripts/deploy-safe.ts --network sepolia --dry-run` | ❌ Wave 0 |
| SHARE-09 | Fallback OG card renders correct layout | unit (snapshot test) | `pnpm --filter @call-it/web test:og-fallback` (Playwright + visual regression vs reference PNG) | ❌ Wave 0 |
| SHARE-10 | Fallback serves when real URL 404s | integration | `pnpm --filter @call-it/web test:og-fallback-routing` (mocked 404, asserts fallback served) | ❌ Wave 0 |
| SHARE-11 | Fallback renders in <100ms warm | unit (benchmark) | `pnpm --filter @call-it/web test:og-fallback-bench` (Playwright timing; p95 < 100ms over 100 runs) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm turbo run test --filter=<affected-package>` (typically <30s for unit tests of the touched package)
- **Per wave merge:** `pnpm turbo run lint test build` (full pipeline; ~3-5 min for Phase 0)
- **Phase gate:** Full suite green + 3 grep guards pass + 1 successful synthetic-alert daily cron run + Safe deploy dry-run logs verified

### Wave 0 Gaps
- [ ] `packages/contracts/foundry.toml` — pin `solc_version = "0.8.30"`
- [ ] `packages/contracts/src/constants/USDC.sol` — single source-of-truth constant
- [ ] `packages/contracts/test/USDC.t.sol` — assert constant value
- [ ] `packages/shared/src/constants/usdc.ts` — TypeScript mirror
- [ ] `packages/shared/src/constants/networks.ts`
- [ ] `packages/shared/vitest.config.ts` + `packages/shared/test/networks.test.ts`
- [ ] `apps/web/app/api/og/fallback/route.ts` + Playwright snapshot test in `apps/web/tests/og-fallback.spec.ts`
- [ ] `apps/relayer/src/index.ts` (Fastify + /health)
- [ ] `apps/relayer/src/kms-signer.ts` + KMS round-trip test
- [ ] `apps/relayer/src/workers/alerts.ts` + 9-event unit tests
- [ ] `apps/relayer/src/lib/redis.ts` (Upstash connection) + paymaster-counter test
- [ ] `apps/relayer/vitest.config.ts`
- [ ] `apps/relayer/Dockerfile` + `apps/relayer/fly.toml`
- [ ] `packages/subgraph/schema.graphql` (full 7-entity schema)
- [ ] `packages/subgraph/subgraph.yaml` (sepolia network, stub addresses)
- [ ] `packages/subgraph/src/*.ts` AssemblyScript stubs per contract
- [ ] `.github/workflows/ci.yml` (Turborepo lint + test + build)
- [ ] `.github/workflows/grep-guards.yml` (3 guards: USDC.e paste, pragma, env-network)
- [ ] `.github/workflows/synthetic-alert.yml` (daily cron + verification)
- [ ] `.github/workflows/deploy-web.yml`, `deploy-relayer.yml`, `deploy-subgraph.yml`
- [ ] `scripts/fire-synthetic-alert.ts` (CI helper)
- [ ] `scripts/deploy-safe.ts` (Sepolia dry-run)
- [ ] `scripts/seed-calendar.ts` (placeholder Stylus reactivation invites)
- [ ] `scripts/verify-versions.ts` (Wave 0 sanity check)
- [ ] `docs/runbooks/stylus-reactivation.md`, `multisig-promotion.md`, `relayer-key-rotation.md`, `env-diff-ritual.md`
- [ ] `turbo.json`, `pnpm-workspace.yaml`, root `package.json`, `tsconfig.json`, `.env.example`

*Existing test infrastructure: NONE — greenfield. Wave 0 establishes Foundry + Vitest + Playwright + Matchstick from scratch.*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial — no user auth in Phase 0; relayer ↔ GCP uses service-account credentials | GCP IAM service accounts; no static API keys |
| V3 Session Management | no — no sessions in Phase 0 | n/a |
| V4 Access Control | yes — relayer's `/internal/test-alert` and `setPaymasterDailyCap` admin endpoints | HMAC for CI-only test endpoints; GCP IAM for admin endpoints (service-account-bound) |
| V5 Input Validation | yes — OG fallback handle, synthetic-event payload, all relayer endpoints | zod schemas in `packages/shared/src/schemas/`; reject unknown fields; bound string lengths |
| V6 Cryptography | yes — signing keys, EIP-712 attestations | **Never hand-roll.** GCP KMS for asymmetric sign; viem's `hashTypedData` for EIP-712 hashing; `@safe-global/protocol-kit` for Safe transactions; `@noble/secp256k1` only if used at all (prefer GCP KMS path) |
| V7 Error Handling + Logging | yes | Pino structured logging; never log private keys or full Telegram tokens; redact sensitive fields via Pino's `redact` config |
| V8 Data Protection | yes — secrets in GCP Secret Manager; KMS keys never leave KMS | GCP Secret Manager for env-bound secrets; KMS for signing; no `.env` files for prod secrets |
| V10 Malicious Code | yes — supply chain | pnpm lockfile + `pnpm audit` in CI; pin every dep with `=` for security-critical (KMS, Safe SDK); use Dependabot/Renovate with PR review |
| V14 Configuration | yes — env-config drift is Pitfall 5 | Single `packages/shared/src/schemas/env-config.ts` zod schema; env-diff ritual script; grep guard against `arbitrum-sepolia` in mainnet profile |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Wrong-USDC paste (bridged vs native) | Tampering | Single source-of-truth constant + CI grep guard + post-deploy verification (Pitfall 1) |
| Floating Solidity pragma drifting into 0.8.28–0.8.33 IR bug | Tampering | Exact pin `=0.8.30` + CI grep guard against `^0.8` (SAFETY-12) |
| Env-config drift (Sepolia config on mainnet day) | Tampering / Spoofing | Per-network GCP project IAM + grep guard + env-diff ritual (Pitfall 5) |
| Relayer signing-key compromise | Spoofing / Elevation of Privilege | GCP KMS — keys never leave KMS; per-attestation-type key separation; rotation via key-version bump (OPS-19 + D-07 + Pitfall 7) |
| Single owner-key compromise | Elevation of Privilege | Safe 2-of-3 multisig promoted in Phase 6 (HARD GATE); Phase 0 stages the Safe + ownership-transfer script (D-10/D-11 + SAFETY-58 + Pitfall 6) |
| Alert pipeline silently broken | Repudiation / DoS | Daily synthetic-alert CI cron with HMAC + Telegram getUpdates verification (D-16 + Pitfall D) |
| Internal admin endpoint exposed | Spoofing / Tampering | HMAC for CI test endpoints; GCP IAM service-account binding for operator admin endpoints (no static API keys) |
| Supply-chain attack on relayer Node dep | Tampering | pnpm lockfile committed; `pnpm audit` in CI; pin security-critical deps with `=`; Dependabot/Renovate reviews |
| Vercel env-var Preview→Production leak | Information Disclosure | OG fallback uses zero `NEXT_PUBLIC_*` envs; downstream phases add explicit env-snapshot diff (Pitfall E) |
| Stylus 365-day deactivation silently degrades to fallback | Denial of Service (degraded mode) | Google Calendar + Telegram T-30/15/7/1 belt-and-suspenders (D-13 + Pitfall 17 + Pitfall C) |
| BullMQ on Upstash silently degrades | Denial of Service | Wave 0 validation; fallback to Fly Redis if needed (Pitfall A) |

---

## Project Constraints (from CLAUDE.md)

**Source: `CLAUDE.md` Project + Constraints + Technology Stack + GSD Workflow Enforcement sections.**

1. **Network locked:** Arbitrum mainnet — hardcoded; not multi-chain in v1. Phase 0 supports Arbitrum Sepolia for staging only.
2. **Currency locked:** USDC on Arbitrum at exact address `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (native, NOT bridged). Hardcoded in every transfer path. **CI grep guard fails build on USDC.e paste.**
3. **Solidity locked:** `=0.8.30` exact pin (NOT `^0.8.24` from the constraint text; per D-21 the spec is corrected to exact pin). CI grep guard fails build on any other version (Avoid 0.8.28–0.8.33 IR bug per STACK.md verdict).
4. **Stack locked at exact pinned versions:** stylus-sdk 0.10.7, openzeppelin-stylus 0.3.0 (alpha — pin with `=`), @openzeppelin/contracts 5.6.1, Next.js 16.2.6, @privy-io/react-auth 3.27.0, @privy-io/wagmi 1.32.5 (NOT `-connector`), wagmi 2.18.0, viem 2.50.4, @tanstack/react-query 5.100.11, Fastify 5.6.1, @vercel/og 0.11.1, satori 0.26.0, @graphprotocol/graph-cli 0.98.1, @graphprotocol/graph-ts 0.38.2.
5. **What NOT to use list (verbatim from CLAUDE.md):** Reservoir API (sunset 2025-10), Bridged USDC.e, Solidity 0.8.28–0.8.33 with IR pipeline, `@privy-io/wagmi-connector`, The Graph Hosted Service, Hardhat alone for Stylus, Vercel Functions for relayer, Edge runtime for OG, `display: grid` in OG templates, MATIC/USD feed (use POL), RNDR/USD feed (use RENDER), `delegatecall` to user-controlled addresses.
6. **Pinned addresses:** Native USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`; Pyth on Arbitrum One `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C` (Pyth wiring lands in Phase 4 — Phase 0 stores the address in `packages/shared/src/constants/addresses.ts`).
7. **Pyth feed catalogue:** 25 verified feed IDs from CLAUDE.md (POL replaces MATIC; RENDER replaces RNDR). Phase 0 stores all 25 in `packages/shared/src/constants/pyth-feed-ids.ts` even though Phase 4 is when they're consumed.
8. **Safety patterns mandatory:** Checks-Effects-Interactions, ReentrancyGuard on USDC paths, no `delegatecall` to user-controlled addresses, hardcoded USDC address gate. Phase 0 doesn't deploy contracts but the templates + ESLint/Solhint config must enforce.
9. **Sepolia staging gate:** ≥48h with seeded data before mainnet (Phase 6 enforcement; Phase 0 lays the staging infrastructure).
10. **Post-deploy smoke test:** 20-minute checklist per §19.11 mandatory before public announcement (Phase 7.5 enforcement; Phase 0 lays the env-diff ritual + smoke test pattern).
11. **Stylus build cutoff:** 48 hours before demo — if Rust + Stylus path not working, swap to Solidity baseline in same proxy slot (Phase 5 enforcement; Phase 0 ensures the Solidity baseline path will be reachable from day one of Phase 4).
12. **GSD Workflow Enforcement:** Before using Edit, Write, or other file-changing tools, start work through a GSD command. **This phase is routed via `/gsd-plan-phase` then `/gsd-execute-phase`.** Direct repo edits outside a GSD workflow are forbidden unless explicitly bypassed by the user.

---

## Runtime State Inventory

*Phase 0 is greenfield — no rename / refactor / migration. Section omitted.*

---

## Sources

### Primary (HIGH confidence)
- `CALL_IT_SPEC1.md` §10.5 (USDC mandate), §10.7 (paymaster cap), §10.8 (multisig + Stylus 365d), §11.6 (Stylus try/catch + `RepCalculatedFallback`), §12.1–12.5 (events for subgraph schema), §16.6 (Fallback OG card design with explicit layout/typography/colors), §19 (build order), §19.10 (Sepolia gate), §19.11 (smoke test), App.A.1 (operational requirements line-by-line) — locked spec; source of truth
- `CLAUDE.md` Technology Stack section — pinned versions, addresses, version compatibility matrix; "What NOT to Use" list
- `.planning/research/STACK.md` — TL;DR + pinned versions + version compatibility matrix + Pyth feed catalogue (verified 2026-05-21)
- `.planning/research/ARCHITECTURE.md` — System overview, 6-contract topology, 3 data planes, monorepo layout (`apps/web`, `apps/relayer`, `packages/{contracts,subgraph,shared,config}`), trust boundary inventory, hidden infrastructure
- `.planning/research/PITFALLS.md` — Pitfalls 1 (USDC paste), 2 (Stylus catch unverified), 3 (TVL aggregation), 5 (Sepolia↔mainnet drift), 6 (multisig promotion delay), 7 (KMS / signing key separation), 8 (OG cache desync), 10 (CEX scraper drift), 17 (Stylus reactivation)
- `.planning/research/SUMMARY.md` — TL;DR + 5 deltas (Phase 0 added; multisig in Phase 6; subgraph/OG in Phase 0; Solidity baseline rep in Phase 4; social linking parallel to Phase 2) + operational budget (~$175/mo recurring + ~$150-300 upfront)
- `.planning/phases/00-foundation/00-CONTEXT.md` — User-locked decisions D-01..D-21
- `.planning/REQUIREMENTS.md` — 32 phase requirement IDs (OPS-01..26, SAFETY-12/13/15/16/17/58, SHARE-09/10/11)
- `.planning/ROADMAP.md` Phase 0 — Goal, success criteria (1–6), requirements list, pitfalls mitigated
- [Pyth Network EVM contract addresses](https://docs.pyth.network/price-feeds/contract-addresses/evm) — Arbitrum One contract address
- [Native USDC on Arbitrum (Arbiscan)](https://arbiscan.io/address/0xaf88d065e77c8cC2239327C5EDb3A432268e5831)
- [Solidity 0.8.30 release announcement](https://www.soliditylang.org/blog/2025/05/07/solidity-0.8.30-release-announcement/) and [0.8.34 IR bug fix](https://www.soliditylang.org/blog/2026/02/18/solidity-0.8.34-release-announcement/) — confirms pre-bug 0.8.30 + post-bug 0.8.34 are both safe
- [Stylus SDK 0.10 release](https://github.com/OffchainLabs/stylus-sdk-rs/releases) — May 19, 2026 confirmed
- [The Graph Hosted Service sunset](https://thegraph.com/blog/sunsetting-hosted-service/) — June 12, 2024
- [Subgraph Studio docs](https://thegraph.com/docs/en/subgraphs/) — Studio is the only path
- [Vercel OG edge-vs-node guidance](https://vercel.com/docs/og-image-generation) — Node runtime preferred 2026
- [Satori CSS support](https://github.com/vercel/satori) — flexbox-only; the most-cited gotcha
- [Safe Wallet protocol-kit docs](https://docs.safe.global/sdk/protocol-kit) — programmatic Safe deploy
- [Fly.io machine configuration](https://fly.io/docs/reference/configuration/) — `auto_stop_machines = false` + `min_machines_running = 1`

### Secondary (MEDIUM confidence)
- [Upstash BullMQ guide](https://upstash.com/docs/redis/integrations/bullmq) — supports BullMQ; Wave 0 verification still needed (Pitfall A)
- [Better Stack Pino integration](https://betterstack.com/docs/logs/pino/) — `@logtail/pino` transport
- [Telegram Bot API getUpdates](https://core.telegram.org/bots/api#getupdates) — channel message visibility depends on bot privacy mode (Open Question 5)
- [@vercel/og 0.11.1 — Node runtime usage](https://vercel.com/docs/og-image-generation/og-image-api) — current Node-runtime pattern

### Tertiary (LOW confidence — flagged for Wave 0 validation)
- `viem-gcp-kms-signer` library currency in May 2026 (A1)
- `@cloud-cryptographic-wallet/cloud-kms-signer` maintenance status (A1)
- Exact 2026 pricing for Upstash + Better Stack + Pinata (operational budget items from SUMMARY.md may have drifted)
- Whether Next.js 16.2.6 + @vercel/og 0.11.1 has any breaking-change interaction (Open Question 4)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pinned by CLAUDE.md + STACK.md; verified via npm registry on 2026-05-21 per STACK.md; only Wave 0 sanity check needed
- Architecture: HIGH — derived from ARCHITECTURE.md (6-package monorepo + relayer cluster diagram) and user-locked decisions
- KMS signer integration: MEDIUM — library landscape (A1); 50-line custom wrapper is well-understood fallback
- Upstash↔BullMQ compatibility: MEDIUM — needs explicit Wave 0 validation (Pitfall A)
- OG Fallback render time: MEDIUM — needs cold-start vs warm-start benchmark (A4 + A11); the route logic itself is HIGH confidence (flexbox + self-hosted fonts + Node runtime + 60s cache is the canonical 2026 pattern)
- Subgraph scaffold-from-spec-events approach: HIGH — schema is fully derivable from §12.1–12.5; mappings stub against empty addresses is a standard Subgraph Studio pattern
- CI grep guards: HIGH — ripgrep is mature; three guards each are <20 lines
- Safe 2-of-3 deploy + Ledger: HIGH — Safe protocol-kit + Ledger Nano are both standard; only A7/A8 need Wave 0 sanity
- Telegram 2-channel routing: HIGH — `node-telegram-bot-api` + 2 chat IDs is a one-day implementation
- Stylus reactivation calendar: MEDIUM — Google Calendar API path is standard; placeholder→real-date re-pointing depends on Phase 5 enforcing the update task (Pitfall C)
- Better Stack dashboards: MEDIUM — dashboards-with-no-data UX needs explicit synthetic-injection pattern (Pitfall G)
- Pitfalls catalogue: HIGH — sourced directly from PITFALLS.md, all 9 referenced pitfalls have full mitigation pathways

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (30 days — stack is locked but Wave 0 should re-verify versions if the start delay exceeds 7 days from the research date)

---

*Phase 0 research complete. Planner can derive PLAN.md files for each wave (Wave 0: monorepo + grep guards + versions; Wave 1: relayer + KMS + Redis + alerts; Wave 2: subgraph scaffold + OG fallback; Wave 3: multisig + calendar + synthetic-alert pipeline; Wave 4: deploy workflows + smoke validation).*
