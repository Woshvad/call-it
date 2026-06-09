---
phase: 08-farcaster-mini-apps
plan: 05
subsystem: web-share
tags: [farcaster, og, outcome-word, core-value, gap-closure, settled-receipt, relayer, subgraph]
gap_closure: true

# Dependency graph
requires:
  - phase: 08-farcaster-mini-apps
    provides: SHARE AS FRAME control + warpcastComposeUrl/buildShareText (plan 08-04)
  - phase: 07-share-loop
    provides: /og/[callId] settled card + getSettledFields subgraph read (plan 07-03)
  - phase: 02-followfademarket
    provides: relayer /api/calls/:id/live-state + CallRegistry.getCall read (plan 02-07/02-09)
provides:
  - relayer /live-state now surfaces settled outcome + repDelta + fadeRealShare (non-Pending Settled/Disputed only)
  - receipt page renders/shares the TRUE §15.7 outcome word — never a fabricated CALLED IT
  - settled-aware og:title in /call/[id]/layout.tsx
  - resolveSettledWord pure fail-safe helper + regression test of record
affects: [phase-08-verification, phase-09-mobile, future-share-flows]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "relayer querySettledFields mirrors web getSettledFields (single source of truth for settled rep/fade)"
    - "fail-safe settled-field fetch: subgraph outage -> absent fields -> page neutral, never a fake win"
    - "pure resolveSettledWord helper makes a fabricated win word impossible + unit-testable without rendering"

key-files:
  created:
    - apps/web/tests/settled-outcome-truth.test.ts
  modified:
    - apps/relayer/src/routes/live-state.ts
    - apps/relayer/src/lib/subgraph-client.ts
    - apps/web/app/call/[id]/page.tsx
    - apps/web/app/call/[id]/layout.tsx
    - apps/web/lib/outcome-word.ts
  deleted:
    - apps/web/lib/outcome-word.js  # stale tracked compiled artifact shadowing the .ts in vitest (Rule 3)

decisions:
  - "Outcome enum mapping resolved against ICallRegistry.sol: Pending=0, CallerWon=1, CallerLost=2 — matches /og route's callerWon===1 convention (no path divergence, T-08-05-03)"
  - "Neutral placeholder word = 'PENDING RESULT' (#94A3B8 slate, brand-muted stamp) — deliberately NOT one of the 5 locked §15.7 words, so unknown outcome never reads as win/loss"
  - "SHARE AS FRAME now also requires outcomeWordResult != null — a neutral/unknown word is never publicly cast"
  - "Removed stale apps/web/lib/outcome-word.js (Jun-2 compile) that vitest resolved over the .ts, hiding the new resolveSettledWord export (Rule 3 blocking fix)"

requirements-completed: [SHARE-19]

# Metrics
duration: ~25min
completed: 2026-06-09
---

# Phase 8 Plan 05: Settled-Receipt Truthful Outcome Word (GAP 1) Summary

**Closes UAT 08 GAP 1 (Core Value violation): a settled LOSS now renders and SHARES "LOUD AND WRONG" on the receipt page + SHARE AS FRAME compose text — never the old fabricated "CALLED IT". Achieved by extending relayer /live-state to carry the real settled outcome (the same data the /og card already uses) and removing the dangerous `?? 'CALLED IT'` fail-open default in favor of a fail-safe neutral state.**

## What changed

### Task 1 — relayer /live-state surfaces settled outcome (commit `e3f453e`)
- `apps/relayer/src/lib/subgraph-client.ts`: new `querySettledFields(callId)` mirroring the web `getSettledFields` query (`repEvents{delta} + positions{side,usdcDeposited}`); computes `fadeRealShare = fadeSum/(fadeSum+followSum)` via BigInt accumulation. FAIL-SAFE — returns `{repDelta:null, fadeRealShare:null}` on any error and never throws.
- `apps/relayer/src/routes/live-state.ts`:
  - Added `outcome` (uint8) to the `getCall` struct read + `outcomeLabel()` map (`Pending/CallerWon/CallerLost`).
  - For SETTLED(1)/DISPUTED(2) calls with a non-Pending outcome, emit `outcome` + (subgraph) `repDelta` + `fadeRealShare`. Wrapped in try/catch → a subgraph outage leaves the settled fields absent and NEVER 502s the live-state read (T-08-05-02; `live_state_settled_fields_failed` warn added).
  - Conditional-spread so the fields stay absent for Live/non-settled calls — the page's settled branch keys off `outcome` presence.

