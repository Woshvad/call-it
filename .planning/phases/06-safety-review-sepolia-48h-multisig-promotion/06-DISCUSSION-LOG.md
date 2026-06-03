# Phase 6: Safety review + Sepolia ≥48h + multisig promotion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 06-safety-review-sepolia-48h-multisig-promotion
**Areas discussed:** Money-path validation strategy, Multisig signers & transfer timing, 48h soak orchestration & seeding, Phase shape & promotion gate

---

## Money-Path Validation Strategy (ADR 0001)

| Option | Description | Selected |
|--------|-------------|----------|
| Mainnet-fork only (c) | Validate money flows on an Arbitrum One fork only; zero contract change; keep live Sepolia for non-money integration. ADR 0001's primary recommendation. | |
| Hybrid: fork + live Sepolia USDC (b) | Also enable live public Sepolia money via chainid-gated Circle Sepolia USDC; adds USDC.sol change + 4-contract redeploy + CI-guard allowlist + security review. | ✓ |

**User's choice:** Hybrid (b) — fork suite **and** live public Sepolia money via Circle Sepolia USDC.
**Notes:** Pulls a LOCKED-invariant change (chainid-gated `resolveUsdc()`) + full Sepolia cluster redeploy + CI-guard allowlist + a security review into Phase 6. Mainnet unfakeable-USDC guarantee preserved via the chainid gate. Invalidates the current 05.1 Sepolia addresses — the redeployed set is what the multisig takes ownership of.

---

## Multisig Signers

| Option | Description | Selected |
|--------|-------------|----------|
| Solo: 3 devices you control | Operator holds all 3 keys; 2-of-3 protects against losing one key, not multi-party. | ✓ |
| Distributed: you + 2 trusted parties | True multi-party control; stronger against single-person compromise; needs co-signers. | |
| Decide at execution | Lock the model + runbook now; provide 3 addresses at deploy time. | |

**User's choice:** Solo 2-of-3 (operator holds all 3 keys).
**Notes:** Exact signer addresses remain an execution-time input. Distributed signers noted as a v1.1 upgrade.

---

## Ownership Transfer Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Rehearse on Sepolia + stand up mainnet Safe | Deploy a matching Safe on Sepolia, run full transfer/acceptOwnership on the redeployed cluster, prove multisig-executed pause/upgrade; also deploy the production Arbitrum One Safe. Real mainnet transfer at Phase 7. | ✓ |
| Stand up Arbitrum One Safe + runbook only | Deploy production Safe + write/test runbook; no Sepolia transfer; first real transfer at mainnet deploy. | |

**User's choice:** Rehearse on Sepolia + stand up the production Arbitrum One Safe.
**Notes:** Matches SC4's `cast call owner()` == multisig literally and the phase's "prove it's real" ethos.

---

## 48h Soak Seeding

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted bot for bulk + manual for folded UAT | Script drives on-chain counts (Circle-faucet wallets + relayer) + fork suite in CI; manual verification of the 5 folded Phase-4 UAT items. | ✓ |
| Fully scripted (incl. UAT capture) | Script drives + auto-captures everything; loses human judgment on readability/modal checks. | |
| Fully manual | Drive all by hand; highest realism, slowest, hard to hit ≥48h coverage. | |

**User's choice:** Scripted bot for bulk + manual verification of the 5 folded UAT items.
**Notes:** Fork money-path suite runs in CI alongside the live-Sepolia seeding.

---

## Soak Monitoring

| Option | Description | Selected |
|--------|-------------|----------|
| Telegram alerts + checked evidence log | Wire Telegram operator alerts + capture an evidence log mapping every SAFETY-29–43 + PITFALLS-38 item to a tx/screenshot. | ✓ |
| Evidence log only | Capture the log; defer alerting to mainnet ops. | |
| You decide | Planner picks monitoring depth. | |

**User's choice:** Telegram alerts + checked evidence log.
**Notes:** Reuses the `stylus-deactivation-watcher.ts` alert path. "Passed" = every item checked with evidence.

---

## Phase Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Keep whole; planner may split | Plan as one phase; planner returns a split recommendation if it exceeds budget. | ✓ |
| Pre-split now: 6a safety+soak, 6b multisig promotion | Lock a split up front at the multisig boundary. | |

**User's choice:** Keep whole; planner may split.
**Notes:** Work is tightly coupled and sequential (redeploy → soak → transfer that cluster). Natural seam if split: 6a safety+soak / 6b multisig promotion.

---

## Budget Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Budget sign-off checkpoint in the promotion gate | Explicit budget-approval checkpoint blocks promotion without confirmed funding. | |
| Defer to Phase 7 | Treat budget approval as a Phase-7 entry item; Sepolia soak doesn't need the recurring spend. | ✓ |
| Approved — note as locked | Record as a locked assumption, no gate task. | |

**User's choice:** Defer to Phase 7.
**Notes:** ~$175/mo + $150-300 upfront is overwhelmingly mainnet-only; the Sepolia soak runs on free infra.

---

## Claude's Discretion

- Security-review mechanism for the (b) USDC change → GSD's own gates (`/gsd-secure-phase` + `/gsd-code-review` on the diff); solo build, not an external audit.
- Exact redeploy set for the Circle-USDC change → planner/research determines (05.1 lesson: redeploying CallRegistry forces FFM+CE+SM).
- Fork RPC (Alchemy Arbitrum One) + Circle faucet rate-limit handling in the seeding script.
- Evidence-log format + monitoring depth specifics.

## Deferred Ideas

- Real mainnet contract deploy + real mainnet ownership transfer → Phase 7.
- Recurring ops budget approval (~$175/mo + $150-300 upfront) → Phase 7.
- Post-deploy 20-minute smoke test (SAFETY-44) → Phase 7.5.
- External/professional security audit → post-hackathon.
- Distributed (multi-party) multisig signers → v1.1.
