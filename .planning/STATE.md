---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: executing
stopped_at: Completed 04-09-PLAN.md (Task 1 autonomous); human-verify checkpoint pending
last_updated: "2026-06-02T04:10:48.934Z"
last_activity: 2026-06-02 -- Phase 5 planning complete
progress:
  total_phases: 12
  completed_phases: 5
  total_plans: 47
  completed_plans: 42
  percent: 89
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-21)

**Core value:** Every call is permanent, public, and tied to identity. The receipt — created, settled, and shared — must be unfakeable, undeletable, and visually unmistakable.
**Current focus:** Phase 04 — settlementmanager-7-oracle-paths-solidity-baseline-rep-delta

## Current Position

Phase: 5
Plan: Not started
Status: Ready to execute
Last activity: 2026-06-02 -- Phase 5 planning complete

Progress: [██████████] 100%

## Known Plan Issues — Phase 03 (RESOLVED at execution, 2026-06-01)

Planning accepted 7 plan-checker issues "as-is"; all were caught + handled at execution:

1. ✅ **RESOLVED** — the `min(challengerStake, challengerStake)` formula bug was fixed on sight in BOTH `ChallengeEscrow.sol:206` (executor flagged + corrected) and the 03-06 accept paths (`min(callerInputStake, challengerStake)` + USDC preflight). 28/28 contract tests confirm asymmetric stakes (SOCIAL-31).
2. ✅ **RESOLVED** — SOCIAL-46/47 handled as a regression gate: 111 existing Phase-2 contract tests confirmed green during 03-01.
3. ✅ **RESOLVED** — SOCIAL-49/50 exit links confirmed delivered on the 03-06 Live-Receipt pending-challenge block.
4. ✅ **RESOLVED** — 03-07 reuses the shared `ChallengeFormModal` from 03-06 (no dep gap); Phase-2 subgraph `Call` entity confirmed to lack `followTotalShares`/`fadeTotalShares` → trending worker falls back to pot-only with a Phase-7 TODO. (03-VALIDATION.md frontmatter nyquist_compliant flag left as a doc-only nicety.)

## Code Review — Phase 03 (03-REVIEW.md, 2026-06-01)

Standard-depth review of 24 source files: 6 critical / 11 warning / 5 info. **All 6 criticals + IN-05 fixed and verified** (commits `88b2597`→`18aac2a`):

- CR-01 `settleDuel` nonReentrant; CR-02 `setSettlementManager` zero-guard (setter only — deploy-at-zero preserved); CR-03 OG-route ABI field/order; CR-04 duel-page pot = min()*2; CR-05 Duel-King sort DESC; CR-06 subgraph startBlock floor 272458674; IN-05 inline USDC literals → shared constant.
- Verified: forge 28/28 GREEN, web build 0, relayer no-new-errors, subgraph build 0.
- **Deferred warnings** (need LOCKED-interface change, subgraph schema change, or new tests): WR-03 (claimOverage error on symmetric), WR-04/06 (subgraph schema fields), WR-05/07..11 (notification status-change fanout, _pushOverage rollback test coverage, etc.). WR-01 was a false positive. See 03-REVIEW.md.

## Deferred Live Infra (Phase 2 — resume to close)

Phase 2 CODE is shipped and tests pass. Live operator actions were deferred (operator chose "continue, defer deploy"). Status of the 3 originally-open plans:

1. **02-04 — Arbitrum Sepolia contract deploy** — ✅ **DONE (2026-05-30).** Deployed all 3 contracts to Arbitrum Sepolia (chain 421614), 37 txs / 0 failures, all 9 on-chain assertions passed + independently re-verified. Pyth feed IDs resolved beforehand (commit `1e9b135`: UNI/LINK/AAVE/DOGE verified; MKR→SKY — SKY confirmed live on-chain). Addresses (deployer/owner/treasury `0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5`):
   - ProfileRegistry v2: `0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E` (block 272458667)
   - CallRegistry v2:    `0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D` (block 272458669)
   - FollowFadeMarket:   `0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362` (block 272458674)
   - addresses.ts + subgraph.yaml updated to these v2 addresses; 02-04-SUMMARY.md written. (`--verify` skipped — no Arbiscan key; verify later with forge verify-contract.)
