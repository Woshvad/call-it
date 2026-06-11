---
phase: quick-260611-bf2
plan: 01
subsystem: web-publish-path
tags: [preflight, pyth-feed-ids, relayer-contract, rhf-validation]
requires: [relayer calls-preflight string-enum schema (deployed, untouched)]
provides:
  - resolveAssetToFeedId + buildPreflightBody pure helpers (apps/web/app/new/lib)
  - string-enum PreflightInput wire contract in the web client
  - resolved assetA/assetB uints in createCall calldata
  - relayer 422 errors[] -> RelayerError.fieldErrors folding
  - pre-modal assetA/assetB resolvability gate (webCreateCallSchema)
affects: [/new publish flow, relayer-client error parsing]
tech-stack:
  added: []
  patterns: [web-local zod schema extension via chained superRefine, single-source body+calldata builder for dup-hash invariant]
key-files:
  created:
    - apps/web/app/new/lib/resolve-asset.ts
    - apps/web/app/new/lib/preflight-body.ts
    - apps/web/app/new/lib/web-call-schema.ts
    - apps/web/tests/resolve-asset.test.ts
    - apps/web/tests/preflight-body.test.ts
  modified:
    - apps/web/app/new/hooks/usePublishCall.ts
    - apps/web/app/new/page.tsx
    - apps/web/app/new/components/SpreadVsFields.tsx
    - apps/web/lib/relayer-client.ts
decisions:
  - "Helpers placed in apps/web (not packages/shared) — shared is consumed by the just-redeployed relayer; touching it widens blast radius (plan-directed)"
  - "web-call-schema.ts avoids importing 'zod' directly (apps/web has no direct zod dep under pnpm isolated node_modules) — uses inferred superRefine ctx with code:'custom'"
metrics:
  duration: ~8 min
  completed: 2026-06-11
---

# Quick 260611-bf2: Fix Web Publish Preflight Contract Summary

Web publish path now sends the relayer string-enum wire contract and resolves typed symbols to Pyth feed ids used consistently in BOTH the preflight body and the on-chain createCall calldata (assetA + assetB).

## What was broken (all three bugs)

**BUG 1 — preflight 422 on every publish.** `usePublishCall` sent `MARKET_TYPE_TO_UINT`/`EVENT_SUBTYPE_TO_UINT`/`CATEGORY_TO_UINT` integers; the relayer's `httpBodyPreprocessSchema` -> `createCallSchemaStrict` expects STRING enums -> 422 `invalid_type "Expected string, received number"` on marketType/eventSubtype/category. Publishing from /new has NEVER worked.

**BUG 2 — unsettleable calls.** Typed symbols ('ETH') were never resolved to Pyth feed ids: calldata line 116 mapped non-0x assets to `BigInt('0x0')` and line 117 hardcoded `assetB: 0n` even for spreadVs -> on-chain assetA=0, no Pyth feed at settlement.

**BUG 3 — invisible 422 errors.** `relayerFetch` only read `body.fieldErrors`, but the preflight 422 body is `{ ok:false, errors:[{field,code,message}] }` -> `RelayerError.fieldErrors` was ALWAYS undefined -> the D-31 inline mapping never fired -> toast said "Please fix the form errors below" with nothing visible.

## What changed per file

| File | Change |
|------|--------|
| `apps/web/app/new/lib/resolve-asset.ts` (new) | `resolveAssetToFeedId` — trim -> 0x 64-hex lowercased passthrough -> uppercase lookup in shared `PYTH_FEED_IDS` -> null. Exports exact `UNKNOWN_ASSET_MESSAGE` copy. Pure module. |
| `apps/web/app/new/lib/preflight-body.ts` (new) | `buildPreflightBody` — SINGLE source of the string-enum preflight body AND calldata `assetAUint`/`assetBUint` (dup-hash consistency invariant documented in header). priceTarget: assetA must resolve; spreadVs: both must resolve; event: best-effort with raw passthrough (assetAUint 0n, relayer parity). |
| `apps/web/app/new/lib/web-call-schema.ts` (new) | `webCreateCallSchema` = shared `createCallSchema` + chained `superRefine` adding assetA/assetB resolvability issues for priceTarget/spreadVs only. Shared schema untouched (D-29 parity). No direct `zod` import (apps/web has no zod dep). |
| `apps/web/app/new/hooks/usePublishCall.ts` | Calls `buildPreflightBody(input, address)` BEFORE `getAccessToken()` — unresolvable assets abort with inline setError + toast before ANY network call. `postPreflight(built.body, ...)` replaces the inline numeric payload. Calldata uses `built.assetAUint`/`built.assetBUint` (uint8 enum args 0-2 unchanged). New `HIDDEN_ERROR_FIELDS` set: hidden-field-only 422s toast `Preflight rejected: <message>`; empty fieldErrors -> `err.message`; visible-field errors keep the generic line. |
| `apps/web/lib/relayer-client.ts` | `PreflightInput` retyped to `MarketType`/`EventSubtype`/`Category` (type-only shared import; `DupCheckInput` untouched). `relayerFetch` folds `body.errors[]` into `RelayerError.fieldErrors` grouped by field (fallback 'root') with defensive Array.isArray/typeof guards; sets `message` from the first entry when body.message absent. |
| `apps/web/app/new/page.tsx` | `zodResolver(webCreateCallSchema)` replaces `zodResolver(createCallSchema)`; unused `createCallSchema` import removed. mode:'onChange' already set -> live inline error + modal blocked via handleSubmit. |
| `apps/web/app/new/components/SpreadVsFields.tsx` | Asset B input now renders the error border + mono error div (mirrors assetA pattern) — assetB inline error was invisible. |
| `apps/web/tests/resolve-asset.test.ts` (new) | 10 tests: shared-constant assertions + hardcoded ETH cross-check, case/trim, 0x passthrough + mixed-case lowering, short-hex/unknown/empty -> null, exact message copy. |
| `apps/web/tests/preflight-body.test.ts` (new) | 8 tests: BUG 1 string-enum regression pin, resolved assetA/assetB body+uint consistency, spreadVs assetB failures, event raw-passthrough + best-effort resolution, parentCallId serialization. |

