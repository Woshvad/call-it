# Phase 0: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 0-foundation
**Areas discussed:** Hosting + region, Secret/KMS strategy, Multisig + bootstrap, Observability + alerts

---

## Hosting + Region

### Where should the relayer + OG service host?

| Option | Description | Selected |
|--------|-------------|----------|
| Fly.io | Global region story, better for long-running workers | ✓ |
| Railway | Simpler ops, single-region (US-East), built-in Redis | |
| Vercel + separate Fly worker | Split OG and relayer; more moving parts | |

**User's choice:** Fly.io

### Which region(s) for the relayer?

| Option | Description | Selected |
|--------|-------------|----------|
| US-East single (iad/ord) | Lowest hops to Alchemy + Pyth, simplest ops | ✓ |
| US-East + EU multi-region | 2x cost; redundancy + EU latency | |
| Whichever is closest to Pyth Hermes | Research Hermes location and pin there | |

**User's choice:** US-East single

### Redis hosting?

| Option | Description | Selected |
|--------|-------------|----------|
| Upstash serverless | Pay-per-request, ~$5/mo, edge endpoints, BullMQ-compatible | ✓ |
| Fly Redis / Railway Redis | Colocated, lowest latency, always-on cost | |
| Self-managed on relayer VM | Cheapest, risk of data loss on redeploy | |

**User's choice:** Upstash serverless

### Frontend host?

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel | Standard for Next.js 16, Node runtime for OG, free tier sufficient | ✓ |
| Self-host on Fly | Single bill, loses Vercel edge cache + ISR | |

**User's choice:** Vercel

---

## Secret / KMS Strategy

### Which KMS / secret manager for relayer signing keys?

| Option | Description | Selected |
|--------|-------------|----------|
| Google Cloud KMS | Best 2026 viem signer support, per-key IAM, free tier covers hackathon | ✓ |
| AWS KMS | Same security; community signers; AWS-IAM friction | |
| Turnkey | Policy-engine MPC; vendor cost; overkill for v1 | |
| Doppler / 1Password Secrets | Not hardware-bound; loses HSM guarantee | |

**User's choice:** Google Cloud KMS

### How should the per-attestation-type keys be separated?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 keys, 1 per attestation type | Pitfall 7 mitigation: NFT-TWAP / DefiLlama / CEX / Snapshot/Tally / OAuth-proof | ✓ |
| 2 keys (oracle vs OAuth) | Pragmatic minimum; loses per-oracle blast containment | |
| 1 key + EIP-712 discrimination | Cheapest; blunts mitigation | |

**User's choice:** 5 keys, 1 per attestation type

### How are non-signing secrets stored?

| Option | Description | Selected |
|--------|-------------|----------|
| GCP Secret Manager | Single vendor with KMS; IAM-managed; deploy-time fetch into Fly | ✓ |
| Fly.io secrets directly | Simpler; no central rotation/audit | |
| Doppler | Best DX for env sync; adds vendor; pairs with GCP KMS | |

**User's choice:** GCP Secret Manager

### Sepolia vs mainnet credential isolation?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate projects per network | Hardens Pitfall 5 mitigation via IAM separation | ✓ |
| One project, separate keys per network | Cheaper; single IAM blast radius | |
| Same keys, different chain-IDs | Eliminates Pitfall 5 mitigation | |

**User's choice:** Separate projects per network

---

## Multisig + Bootstrap

### Safe 2-of-3 signer composition?

| Option | Description | Selected |
|--------|-------------|----------|
| You + 2 trusted humans you control | Solo+AI build reality; 2 hardware wallets across signers | ✓ |
| You + 1 trusted human + 1 hosted MPC | MPC reduces "lose the seed" risk; adds vendor | |
| You + co-founder + advisor (3 distinct humans) | Spec-literal; requires real names now | |
| Defer signer identification to Phase 6 | Phase 6 surprise risk | |

**User's choice:** You + 2 trusted humans you control

### Hardware wallet brand for Phase 0–5 single-owner deployer key?

| Option | Description | Selected |
|--------|-------------|----------|
| Ledger Nano X / S Plus | Best Foundry/Cast clear-signing for proxy admin txs | ✓ |
| Trezor Safe 3 | Open firmware; slightly weaker clear-signing | |
| GridPlus Lattice1 | Best clear-signing; $400+ upfront | |

