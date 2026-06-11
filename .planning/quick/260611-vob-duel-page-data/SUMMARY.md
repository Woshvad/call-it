---
phase: quick-260611-vob
plan: 260611-vob
slug: duel-page-data
status: complete
commit: 9763b9a
completed: 2026-06-11
---

# Quick 260611-vob: Duel Page Wired to Real Data — Summary

**One-liner:** Duel page's prototype markup now runs on real sources — useProfile ×2 (handles AS STORED, rep chips, settledCalls-gated accuracy, VERIFIED pills), on-chain CallRegistry.getCall + PYTH_FEED_IDS inversion for the asset-pair hero and oracle sub, and marketLine/assetSymbol reused from the existing riders fetch; win-streak + in-category surfaces deleted per user constraint.

## What Shipped

1. **apps/web/lib/abis/CallRegistry.ts** — additive getCall view fragment, 19-field tuple copied field-for-field from the relayer canon (apps/relayer/src/lib/call-enrichment.ts:40-74). Every pre-existing fragment untouched.

2. **apps/web/lib/feed-symbols.ts** (NEW) — feedIdToSymbol(feedId: bigint): string | undefined. Lowercased 0x-hex inversion of @call-it/shared PYTH_FEED_IDS via `0x` + toString(16).padStart(64,'0'); 0n/unknown -> undefined (D-07, never guess). Canon citation in header.

3. **apps/web/app/duel/[challengeId]/page.tsx** — full data wiring:
   - **Hero (D-07):** marketType 1 + both symbols -> giant SYMA/SYMB pair (existing h1 idiom); marketType 0 + symA -> giant single; else marketLine as headline at clamp(28px, 6vw, 64px). The unconditional '—/—' wire-pair render is dead; assetA/assetB wire fields deleted.
   - **On-chain read:** useReadContract getCall — chainId: ACTIVE_CHAIN_ID, enabled: callId > 0n, staleTime: 60_000, no polling. Placed with the other unconditional hooks above the early returns.
   - **Riders fetch extension:** fetchRidingLists now also returns callLine { marketLine?, assetSymbol? } from the SAME /api/calls/:id/live-state response — zero new requests (verified: exactly one fetch of that route in the file, pinned by test).
   - **Identity:** two unconditional useProfile calls; display handles = profile.handle when source !== 'truncated', else the wire's truncated-address alias; rendered AS STORED (no uppercase). VERIFIED · X / VERIFIED · FC pill-muted badges (WalletPill idiom); RepChip per the prototype RepBadge recipe (components.jsx:84-103, no trend arrow), gated Number.isFinite(globalRep).
   - **Stats (D-07):** REP only when Number.isFinite(globalRep); ACCURACY = Math.round(wins/settledCalls*100)% only when settledCalls > 0; failed profile fetch -> no stats row; in-category column removed entirely; live-spread stays hidden (existing D-07 comment kept).
   - **Positions:** caller box = real marketLine (absent -> hidden); challenger box = literal TAKES THE OTHER SIDE. with the contract-semantic justification comment.
   - **Oracle sub:** SETTLES IN gains PYTH ORACLE (marketType 0/1) / ATTESTED EVENT (marketType 2) / no sub when unknown. POT's "winner takes all" sub kept.
   - **Streak removal (user 2026-06-11):** both fire-emoji blocks, callerStreak/challengerStreak + callerCategoryAccuracy/challengerCategoryAccuracy + callerRep/callerAccuracy/callerPosition (and challenger mirrors) + assetA/assetB/marketLine dead wire fields and mappings all deleted. The duel wire only ever carried escrow facts — these were defensive defaults rendering fake data.
   - **Untouched:** accept/reject handlers, approve flow, ChallengeFormModal (only its marketLine prop now feeds from the real callMarketLine), toast, 5s liveness, consensus bar, riders lists, DesktopOnlyBanner, mobile stacking. Pending-block copy upgraded from wire handle -> profile-backed display handle (D-14).

4. **apps/web/tests/duel-page-data.test.ts** (NEW) — 20 pins: wiring (useProfile ×2, feed-symbols import, chainId-pinned getCall region, ABI fragment, single live-state fetch), user-constraint removals (no win streak / streak fields / in-category / category-accuracy), honesty gates (settledCalls > 0, TAKES THE OTHER SIDE., no liveState.assetA/assetB, no rendered live-spread, oracle subs), identity (verifiedX/Fc, Number.isFinite-gated globalRep, source !== 'truncated'), and real-module feedIdToSymbol units (BTC/ARB/OP round-trip, 0n -> undefined, unknown -> undefined).

## Gate Results

| Gate | Result |
|---|---|
| pnpm --filter @call-it/web build | exit 0 (all routes compiled) |
| pnpm --filter @call-it/web exec vitest run | **357/357 green**, 34 files, 0 fails (before: 337 baseline — the plan's "335" figure predated 2 tests added by the parallel-session ust quick; after: 337 + 20 new = 357) |

## Commit

9763b9a — single atomic commit, exactly 5 files (page.tsx, CallRegistry.ts, feed-symbols.ts, duel-page-data.test.ts, presentation-sweep.test.ts). **NO push** (orchestrator pushes -> Vercel web deploy; no Fly deploy). Relayer/packages/prototype/docs/evidence untouched.

## ChallengeFormModal Grep Outcome (challenger-position exception)

Grepped apps/web/app/components/ChallengeFormModal.tsx for any challenger statement/stance capture: **NONE exists** — the modal captures only a stake amount and displays the caller's marketLine; nothing statement-like is posted to the relayer. The generic TAKES THE OTHER SIDE. line is therefore the stored truth (challenger wins iff the caller loses), used with a justification comment.

## Parallel-Session Drift

Pre-edit re-read + git status on page.tsx: **clean at b33ad5d, zero drift.** Plan anchors matched content with minor line offsets only.

## Honestly-Migrated Pins (D-15)

- apps/web/tests/presentation-sweep.test.ts — C6 test 'zero stats are hidden (D-07): rep stat gated on > 0' (was lines 88-91) pinned the removed liveState.callerRep > 0 / liveState.challengerRep > 0 wire-default gates. Migrated (same D-07 contract, new expectation) to pin Number.isFinite(callerProfile.globalRep) / Number.isFinite(challengerProfile.globalRep) / settledCalls > 0, with a quick-260611-vob comment. No assertion deleted.

## Deviations from Plan

1. **[Minor] Comment-literal rewording** — the page's own doc comments initially contained the literal "IN CATEGORY", which the plan's mandated source-assertion pin (NO 'IN CATEGORY') would have failed; reworded to "in-category" (hyphenated) so the constraint pin is strict over the whole file.
2. **[Per plan's dead-field rule] Wider wire-field cleanup** — beyond the explicitly listed streak/category fields, also removed callerRep/callerAccuracy/callerPosition (+ challenger mirrors) and marketLine from DuelLiveState: the duel wire never carries them (relayer returns escrow facts only) and nothing consumed them after the profile/call-line rewire — same "dead fields out" rule the plan applied to assetA/assetB.
3. **Baseline count** — full-suite baseline was 337, not the plan's 335 (two tests added by the parallel ust quick after planning). All green either way.

## Known Stubs

None introduced. The page's pre-existing followReserveFromState = 0n placeholder (consensus-bar fallback, explicitly out of scope per plan task (j)) remains as-is with its D-07 honest-degradation handling.
