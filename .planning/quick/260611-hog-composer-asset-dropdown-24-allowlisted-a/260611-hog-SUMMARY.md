---
phase: quick-260611-hog
plan: 01
subsystem: ui
tags: [composer, pyth, hermes, react-hook-form, nextjs]

# Dependency graph
requires:
  - phase: quick-260611-bf2
    provides: resolveAssetToFeedId / canonicalAssetForWire symbol→feed-id resolution (lib/resolve-asset.ts)
  - phase: quick-260611-5mh
    provides: canonical 1e8 target-scale helpers (usdToTargetValue / targetValueToUsd)
  - phase: 00-foundation
    provides: PYTH_FEED_IDS 24-asset catalogue (@call-it/shared)
provides:
  - AssetSelect — reusable 24-asset grouped .brutal-select dropdown (single source for all three composer sub-forms)
  - hermes-price.ts — pure Hermes URL builder + defensive parser + never-throwing fetch + USD formatter + chip-target math
  - usePythPrice(symbol) — live price state with 5s abort timeout + 30s silent refresh + honest null degrade
  - Percentage quick-pick chips (+10/+20/+50/+100%) on the Price Target field
affects: [composer, phase-09.1-demo-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Catalog type-binding: optgroup symbols typed readonly (keyof typeof PYTH_FEED_IDS)[] — feed-catalogue drift is a compile error + runtime set-equality test"
    - "D-07 honest price degrade: fetch failure/timeout/refresh-failure clears price to null; callers render NOTHING (transient 'fetching price…' only while loading with nothing shown)"
    - "Chips are setters, not modes: write through the SAME field.onChange -> usdToTargetValue -> zod path as manual entry"

key-files:
  created:
    - apps/web/app/new/components/AssetSelect.tsx
    - apps/web/app/new/lib/hermes-price.ts
    - apps/web/app/new/hooks/usePythPrice.ts
    - apps/web/tests/asset-select.test.ts
    - apps/web/tests/hermes-price.test.ts
  modified:
    - apps/web/app/new/components/PriceTargetFields.tsx
    - apps/web/app/new/components/SpreadVsFields.tsx
    - apps/web/app/new/components/EventFields.tsx
    - apps/web/app/new/lib/resolve-asset.ts

key-decisions:
  - "Chips default to ABOVE (+pct) including +100% — CreateCallInput has NO direction field (call-gates.ts verified; /new preview hardcodes '>='); documented in code, revisit if a direction control ships"
  - "EventFields dropdown narrows event-asset entry to the 24 feed symbols; webCreateCallSchema still ACCEPTS hex-address/numeric event assets but no UI path remains (quick-260611-bf2 client gate consequence, commented in source)"
  - "Select value stays the bare ticker string ('BTC') — preflight resolveAssetToFeedId, dup-hash, and receipt preview consume it byte-identical; page.tsx untouched"
  - "Failed 30s refresh CLEARS the displayed price (never keep showing a number the feed stopped backing) — T-hog-02 mitigation"

requirements-completed: [CALL-06, UI-02]

# Metrics
duration: ~12min
completed: 2026-06-11
---

# Quick Task 260611-hog: Composer Asset Dropdown + Live Hermes Price + Target Chips Summary

**Free-text asset entry replaced by one reusable 24-asset grouped .brutal-select (the CALL-06 CoinPicker), with live Pyth Hermes price rows (D-07 honest degrade-to-hidden) and +10/+20/+50/+100% target quick-pick chips writing through the existing RHF/zod path**

## Tasks Completed

| Task | Name | Commits | Key Files |
|------|------|---------|-----------|
| 1 | AssetSelect + dropdown swap in all three sub-forms + catalog-drift test | `fa3ab4c` | AssetSelect.tsx, PriceTargetFields.tsx, SpreadVsFields.tsx, EventFields.tsx, asset-select.test.ts |
| 2 (RED) | Failing hermes-price unit tests (19 tests, zero network) | `d1e6f4e` | hermes-price.test.ts |
| 2 (GREEN) | hermes-price lib + usePythPrice hook + price rows + chips | `236c552` | hermes-price.ts, usePythPrice.ts, PriceTargetFields.tsx, SpreadVsFields.tsx |

## What Was Built

1. **AssetSelect** (`apps/web/app/new/components/AssetSelect.tsx`) — exports `AssetSelect` + `ASSET_GROUPS`; six optgroups (Majors / L2s / DeFi / Restaking & LSTs / Memes / AI & RWA) covering exactly the 24 `PYTH_FEED_IDS` keys. `symbols` typed `readonly (keyof typeof PYTH_FEED_IDS)[]` so catalogue drift is a compile error; `asset-select.test.ts` guards runtime set-equality (24/24, no dupes, label order). Option value is the plain ticker string. Optgroup labels are display-only — the separate `category` form field (AdvancedSettings) is untouched.

2. **Dropdown swaps** — PriceTargetFields (Controller, `id="pt-asset"`), SpreadVsFields (both Controllers, `sv-asset-a`/`sv-asset-b`, "Asset A"/"Asset B" labels preserved for Tier-2 e2e), EventFields (`useWatch` + `setValue('assetA', v, { shouldValidate: true })` — it has no Controller wiring). No free-text asset input remains under `app/new/components`.

3. **hermes-price.ts** — pure module: `buildHermesLatestUrl` (0x-prefixed `ids[]` param), `parseHermesPriceResponse` (defensive narrowing of the untrusted Hermes boundary — null on malformed/non-finite/non-positive, never throws — T-hog-01), `fetchHermesPrice` (never throws; non-ok/abort/network → null), `formatUsdPrice` (4 sig figs sub-$1, en-US 2-decimal grouping ≥$1), `roundForTarget`, `computeChipTarget` (above-direction default, documented).

4. **usePythPrice** — resolves symbol via existing `resolveAssetToFeedId`; 5s AbortController budget; 30s silent refresh; unmount/feedId-change guarded by a cancelled flag; failed fetch OR failed refresh clears price to null (T-hog-02). Status: idle/loading/ready/error.

5. **Price rows + chips** — `Current price · $X` mono row under the select in PriceTargetFields and under BOTH selects in SpreadVsFields (no chips there — ratio target); transient `fetching price…` only while loading with nothing shown; error/idle renders nothing. PriceTarget chips render only when `price !== null`, fill the target via `field.onChange(usdToTargetValue(computeChipTarget(price, pct)))`, input stays editable. EventFields gets no price row (non-price oracles).

## Verification Results

| Gate | Result |
|------|--------|
| `pnpm --filter @call-it/shared build` | exit 0 |
| `pnpm --filter @call-it/web test` | **228/228 passed** (25 files; was 206 — +3 asset-select, +19 hermes-price) |
| `pnpm --filter @call-it/web build` | exit 0 |
| Placeholder sweep ("Pyth feed or symbol" / "First asset" / "Second asset" / "e.g. ETH, Uniswap") | zero hits under apps/web |
| `target-scale` import kept + no `targetValue…1_000_000` within 200 chars | intact (target-scale.test.ts source assertions pass) |
| No `display:grid` / `grid-cols-` under app/new (incl. AssetSelect) | zero hits |
| preflight-body / web-call-schema / resolve-asset suites | pass unchanged |

## TDD Gate Compliance

RED commit `d1e6f4e` (test failed — module absent), GREEN commit `236c552` (19/19 pass). No refactor commit needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Stale docstring] resolve-asset.ts referenced the removed free-text placeholder**
- **Found during:** Task 1 verification sweep ("Pyth feed or symbol" grep hit)
- **Issue:** the lib docstring quoted the deleted composer placeholder text, failing the plan's zero-hit sweep under apps/web
- **Fix:** docstring rewritten to describe the dropdown-constrained reality while noting the resolver remains the canonical symbol→feed-id path
- **Files modified:** apps/web/app/new/lib/resolve-asset.ts
- **Commit:** `fa3ab4c`