### Task 2 — receipt page + layout truth, regression test (commit `609182d`, TDD)
- `apps/web/lib/outcome-word.ts`: new pure `resolveSettledWord(result)` + `SETTLED_NEUTRAL_WORD = 'PENDING RESULT'` / `SETTLED_NEUTRAL_COLOR`. Null result → neutral, never a win word.
- `apps/web/app/call/[id]/page.tsx`:
  - REMOVED `const outcomeWord = outcomeWordResult?.word ?? 'CALLED IT'` (+ color/lozenge defaults) → `resolveSettledWord(outcomeWordResult)`.
  - SHARE AS FRAME url now requires `outcomeWordResult != null` (in addition to base+handle) — never casts a fabricated/neutral word.
  - Stamp token: neutral placeholder → `brand-muted`, never `outcome-win`.
- `apps/web/app/call/[id]/layout.tsx`: `fetchCallMeta` reads `outcome`/`repDelta`/`fadeRealShare`; `generateMetadata` derives the settled outcome word via `getOutcomeWordResult` (viewerIsWinningFader:false server-side) and prefixes the og:title — e.g. `"LOUD AND WRONG — @veda · … — Call It"` — instead of the old wrong "Live Call".
- `apps/web/tests/settled-outcome-truth.test.ts` (NEW, vitest node env): CallerLost → 'LOUD AND WRONG' (+ buildShareText contains it, NOT 'CALLED IT'); CallerWon high-rep → 'CALLED IT'; unknown → neutral; FORBIDDEN sweep: no loss/unknown input ever yields 'CALLED IT'.

## Outcome enum mapping (resolved per plan instruction)
Cross-checked `packages/contracts/src/interfaces/ICallRegistry.sol`: `Outcome { Pending=0, CallerWon=1, CallerLost=2 }`. This MATCHES the plan's stated ordinals AND the `/og/[callId]` route's `callerWon = outcomeNum === 1` convention — the page and the OG card now derive identically from the same on-chain enum + subgraph fields (T-08-05-03, no divergence).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed stale tracked `apps/web/lib/outcome-word.js`**
- **Found during:** Task 2 (RED — the new regression test reported `resolveSettledWord is not a function` and `Object.keys(module)` showed only the Jun-2 exports).
- **Issue:** A stale compiled `apps/web/lib/outcome-word.js` (committed Jun 2, no `.js.map`) was tracked in git and **shadowed `outcome-word.ts` in vitest's module resolution**, so the new `resolveSettledWord`/`SETTLED_NEUTRAL_WORD` exports were invisible to tests. This is also a latent correctness hazard for any consumer whose bundler prefers `.js`.
- **Fix:** `git rm apps/web/lib/outcome-word.js` (the `.ts` is the single source). Verified the deleted `.js` lacked `resolveSettledWord` (confirming it was stale), and re-ran tests green.
- **Files modified:** deleted `apps/web/lib/outcome-word.js`.
- **Committed in:** `609182d`.

No other deviations — Task 1 executed exactly as written.

## Verification

- `grep "'CALLED IT'" apps/web/app/call/[id]/page.tsx` → only a comment + the Stamp-token mapping branch remain; the `?? 'CALLED IT'` fail-open default is GONE.
- Relayer: `tsc --noEmit` clean; `pnpm --filter @call-it/relayer test` → 209 passed / 1 skipped (no regressions).
- Web: `pnpm --filter @call-it/web test` → 93 passed (was 89 + 4 new); `pnpm --filter @call-it/web build` → exit 0.
- Targeted: `settled-outcome-truth.test.ts` + `outcome-word.test.ts` + `share-text.test.ts` → 19 passed.

## Threat surface
No new network endpoints or trust boundaries beyond the plan's threat model.
- T-08-05-01 (false-claim disclosure) — MITIGATED: `?? 'CALLED IT'` removed; outcome word is ONLY `getOutcomeWordResult(real data)`; unknown → neutral, share omitted.
- T-08-05-02 (DoS via subgraph fetch) — MITIGATED: `querySettledFields` fail-safe try/catch → null fields; never 502s live-state; page then neutral, NOT a win.
- T-08-05-03 (outcome enum tamper/divergence) — MITIGATED: enum cross-checked vs ICallRegistry.sol; relayer + /og share the `callerWon === 1` convention.
- T-08-05-SC — no new package installs in this plan.

## Self-Check: PASSED
- [x] apps/relayer/src/routes/live-state.ts modified (outcome/repDelta/fadeRealShare emitted)
- [x] apps/relayer/src/lib/subgraph-client.ts modified (querySettledFields added)
- [x] apps/web/app/call/[id]/page.tsx modified (`?? 'CALLED IT'` removed; resolveSettledWord wired; SHARE AS FRAME guarded)
- [x] apps/web/app/call/[id]/layout.tsx modified (settled-aware og:title)
- [x] apps/web/lib/outcome-word.ts modified (resolveSettledWord + neutral constants)
- [x] apps/web/tests/settled-outcome-truth.test.ts created
- [x] Commit e3f453e exists (Task 1)
- [x] Commit 609182d exists (Task 2)
- [x] relayer 209/1-skip green; web 93/93 green; web build exit 0
