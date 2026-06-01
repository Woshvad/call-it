---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 07
subsystem: ui
tags: [nextjs, satori, vercel-og, framer-motion, outcome-word, settled-receipt, vitest, typescript]

# Dependency graph
requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: outcome-word.test.ts RED scaffold (plan 04-01)
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: SettlementManager subgraph (plan 04-05)
  - phase: 02-followfademarket
    provides: Live OG card variant 1 + renderFallback + og-fonts (plan 02-09)
  - phase: 03-challengeescrow
    provides: Duel OG route with D-11 settled stubs (plan 03-07)

provides:
  - "getOutcomeWord() + getOutcomeWordResult() — D-08 thresholds (COLD CALL priority, CONTRARIAN HIT, CALLED IT, LOUD AND WRONG, FADED CORRECTLY D-09)"
  - "outcome-word.test.ts GREEN gate — 9 tests passing in apps/web/tests/"
  - "Stamp.tsx extended: hexColor? prop + boxShadow 0→4px 4px 0 {color} animation (UI-45)"
  - "call/[id]/page.tsx: Settled Receipt branch (96px Syne outcome word, FINAL POSITIONS flex, provenance line)"
  - "call/[id]/page.tsx: Disputed branch (PENDING DISPUTE block amber) + CallerExited settled branch"
  - "og/[callId]/route.ts: buildSettledCard (variant 2) + buildCallerExitedCard (variant 4)"
  - "og/duel/[challengeId]/route.ts: D-11 stub fill (settled=winner, callerIsWinner, WINS, real repDelta)"

affects: [phase-05-stylus-engine, phase-07-og-finalization, future-phases-settlement]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — Plan 04-07 as specified
  patterns:
    - "Settled Receipt page: early-return branch on isSettled before Live render; keeps Live path clean"
    - "outcome-word: compiled .js artifact must be kept in sync with .ts source when vitest resolves .js extension first"
    - "OG card branching: branch on callData.status uint8 ordinal (3=Settled, 2=CallerExited, 1=Disputed, 0=Live)"
    - "Cross-package test violation fix: co-locate test in consuming package (web/tests/) not in producer (relayer)"
    - "D-09 viewerIsWinningFader guard: authenticated AND userAddress AND fadeShares > 0 AND CallerLost"

key-files:
  created:
    - apps/web/lib/outcome-word.ts (GREEN implementation, was throwing stub)
    - apps/web/lib/outcome-word.js (compiled artifact kept in sync)
    - apps/web/tests/outcome-word.test.ts (moved from relayer — cross-package rootDir fix)
  modified:
    - packages/ui/src/primitives/Stamp.tsx (hexColor? prop + boxShadow animation)
    - apps/web/app/call/[id]/page.tsx (Settled/Disputed/CallerExited branches)
    - apps/web/app/og/[callId]/route.ts (buildSettledCard + buildCallerExitedCard)
    - apps/web/app/og/duel/[challengeId]/route.ts (D-11 stub fill)

key-decisions:
  - "outcome-word test co-located in apps/web/tests/ (not shared package) — shared package holds constants/types/schemas, not display logic; relayer should not import web source (rootDir violation TS6059/TS6307)"
  - "Compiled outcome-word.js updated manually — vitest resolves .js before .ts when both exist; keeping .js in sync is the lowest-friction fix without restructuring the tsbuildinfo"
  - "CONTRARIAN HIT = #E8F542 explicit hex (NOT outcome-contrarian token #A855F7 from Stamp token map) — §14.1 is authoritative; token map is stale per UI-SPEC conflict note"
  - "Stamp hexColor? is additive only — existing StampColor token union unchanged; other callers not affected"
  - "buildSettledCard outcome data (repDelta, finalValue) uses Phase 7 placeholder '—' stubs — SettlementManager.RepCalculated events not yet read in OG route; Phase 7 wires full subgraph lookup"
  - "Duel OG callerIsWinner = winner.toLowerCase() === caller.toLowerCase() (T-04-07-04 winner-aware); callerRepDelta uses +REP/-REP labels pending Phase 7 subgraph RepCalculated wire"