## Findings for Future Phases

- **No direction field exists in CreateCallInput** (`packages/shared/src/validation/call-gates.ts` — verified, zero `direction` matches in packages/shared/src; the /new preview hardcodes `>=`). All four chips (including +100%) compute ABOVE targets. If a direction control ever ships, `computeChipTarget` must become direction-aware (and the "omit +100% when below" rule becomes live).
- **EventFields hex/numeric-entry consequence:** `webCreateCallSchema` still ACCEPTS hex-address/numeric event assets, but the UI no longer offers a path to enter them — event assets are allowlist-gated client-side (quick-260611-bf2 gate). Any future event type needing a non-feed asset (e.g. a protocol address) needs a new UI affordance.

## Known Stubs

None — the price row's degrade-to-hidden on fetch failure is the intentional D-07 design, not a stub.

## Threat Flags

None — all new surface (Hermes fetch boundary, chip→target flow) was pre-registered in the plan's threat model (T-hog-01..04) and mitigations are implemented as specified.

## Self-Check: PASSED

- FOUND: apps/web/app/new/components/AssetSelect.tsx
- FOUND: apps/web/app/new/lib/hermes-price.ts
- FOUND: apps/web/app/new/hooks/usePythPrice.ts
- FOUND: apps/web/tests/asset-select.test.ts
- FOUND: apps/web/tests/hermes-price.test.ts
- FOUND commits: fa3ab4c, d1e6f4e, 236c552
