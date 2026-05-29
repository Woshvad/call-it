---
phase: 2
slug: followfademarket
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` → Validation Architecture. Per-task rows are filled
> in by the planner / Wave 0 once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Foundry (`forge test`) for contracts; Vitest for `packages/shared` Foundry↔TS parity (D-29) |
| **Config file** | `packages/contracts/foundry.toml` — `[profile.ci] fuzz.runs = 1000` |
| **Quick run command** | `forge test --match-contract FollowFadeMarket -v` |
| **Full suite command** | `forge test --profile ci` |
| **Parity command** | `pnpm --filter @call-it/shared test` |
| **Estimated runtime** | ~30s quick · ~3–5 min full (1000 fuzz runs) |

---

## Sampling Rate

- **After every task commit:** Run `forge test --match-contract FollowFadeMarket -v` (single file, fast)
- **After every plan wave:** Run `forge test --profile ci` (1000 fuzz runs) + `pnpm --filter @call-it/shared test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30s (quick), ~5 min (full)

---

## Per-Task Verification Map

> Populated by the planner / Wave 0 once PLAN.md task IDs are assigned. Rows below
> are the requirement→test contract from RESEARCH.md; map each to its task ID during planning.

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| SOCIAL-01/02 | AMM follow/fade mints correct shares (`sharesOut = totalShares × amtIn / (reserve + amtIn)`) | unit | `forge test --match-test testFollowSharesMinted -v` | ❌ W0 |
| SOCIAL-03/04 | Min ($1) / max ($100 cumulative) position enforcement | unit | `forge test --match-test testPositionBounds -v` | ❌ W0 |
| SOCIAL-05/06 | `SlippageExceeded` fires; frontend 1% tolerance on `minSharesOut` | unit + TS | `forge test --match-test testSlippage -v` | ❌ W0 |
| SOCIAL-07 | Post-expiry follow/fade reverts `CallPastExpiry` (strict `<`) | unit | `forge test --match-test testPostExpiryGate -v` | ❌ W0 |
| SOCIAL-09 | TVL cap aggregation across CallRegistry + FollowFadeMarket | unit | `forge test --match-test testTvlAggregation -v` | ❌ W0 |
| SOCIAL-11 | Penalty injection grows `k`, **no phantom shares** | **invariant** | `forge test --match-contract FollowFadeMarketGates -v` | ❌ W0 |
| SOCIAL-12/13/14 | 4h cooldown + 10% slash + 50/40/10 split | unit | `forge test --match-test testPositionExit -v` | ❌ W0 |
| SOCIAL-17/18 | 24h lock + penalty decay `15% + 35%×time_remaining_ratio` (floor 15%) | unit (fuzz over time) | `forge test --match-test testCallerExitPenalty -v` | ❌ W0 |
| SOCIAL-19 | Caller exit 50/40/10 split | unit | `forge test --match-test testCallerExitSplit -v` | ❌ W0 |
| SOCIAL-21 | `call.status = CallerExited` after caller exit | unit | `forge test --match-test testCallerExitStatus -v` | ❌ W0 |
| SOCIAL-24 | Caller-exit notification fan-out writes one row per holder | integration | relayer worker test | ❌ W0 |
| SOCIAL-26 | Rep slash applied via `applyRepDelta` in same tx | unit | `forge test --match-test testRepSlash -v` | ❌ W0 |
| D-01 | `createCall` forwards stake to FFM, does not hold | integration | `forge test --match-test testCreateCallForwards -v` | ❌ W0 |
| Pitfall 9 | AMM `k`-invariant holds across multi-call interference | **invariant fuzz** | `forge test --match-contract FollowFadeMarketInterference -v` | ❌ W0 |
| Pitfall 22 | Empty-pool LP-fee routes to treasury | unit | `forge test --match-test testEmptyPoolLpFee -v` | ❌ W0 |
| Pitfall 3 | TVL aggregation boundary $4999 / $5001 | unit | `forge test --match-test testTvlBoundary -v` | ❌ W0 |
| Pitfall 10 | Strict `<` expiry gate (off-by-one) | unit | `forge test --match-test testExpiryGate -v` | ❌ W0 |
| SHARE-04 / UI-06/07 | Live OG card + Live Receipt render correctly | visual/smoke | Playwright OG smoke test | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/contracts/test/FollowFadeMarket.t.sol` — SOCIAL-01..28 unit tests
- [ ] `packages/contracts/test/FollowFadeMarketGates.t.sol` — AMM `k`-invariant + penalty-injection invariant fuzz (`invariant_kNeverShrinks`, `invariant_usdcBalanceMatchesReserves`, `invariant_noOverClaim`)
- [ ] `packages/contracts/test/FollowFadeMarketInterference.t.sol` — multi-call interference fixtures (Pitfall 9)
- [ ] `packages/contracts/test/TvlAggregation.t.sol` — TVL cap boundary tests (Pitfall 3)
- [ ] `packages/contracts/test/helpers/FfmTestHelper.sol` — shared bootstrap (deploy FFM + seed 3 calls)
- [ ] ABI export: `packages/contracts/out/FollowFadeMarket.sol/FollowFadeMarket.json` → `packages/subgraph/abis/`
- [ ] `packages/shared` Vitest parity stubs for follow/fade/exit gate math (D-29)

*No new test framework install needed — Foundry and Vitest already installed (Phase 0/1).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Receipt ~5s poll + optimistic update feel | UI-06, SOCIAL-44 | Real-time UX freshness not unit-testable | Open `/call/[id]` on Sepolia, follow from a 2nd wallet, confirm bar updates within ~5s |
| Caller-exit amber "CALLER EXITED" banner appears from exit moment | SOCIAL-23, UI-06 | Visual state transition | Trigger caller exit on a seeded call, confirm banner + broadcast entry render |
| Exit-modal type-to-confirm ("EXIT") friction | SOCIAL-49, D-11 | Modal interaction | Open caller-exit modal, confirm typed-word gate + penalty/return/rep math display |
| OG card `?v={statusVersion}` cache-bust on activity | SHARE-04, D-09, Pitfall 8 | CDN cache behavior | Follow a call, confirm `og:image?v=` increments and card regenerates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test files above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick) / 5 min (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