patterns-established:
  - "OG route multi-variant: branch on callData.status ordinal; X-Variant header: settled/caller-exited/live"
  - "D-09 fader guard: authenticated && userAddress && outcome===CallerLost && hasFadePosition; false when wallet disconnected"

requirements-completed:
  - UI-14
  - UI-15
  - UI-16
  - UI-17
  - UI-18
  - UI-19
  - UI-20
  - UI-21
  - UI-22
  - UI-23
  - UI-44
  - UI-45
  - UI-52
  - UI-54
  - SHARE-05
  - SHARE-06
  - SHARE-08
  - SHARE-12

# Metrics
duration: 20min
completed: 2026-06-01
---

# Phase 4 Plan 7: Settled Receipt + OG Variants + Outcome-Word GREEN Gate Summary

**Settled Receipt page (96px Syne outcome word, FINAL POSITIONS flex, provenance line) + 3 OG card variants (Settled/CallerExited/Duel settled fill) + getOutcomeWord() GREEN gate (9 tests pass) + Stamp boxShadow animation**

## Performance

- **Duration:** 20 min
- **Started:** 2026-06-01T23:02:22Z
- **Completed:** 2026-06-01T23:22:27Z
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- Implemented `getOutcomeWord()` in `apps/web/lib/outcome-word.ts` — GREEN gate for 9 spec-of-record tests (D-08 thresholds: COLD CALL priority over CONTRARIAN HIT at repDelta<=3, CONTRARIAN HIT at fadeShare>=0.5, CALLED IT default win, LOUD AND WRONG default loss, FADED CORRECTLY per-viewer D-09)
- Resolved outcome-word cross-package rootDir violation: moved test from relayer to `apps/web/tests/outcome-word.test.ts` so relayer no longer imports `apps/web` source (TS6059/TS6307 eliminated)
- Extended `Stamp.tsx` with `hexColor?` prop + boxShadow expansion animation `0→4px 4px 0 {color}` ~300-400ms ease-out (UI-45); existing StampColor token map unchanged (additive only)
- Added Settled Receipt branch in `call/[id]/page.tsx`: outcome hero 96px Syne §14.1 colors, Stamp animation, rep count-up, FINAL POSITIONS two-column flex (NOT grid), action row, provenance line (SETTLE-52/D-10); viewerIsWinningFader guard (D-09 T-04-07-05)
- Added Disputed branch: PENDING DISPUTE block amber #FB923C (UI-23)
- Added `buildSettledCard` (variant 2, SHARE-05/06) + `buildCallerExitedCard` (variant 4, SHARE-08) in `og/[callId]/route.ts`; ?as=fader shows FADED CORRECTLY (D-09); X-Variant header per branch
- Filled D-11 stubs in `og/duel/[challengeId]/route.ts`: `settled = winner !== ZERO_ADDRESS`, winner-aware `callerIsWinner` boolean (T-04-07-04), WINS in #E8F542, `repDeltaDisplay` replaces hardcoded "? REP", `X-Variant: duel-settled`
- All OG routes: flexbox-only (no `display:grid` anywhere in code), `export const runtime = 'nodejs'` as first export, `renderFallback` on error
- `pnpm --filter @call-it/web build` exits 0; 9 outcome-word tests GREEN

## Task Commits

