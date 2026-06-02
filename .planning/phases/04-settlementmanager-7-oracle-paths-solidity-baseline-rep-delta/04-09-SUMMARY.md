---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 09
subsystem: infra
tags: [github-actions, cex-scraper, oauth, adr, addresses, subgraph, safety]

# Dependency graph
requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: 8 CEX scraper modules with testWithFixture (plan 04-01 scaffold + 04-06 implementation)
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: SettlementManager deployed on Sepolia (04-03 operator step)
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: FollowFadeMarket v2 deployed on Sepolia (04-03 operator step)
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: Subgraph v0.4.0 published with SettlementManager handlers (04-05 + 04-06)
provides:
  - Weekly CEX scraper synthetic CI cron (.github/workflows/cex-synthetic-ci.yml): matrix job
    runs all 8 CEX scraper testWithFixture functions every Monday; fail-fast=false isolates
    per-exchange failures; triage instructions on failure (D-02, Pitfall 10)
  - SAFETY-57 ADR (docs/adr/SAFETY-57-oauth-permission-scoping.md): follows.read v1 limitation
    documented; X API Basic tier requirement for Phase 1.5; RPC metrics KMS key blast-radius
    note (SAFETY-58) for Phase 6 security review
  - SUBGRAPH_URL_SEPOLIA updated to v0.4.0 in packages/shared/src/constants/addresses.ts;
    Phase 4 on-chain assertion block added
affects: [phase-05-stylus-score-engine, phase-06-mainnet-promotion, phase-1.5-social-linking]

# Tech tracking
tech-stack:
  added: [github-actions matrix strategy (fail-fast=false for per-exchange isolation)]
  patterns:
    - "CEX CI pattern: matrix job per exchange with fail-fast=false; testWithFixture tests
      run with pnpm --filter @call-it/relayer test --run --reporter=verbose <pattern>;
      per-job step summary for triage"
    - "ADR format: frontmatter with adr/title/status/date/owner/affects/related;
      Context → v1 Limitation → Security Implications → Decision → Consequences → References"

key-files:
  created:
    - .github/workflows/cex-synthetic-ci.yml
    - docs/adr/SAFETY-57-oauth-permission-scoping.md
  modified:
    - packages/shared/src/constants/addresses.ts (SUBGRAPH_URL_SEPOLIA v0.0.1 -> v0.4.0 + Phase 4 on-chain assertion block)

key-decisions:
  - "CEX CI uses matrix strategy (fail-fast=false) so one broken exchange doesn't block the other 7 — per D-02, Pitfall 10 per-exchange isolation requirement"
  - "SAFETY-57 accepted: follows.read OAuth scope is a v1 limitation; Phase 1.5 will wire the follow-graph feed with X API Basic tier; v1 uses only tweet.read+users.read for VERIFIED badge"
  - "RPC metrics shares defillama KMS key (Phase 04-06 implementation deviation): domain separation provides replay protection; Phase 6 security review must assess whether per-adapter key isolation is required for mainnet"
  - "SUBGRAPH_URL_SEPOLIA updated to v0.4.0 (hasIndexingErrors=false, Phase 4 SettlementManager handlers live)"

patterns-established:
  - "ADR convention for security/permission decisions: docs/adr/SAFETY-{N}-{title}.md"
  - "CEX synthetic CI: matrix job per exchange (8 total), weekly Monday 09:00 UTC cron + workflow_dispatch"

requirements-completed:
  - SETTLE-23
  - SETTLE-24
  - SAFETY-57
  - OPS-15
  - OPS-16

# Metrics
duration: 4min
completed: 2026-06-02
---

# Phase 4 Plan 9: CEX Synthetic CI + SAFETY-57 ADR + Address Finalization Summary

**Weekly CEX synthetic CI cron (matrix, fail-fast=false, 8 exchanges) + SAFETY-57 ADR documenting follows.read v1 limitation + SUBGRAPH_URL_SEPOLIA finalized to v0.4.0 — closing all Phase 4 autonomous requirements**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-02T00:05:54Z
- **Completed:** 2026-06-02T00:09:20Z
- **Tasks:** 1 autonomous task executed (+ 1 human-verify checkpoint pending operator)
- **Files modified:** 3

## Accomplishments

- Weekly CEX scraper synthetic CI cron: matrix GitHub Actions workflow runs all 8 exchanges (Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit) in parallel matrix jobs with `fail-fast: false`; each job scopes to its exchange's test pattern via `pnpm --filter @call-it/relayer test --run --reporter=verbose <pattern>`; per-job triage summary on failure documents selector-drift and Innovation Zone exclusion update instructions
- SAFETY-57 ADR documenting: (a) follows.read OAuth scope is a v1 limitation — only tweet.read+users.read requested in v1 for the VERIFIED badge; (b) "From your X" follow-graph feed is Phase 1.5 requiring X API Basic tier; (c) Farcaster SIWF scope is minimal (FID only); (d) RPC metrics KMS key blast-radius note for Phase 6 security review
- SUBGRAPH_URL_SEPOLIA updated from v0.0.1 to v0.4.0 (Phase 4 SettlementManager handlers with CallSettled/DisputeRaised/DisputeResolved/RepCalculated events; hasIndexingErrors=false); Phase 4 on-chain post-deploy assertion block added to comment

