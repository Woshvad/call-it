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

## Operational Scripts

| Script | Purpose |
|--------|---------|
| `scripts/deploy-safe.ts` | Safe 2-of-3 deploy (SAFETY-58) |
| `scripts/seed-calendar.ts` | Google Calendar event seeding for Stylus reactivation (D-13) |
| `scripts/repoint-calendar.ts` | Phase 5: update Calendar events to real Stylus deploy date |
| `scripts/fire-synthetic-alert.ts` | CI helper: fire + verify synthetic alert via Telegram |