**User's choice:** Ledger Nano X / S Plus

### Domain ownership (`api.callitapp.xyz` per ARCHITECTURE.md)?

| Option | Description | Selected |
|--------|-------------|----------|
| Register callitapp.xyz now | Cloudflare registrar; ~$10/yr; locks brand | |
| Different domain already owned | Substitute throughout planning docs | |
| Defer domain decision to Phase 7 | Use Fly + Vercel default domains in Phase 0–6 | ✓ |

**User's choice:** Defer domain decision to Phase 7

### Stylus reactivation calendar reminders?

| Option | Description | Selected |
|--------|-------------|----------|
| Google Calendar + Telegram bot duplicate | Belt + suspenders for Pitfall 17 | ✓ |
| Telegram bot only | Lower setup; single point of failure | |
| Skip in Phase 0, add when Stylus deploys (Phase 5) | Violates Phase 0 success criterion #6 | |

**User's choice:** Google Calendar + Telegram bot duplicate

---

## Observability + Alerts

### Observability platform for the 5 dashboards?

| Option | Description | Selected |
|--------|-------------|----------|
| Better Stack | Logtail + Uptime + Status pages; Pino-native; ~$25/mo | ✓ |
| Grafana Cloud free tier | Loki + Prometheus + Grafana; generous free tier; more setup | |
| Axiom + custom Grafana | Most flexible; largest setup investment | |
| Datadog | Best span/trace ergonomics; cost scales hard | |

**User's choice:** Better Stack

### Telegram alert routing strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Single private group, all alerts | One group; lowest setup; noisier | |
| Two channels: P0 + P1 | P0 paged (pause/dispute/forceSettle/RepFallback); P1 digest (paymaster/TVL/stuck) | ✓ |
| Per-event-type channels | Most signal-friendly; slow setup; subscribe drift | |

**User's choice:** Two channels: P0 (immediate) + P1 (informational)

### Synthetic alert test cadence?

| Option | Description | Selected |
|--------|-------------|----------|
| Daily CI cron + weekly manual fire | CI fails if alert doesn't arrive in 60s | ✓ |
| Weekly CI cron only | Misses sub-week regressions | |
| On every relayer deploy | Lowest overhead; gaps between deploys | |

**User's choice:** Daily CI cron + weekly manual fire

### Better Stack dashboard ownership?

| Option | Description | Selected |
|--------|-------------|----------|
| Private — operator + co-signers only | v1 stance: ship signals, don't broadcast soft spots | ✓ |
| Public status page + private detail | Strong credibility bit; status.callitapp.xyz | |
| Fully public dashboards | Reveals operational soft spots to adversaries | |

**User's choice:** Private — operator + co-signers only

---

## Claude's Discretion

Areas where Claude made the reasonable call rather than asking (per user "work without stopping for clarifying questions"):

- **Monorepo tooling:** pnpm workspaces + Turborepo (remote cache via Vercel free tier). pnpm required by stack; Turborepo accelerates CI.
- **CI provider:** GitHub Actions. Industry default; both Fly and Vercel have first-class deploy workflows.
- **IPFS pinning scope in Phase 0:** Provision Pinata account + smoke-test a pin only. No app-level pinning yet — that lands when receipts ship in Phase 7.
- **Solidity exact pin:** `=0.8.30` (CALL_IT_SPEC1.md constraint text said `^0.8.24`; CLAUDE.md / STACK.md verdict pins exact to avoid 0.8.28–0.8.33 IR bug).
- **OG fallback canonical URL during Phase 0–6:** Fly default domain. Every OG canonical URL constructed from env-var, not a hardcoded `callitapp.xyz` literal.

## Deferred Ideas

(See CONTEXT.md `<deferred>` section.) Highlights:
- Public status page (v1.1 credibility candidate)
- Multi-region relayer (Phase 8+ if traffic justifies)
- MPC signer as third multisig key (v1.1)
- Per-event-type Telegram channels (v1.1 ergonomics polish)
- IPFS application-level pinning (Phase 7)
- Real domain registration (Phase 7)