1. **Task 1: outcome-word.ts + Stamp + Settled Receipt page** - `78a1f8a` (feat)
2. **Task 2: Settled OG variants 2+4 + Duel OG stub fill** - `7d00f6b` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/web/lib/outcome-word.ts` — getOutcomeWord() + getOutcomeWordResult(); D-08 thresholds; §14.1 hex colors
- `apps/web/lib/outcome-word.js` — compiled artifact updated to match .ts implementation (GREEN gate fix)
- `apps/web/tests/outcome-word.test.ts` — 9 spec-of-record tests; moved from relayer cross-package violation
- `packages/ui/src/primitives/Stamp.tsx` — hexColor? prop; boxShadow 0→4px 4px 0 animation (UI-45); additive only
- `apps/web/app/call/[id]/page.tsx` — Settled/Disputed/CallerExited branches; 96px outcome word; FINAL POSITIONS; D-09 guard
- `apps/web/app/og/[callId]/route.ts` — buildSettledCard (V2) + buildCallerExitedCard (V4); ?as=fader; status branching
- `apps/web/app/og/duel/[challengeId]/route.ts` — D-11 stubs filled; callerIsWinner; WINS/#E8F542; repDeltaDisplay

## Decisions Made

1. **outcome-word test co-located in apps/web/tests/** — The relayer's `outcome-word.test.ts` imported `apps/web/lib/outcome-word.ts`, violating the relayer tsconfig `rootDir: apps/relayer/src` (TS6059/TS6307). The preferred fix was a shared package move, but `@call-it/shared` holds constants/types/schemas — not display logic. Co-locating in `apps/web/tests/` (the consuming package) is architecturally correct: outcome-word is web display logic tested from the web test suite. The relayer test is superseded. Pre-existing relayer Phase-1 tsc errors are NOT fixed (out of scope).

2. **Compiled outcome-word.js updated manually** — Vitest resolves `.js` extension imports directly to the compiled artifact (not the `.ts` source), because the test originally used `import from '../../../../web/lib/outcome-word.js'`. The new test uses `import from '../lib/outcome-word'` (no extension), but there was also an existing stale `.js` that took resolution priority. Keeping `.js` in sync is the lowest-friction fix. The tsbuildinfo will regenerate on next `tsc --build`.

3. **CONTRARIAN HIT = #E8F542 hex (NOT #A855F7 token)** — The `outcome-contrarian` token in `packages/ui/src/tokens/colors.ts` is `#A855F7` (purple), which violates §14.1 and UI-17. The §14.1 spec and REQUIREMENTS are authoritative. Used explicit `hexColor="#E8F542"` on Stamp and in OG routes. Token map not changed (other phases depend on it; reconciliation is out of Phase 4 scope per UI-SPEC note).

4. **OG card outcome stubs for Phase 7** — `buildSettledCard` shows `'—'` for P&L, repDelta, finalValue, and targetValue because those fields come from SettlementManager's `RepCalculated` events (not from `CallRegistry.getCall`). Phase 7 will wire the full subgraph lookup for all 5 OG variants.