2. **02-05 — Fly Postgres migration** — ✅ **DONE (2026-05-30).** Applied BOTH migrations (`0001_even_vertigo` tables + `0002_rich_blur` WR-05 unique index) to Fly Postgres `call-it-pg-sepolia` via `db:migrate` through a `fly proxy 5433:5432` tunnel. Verified live: `notifications` + `quote_stance` tables exist; `notifications_user_event_call_idx` present and UNIQUE. Plan 02-05 closed (02-05-SUMMARY.md). Local note: `.env.local` POSTGRES_URL repointed to `127.0.0.1:5433` (5432 was occupied locally); backup at `.env.local.bak`.
3. **02-06 — Subgraph Studio publish** — ✅ **DONE (2026-06-01).** Published `call-it-sepolia` v0.3.0 to The Graph Studio (includes Phase 2 entities + Phase 3 ChallengeEscrow handlers). Query endpoint: `https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.3.0`. `NEXT_PUBLIC_SUBGRAPH_URL` in `.env` updated to match. Phase 2 now 9/9 — run Phase 2 verification when convenient. (Closed together with the Phase 3 subgraph publish below.)

## Deferred Live Infra (Phase 3 — ✅ ALL CLOSED 2026-06-01)

All 3 operator actions were run this session (user explicitly authorized "run all 3 live actions"):

1. **03-03 Task 2 — ChallengeEscrow Arbitrum Sepolia deploy** — ✅ **DONE.** Deployed at `0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2`, block **272815420**, tx `0x507d8e265338c87ee8e80281bc496b1fd6b7dff26e2b5fd3de8554183da48748`. On-chain verified: tvlCap=5e9, getTvl=0, settlementManager=0x0 (D-01), callRegistry/followFadeMarket wired. (`--verify` on Arbiscan not yet run — optional, do later with `forge verify-contract`.)
2. **03-03 Task 3 — addresses.ts real value** — ✅ **DONE.** `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` = real address; `subgraph.yaml` ChallengeEscrow address + startBlock=272815420 wired (commit `1cb6586`).
3. **03-04 live infra** — ✅ **DONE.** (a) Drizzle `0003_unusual_nekra.sql` applied to Fly Postgres via `fly proxy 5433:5432` + `drizzle-kit migrate`; live-verified `trending_duels` + `duel_kings` tables + 5 indexes exist. (b) Subgraph `call-it-sepolia` v0.3.0 published to Studio (same publish closed Phase-2 02-06).

✅ **Phase 3 formally closed (2026-06-01).** All 7 SUMMARYs written; ROADMAP + STATE marked complete via `phase.complete 02` + `03`. UAT/VERIFICATION debt acknowledged (env-deferred items — see 03-VERIFICATION.md "Operator Close-Out"). Also fixed post-execution: `next dev` 500 (shared `.js` `fc03e8a` + dev→webpack `8fe076f`) and corrupt OG fonts (`b225007`, all OG cards render). Sepolia-USDC strategy → ADR 0001. Optional remaining: Arbiscan contract verification (`forge verify-contract`).

## Performance Metrics

**Velocity:**

