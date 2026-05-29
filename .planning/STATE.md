---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: executing
stopped_at: Completed 02-08-PLAN.md
last_updated: "2026-05-29T18:17:59.484Z"
last_activity: 2026-05-29
progress:
  total_phases: 12
  completed_phases: 2
  total_plans: 24
  completed_plans: 21
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-21)

**Core value:** Every call is permanent, public, and tied to identity. The receipt — created, settled, and shared — must be unfakeable, undeletable, and visually unmistakable.
**Current focus:** Phase 02 — followfademarket

## Current Position

Phase: 02 (followfademarket) — EXECUTING
Plan: 6 of 9
Status: Ready to execute
Last activity: 2026-05-29

Progress: [█████████░] 88%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: — (no data yet)

*Updated after each plan completion*
| Phase 00-foundation P01 | 90 | 5 tasks | 48 files |
| Phase 00 P02 | 90 | 4 tasks | 30 files |
| Phase 00 P03 | 90 | 4 tasks | 33 files |
| Phase 00-foundation P04 | 80 | 4 tasks | 23 files |
| Phase 00-foundation P05 | 90 | 5 tasks | 9 files |
| Phase 02-followfademarket P01 | 10min | 3 tasks | 8 files |
| Phase 02-followfademarket P02 | 30min | 2 tasks | 14 files |
| Phase 02-followfademarket P03 | 10min | 2 tasks | 2 files |
| Phase 02-followfademarket P07 | 12min | 2 tasks | 7 files |
| Phase 02-followfademarket P08 | 21min | 3 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Spec source-of-truth: `CALL_IT_SPEC1.md` v1.0 locked at 3,088 lines; REQ-IDs in REQUIREMENTS.md are translation, not redesign
- Roadmap derived from spec §19 plus 5 research deltas: Phase 0 added (always-live foundation); Phase 1.5 runs parallel to Phase 2 (social linking); Solidity baseline rep delta ships in Phase 4 not Phase 5; multisig promotion pulled into Phase 6 as hard gate; subgraph + OG service skeletons in Phase 0 with finalization in Phase 7
- Solidity pinned to exact `=0.8.30` (NOT `^0.8.24`) to avoid 0.8.28–0.8.33 IR storage-clearing bug; CI grep guard enforces
- USDC hardcoded to canonical `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (NOT bridged USDC.e); CI grep guard enforces single source-of-truth
- Stylus 48h-before-demo cutoff is mechanical `proxy.upgradeTo(soliditySolidityBaselineAddress)` (one cast call), not a panicked rewrite — baseline ships in-contract from Phase 4
- [Phase ?]: 00-01 deviation: @privy-io/wagmi pinned to 4.0.8 (v1.32.5 specified in CLAUDE.md does not exist on npm)
- [Phase ?]: graph-cli@0.98.1 requires explicit @entity(immutable:true/false)
- [Phase 0 P05]: GCP OIDC federation (google-github-actions/auth@v2) for all deploy workflows — no long-lived service-account JSON keys in GH Secrets (T-00-35)
- [Phase 0 P05]: DRY fetch_secret() helper pattern in deploy-relayer.yml — centralizes --project=$GCP_PROJECT_ID routing for all 17 GCP Secret Manager fetches
- [Phase 0 P05]: Injectable step1Override in runSmokeTest() for unit testability — production CI path unaffected
- [Phase ?]: [Phase 02-01]: test file in test/ not src/validation/ to match vitest include pattern; Wave 0 RED gate confirmed; FfmTestHelper abstract base for all FFM test contracts
- [Phase 02-followfademarket]: [02-02]: callerExit sub-functions for 16-slot stack depth; currentTvl tracks stakes only in CR v2; full creation fee to treasury for D-01 zero-balance invariant; FfmTestHelper C3 linearization fix
- [Phase ?]: 02-03: CallerExited ordinal stays at 3 (not 2) — Disputed=2 was added in Phase 1; ABI-stable ordering enforced via NatSpec comment
- [Phase ?]: 02-03: Outcome enum Pending=0 default; markSettled + callerExitedAt complete Phase 4 authorization surface
- [Phase ?]: [Phase 02-08]: repDelta hardcoded to -35 in CallerExitModal; Phase 4 will wire computeCallerExitRepDelta exact value

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Operational budget items the spec is silent on (~$175/mo recurring + ~$150-300 upfront): X API Basic tier ($100-200/mo), The Graph publishing GRT (~$100-300 upfront), Pinata ($20/mo), Redis ($5/mo), Better Stack ($25/mo), Pyth update VAA ETH (~$10/day at 1000 settles). Pre-deploy budget approval needed before Phase 6 mainnet promotion.
- Top 3 inherited risks: Stylus alpha-line crate stability (`openzeppelin-stylus@0.3.0`), X API Basic tier ongoing cost volatility, owner-resolved disputes as governance attack surface (mitigated in v1 via Phase 6 multisig + public dispute log + owner self-exclusion).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none — first milestone)* | | | |

## Session Continuity

Last session: 2026-05-29T18:16:36.844Z
Stopped at: Completed 02-08-PLAN.md
Resume file: None
