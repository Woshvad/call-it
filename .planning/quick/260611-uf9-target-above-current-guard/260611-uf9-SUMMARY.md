---
phase: quick
plan: 260611-uf9
subsystem: composer + relayer-preflight
tags: [integrity-guard, pyth, hermes, preflight, fail-closed, rep-farming]
requires:
  - quick-260611-hog (usePythPrice hook + hermes-price helpers + AssetSelect)
  - quick-260611-5mh (target-scale 1e8 canonical helpers)
  - quick-260610-sr0 (withTimeout helper)
provides:
  - "Web composer: strict target > live-price guard (derived inline error + modal gate)"
  - "Relayer preflight: fail-closed Gate Spot for marketType priceTarget"
  - "apps/relayer/src/lib/hermes-spot.ts: normalizePythPriceTo1e8 / getSpotPrice1e8 / evaluateTargetGuard"
affects: [call-creation, reputation-integrity]
tech-stack:
  added: []
  patterns:
    - "Derived render over one-shot setError for live-data validation (zodResolver mode:onChange wipes manual errors)"
    - "Lifted price hook — one fetch loop serves display + gate"
    - "Fail-closed upstream guard (price_unverifiable) + never-throw defensive parse"
key-files:
  created:
    - apps/web/app/new/lib/target-guard.ts
    - apps/web/tests/target-guard.test.ts
    - apps/relayer/src/lib/hermes-spot.ts
    - apps/relayer/src/lib/__tests__/hermes-spot.test.ts
  modified:
    - apps/web/app/new/page.tsx
    - apps/web/app/new/components/PriceTargetFields.tsx
    - apps/relayer/src/routes/calls-preflight.ts
    - apps/relayer/__tests__/calls-preflight.test.ts
decisions:
  - "STRICT > rule — equality blocked (target == current is already at-or-above per SettlementManager.sol:718 v1 >= settlement); no margin band"
  - "FAIL-CLOSED relayer gate: Hermes unreachable/malformed/timeout → 422 price_unverifiable (fail-open = farmable guaranteed wins)"
  - "D-07 preserved client-side: null live price SKIPS the web check (relayer enforces); no fabricated price, no client block on missing data"
  - "PythPriceStatus prop typed as inline union in PriceTargetFields (not imported from the hook module) so the 'no usePythPrice in component' source pin holds"
metrics:
  duration: ~15min
  completed: 2026-06-11
  tasks: 2
  files: 8
---

# Quick 260611-uf9: Target-Above-Current Guard Summary