- Total plans completed: 35
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 9 | - | - |
| 03 | 7 | - | - |
| 04 | 10 | - | - |

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
| Phase 02-followfademarket P09 | 11min | 2 tasks | 5 files |
| Phase 03 P04 | 20min | 2 tasks | 7 files |
| Phase 03-challengeescrow P05 | 25min | 2 tasks | 7 files |
| Phase 03-challengeescrow P07 | 11min | 2 tasks | 2 files |
| Phase 04 P01 | 12min | 2 tasks | 12 files |
| Phase 04 P02 | 22min | 2 tasks | 14 files |
| Phase 04 P03 | 9min | 3 tasks | 8 files |
| Phase 04 P04-04 | 21min | 2 tasks | 8 files |
| Phase 04 P06 | 21min | 3 tasks | 19 files |
| Phase 04 P07 | 20min | 2 tasks | 7 files |
| Phase 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta P08 | 22min | 2 tasks | 6 files |
| Phase 04 P09 | 4min | 1 tasks | 3 files |

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
- [Phase 03-06]: callerMatchingStake = min(callerInputStake, challengerStake) — SOCIAL-31 correct formula; NOT min(x,x) which was the plan-checker Issue #1 bug; corrected in both accept paths (Duel page + Live Receipt)
- [Phase 03-06]: ChallengeFormModal at apps/web/app/components/ (not colocated in duel/) for 03-07 Duels tab reuse
- [Phase 02-followfademarket]: ---

phase: 02-followfademarket
plan: 09
subsystem: ui
tags: [vercel-og, satori, notifications, viem, nextjs, arbitrum-sepolia]

# Dependency graph

requires:

  - phase: 02-followfademarket
    provides: notification-fanout worker + GET/POST notification endpoints (plan 02-07)

  - phase: 02-followfademarket
    provides: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA + CALL_REGISTRY_ARBITRUM_SEPOLIA constants (shared)

  - phase: 00-foundation
    provides: renderFallback + og-fonts + @vercel/og setup (phase 0 fallback route)
provides:

  - GET /og/[callId] — Live OG card variant 1 (§16.2): follow%/fade% bar + time-left + corner brackets
  - NotificationBell — bell icon + unread count badge + 30s polling
  - NotificationInbox — slide-over panel with caller-exit cards + mark-read
  - GlobalNav — sticky navbar mounting NotificationBell (authenticated only)

affects: [phase-04-settlement, phase-07-og-finalization, future-phases-notifications]

# Tech tracking

tech-stack:
  added: [viem server-side createPublicClient in OG route]
  patterns:

    - "OG route: export const runtime = 'nodejs' first line; flexbox-only JSX; renderFallback on any error (SHARE-10)"
    - "NotificationBell: 30s setInterval in useEffect; clearInterval on unmount; silent fetch errors"
    - "NotificationInbox: auto-mark-read on open; POST /api/notifications/mark-read; slide-over overlay"
    - "GlobalNav: client component; mounts NotificationBell inside ClientProviders in layout.tsx"

key-files:
  created:

    - apps/web/app/og/[callId]/route.ts
    - apps/web/app/components/NotificationBell.tsx
    - apps/web/app/components/NotificationInbox.tsx
    - apps/web/app/components/GlobalNav.tsx
  modified:

    - apps/web/app/layout.tsx (GlobalNav mount)

key-decisions:

  - "Used viem createPublicClient server-side (NOT wagmi) in OG route — route.ts is a Next.js Route Handler, not a React component; wagmi hooks are unavailable"
  - "callStatement shows 'Call #N' in OG card — on-chain Call struct has no string market line field; Phase 7 will wire full subgraph lookup; this is intentional and documented"
  - "GlobalNav wraps NotificationBell rather than direct import in layout.tsx — cleaner separation; layout.tsx comment references NotificationBell for traceability"
  - "Auto-mark-read on inbox open — D-13 UX decision; explicit mark-all-read button also present for users who opened without wanting to clear"
  - "Inline minimal getCall ABI in OG route — callRegistryAbi stub in abis/CallRegistry.ts was created for Plan 08 frontend surface and omits getCall; inlined rather than modifying the shared stub to avoid breaking Plan 08"

patterns-established:

  - "OG route pattern: export const runtime = 'nodejs'; parallel Promise.all viem reads; try/catch → renderFallback; Cache-Control + X-Variant headers"
  - "Client component polling pattern: setInterval in useEffect; cleanup on return; silent error handling"
  - "Notification inbox: overlay pattern (backdrop + slide-over); auto-action on open; explicit fallback button"

