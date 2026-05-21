# Phase 0: Foundation - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Always-live infrastructure so the receipt loop is never blocked by infra. Phase 0 delivers the monorepo, CI guards, relayer skeleton, subgraph schema scaffold, OG fallback variant, Telegram alert pipeline, Safe multisig deploy script (dry-run-tested, signers identified), KMS / secret manager wiring, observability dashboards, and Stylus reactivation calendar reminders.

**In scope:** monorepo (6 packages), CI guards (USDC paste, solidity pin, env-network), relayer skeleton (Fastify + BullMQ + Redis + Pino + viem), subgraph schema stub + polled-events fallback, OG fallback variant `/og/fallback`, Telegram alert bot for 7 event types, Safe 2-of-3 multisig deploy script (Sepolia dry-run), KMS namespace + 5 attestation keys, Stylus reactivation calendar.

**Out of scope:** Contract logic beyond pragma + USDC constant (→ Phase 1+); auth UI (→ Phase 1); OG variants 1–4 Live/Settled/DuelSettled/CallerExited (→ Phase 7); subgraph event mappings against real events (→ Phase 1+); multisig promotion (→ Phase 6 HARD GATE); Stylus engine deploy (→ Phase 5); domain registration (deferred → Phase 7); IPFS application-level pinning (→ when receipts ship in Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Hosting + Region
- **D-01:** Relayer + OG service host on **Fly.io**. Long-lived workers needed for 30-min Pyth retry, BullMQ jobs, CEX scrapers. Fly Postgres/Upstash pair cleanly.
- **D-02:** Single region: **US-East (iad)**. Hackathon-appropriate; multi-region deferred until traffic justifies.
- **D-03:** Redis: **Upstash serverless** (pay-per-request, ~$5/mo). Works with BullMQ; global edge endpoints; no idle cost.
- **D-04:** Frontend host: **Vercel** (Next.js 16 App Router, Node runtime for any OG endpoint that ends up on the web app).
- **D-05:** Phase 0 uses **default Fly + Vercel domains** for relayer/OG canonical URLs. The `api.callitapp.xyz` / `app.callitapp.xyz` rebrand happens in Phase 7 with OG cache-warm cutover.

### Secret / KMS Strategy
- **D-06:** Signing keys live in **Google Cloud KMS**. viem GCP-KMS signer wrapper for relayer integration. Spec mandates KMS — env files are forbidden.
- **D-07:** **5 separate KMS keys**, one per attestation type: NFT-TWAP, DefiLlama, CEX, Snapshot/Tally, OAuth-proof. EIP-712 domain includes `attestationType` to bind signatures (Pitfall 7 mitigation).
- **D-08:** Non-signing secrets (Privy app secret, Alchemy API key, RPC URLs, Pinata, Telegram bot token, Better Stack token) live in **GCP Secret Manager**. Injected into Fly at deploy time via a `gcloud secrets versions access` step in the deploy workflow.
- **D-09:** **Separate GCP projects per network**: `call-it-sepolia` and `call-it-mainnet`. No KMS key, secret, or service account is ever reachable from the wrong network. IAM separation hardens Pitfall 5 mitigation beyond the grep guard.

### Multisig + Bootstrap
- **D-10:** Safe 2-of-3 signer composition: **operator (user) + 2 trusted humans the user controls**, each holding a hardware wallet. Two different hardware-wallet brands across the three signers to harden against single-brand firmware risk.
- **D-11:** Hardware wallet for the Phase 0–5 single-owner deployer key: **Ledger Nano X / S Plus**. Best Foundry/Cast clear-signing for proxy-admin txs and EIP-712. The deployer key is the SAME hardware wallet that becomes one of the 3 multisig signers in Phase 6.
- **D-12:** Domain registration **deferred to Phase 7**. Phase 0–6 ship against Fly + Vercel default domains. Planning, OG canonical URL placeholders, and CI must accept env-variable host substitution rather than hardcoding the eventual domain.
- **D-13:** Stylus reactivation calendar: **Google Calendar invites + Telegram bot duplicate alerts** at T-30d / T-15d / T-7d / T-1d before the 365-day expiry. Calendar invites carry the runbook URL; Telegram fires through the same P0 channel as other critical alerts. Belt + suspenders for Pitfall 17.

### Observability + Alerts
- **D-14:** Observability platform: **Better Stack** (Logtail + Uptime + Status pages). Pino-native; one vendor for log storage + dashboards + uptime. 5 dashboards: Total TVL, calls/hour, settlement latency, dispute rate, failed-tx rate.
- **D-15:** Telegram alerts route to **two channels**: **P0 (immediate / paged)** for pause / dispute / `CallForceSettled` / `RepCalculatedFallback`; **P1 (digest / informational)** for paymaster 80% / TVL approach / settle-stuck > 25min. Splits signal from noise; reduces alert fatigue without dropping coverage.
- **D-16:** Synthetic alert pipeline test: **daily CI cron + weekly manual fire**. CI fires a synthetic event (e.g., `paused`, `RepCalculatedFallback`) once per day and fails the build if the alert doesn't arrive in Telegram within 60s. Weekly operator-fires for end-to-end including Better Stack ingestion. Pitfall 2 mitigation extends to the alert path itself.
- **D-17:** Better Stack dashboards are **private (operator + co-signers only)**. Public-facing status page can land later if/when credibility-from-uptime becomes a feature; v1 stance is "ship signals, don't broadcast soft spots."

### Claude's Discretion
- **D-18:** Monorepo tooling: **pnpm workspaces + Turborepo** (remote cache via Vercel free tier). pnpm is required by the spec stack; Turborepo adds CI build-cache speed. The 6 packages (`apps/web`, `apps/relayer`, `packages/contracts`, `packages/subgraph`, `packages/shared`, `packages/config`) are fixed by success criterion #1.
- **D-19:** CI provider: **GitHub Actions**. Industry default; no spec / stack constraint forces another provider; Fly + Vercel both have first-class GH Actions deploy workflows.
- **D-20:** IPFS pinning in Phase 0: **provision Pinata account + smoke-test a pin only**. No app-level pinning yet — application pins land when receipts need them in Phase 7. Phase 0 deliverable is "Pinata API key in GCP Secret Manager + a successful smoke pin", not a production pinning service.
- **D-21:** Solidity exact pin enforced as `pragma solidity =0.8.30` (not `^0.8.24` from the constraint text). CI grep guard rejects any other version per success criterion #2 and STACK.md verdict ("avoid 0.8.28–0.8.33 IR storage-clearing bug").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec source-of-truth (LOCKED)
- `CALL_IT_SPEC1.md` §10.5 — USDC `require(token == USDC_ARB)` mandate; hardcoded address contract
- `CALL_IT_SPEC1.md` §10.7 — Paymaster $50/day cap; alert at 80%; settlement-stuck SLA
- `CALL_IT_SPEC1.md` §10.8 — Single owner key; multisig promotion gate; Stylus 365-day reactivation
- `CALL_IT_SPEC1.md` §11.6 — Stylus runtime try/catch + Solidity baseline + `RepCalculatedFallback` event
- `CALL_IT_SPEC1.md` §12.1–12.5 — Indexed events list (input to subgraph schema scaffold)
- `CALL_IT_SPEC1.md` §13.7 — `forceSettle` 7-day cooldown + dispute window
- `CALL_IT_SPEC1.md` §16.6 — Fallback OG card design (SHARE-09 / SHARE-10 / SHARE-11)
- `CALL_IT_SPEC1.md` §19 — Build Order (Phase 0 derivation)
- `CALL_IT_SPEC1.md` §19.10 — Sepolia ≥48h staging gate
- `CALL_IT_SPEC1.md` §19.11 — Mainnet 20-minute smoke test
- `CALL_IT_SPEC1.md` App.A.1 — Operational requirements line-by-line

### Project planning artifacts
- `.planning/PROJECT.md` — Project frame, locked decisions table, constraints, out-of-scope items
- `.planning/REQUIREMENTS.md` — REQ-ID list (OPS-01..26, SAFETY-12/13/15/16/17/58, SHARE-09/10/11 land in Phase 0)
- `.planning/ROADMAP.md` Phase 0 — Goal, success criteria, pitfalls mitigated, requirements mapping
- `.planning/STATE.md` — Current position, accumulated context, blockers list (operational budget)

### Research (read before planning)
- `.planning/research/STACK.md` — Pinned versions, addresses, network choices (lives in `CLAUDE.md` Technology Stack section; treat that section as the canonical pinned-stack record)
- `.planning/research/ARCHITECTURE.md` — Component boundaries, monorepo layout, relayer-cluster diagram
- `.planning/research/PITFALLS.md` — Especially Pitfalls 1 (USDC paste), 2 (Stylus catch unverified), 3 (TVL aggregation), 5 (Sepolia↔mainnet drift), 6 (multisig promotion delay), 7 (KMS / signing key separation), 8 (OG cache desync), 10 (CEX scraper drift), 17 (Stylus reactivation)
- `.planning/research/FEATURES.md` — Feature inventory used to derive REQ-IDs
- `.planning/research/SUMMARY.md` — Research synthesis with 5 deltas applied in the roadmap

### Project root
- `CLAUDE.md` — Technology Stack section (pinned versions, alternatives considered, what NOT to use, version compatibility matrix). This is the operative stack reference for all phases.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None.** Greenfield repo. Only the spec, planning artifacts, and this CLAUDE.md exist at Phase 0 start.

### Established Patterns
- **None yet.** Phase 0 IS the pattern-establishing phase. The monorepo layout in ARCHITECTURE.md, the package boundaries in success criterion #1, and the CI guards listed in success criterion #2 are the patterns that every downstream phase consumes without re-litigation.

### Integration Points
- **GCP project provisioning** must precede any code that references KMS or Secret Manager — D-09 requires the two-project structure exist before relayer skeleton wiring.
- **Fly.io app creation + Upstash Redis + Vercel project** must precede the relayer skeleton's `/health` endpoint deploy (success criterion #3).
- **Subgraph Studio account** must exist before subgraph schema deploys to Sepolia (success criterion #4).
- **GitHub repo init + Actions workflows** must precede every CI guard test in success criterion #2.

</code_context>

<specifics>
## Specific Ideas

- **Two different hardware-wallet brands across the 3 multisig signers** (D-10). One signer-key compromise via a brand-wide firmware exploit can't take 2-of-3.
- **Domain placeholder discipline** (D-12). Every OG canonical URL, every CORS origin allowlist, every webhook callback URL in Phase 0–6 is constructed from an env-var rather than a hardcoded `callitapp.xyz` literal. Phase 7 substitutes the real domain in one place.
- **CI grep guards are first-class build steps** (D-21, per success criterion #2). Not "linting" — failing-build steps. Three guards: `=0.8.30` exact match; USDC address whitelist (only `0xaf88d065...e5831`); `arbitrum-sepolia` absent from any mainnet-profile env.
- **Synthetic alert test is a build-failer** (D-16). If the alert pipeline silently broke, the build that would have shipped the broken pipeline fails the next day.

</specifics>

<deferred>
## Deferred Ideas

- **Public status page** — D-17 dashboards are private in v1; public uptime/transparency page is a v1.1 candidate (credibility leverage).
- **Multi-region relayer** — D-02 is US-East single; EU multi-region kicks in if traffic justifies post-mainnet (Phase 8+).
- **MPC signer as third multisig key** — D-10 uses 3 human signers; an MPC service (Turnkey) as the third reduces "lose the seed" risk and can replace one signer in v1.1.
- **Turborepo remote cache promotion** — D-18 starts on Vercel free-tier remote cache; if CI builds slow, swap to a self-hosted or Turborepo Cloud cache later.
- **Per-event-type Telegram channels** — D-15 ships 2-channel routing; granular per-event channels are a v1.1 ergonomics polish if alert volume justifies.
- **IPFS application-level pinning** — D-20 only smoke-tests Pinata in Phase 0; receipt hash pinning, asset pinning land in Phase 7 when receipts go live.
- **Real domain registration** — D-12 defers `callitapp.xyz` (or alternative) to Phase 7; until then, default Fly + Vercel domains.

</deferred>

---

*Phase: 0-Foundation*
*Context gathered: 2026-05-21*