Trivially-true price-target calls (target at/below live Pyth price = guaranteed CALLED IT under v1's >=-only settlement) are now blocked at creation by two layers: a reactive web composer guard (inline error + confirm-modal gate) and a fail-closed relayer preflight gate against a fresh Hermes spot price.

## What Was Built

### Task 1 — Web composer guard (commit e3ac074)
- **`apps/web/app/new/lib/target-guard.ts`** (new, pure): `targetGuardViolation(targetValue 1e8 bigint, priceUsd float)` — true when `target <= price` scaled via `usdToTargetValue` (strict > rule; comparison in 1e8 bigint space, never float). Returns false (check skipped) for undefined target / null price / unscalable price (D-07). `targetGuardMessage(priceUsd)` builds the inline copy with `formatUsdPrice`.
- **`apps/web/app/new/page.tsx`**: `usePythPrice` LIFTED from PriceTargetFields — one 30s fetch loop now serves both the price display and the publish gate (non-priceTarget types pass `undefined` so the hook stays idle). `onPublish` early-returns before `loadToken()`/`setIsModalOpen(true)` when `marketType === 'priceTarget' && targetGuardViolation(...)`. useCallback deps include `form` and `livePrice` (no stale price closure).
- **`apps/web/app/new/components/PriceTargetFields.tsx`**: price/status arrive as props (hook removed); `guardViolated` is DERIVED from `useWatch('targetValue')` + the price prop — reactive by construction, so the error clears the instant the user raises the target or the 30s refresh moves the price (no stale one-shot setError, which zodResolver mode:'onChange' would wipe anyway). Guard error renders in the targetValue slot only when no zod error is showing; input border goes red on either. Chips untouched (upside-only, can never violate).

### Task 2 — Relayer preflight enforcement (commit e3ac074)
- **`apps/relayer/src/lib/hermes-spot.ts`** (new): `normalizePythPriceTo1e8` (exact integer math; multiply path for expo > -8, floor-divide for expo < -8 — floor is exact for strict-above at integer 1e8 granularity); `evaluateTargetGuard` (spot null → `price_unverifiable` FAIL-CLOSED; `target <= spot` → `target_not_above_current` incl. equality; sub-$1 prices format at 8 decimals); `getSpotPrice1e8` (lazy HermesClient singleton, `HERMES_URL` env override, defensive never-throw parse mirroring pyth-adapter.ts — string mantissa > 0 + integer expo required).
- **`apps/relayer/src/routes/calls-preflight.ts`**: new Gate Spot (section 1.5, between schema parse and duplicate-hash) for `marketType === 'priceTarget'` only — `withTimeout(getSpotPrice1e8(input.assetA), 4_000, ...)` with try/catch → null → fail-closed. Pushes `{field:'targetValue', code, message}` into the existing D-31 `errors[]` (aggregates through the single 422 at section 5; the web's existing 422→setError mapping renders it inline with zero web changes). Gate-sequence doc comment updated; route comment documents rationale, fail-closed decision, 4s bound, and the contracts-v2 on-chain-bypass accepted residual.

## Verification (all four gates green)

| Gate | Result |
|------|--------|
| `pnpm --filter @call-it/web test` | 312 passed / 0 failed (32 files, incl. new target-guard.test.ts) |
| `pnpm --filter @call-it/web build` | exit 0 (warnings pre-existing: middleware→proxy deprecation, metamask-sdk optional dep) |
| `pnpm --filter @call-it/relayer test` | 350 passed / 1 skipped (pre-existing skip), incl. new hermes-spot.test.ts (16 tests) |
| `pnpm --filter @call-it/relayer build` | exit 0 (`tsc --build`) |

`packages/ui` untouched. Equality boundary, expo -6 multiply / -10 floor-divide normalization, fail-closed null path, and mock-Hermes malformed/zero/negative parse all covered. Source pins lock both wiring layers (page.tsx lift + gate; PriceTargetFields message + no hook; route getSpotPrice1e8/evaluateTargetGuard/withTimeout/priceTarget/price_unverifiable).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing preflight route test hit live Hermes and failed**
- **Found during:** Task 2 (full relayer suite run)
- **Issue:** `apps/relayer/__tests__/calls-preflight.test.ts` Tests 1/8/9 post a priceTarget body (BTC feed, $800 target at 1e8) — the new Gate Spot fetched the REAL live BTC price via the module singleton and correctly rejected `target_not_above_current`, making the suite network-dependent and red.
- **Fix:** Added a `vi.mock('../src/lib/hermes-spot.js')` that stubs `getSpotPrice1e8` to a deterministic $500 spot (below the $800 target → gate passes) while keeping the pure `evaluateTargetGuard` real. Suite is offline + deterministic again.
- **Files modified:** apps/relayer/__tests__/calls-preflight.test.ts
- **Commit:** e3ac074

**2. [Rule 1 - Plan contradiction] PythPriceStatus type import vs. source pin**
- **Found during:** Task 1
- **Issue:** Plan action step 3 said to import `PythPriceStatus` from `../hooks/usePythPrice`, but the behavior block + must_haves pin requires PriceTargetFields.tsx to NOT contain the string `usePythPrice`. Literal contradiction.
- **Fix:** Typed the `status` prop as the structurally-identical inline union `'idle' | 'loading' | 'ready' | 'error'` with a comment noting it mirrors PythPriceStatus. The pin (authoritative must_have) holds; assignability from the hook's return is unchanged.
- **Files modified:** apps/web/app/new/components/PriceTargetFields.tsx
- **Commit:** e3ac074

**3. [Minor copy hardening] Guard message render narrows price explicitly**
- Plan suggested `targetGuardMessage(price!)`; used `guardViolated && price !== null && ...` instead — same render condition (price is always non-null when guardViolated), avoids a non-null assertion that lint configs commonly reject.

## TDD Gate Compliance

Both tasks followed RED→GREEN (test files written first, confirmed failing on module-not-found, then implemented to green). Per the plan's explicit `<execution_constraints>` ("Single atomic code commit"), the RED and GREEN states were NOT committed separately — one commit `e3ac074` carries tests + implementation. This is a deliberate plan-mandated deviation from the per-gate test/feat commit convention.

## Deployment Status — OPERATOR NOTE

**NOT pushed** (operator authorizes push/deploy separately).

- **Web layer:** goes live on the next push (Vercel auto-deploys master).
- **Relayer layer is INERT until the relayer's Fly deploy.** The deployed `call-it-relayer-sepolia` does not have Gate Spot until the operator runs the working local deploy (per MEMORY — the GH workflow is broken, missing FLY_API_TOKEN/GCP-WIF secrets):
  ```
  flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .
  ```
  Until then, only the web inline guard protects (bypassable via direct API). Note also `HERMES_URL` is optional on Fly — defaults to `https://hermes.pyth.network`.

## Known Stubs

None — no placeholder values or unwired data introduced.

## Threat Flags

None beyond the plan's threat model. T-uf9-01/02/04 mitigated as planned (server-authoritative gate, fail-closed + 4s timeout + never-throw parse, D-07 null-price skip). T-uf9-03 (direct on-chain createCall bypass) remains the documented accepted residual — recorded in the route comment; contracts-v2 scope.

## Self-Check: PASSED

- apps/web/app/new/lib/target-guard.ts — FOUND
- apps/web/tests/target-guard.test.ts — FOUND
- apps/relayer/src/lib/hermes-spot.ts — FOUND
- apps/relayer/src/lib/__tests__/hermes-spot.test.ts — FOUND
- Commit e3ac074 — FOUND (8 files changed, 584 insertions)