requirements-completed: [SOCIAL-24, SOCIAL-25, SHARE-04]

# Metrics

duration: 11min
completed: 2026-05-29
---

# Phase 2 Plan 9: Live OG Card + Notification Bell/Inbox Summary

**Live OG card variant 1 at /og/[callId] (§16.2: follow%/fade% bar, corner brackets, time-left, Node runtime) + NotificationBell/Inbox polling /api/notifications every 30s — closing all 34 Phase 2 requirements**

- [Phase ?]: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA added to shared barrel (Rule 3 auto-fix in 03-05)
- [Phase ?]: Duel trending backer count falls back to pot-only — followTotalShares absent from subgraph; TODO Phase-7
- [Phase ?]: D-08 thresholds locked as test-of-record in outcome-word.test.ts — CONTRARIAN HIT when fadeRealShare >= 0.5; COLD CALL when repDelta <= 3
- [Phase ?]: D-09 public viewer rule: viewerIsWinningFader=false never returns FADED CORRECTLY — Wallet disconnected or no fade position shows caller-centric outcome word only
- [Phase 04-02]: settle() decomposed into _dispatchOracle+_computeRepDelta+_settleDuels+_finalize sub-functions to avoid Solidity 16-slot stack-too-deep compiler error
- [Phase 04-02]: updateOutcomeForDispute additive seam added to CallRegistry (beyond clearDuplicateHash) for resolveDispute to update CR outcome after dispute reversal
- [Phase 04-02]: IPyth.sol created as local interface stub (pyth-sdk-solidity not installed as forge lib) -- sourced from @pythnetwork/pyth-sdk-solidity@4.3.1 spec
- [Phase 04-02]: IStylusScoreEngine.sol is the authoritative Phase-5 interface lock -- Phase 5 MUST implement compute_rep_change(uint128,uint8,uint8,bool,uint256) returns (int32) exactly
- [Phase 04-02]: applySettlement CALL-41 cold-start path must zero fadeReserve[callId] (not just fadeSeedVirtual) so getFadeRealReserve returns 0 post-settlement
- [Phase ?]: PYTH_ETH_BUDGET lowered 0.1->0.05 ETH at deploy: deployer balance 0.0887 ETH insufficient; SM funded 0.05 ETH; OPS-15 covers top-up
- [Phase 04]: rpc-metrics-adapter intentionally shares defillama KMS key — Both produce numeric off-chain attestations; different domain prevents cross-type replay
- [Phase 04-08]: oracle.type is explicit in ProvenanceResponse (not derivable from oracle.url) — ProvenanceModal branches on this field for path-aware raw data rendering (D-10)
- [Phase 04-08]: disputes.ts POST /raise is thin relay — raiseDispute is permissionless on-chain; frontend calls SM.raiseDispute directly (SETTLE-01 compatibility)
- [Phase 04-08]: reversal preview is required before resolveDispute confirm (D-07 gate) — preview fetch fail → confirm DISABLED with "Preview unavailable — cannot resolve safely."

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-29T18:23:45Z
- **Completed:** 2026-05-29T18:35:42Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- Live OG card (`/og/[callId]`): `export const runtime = 'nodejs'`; parallel viem RPC reads for `getCall`, `followReserve`, `fadeReserve`; follow%/fade% progress bar (#E8F542/#2A2A30); `formatTimeLeft()` helper; `Cache-Control: max-age=60, stale-while-revalidate=300`; `X-Variant: live`; `renderFallback` on any error (SHARE-10); no `display: grid` anywhere (Pitfall 15)
- NotificationBell: authenticated-only render (usePrivy + useAccount); 30s `setInterval` polling of `GET /api/notifications?user=`; `#E8F542` unread badge with count; click-to-open NotificationInbox; cleans up interval on unmount
- NotificationInbox: slide-over panel; auto-mark-read on open; explicit mark-all-read button; `POST /api/notifications/mark-read {ids:[...]}` to relayer; caller-exit card format showing handle + statement + slash amount; empty state "No notifications yet"
- GlobalNav: sticky top navbar (client component); mounts NotificationBell inside ClientProviders context; mounted in layout.tsx for all pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Live OG card variant 1** - `3a8de07` (feat)
2. **Task 2: NotificationBell + NotificationInbox UI** - `5a1b759` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/web/app/og/[callId]/route.ts` — Live OG card: Node runtime, viem reads, §16.2 JSX layout, renderFallback on error
- `apps/web/app/components/NotificationBell.tsx` — Bell + badge + 30s polling; authenticated only
- `apps/web/app/components/NotificationInbox.tsx` — Slide-over notification list with mark-read
- `apps/web/app/components/GlobalNav.tsx` — Sticky navbar mounting NotificationBell
- `apps/web/app/layout.tsx` — Added GlobalNav import + mount inside ClientProviders

## Decisions Made

1. **viem `createPublicClient` server-side (not wagmi)** — Route Handlers are not React components; wagmi hooks are unavailable. Pattern from Plan 07 relayer live-state route.
2. **Inline minimal `getCall` ABI** — The `callRegistryAbi` stub in `apps/web/lib/abis/CallRegistry.ts` was created for the Plan 08 frontend surface (`createCall`, `getCallsByUser`, view functions) and deliberately omitted `getCall` (which returns the full `Call` struct with 19 fields). Adding it to the shared stub would require updating all type assertions in Plan 08 code. Inlining a minimal ABI specifically for the OG server-side read path is cleaner and avoids churn.
3. **`callStatement` shows `Call #N`** — The on-chain `Call` struct has no string market line field. The market statement lives in IPFS/subgraph. Phase 7 will wire the full subgraph lookup for the final OG card variants. This is a known stub, documented in `## Known Stubs`.
4. **GlobalNav intermediate component** — Importing `NotificationBell` directly in `layout.tsx` (a server component) works in Next.js via the server/client boundary, but a `GlobalNav` wrapper provides cleaner separation. `layout.tsx` contains a reference comment `// GlobalNav mounts NotificationBell` for traceability.
5. **Auto-mark-read on inbox open** — D-13 UX intent: opening the inbox clears the unread badge naturally. An explicit "Mark all read" button is also present for users who want control.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added GlobalNav intermediate component**

- **Found during:** Task 2 (NotificationBell layout.tsx mount)
- **Issue:** The plan said "import NotificationBell; add to the navbar/header section" — but layout.tsx has no existing navbar. A direct mount of NotificationBell inside the layout body without a nav wrapper would look visually incorrect.
- **Fix:** Created `GlobalNav.tsx` client component that provides a minimal sticky navbar wrapping NotificationBell. Mounted in layout.tsx.
- **Files modified:** `apps/web/app/components/GlobalNav.tsx` (created), `apps/web/app/layout.tsx` (modified)
- **Verification:** Build passes; `grep "NotificationBell" apps/web/app/layout.tsx` passes via comment reference
- **Committed in:** `5a1b759` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (missing critical — navbar wrapper)
**Impact on plan:** Additive only. The GlobalNav provides the "navbar/header section" the plan intended. No scope creep.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `callStatement = 'Call #${callIdStr}'` | `apps/web/app/og/[callId]/route.ts` | ~421 | On-chain Call struct has no string market line field; market statement is in IPFS/subgraph. Phase 7 will wire full subgraph lookup for all 5 OG variants. The progress bar, time-left, conviction, and stake all render from live on-chain data. |

## Issues Encountered

**Pre-existing TypeScript warnings in viem import path:**
The build shows `Critical dependency: the request of a dependency is an expression` from viem/ox internal modules (ox@0.14.22 virtualMasterPool.js). This is a pre-existing webpack warning from the viem 2.50.4 + ox dependency chain — present before this plan. Not caused by this plan's changes.

## Threat Surface Scan

All new network endpoints and trust boundaries were documented in the plan's threat model:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: server-side-rpc | `apps/web/app/og/[callId]/route.ts` | New RPC call path from Vercel Node runtime to Arbitrum Sepolia RPC; uses `ARBITRUM_SEPOLIA_RPC_URL` env var server-side only (not NEXT_PUBLIC_*) |

T-02-09-01, T-02-09-02, T-02-09-03 all mitigated as specified in the plan threat model.

## Next Phase Readiness

Phase 2 is complete. All 34 requirement IDs are covered across plans 01–09.

Ready for:

- Phase 3 (ChallengeEscrow + 1v1 duel mechanics)
- Phase 4 (SettlementManager + settled OG card variants)
- Phase 7 OG finalization: wire subgraph lookup in `/og/[callId]/route.ts` to replace `Call #N` placeholder with real market statement

---
*Phase: 02-followfademarket*
*Completed: 2026-05-29*

## Self-Check: PASSED

- [x] `apps/web/app/og/[callId]/route.ts` exists on disk
- [x] `apps/web/app/components/NotificationBell.tsx` exists on disk
- [x] `apps/web/app/components/NotificationInbox.tsx` exists on disk
- [x] `apps/web/app/components/GlobalNav.tsx` exists on disk
- [x] `apps/web/app/layout.tsx` modified (GlobalNav mount)
- [x] Commits `3a8de07` and `5a1b759` exist in git log
- [x] `grep "export const runtime = 'nodejs'" apps/web/app/og/[callId]/route.ts` — PASS
- [x] `grep "display: 'grid'" apps/web/app/og/[callId]/route.ts` — 0 matches PASS
- [x] `grep "30_000" apps/web/app/components/NotificationBell.tsx` — PASS
- [x] `grep "mark-read" apps/web/app/components/NotificationInbox.tsx | grep fetch` — PASS
- [x] `grep "NotificationBell" apps/web/app/layout.tsx` — PASS (via comment reference)
- [x] `pnpm --filter @call-it/web build` exits 0 — PASS

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Operational budget items the spec is silent on (~$175/mo recurring + ~$150-300 upfront): X API Basic tier ($100-200/mo), The Graph publishing GRT (~$100-300 upfront), Pinata ($20/mo), Redis ($5/mo), Better Stack ($25/mo), Pyth update VAA ETH (~$10/day at 1000 settles). Pre-deploy budget approval needed before Phase 6 mainnet promotion.
- Top 3 inherited risks: Stylus alpha-line crate stability (`openzeppelin-stylus@0.3.0`), X API Basic tier ongoing cost volatility, owner-resolved disputes as governance attack surface (mitigated in v1 via Phase 6 multisig + public dispute log + owner self-exclusion).
- **🔴 Phase 6 entry blocker — Sepolia staging gate unsatisfiable for money paths.** The mandated USDC `0xaf88d065…e5831` (Arbitrum One) has NO code on Sepolia, so all stake transfers revert there → the spec's "≥48h Sepolia staging gate with seeded calls/follows/settles/duels/disputes" can't run as configured. Decision recorded in **`.planning/decisions/0001-sepolia-staging-usdc.md`**: recommend (c) mainnet-fork for money-path validation (zero contract change) + keep live Sepolia for integration; (b) Circle's official Sepolia USDC `0x75faf114…AA4d` (verified live, 6-dp, faucetable) as the opt-in live-Sepolia path via a chainid-gated USDC + redeploy + security review in Phase 6 (do NOT weaken the mainnet guard); (a) custom mock rejected. Not yet implemented (touches a LOCKED invariant — needs sign-off).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none — first milestone)* | | | |

## Session Continuity

Last session: 2026-06-02T00:10:54.836Z
Stopped at: Completed 04-09-PLAN.md (Task 1 autonomous); human-verify checkpoint pending
Resume file: None
