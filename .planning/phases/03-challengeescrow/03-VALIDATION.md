---
phase: 3
slug: challengeescrow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `03-RESEARCH.md` → Validation Architecture. Task IDs are TBD until plans exist;
> the planner maps each requirement below to concrete tasks/waves.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Foundry (forge) + Vitest (Foundry↔Vitest parity gate, D-29) |
| **Config file** | `packages/contracts/foundry.toml` (`=0.8.30` pin; fuzz `ci` profile = 1000 runs) |
| **Quick run command** | `forge test --match-contract ChallengeEscrow -v` |
| **Full suite command** | `forge test --match-contract 'ChallengeEscrow\|TvlAggregation' --profile ci -v` |
| **Vitest parity** | `pnpm --filter @call-it/web test --run challenge-gates` |
| **Estimated runtime** | ~60s (quick ~5s; full ci fuzz ~60s) |

---

## Sampling Rate

- **After every task commit:** Run `forge test --match-contract ChallengeEscrow -v`
- **After every plan wave:** Run `forge test --match-contract 'ChallengeEscrow|TvlAggregation' --profile ci`
- **Before `/gsd-verify-work`:** Full suite green **+** `/duel/[id]` Sepolia smoke renders **+** `/og/duel/[id]` returns 200
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Task IDs assigned during planning (`/gsd-plan-phase 3`). `❌ W0` = test file is a Wave 0 gap (created before/at Wave 0).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SOCIAL-29 | T-3-stale-call | `proposeChallenge` reverts `CallerNotOpenToChallenges` when `openToChallenges == false` | unit | `forge test --match-test testProposeRevertsNotOpen` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-30 | — | Challenge form pre-fills challenger stake to caller's, override allowed; zod stake-bounds + USDC allowance/balance preflight | unit + Vitest | `pnpm --filter @call-it/web test --run challenge-gates` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-31 | — | Asymmetric stakes accepted; `pot = min(callerStake, challengerStake) × 2` | unit + fuzz | `forge test --match-test testPotMinTimesTwo` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-32 | T-3-selfchallenge | `SelfChallenge` revert when `msg.sender == call.caller` | unit | `forge test --match-test testSelfChallengeBanned` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-33 | T-3-stale-call | `CallNotChallengeable` when call not Live or past expiry | unit | `forge test --match-test testChallengeNotLive` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-34 | — | `AcceptanceWindowExpired` after `CHALLENGE_ACCEPTANCE_WINDOW` (24h) | unit | `forge test --match-test testWindowExpired` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-35 | — | `rejectChallenge` refunds challenger immediately | unit | `forge test --match-test testRejectRefunds` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-36 | — | `claimRefund` recovers challenger stake after the 24h window | unit | `forge test --match-test testClaimRefundAfterWindow` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-37 | T-3-tvl-bypass | 3-way TVL cap: `TvlCapReached` on `proposeChallenge` AND `acceptChallenge` (`CR.currentTvl + FFM.getTvl() + own escrow`) | unit | `forge test --match-test testTvlCap3Way` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-38 | T-3-double-claim | `claimDuelPayout` idempotent — `AlreadyClaimed` on second attempt | unit | `forge test --match-test testClaimIdempotent` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-39 | T-3-double-claim | `claimDuelPayout` reverts `NotDuelWinner` for non-winners; CEI (mark claimed before transfer) | unit | `forge test --match-test testClaimNotWinner` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-48 | — | Subgraph indexes `ChallengeProposed/Accepted/Rejected/Refunded/Settled`, `PayoutClaimed`, `PositionExited` | subgraph assertion | `graph build` + entity query on Sepolia Studio | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-49, SOCIAL-50 (Pitfall 21) | T-3-overage-grief | Overage pushed at `settleDuel`; on push failure `UnclaimedOverageCreated` fires + `claimOverage` succeeds for the (possibly losing) overcommitter | unit + subgraph | `forge test --match-test testOveragePushFail` ; `forge test --match-test testClaimOverageLosing` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-46, SOCIAL-47 | T-3-double-claim | FollowFadeMarket `claimPayout` idempotency + CEI (contract exists from Phase 2; exercised at Phase 4 settlement) | unit | `forge test --match-contract FollowFadeMarket --match-test testClaimPayout` | ✅ Phase 2 | ⬜ pending |
| TBD | TBD | TBD | UI-11 | — | Duel page `/duel/[id]` renders THE MARKET hero, two-column duel card, MARKET CONSENSUS bar, Riding sections, Side-with CTAs; live stats update on ~5s poll | manual / visual | Sepolia smoke in browser + local dev | N/A manual | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-40, SOCIAL-41, SOCIAL-42 | — | Trending Duel pin (`trending_duels` row, `trending_until`); Duel King placeholder (no settled data until Phase 4); Duels tab filter chips | relayer integration | Manual Sepolia seed + Postgres query | N/A manual | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-51, SHARE-07 | T-3-og-grid | Duel Settled OG card variant 3 (`/og/duel/[id]`, Node runtime, flexbox-only); settled fields stubbed until Phase 4 | visual + grep guard | `curl /og/duel/[id]` → 200 ; `grep -r "display.*grid" apps/web/app/og/duel/` → 0 matches | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Property fuzz invariants (Foundry fuzz, `ci` profile = 1000 runs)

- **Overage conservation:** `callerStake + challengerStake == pot + overage` always holds
- **Escrow accounting:** after every operation, `totalEscrow == sum(all active challenge stakes)`
- **Payout ceiling:** `payout <= pot * 99 / 100` (never exceeds 99% of pot)
- **No zero-value overage:** `claimOverage` is a no-op when stakes were equal

---

## Wave 0 Requirements

- [ ] `packages/contracts/src/interfaces/IChallengeEscrow.sol` — LOCKED interface per §12.3 (enum/struct, events, errors)
- [ ] `packages/contracts/src/ChallengeEscrow.sol` — the contract under test
- [ ] `packages/contracts/test/ChallengeEscrow.t.sol` — full propose/accept/reject/refund/claim matrix + fuzz invariants
- [ ] `packages/contracts/test/ChallengeEscrowGates.t.sol` — self-challenge / stake-bounds / window / cap gate tests
- [ ] `packages/contracts/test/helpers/CeTestHelper.sol` — extends `FfmTestHelper`
- [ ] `apps/web/src/__tests__/challenge-gates.test.ts` — Vitest parity (D-29) for stake bounds / self-challenge / window / openToChallenges
- [ ] Drizzle migration `0003_*` — `trending_duels` + `duel_kings` tables
- [ ] Framework install — none needed; Foundry + Vitest already established

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Duel page renders all sections + live polling | UI-11 | Visual layout + ~5s live poll behavior not unit-testable | Seed a Sepolia duel, open `/duel/[challengeId]`, confirm hero / two-column card / consensus bar / Riding / CTAs; watch pot + settles-in update |
| Trending pin + Duel King placeholder | SOCIAL-40, SOCIAL-41, SOCIAL-42 | Requires running relayer worker + Postgres state | Seed duel with pot ≥ $500, run BullMQ worker, query `trending_duels`; confirm Duels-tab chips + Duel King placeholder render (no settled data until Phase 4) |
| OG card variant 3 visual fidelity | SOCIAL-51, SHARE-07 | Satori render correctness is visual | `curl` the route → 200; open image; confirm two-avatar layout + Syne "WINS" + flexbox-only (grep guard) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