5. **Duel OG repDelta uses +REP/-REP labels** — Phase 3 D-11 spec says "replace '? REP' with real rep delta values from subgraph RepCalculated events." The OG route has no subgraph client — it uses RPC only. The real rep delta requires a subgraph query by challengeId. This plan adds the winner/loser label heuristic (+REP/-REP) as the fill; Phase 7 will wire the actual numeric values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale compiled outcome-word.js shadowed .ts implementation**
- **Found during:** Task 1 (outcome-word GREEN gate)
- **Issue:** `apps/web/lib/outcome-word.js` contained the old throwing stub. Vitest resolved `.js` directly when `import from '...'` (no extension), causing all 9 tests to fail with the original error even after the `.ts` was updated.
- **Fix:** Updated `outcome-word.js` to match the new `.ts` implementation; changed test import to bare path (no `.js` extension) to let vitest resolve via TypeScript.
- **Files modified:** `apps/web/lib/outcome-word.js`, `apps/web/tests/outcome-word.test.ts`
- **Verification:** 9/9 tests GREEN after fix.
- **Committed in:** `78a1f8a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking — stale compiled artifact)
**Impact on plan:** Necessary fix for the GREEN gate to pass. No scope creep.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `pnlStr: '—', repDeltaStr: '—', finalValue: '—', targetValue: '—'` | `og/[callId]/route.ts` (buildSettledCard) | SettlementManager RepCalculated events not yet read in OG route; Phase 7 wires subgraph lookup |
| `callerRepDelta: '+REP'/'-REP', challengerRepDelta: '-REP'/'+REP'` | `og/duel/[challengeId]/route.ts` | Real numeric rep delta requires subgraph RepCalculated query; Phase 7 wires |
| `assetPair: '', callQuestion: 'Duel #N'` | `og/duel/[challengeId]/route.ts` | Market statement from IPFS/subgraph; Phase 7 wires |

## Threat Surface Scan

All threat model items (T-04-07-01..T-04-07-05) mitigated as specified:

| Flag | File | Status |
|------|------|--------|
| T-04-07-01: AUTH-44 wallet address in OG | `og/[callId]/route.ts` | Mitigated: @handle only, no raw address rendered |
| T-04-07-02: display:grid in Satori routes | Both OG routes | Mitigated: zero `display: 'grid'` in code (only in comments) |
| T-04-07-03: CONTRARIAN HIT wrong color | `outcome-word.ts`, `og/[callId]/route.ts` | Mitigated: explicit #E8F542, confirmed by grep: `A855F7` not in outcome-word.ts |
| T-04-07-04: Duel OG winner hardcoded as caller | `og/duel/[challengeId]/route.ts` | Mitigated: `callerIsWinner = winner.toLowerCase() === caller.toLowerCase()` |
| T-04-07-05: Unauthenticated viewer sees FADED CORRECTLY | `call/[id]/page.tsx`, `og/[callId]/route.ts` | Mitigated: D-09 guard requires `authenticated && userAddress`; `?as=fader` requires explicit query param |

## Issues Encountered

**Pre-existing TypeScript warnings:** `tailwind.config.ts` TS6059/TS6307 (ui package outside rootDir) + Playwright test `reducedMotion` type errors — these are pre-existing, out of scope, and not caused by this plan's changes.

## Next Phase Readiness

Ready for:
- Phase 4 Plan 08 (dispute UI/routes) — Settled Receipt page foundation is complete; dispute modal can build on it
- Phase 4 Plan 09 (CI cron) — outcome-word GREEN gate is a test that CI can now run
- Phase 7 OG finalization — buildSettledCard stubs documented; Phase 7 wires subgraph lookup for P&L/repDelta/finalValue

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-01*

## Self-Check: PASSED

- [x] `apps/web/lib/outcome-word.ts` exists on disk — FOUND
- [x] `apps/web/lib/outcome-word.js` exists on disk — FOUND
- [x] `apps/web/tests/outcome-word.test.ts` exists on disk — FOUND
- [x] `packages/ui/src/primitives/Stamp.tsx` exists on disk — FOUND
- [x] `apps/web/app/call/[id]/page.tsx` exists on disk — FOUND
- [x] `apps/web/app/og/[callId]/route.ts` exists on disk — FOUND
- [x] `apps/web/app/og/duel/[challengeId]/route.ts` exists on disk — FOUND
- [x] `04-07-SUMMARY.md` exists on disk — FOUND
- [x] Commit `78a1f8a` exists (Task 1) — VERIFIED
- [x] Commit `7d00f6b` exists (Task 2) — VERIFIED
- [x] `pnpm --filter @call-it/web exec vitest run outcome-word` — 9/9 PASS (GREEN)
- [x] `pnpm --filter @call-it/web build` exits 0 — PASS
- [x] `grep "A855F7\|purple" apps/web/lib/outcome-word.ts` — 0 matches PASS (only in comments)
- [x] `grep "viewerIsWinningFader = Boolean" apps/web/app/call/[id]/page.tsx` — PASS (auth guard present)
- [x] `grep "FINAL POSITIONS" apps/web/app/call/[id]/page.tsx` — PASS
- [x] `grep "96" apps/web/app/call/[id]/page.tsx` — PASS (fontSize 96 in outcome hero)
- [x] `grep "buildSettledCard" apps/web/app/og/[callId]/route.ts` — PASS
- [x] `grep "buildCallerExitedCard" apps/web/app/og/[callId]/route.ts` — PASS
- [x] `grep "callerIsWinner" apps/web/app/og/duel/[challengeId]/route.ts` — PASS
- [x] No `display: 'grid'` in OG route code (only in comments) — PASS