## Task Commits

Each task was committed atomically:

1. **Task 1: CEX weekly CI cron + SAFETY-57 ADR + addresses.ts finalization** - `84e7c3f` (feat)

## Files Created/Modified

- `.github/workflows/cex-synthetic-ci.yml` — matrix cron CI: 8 CEX scraper testWithFixture jobs, Monday 09:00 UTC + workflow_dispatch, fail-fast=false, per-job triage summary
- `docs/adr/SAFETY-57-oauth-permission-scoping.md` — SAFETY-57 accepted: follows.read v1 limitation + RPC metrics KMS key blast-radius note
- `packages/shared/src/constants/addresses.ts` — SUBGRAPH_URL_SEPOLIA v0.4.0 + Phase 4 on-chain assertions comment block

## Decisions Made

1. **CEX CI uses matrix fail-fast=false** — per D-02/Pitfall 10 per-exchange isolation requirement; one broken exchange must not cascade to block the other 7.
2. **SAFETY-57 accepted** — follows.read scope is a v1 limitation (no follow-graph data fetched); the "From your X" feed is a Phase 1.5 feature requiring X API Basic tier budget.
3. **RPC metrics shared defillama KMS key** — documented as SAFETY-58 follow-up in the ADR; domain separation in the EIP-712 struct provides replay protection; Phase 6 security review must evaluate per-adapter key isolation for mainnet.
4. **SUBGRAPH_URL_SEPOLIA pinned to v0.4.0** — the Phase 4 redeploy with SettlementManager handlers is live and verified (hasIndexingErrors=false per key facts).

## Deviations from Plan

None - plan executed exactly as written.

The addresses.ts was already partially complete (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA and FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA were set in prior plan 04-03 operator step). The only required update was SUBGRAPH_URL_SEPOLIA from v0.0.1 to v0.4.0 per the live deployment state documented in the key facts.

## Known Stubs

None in this plan. The SUBGRAPH_URL_SEPOLIA is now the real v0.4.0 endpoint.

## Threat Flags

No new threat surface introduced. This plan creates documentation files and a GitHub Actions workflow using static fixtures — no new network endpoints, auth paths, or schema changes.

## Security Notes

### RPC Metrics Shared KMS Key (SAFETY-58)

Per the Phase 04-06 implementation deviation documented in STATE.md:

> "rpc-metrics-adapter intentionally shares defillama KMS key — Both produce numeric off-chain attestations; different domain prevents cross-type replay"

This is documented in SAFETY-57 ADR under "Related: RPC Metrics KMS Key Blast-Radius Note" as a follow-up item for the Phase 6 pre-mainnet security review. The v1 risk is mitigated by EIP-712 domain separation, which prevents cross-type replay between a DefiLlama TVL attestation and an RPC metrics attestation. A dedicated key per adapter would further contain blast radius but adds operational overhead disproportionate to the Phase 4 risk surface (Sepolia, $5,000 TVL cap).

## Checkpoint: End-to-End Verification

This plan ends with a `checkpoint:human-verify` (the §19.11 smoke test against the live Arbitrum Sepolia deployment). The operator must run the full verification checklist before Phase 4 is formally closed. See the checkpoint output below.

## Issues Encountered

None - all acceptance criteria passed cleanly.

## Next Phase Readiness

Phase 4 autonomous work is complete. All 9 plans have been executed (04-01 through 04-09 Task 1). The operator must run the §19.11 end-to-end verification to close Phase 4.

Ready for:
- Phase 5: StylusScoreEngine (Rust + TransparentUpgradeableProxy + 48h cutoff)
- Phase 1.5: Social linking + follow-graph feed (requires X API Basic tier budget)
- Phase 6: Mainnet promotion gate + full Sepolia load validation

Blockers:
- [OPERATOR] End-to-end Phase 4 verification checkpoint (§19.11 smoke test) — must complete before Phase 5 begins
- ADR-0001 Sepolia staging-USDC decision remains unimplemented (live Sepolia money flows still impossible; mainnet-fork path is the recommended resolution for Phase 6)

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-02*

## Self-Check

- [x] `.github/workflows/cex-synthetic-ci.yml` exists on disk
- [x] `docs/adr/SAFETY-57-oauth-permission-scoping.md` exists on disk
- [x] `packages/shared/src/constants/addresses.ts` modified (SUBGRAPH_URL_SEPOLIA = v0.4.0)
- [x] SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA = 0xAc37a0e4A3e575EF21684c28a5b820dB44654595 (not zero address)
- [x] FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA = 0x185e43526c0acd88AC236197e3Ee7629ebd601CA (not old 0x12aafa5a...)
- [x] Commit 84e7c3f exists in git log
- [x] cex-synthetic-ci.yml contains `cron: '0 9 * * 1'`
- [x] cex-synthetic-ci.yml contains >= 8 cex- patterns
- [x] SAFETY-57 ADR contains "X API Basic tier" and "Phase 1.5"
- [x] pnpm --filter @call-it/shared build exits 0

## Self-Check: PASSED
