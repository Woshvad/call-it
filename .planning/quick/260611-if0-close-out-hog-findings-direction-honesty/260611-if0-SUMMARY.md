---
phase: quick-260611-if0
plan: 01
subsystem: ui
tags: [composer, zod, rhf, direction-honesty, schema-gate, pyth]

requires:
  - phase: quick-260611-hog
    provides: AssetSelect 24-ticker dropdown (sole asset entry path) + Hermes price row + chips
  - phase: quick-260611-bf2
    provides: resolveAssetToFeedId / assetToUint256Parity / preflight-body parity surface (CR-01)
provides:
  - "Explicit >= win-condition copy under the Price Target input ('Wins if price closes at or above target at the deadline.')"
  - "Composer receipt preview '≥' glyph matching server-built receipt lines"
  - "Ticker-only webCreateCallSchema (LISTED_ASSET_MESSAGE on all branches; dead 0x-hex/numeric path rejected)"
  - "Contracts-v2 below-target deferral record (260611-if0-deferred-items.md)"
affects: [composer, future-contracts-v2-direction-field]

tech-stack:
  added: []
  patterns:
    - "Form gate tightening sits IN FRONT of the resolution/parity layer — schema changes never touch preflight/dup-hash inputs"

key-files:
  created:
    - .planning/quick/260611-if0-close-out-hog-findings-direction-honesty/260611-if0-deferred-items.md
  modified:
    - apps/web/app/new/components/PriceTargetFields.tsx
    - apps/web/app/new/lib/hermes-price.ts
    - apps/web/app/new/page.tsx
    - apps/web/app/new/lib/web-call-schema.ts
    - apps/web/app/new/components/EventFields.tsx
    - apps/web/tests/web-call-schema.test.ts

key-decisions:
  - "EVENT_ASSET_MESSAGE renamed → LISTED_ASSET_MESSAGE (same exact copy) and applied to ALL branches; UNKNOWN_ASSET_MESSAGE no longer imported by the form schema (still live at the preflight-body publish abort — parity-adjacent layer untouched)"
  - "Event assetB intentionally NOT ticker-gated — it carries exchange/metric strings ('binance', 'tvl'), not assets"
  - "resolve-asset.ts:28 comment is now half-stale (mentions the schema refine reuse) but the file is under the byte-identical parity guard — left untouched, parity wins"

requirements-completed: [QUICK-260611-IF0]

duration: 9min
completed: 2026-06-11
---

# Quick 260611-if0: Close out hog findings — direction honesty + ticker-only schema Summary

**Composer now states the >= win condition out loud (copy + '≥' preview glyph) and webCreateCallSchema rejects every non-ticker asset string with 'Use a listed asset (BTC, ETH, SOL…)' — relayer dup-hash parity surface byte-identical.**

## Task 1 — Direction honesty (commit 7e5bf4f)

- PriceTargetFields: static mono helper "Wins if price closes at or above target at the deadline." between the targetValue control and its error div (token styles, matches the Asset group's order). Covers the +pct chip row too.
- Deferral anchor "Below-target direction is a contracts-v2 feature — SettlementManager v1 settles >= only (SettlementManager.sol:718)" added at both chip-math sites (TARGET_CHIP_PCTS doc comment + computeChipTarget doc comment) and at the schema site.
- page.tsx previewMarketLine: `'>='` → `'≥'` — composer preview now matches server-built receipt lines ("ETH ≥ $1,000,000"). Display-only; feeds only `<Receipt mode="preview">`. The `'vs'` spreadVs arm and the mocked server fixture in quote-composer.spec.ts:109 untouched.
- 260611-if0-deferred-items.md records the contracts-v2 deferral (direction field through CallRegistry create path + below branch in SettlementManager settle; v1 deployed contracts immutable).

## Task 2 — Ticker-only schema gate (TDD: RED 9ba08f5 → GREEN 9f15ac4)

- RED: rewrote web-call-schema.test.ts — flipped the two event acceptance tests (0x-40-hex, '12345') to rejection, moved all message assertions to LISTED_ASSET_MESSAGE, added the dead-path pin (priceTarget + `PYTH_FEED_IDS.ETH` raw feed id fails the FORM gate while `resolveAssetToFeedId` still resolves it), added spreadVs missing-assetB + trim/case tests, exact-copy export test. Confirmed failing: 9 failed / 4 passed.
- GREEN: web-call-schema.ts replaced the per-branch resolveAssetToFeedId / isUintParseableAsset gates with a single local `isListedTicker` helper (trim → uppercase → `in PYTH_FEED_IDS`). Gate: assetA for ALL market types + spreadVs assetB. No zod import (ctx code 'custom' preserved). Dropped resolve-asset imports FROM THIS FILE ONLY. Header comment rewritten (ticker-only rationale + parity note + finding-(1) anchor).
- EventFields.tsx stale Asset comment fixed (entry AND schema are both ticker-only).

## Verification (real results)

- `pnpm --filter @call-it/web test` — **25 files / 231 tests, ALL PASSED** (was baseline 21/197 per plan; actual repo baseline had grown — suite fully green either way)
- `pnpm --filter @call-it/web build` — **exit 0**
- Parity guard: `git status --porcelain` shows **no modifications** to resolve-asset.ts, preflight-body.ts, tests/resolve-asset.test.ts, tests/preflight-body.test.ts, or apps/relayer source. resolve-asset.test.ts 20/20 + preflight-body.test.ts 11/11 green, unmodified. The only `packages/` entry is the pre-existing dirty `packages/contracts/lib/openzeppelin-contracts` submodule pointer (present before this task started — not touched).
- Task 1 greps: "at or above target" ×1 in PriceTargetFields; "SettlementManager.sol:718" in PriceTargetFields + hermes-price; "≥" in page.tsx; deferred-items.md exists.

## Deviations from Plan

None - plan executed exactly as written. The fallback rule (parity-test conflict) never triggered — no parity test asserts the FORM schema's hex acceptance.

## Known Stubs

None introduced. (EventFields' uncontrolled Target Value / Exchange / Metric inputs are pre-existing and out of scope.)

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes. The schema change strictly narrows accepted input.

## Commits

| Commit | Type | Description |
| ------ | ---- | ----------- |
| 7e5bf4f | feat | Direction-honesty copy + '≥' preview glyph + deferral anchors |
| 9ba08f5 | test | RED — failing ticker-only gate tests (flipped event acceptances) |
| 9f15ac4 | feat | GREEN — ticker-only webCreateCallSchema + EventFields comment fix |

## Self-Check: PASSED

All claimed files exist on disk; commits 7e5bf4f, 9ba08f5, 9f15ac4 present in git log; LISTED_ASSET_MESSAGE artifact contains check satisfied.
