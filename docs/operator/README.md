# Operator Documentation Index

This directory contains the operational substrate for Call It.

## Runbooks

| Runbook | Purpose | Phase |
|---------|---------|-------|
| [stylus-reactivation.md](../runbooks/stylus-reactivation.md) | Stylus 365-day reactivation procedure (Pitfall 17) | Phase 5+ |
| [multisig-promotion.md](../runbooks/multisig-promotion.md) | Phase 6 multisig ownership transfer (HARD GATE) | Phase 6 |
| [relayer-key-rotation.md](../runbooks/relayer-key-rotation.md) | GCP KMS key rotation + rep compensation | Ongoing |
| [env-diff-ritual.md](../runbooks/env-diff-ritual.md) | Pre-mainnet Sepolia/mainnet env diff | Phase 6+ |
| [nft-twap-sanity.md](../runbooks/nft-twap-sanity.md) | NFT TWAP sanity-check (Phase 4 fills) | Phase 4+ |
| [settlement-stuck.md](../runbooks/settlement-stuck.md) | Settlement-stuck 3-step diagnosis + forceSettle | Phase 1+ |

## Other Documentation

| Document | Purpose |
|----------|---------|
| [../better-stack-dashboards.md](../better-stack-dashboards.md) | 5 Better Stack dashboard configurations (OPS-06) |
| [../demo-seed-plan.md](../demo-seed-plan.md) | 10-call seed plan for Phase 6 Sepolia staging (OPS-20) |

## Pre-Tag Checklist

| Document | Purpose |
|----------|---------|
| [../phase-0-deploy-checklist.md](../phase-0-deploy-checklist.md) | 8-item human gate before `git tag phase-0-complete` — GCP KMS keys, Telegram bot, Better Stack dashboards, Safe on Arbiscan, Calendar events, GCP secrets, Pinata, domain validation |

## Operational Scripts

| Script | Purpose |
|--------|---------|
| `scripts/deploy-safe.ts` | Safe 2-of-3 deploy (SAFETY-58) |
| `scripts/seed-calendar.ts` | Google Calendar event seeding for Stylus reactivation (D-13) |
| `scripts/repoint-calendar.ts` | Phase 5: update Calendar events to real Stylus deploy date |
| `scripts/fire-synthetic-alert.ts` | CI helper: fire synthetic alert + verify via the relayer's send-confirmation (HTTP 200 + echoed nonce) |
| `scripts/phase-0-smoke.ts` | 6-step Phase 0 smoke test against deployed artifacts; used by phase-0-gate.yml |

## GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy-web.yml` | push to sepolia/main | Deploy apps/web to Vercel (per-network project routing) |
| `deploy-relayer.yml` | push to sepolia/main | Deploy apps/relayer to Fly.io (GCP OIDC + Secret Manager) |
| `deploy-subgraph.yml` | push to sepolia/main (path-filtered) | Deploy packages/subgraph to Subgraph Studio |
| `phase-0-gate.yml` | tag phase-0-complete* | 6-step blocking gate; creates GitHub release with smoke results |
| `synthetic-alert.yml` | daily cron 12:00 UTC | Fire a synthetic alert + verify the relayer's send-confirmation end-to-end |
| `grep-guards.yml` | every push | 3 CI invariants (USDC address, Solidity pragma, env-network) |