## Test counts

- Before: 18 test files / 156 tests (web vitest)
- After: **20 test files / 174 tests — all green** (18 new tests added, zero pre-existing tests modified or weakened)
- Builds: `pnpm --filter @call-it/shared build` green (defensive dist refresh only — shared SOURCE untouched), `pnpm --filter @call-it/web build` green.

## Commit

`ae29569` — `fix(quick-260611-bf2): web publish path — preflight string enums + Pyth feed-id resolution (assetA/assetB)` — exactly the 9 planned files, on master, NOT pushed.

## Constraint compliance

- `git status --porcelain -uno -- packages/shared apps/relayer` -> empty (tracked trees byte-identical to HEAD~1). The only entries under apps/relayer are the two PRE-EXISTING untracked soak scripts (`soak-monitor.sh`/`soak-status.sh`, present before execution, on the never-stage list) — not modifications.
- No `*_TO_UINT` import in either new lib file (they remain ONLY for the on-chain uint8 enum calldata args + the out-of-scope dup-check route).
- `useDebouncedDupCheck`/`postDupCheck` untouched (different relayer route, numeric contract, out of scope).

## Deviations from Plan

None functional. One assertion interpretation: the plan's "git status --porcelain -- packages/shared apps/relayer must output NOTHING" lists the two pre-existing UNTRACKED soak scripts (present at session start, explicitly on the orchestrator's never-stage list). Asserted with `-uno` (tracked modifications only) instead of deleting/reverting pre-existing files not created by this task — relayer source remains byte-identical.

## Live-verification handoff (orchestrator, post-push)

After push -> Vercel auto-deploy, re-run the real-session publish on https://call-it-web-sepolia.vercel.app/new and confirm:
1. Preflight 200 `ok:true` with a typed symbol (e.g. 'ETH') — body carries string enums + the resolved `0xff61491a...0ace` feed id.
2. On-chain `assetA` of the new call equals the resolved Pyth feed id (non-zero; settleable).
3. An unknown asset (e.g. 'DOGECOIN') shows the inline "Unknown asset — use a listed symbol (BTC, ETH, SOL…) or a Pyth feed id" error on assetA BEFORE the confirm modal, and publish aborts with no network call.
4. spreadVs: assetB errors render inline (new error slot) and resolved assetB lands in calldata.

## Review-Fix Addendum (2026-06-11)

Code review (REVIEW.md) found 1 critical + 2 warnings + 5 info on `ae29569`; fixed CR-01, WR-01, WR-02, IN-04, IN-05 in a follow-up commit (apps/web only).

**WR-02 contract verification verdict: events ARE allowlist-gated on-chain.** `CallRegistry._assertAllowlisted` is called unconditionally for all market types (CallRegistry.sol:201); its Event branch (lines 496-501) requires `allowlistedNftCollections[address(uint160(assetA))]` OR `allowlistedFeedKeys[bytes32(assetA)]` — `bytes32(0)` is neither, so a freeform event asset is a guaranteed `AssetNotAllowlisted` revert after signing. Consequence: the "events publish with freeform assets" claim shipped in `ae29569` was unachievable; `webCreateCallSchema` now gates event `assetA` on resolvable-or-0x/numeric (`EVENT_ASSET_MESSAGE` = "Use a listed asset (BTC, ETH, SOL…)") and the comments were corrected.

Other fixes: event fallback uint now mirrors relayer `assetToUint256` exactly via `assetToUint256Parity` (0x-hex/numeric → BigInt, else 0n — dup-hash invariant holds for every input class, CR-01); `useDebouncedDupCheck` posts `canonicalAssetForWire(assetA)` so the DuplicateWarning hash matches published calls again (WR-01); dead toast branch removed (IN-04); `PreflightInput.callerSettledCalls` made required (IN-05). IN-01/02/03 deferred with notes in REVIEW.md.

Post-fix: web vitest 21 files / 197 tests green (23 added, none weakened — D-15); `pnpm --filter @call-it/web build` green.

## Self-Check: PASSED

- All 5 created files exist on disk; 4 modified files contain the expected patterns (`buildPreflightBody`, `assetBUint`, `webCreateCallSchema`, `errors` folding).
- Commit `ae29569` exists on master with exactly 9 files, no deletions.
- Full web vitest 174/174 green post-commit; FINAL-GATES-OK emitted.
